import { game } from "@pickup-vball/db/schema/game";
import { gameGroup } from "@pickup-vball/db/schema/group";
import { gym } from "@pickup-vball/db/schema/gym";
import { permit } from "@pickup-vball/db/schema/permit";
import { rsvp } from "@pickup-vball/db/schema/rsvp";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";

import type { Scope } from "./access";
import type { Context } from "./context";
import { STAGES } from "./cycle";
import {
	addDays,
	FORMAT_LABEL,
	formatGameDate,
	formatTimeRange,
	NIGHT_TYPE_LABEL,
	runInstant,
	todayInRunTimezone,
} from "./run";

type Db = Context["db"];

/** Base query: games with their gym, permit summary and current In count. */
function selectGames(db: Db) {
	return (
		db
			.select({
				id: game.id,
				date: game.date,
				startTime: game.startTime,
				endTime: game.endTime,
				notes: game.notes,
				groupId: game.groupId,
				format: game.format,
				nightType: game.nightType,
				capacity: game.capacity,
				status: game.status,
				callAt: game.callAt,
				nudgeAt: game.nudgeAt,
				lastCallAt: game.lastCallAt,
				decidedAt: game.decidedAt,
				lastEmailAt: game.lastEmailAt,
				closedAt: game.closedAt,
				closedBy: game.closedBy,
				gym: {
					id: gym.id,
					name: gym.name,
					address: gym.address,
					notes: gym.notes,
				},
				group: { id: gameGroup.id, name: gameGroup.name },
				permit: {
					id: permit.id,
					label: permit.label,
					fileName: permit.fileName,
				},
				inCount: sql<number>`(select count(*) from ${rsvp} where ${rsvp.gameId} = ${game.id} and ${rsvp.response} = 'in')`,
				waitCount: sql<number>`(select count(*) from ${rsvp} where ${rsvp.gameId} = ${game.id} and ${rsvp.response} = 'waitlist')`,
			})
			.from(game)
			// The gym join is inner: `game.gym_id` is NOT NULL, so a game without
			// one cannot exist, and every caller gets to treat `gym` as present.
			.innerJoin(gym, eq(game.gymId, gym.id))
			.leftJoin(permit, eq(game.permitId, permit.id))
			.leftJoin(gameGroup, eq(game.groupId, gameGroup.id))
	);
}

type GameRow = Awaited<
	ReturnType<ReturnType<typeof selectGames>["all"]>
>[number];

export function decorateGame(row: GameRow) {
	return {
		...row,
		permit: row.permit?.id ? row.permit : null,
		group: row.group?.id ? row.group : null,
		revco: row.nightType === "revco",
		/** Where to tell people to go: the court, and the street it is on. */
		location: row.gym.address
			? `${row.gym.name}, ${row.gym.address}`
			: row.gym.name,
		/**
		 * Every moment of this game's cycle as a UTC instant, worked out once
		 * here so nothing downstream -- least of all a browser -- has to know
		 * what timezone the gym is in.
		 */
		cycle: {
			startsAt: runInstant(row.date, row.startTime).toISOString(),
			stages: STAGES.map((stage) => ({
				key: stage.key,
				at: runInstant(
					addDays(row.date, stage.dayOffset),
					stage.at,
				).toISOString(),
				doneAt: (row[stage.column] as Date | null)?.toISOString() ?? null,
			})),
		},
		formatLabel: FORMAT_LABEL[row.format],
		/** "6 v 6 Reverse coed": how the night is played, in one phrase. */
		kindLabel: `${FORMAT_LABEL[row.format]} ${NIGHT_TYPE_LABEL[row.nightType]}`,
		dateLabel: formatGameDate(row.date),
		timeLabel: formatTimeRange(row.startTime, row.endTime),
		isPast: row.date < todayInRunTimezone(),
	};
}

export type GameSummary = ReturnType<typeof decorateGame>;

/**
 * The nights a scope may see. A night from before groups has none and is
 * open to everybody; `inArray` is skipped when the list is empty, where it
 * would render as nothing at all.
 */
function inScope(scope: Scope) {
	if (scope === null) return undefined;
	return scope.length === 0
		? isNull(game.groupId)
		: or(isNull(game.groupId), inArray(game.groupId, scope));
}

export async function findNextGame(db: Db, scope: Scope = null) {
	const row = await selectGames(db)
		.where(and(gte(game.date, todayInRunTimezone()), inScope(scope)))
		.orderBy(asc(game.date), asc(game.startTime))
		.get();
	return row ? decorateGame(row) : null;
}

/** One night by id, whoever is asking. Callers that serve a player check `canSee`. */
export async function findGame(db: Db, id: string) {
	const row = await selectGames(db).where(eq(game.id, id)).get();
	return row ? decorateGame(row) : null;
}

export async function listGames(db: Db, pastLimit = 5, scope: Scope = null) {
	const today = todayInRunTimezone();
	const upcoming = await selectGames(db)
		.where(and(gte(game.date, today), inScope(scope)))
		.orderBy(asc(game.date), asc(game.startTime))
		.all();
	const past = await selectGames(db)
		.where(and(lt(game.date, today), inScope(scope)))
		.orderBy(desc(game.date), desc(game.startTime))
		.limit(pastLimit)
		.all();
	return {
		upcoming: upcoming.map(decorateGame),
		past: past.map(decorateGame),
	};
}
