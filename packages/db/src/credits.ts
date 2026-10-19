import { and, desc, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { createDb } from "./index";
import { user } from "./schema/auth";
import {
	type CreditReason,
	checkIn,
	creditEntry,
	type PaymentMethod,
} from "./schema/credit";
import { game } from "./schema/game";
import { gym } from "./schema/gym";

type Db = ReturnType<typeof createDb>;

/*
 * Every read and write of the credit ledger and the check-in sheet lives
 * here, the way `people.ts` owns the `user` table. The ledger is append-only:
 * nothing in this file updates or deletes a `credit_entry` row, and nothing
 * anywhere else may.
 */

/** One person's balance: the sum of their entries, zero with none. */
export async function balanceOf(db: Db, userId: string): Promise<number> {
	const row = await db
		.select({ total: sql<number>`coalesce(sum(${creditEntry.delta}), 0)` })
		.from(creditEntry)
		.where(eq(creditEntry.userId, userId))
		.get();
	return row?.total ?? 0;
}

/** Everybody's balance at once. Somebody missing from the map has zero. */
export async function listBalances(db: Db): Promise<Map<string, number>> {
	const rows = await db
		.select({
			userId: creditEntry.userId,
			total: sql<number>`sum(${creditEntry.delta})`,
		})
		.from(creditEntry)
		.groupBy(creditEntry.userId)
		.all();
	return new Map(rows.map((r) => [r.userId, r.total]));
}

export type EntryRow = {
	id: string;
	userId: string;
	playerName: string;
	playerEmail: string;
	delta: number;
	reason: CreditReason;
	gameId: string | null;
	method: PaymentMethod | null;
	amountUsd: number | null;
	note: string | null;
	createdAt: Date;
	/** The admin who wrote it; null if they have since gone. */
	byName: string | null;
	/** The person's balance just after this entry. */
	balance: number;
	/** The night a charge or refund was for. */
	night: { date: string; gymName: string } | null;
};

export type EntryFilter = {
	userId?: string;
	/** `added` is every entry that raised a balance, `used` every one that lowered it. */
	direction?: "added" | "used";
	limit?: number;
};

/**
 * Ledger rows, newest first, each with the balance it left behind.
 *
 * The running balance is a window over the whole table, worked out in a CTE
 * before any filter applies -- a `where` on the same query would run first
 * and the sums would only count the rows that survived it. Ties on the
 * millisecond fall back to `rowid`, which is insertion order.
 */
export async function listEntries(
	db: Db,
	filter: EntryFilter = {},
): Promise<EntryRow[]> {
	const running = db.$with("running").as(
		db
			.select({
				entryId: sql<string>`${creditEntry.id}`.as("entry_id"),
				balance:
					sql<number>`sum(${creditEntry.delta}) over (partition by ${creditEntry.userId} order by ${creditEntry.createdAt}, rowid)`.as(
						"balance",
					),
			})
			.from(creditEntry),
	);
	const creator = alias(user, "creator");
	const where = and(
		filter.userId ? eq(creditEntry.userId, filter.userId) : undefined,
		filter.direction === "added"
			? gt(creditEntry.delta, 0)
			: filter.direction === "used"
				? lt(creditEntry.delta, 0)
				: undefined,
	);
	const rows = await db
		.with(running)
		.select({
			id: creditEntry.id,
			userId: creditEntry.userId,
			playerName: user.name,
			playerEmail: user.email,
			delta: creditEntry.delta,
			reason: creditEntry.reason,
			gameId: creditEntry.gameId,
			method: creditEntry.method,
			amountUsd: creditEntry.amountUsd,
			note: creditEntry.note,
			createdAt: creditEntry.createdAt,
			byName: creator.name,
			balance: running.balance,
			nightDate: game.date,
			gymName: gym.name,
		})
		.from(creditEntry)
		.innerJoin(running, eq(running.entryId, creditEntry.id))
		.innerJoin(user, eq(user.id, creditEntry.userId))
		.leftJoin(creator, eq(creator.id, creditEntry.createdBy))
		.leftJoin(game, eq(game.id, creditEntry.gameId))
		.leftJoin(gym, eq(gym.id, game.gymId))
		.where(where)
		.orderBy(desc(creditEntry.createdAt), desc(sql`${creditEntry}.rowid`))
		.limit(filter.limit ?? 500)
		.all();
	return rows.map(({ nightDate, gymName, ...row }) => ({
		...row,
		night: nightDate ? { date: nightDate, gymName: gymName ?? "" } : null,
	}));
}

/** Credits in and credits out since an instant, both as positive numbers. */
export async function totalsSince(
	db: Db,
	since: Date,
): Promise<{ added: number; used: number }> {
	const row = await db
		.select({
			added: sql<number>`coalesce(sum(case when ${creditEntry.delta} > 0 then ${creditEntry.delta} else 0 end), 0)`,
			used: sql<number>`coalesce(sum(case when ${creditEntry.delta} < 0 then -${creditEntry.delta} else 0 end), 0)`,
		})
		.from(creditEntry)
		.where(gte(creditEntry.createdAt, since))
		.get();
	return { added: row?.added ?? 0, used: row?.used ?? 0 };
}

export type NewEntry = {
	userId: string;
	delta: number;
	reason: Exclude<CreditReason, "played">;
	gameId?: string | null;
	method?: PaymentMethod | null;
	amountUsd?: number | null;
	note?: string | null;
	createdBy: string;
};

/**
 * Append one row. `played` is not accepted: a charge only ever comes from
 * closing a night, all of them together, in `closeNight`.
 */
export async function addEntry(db: Db, entry: NewEntry): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(creditEntry).values({
		id,
		userId: entry.userId,
		delta: entry.delta,
		reason: entry.reason,
		gameId: entry.gameId ?? null,
		method: entry.method ?? null,
		amountUsd: entry.amountUsd ?? null,
		note: entry.note ?? null,
		createdBy: entry.createdBy,
	});
	return id;
}

