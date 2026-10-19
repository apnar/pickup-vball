import {
	type RsvpAnswer,
	type RsvpResponse,
	rsvp,
} from "@pickup-vball/db/schema/rsvp";
import { waitlistInEmail } from "@pickup-vball/email";
import { siteUrl } from "@pickup-vball/email/worker";
import { and, eq, sql } from "drizzle-orm";

import type { Context } from "./context";
import type { GameSummary } from "./games";
import { sendToList } from "./mail";
import { todayInRunTimezone } from "./run";

/*
 * Spots and the line for them. Every write that could take a spot or free
 * one comes through here, so the rule is in one place: a yes on a night with
 * room is a yes; a yes on a full night -- or on one where somebody is already
 * waiting -- joins the back of the line; and whenever a spot frees, the front
 * of the line gets it.
 *
 * The counts are written by hand with aliases. In a subquery drizzle leaves
 * column names unqualified, and inside an `update rsvp` they would resolve
 * against the row being written.
 */

type Db = Context["db"];

/** True while fewer are in than the night has spots. */
function spotFree(game: GameSummary) {
	return sql`(select count(*) from rsvp as taken where taken.game_id = ${game.id} and taken.response = 'in') < ${game.capacity}`;
}

/** True while nobody is in line -- a new yes may not walk past them. */
function nobodyWaiting(game: GameSummary) {
	return sql`not exists (select 1 from rsvp as queued where queued.game_id = ${game.id} and queued.response = 'waitlist')`;
}

export type Outcome = "in" | "waitlist" | "other";

/**
 * Change the answer on an existing row.
 *
 * `override` is an admin fixing somebody else's row: they may put anybody in
 * past the number, because somebody has to be able to fix the sheet by hand.
 * An admin answering for themselves waits in line like anyone.
 */
export async function answerRow(
	db: Db,
	game: GameSummary,
	row: { id: string; response: RsvpResponse },
	set: { response: RsvpAnswer; userId?: string; addedBy?: string },
	override = false,
): Promise<Outcome> {
	if (set.response !== "in") {
		await db
			.update(rsvp)
			.set({ ...set, waitlistedAt: null })
			.where(eq(rsvp.id, row.id));
		return "other";
	}
	if (row.response === "in" || override) {
		await db
			.update(rsvp)
			.set({ ...set, waitlistedAt: null })
			.where(eq(rsvp.id, row.id));
		return "in";
	}
	if (row.response === "waitlist") {
		// Saying yes again keeps their place; it does not jump the line.
		const { response: _, ...rest } = set;
		if (Object.keys(rest).length > 0) {
			await db.update(rsvp).set(rest).where(eq(rsvp.id, row.id));
		}
		return "waitlist";
	}
	// The count and the write are one statement, so two people cannot both
	// take the last spot.
	const taken = await db
		.update(rsvp)
		.set({ ...set, waitlistedAt: null })
		.where(and(eq(rsvp.id, row.id), spotFree(game), nobodyWaiting(game)))
		.run();
	if (taken.meta.changes === 1) return "in";
	await db
		.update(rsvp)
		.set({ ...set, response: "waitlist", waitlistedAt: new Date() })
		.where(eq(rsvp.id, row.id));
	return "waitlist";
}

/**
 * Put a new row on the sheet. An insert cannot carry a `where`, so a yes is
 * counted afterwards and moved to the back of the line if it was one too
 * many. Two people racing for the last spot can then both end up waiting --
 * and `promote`, which every write runs next, hands the spot to the first of
 * them.
 */
export async function addRow(
	db: Db,
	game: GameSummary,
	values: typeof rsvp.$inferInsert,
	override = false,
): Promise<Outcome> {
	await db.insert(rsvp).values(values);
	if (values.response !== "in") return "other";
	if (override) return "in";
	const counts = await db
		.select({
			in: sql<number>`sum(case when ${rsvp.response} = 'in' then 1 else 0 end)`,
			waiting: sql<number>`sum(case when ${rsvp.response} = 'waitlist' then 1 else 0 end)`,
		})
		.from(rsvp)
		.where(eq(rsvp.gameId, game.id))
		.get();
	const over = (counts?.in ?? 0) > game.capacity;
	if (!over && (counts?.waiting ?? 0) === 0) return "in";
	await db
		.update(rsvp)
		.set({ response: "waitlist", waitlistedAt: new Date() })
		.where(eq(rsvp.id, values.id));
	return "waitlist";
}

/**
 * Give free spots to the front of the line, one at a time, and tell each
 * of them. Safe to call after any write: with no free spot or nobody waiting
 * it changes nothing. A night that has already gone by is left alone.
 */
export async function promote(db: Db, game: GameSummary): Promise<number> {
	if (game.date < todayInRunTimezone() || game.status === "canceled") return 0;
	let moved = 0;
	// Bounded so a mistake here can never spin; a night has at most a few
	// hundred spots.
	for (let i = 0; i < 500; i++) {
		const next = await db
			.update(rsvp)
			.set({ response: "in", waitlistedAt: null })
			.where(
				and(
					sql`${rsvp.id} = (select queued.id from rsvp as queued where queued.game_id = ${game.id} and queued.response = 'waitlist' order by queued.waitlisted_at, queued.rowid limit 1)`,
					spotFree(game),
				),
			)
			.returning({
				name: rsvp.name,
				userId: rsvp.userId,
				addedBy: rsvp.addedBy,
			})
			.get();
		if (!next) break;
		moved += 1;
		await tellPromoted(db, game, next);
	}
	return moved;
}

/**
 * The email that says so. A guest has no inbox, so whoever put them on the
 * sheet hears instead. A failed send is logged, not thrown: the spot is
 * theirs either way, and the board says so.
 */
async function tellPromoted(
	db: Db,
	game: GameSummary,
	row: { name: string; userId: string | null; addedBy: string | null },
) {
	const to = row.userId ?? row.addedBy;
	if (!to) return;
	try {
		await sendToList(db, {
			kind: "waitlist_in",
			gameId: game.id,
			rendered: waitlistInEmail({
				gameId: game.id,
				dateLabel: game.dateLabel,
				timeLabel: game.timeLabel,
				location: game.location,
				formatLabel: game.formatLabel,
				siteUrl: siteUrl(),
				guestName: row.userId ? null : row.name,
			}),
			onlyPersonIds: [to],
		});
	} catch (error) {
		console.error("waitlist email failed", error);
	}
}

/** Everyone waiting on a night, front of the line first, as row ids. */
export async function waitlistOrder(db: Db, gameId: string): Promise<string[]> {
	const rows = await db
		.select({ id: rsvp.id })
		.from(rsvp)
		.where(and(eq(rsvp.gameId, gameId), eq(rsvp.response, "waitlist")))
		.orderBy(rsvp.waitlistedAt, sql`rowid`)
		.all();
	return rows.map((r) => r.id);
}