export async function findEntry(db: Db, id: string) {
	const row = await db
		.select()
		.from(creditEntry)
		.where(eq(creditEntry.id, id))
		.get();
	return row ?? null;
}

/** Whether a night's charge to this person has already been given back. */
export async function isRefunded(
	db: Db,
	gameId: string,
	userId: string,
): Promise<boolean> {
	const row = await db
		.select({ id: creditEntry.id })
		.from(creditEntry)
		.where(
			and(
				eq(creditEntry.gameId, gameId),
				eq(creditEntry.userId, userId),
				eq(creditEntry.reason, "refund"),
			),
		)
		.get();
	return Boolean(row);
}

/** Who is ticked off for a night. */
export async function listCheckIns(
	db: Db,
	gameId: string,
): Promise<{ userId: string; walkIn: boolean }[]> {
	return db
		.select({ userId: checkIn.userId, walkIn: checkIn.walkIn })
		.from(checkIn)
		.where(eq(checkIn.gameId, gameId))
		.all();
}

/*
 * The two check-in writes carry their own "not closed yet" test rather than
 * trusting the router's: a tick that lands a moment after somebody else
 * closed the night would otherwise sit on a frozen sheet, checked in and
 * never charged. Column names are written out because drizzle leaves them
 * unqualified in a `sql` template, and inside these subqueries that is
 * exactly the point -- `id` is the game's.
 */

/** Tick somebody off. False when already ticked, or the night is closed. */
export async function checkInPerson(
	db: Db,
	input: { gameId: string; userId: string; walkIn: boolean; by: string },
): Promise<boolean> {
	const result = await db.run(sql`
		insert into check_in (id, game_id, user_id, walk_in, checked_in_by)
		select ${crypto.randomUUID()}, ${input.gameId}, ${input.userId}, ${input.walkIn ? 1 : 0}, ${input.by}
		where exists (select 1 from game where id = ${input.gameId} and closed_at is null)
		on conflict do nothing
	`);
	return result.meta.changes === 1;
}

/** Untick somebody. False when they were not ticked, or the night is closed. */
export async function uncheckPerson(
	db: Db,
	input: { gameId: string; userId: string },
): Promise<boolean> {
	const result = await db.run(sql`
		delete from check_in
		where game_id = ${input.gameId} and user_id = ${input.userId}
		and exists (select 1 from game where id = ${input.gameId} and closed_at is null)
	`);
	return result.meta.changes === 1;
}

/**
 * Close the night: stamp it and charge one credit to everybody checked in,
 * in one D1 batch, which is one transaction.
 *
 * The charges are an `insert ... select` off the sheet as it stands at
 * commit, not a list read beforehand, so a tick that lands mid-close is
 * either charged or refused, never left in between. A second close -- the
 * double tap, or two admins at once -- re-runs the same insert and hits
 * `credit_entry_played_uidx`, and the whole batch, stamp included, rolls
 * back. `closed: false` is the quiet version of that: a night with nobody
 * checked in that was already closed.
 */
export async function closeNight(
	db: Db,
	input: { gameId: string; by: string },
): Promise<{ closed: boolean; charged: number }> {
	const now = new Date();
	const [stamp, charge] = await db.batch([
		db
			.update(game)
			.set({ closedAt: now, closedBy: input.by })
			.where(and(eq(game.id, input.gameId), isNull(game.closedAt))),
		// Every column, in table order: drizzle's insert-select insists.
		db.insert(creditEntry).select(
			db
				.select({
					id: sql<string>`lower(hex(randomblob(16)))`.as("id"),
					userId: checkIn.userId,
					delta: sql<number>`-1`.as("delta"),
					reason: sql<CreditReason>`'played'`.as("reason"),
					gameId: checkIn.gameId,
					method: sql<null>`null`.as("method"),
					amountUsd: sql<null>`null`.as("amount_usd"),
					note: sql<null>`null`.as("note"),
					createdBy: sql<string>`${input.by}`.as("created_by"),
					createdAt: sql<number>`${now.getTime()}`.as("created_at"),
				})
				.from(checkIn)
				.where(eq(checkIn.gameId, input.gameId)),
		),
	]);
	return {
		closed: stamp.meta.changes === 1,
		charged: charge.meta.changes,
	};
}
