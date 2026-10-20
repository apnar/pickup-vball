/**
 * The RSVP cycle. Runs every half hour from the Cron Trigger and does exactly
 * what `../cycle.ts` says, which is also exactly what /admin/cycle tells
 * everybody it does.
 *
 * The half hour matters: the last call falls at 11:30. Nothing else about the
 * schedule lives in wrangler.jsonc -- the job re-derives every instant from
 * `now` against the gym's clock, so the cron only has to be frequent enough,
 * never correct, and daylight saving never touches it.
 */

import { game } from "@pickup-vball/db/schema/game";
import { and, asc, eq, gte, isNull, lte, ne } from "drizzle-orm";

import { union } from "../audience";
import type { Context } from "../context";
import {
	EMAIL_STAGE,
	type EmailStageKey,
	STAGE,
	type StageKey,
} from "../cycle";
import { findGame, type GameSummary } from "../games";
import { recordInvites } from "../invites";
import { type ListSendResult, readSplit, sendToList } from "../mail";
import { addDays, todayInRunTimezone } from "../run";
import { planStage, type Stamps } from "./plan";
import { renderStage, type StageRender } from "./stage-render";

type Db = Context["db"];

export type StageOutcome = {
	gameId: string;
	stage: StageKey;
	sent: number;
	/** Queued a text instead of (or as well as) an email. */
	texted?: number;
	failed: number;
	/** Resolved without emailing: the condition was not met, or the close. */
	quiet?: string;
};

export type CycleRunResult = {
	skipped?: string;
	acted: StageOutcome[];
};

const stampsOf = (row: {
	callAt: Date | null;
	nudgeAt: Date | null;
	lastCallAt: Date | null;
	decidedAt: Date | null;
}): Stamps => ({
	call: row.callAt,
	nudge: row.nudgeAt,
	lastCall: row.lastCallAt,
	close: row.decidedAt,
});

/**
 * Claim a stage. The conditional update is the once-only lock, the same one
 * the old reminder job used: two overlapping runs cannot both see one change.
 */
async function claim(
	db: Db,
	gameId: string,
	stage: StageKey,
	now: Date,
	extra: { sending: boolean },
): Promise<boolean> {
	const column = STAGE[stage].column;
	const result = await db
		.update(game)
		.set({
			[column]: now,
			...(extra.sending && { lastEmailAt: now }),
		})
		.where(and(eq(game.id, gameId), isNull(game[column])))
		.run();
	return result.meta.changes === 1;
}

/** Give a stage back, so the next pass can try again. */
async function release(db: Db, gameId: string, stage: StageKey) {
	await db
		.update(game)
		.set({ [STAGE[stage].column]: null })
		.where(eq(game.id, gameId));
}

/** Mark a stage resolved without sending anything. */
async function skipStage(db: Db, gameId: string, stage: StageKey, now: Date) {
	await claim(db, gameId, stage, now, { sending: false });
}

/** Send, record, and hand back the outcome. Releases the lock on a throw. */
async function finish(
	db: Db,
	gameId: string,
	stage: EmailStageKey,
	out: Pick<StageRender, "rendered" | "text">,
	opts: { onlyPersonIds?: string[] },
): Promise<StageOutcome> {
	let result: ListSendResult | null;
	try {
		result = await sendToList(db, {
			kind: EMAIL_STAGE[stage].kind,
			gameId,
			rendered: out.rendered,
			text: out.text,
			audience: "active",
			onlyPersonIds: opts.onlyPersonIds,
		});
	} catch (error) {
		await release(db, gameId, stage);
		throw error;
	}
	// Nobody to tell is a resolved stage, not a failed one: keep the stamp or
	// the job retries it every half hour until midnight.
	if (!result) {
		return { gameId, stage, sent: 0, failed: 0, quiet: "Nobody to tell." };
	}
	// Every batch rejected and nobody texted: give it back and try on the
	// next pass. A queued text counts as reached -- taking the stage back
	// then would text them twice.
	if (result.sent + result.texted === 0) await release(db, gameId, stage);
	return {
		gameId,
		stage,
		sent: result.sent,
		texted: result.texted,
		failed: result.attempted - result.sent,
	};
}

/**
 * Run one stage for one game. Reads and decides before claiming, so a stage
 * that turns out to have nothing to say is never recorded as an email.
 */
async function runStage(
	db: Db,
	summary: GameSummary,
	stage: StageKey,
	now: Date,
): Promise<StageOutcome | null> {
	if (stage === "close") {
		// Answers close and nobody is told: whoever is in plays, so there is
		// no news in it. The stamp is what freezes the sheet.
		if (!(await claim(db, summary.id, "close", now, { sending: false }))) {
			return null;
		}
		return {
			gameId: summary.id,
			stage,
			sent: 0,
			failed: 0,
			quiet: "Answers closed.",
		};
	}

	const split = await readSplit(db, summary.id);
	// A full night has nobody to ask for a yes: one now would only join the
	// line, and the spot alert is how the line hears about a free spot.
	const full = split.yes >= summary.capacity;

	if (stage === "call") {
		if (!(await claim(db, summary.id, "call", now, { sending: true }))) {
			return null;
		}
		// Write down who is being asked, before the asking. This snapshot is
		// the only record that survives of who was on the roster that night and
		// who was away -- `user` keeps one status and no history -- and the
		// response rates on /admin/users are counted against it.
		await recordInvites(db, summary.id, now);
		const { rendered, text } = renderStage({
			stage: "call",
			game: summary,
			split,
			now,
		});
		return finish(
			db,
			summary.id,
			"call",
			{ rendered, text },
			{
				onlyPersonIds: split.askedIds,
			},
		);
	}

	if (stage === "nudge") {
		if (full || split.silentIds.length === 0) {
			await skipStage(db, summary.id, stage, now);
			return {
				gameId: summary.id,
				stage,
				sent: 0,
				failed: 0,
				quiet: full ? "Every spot is taken." : "Everybody answered.",
			};
		}
		if (!(await claim(db, summary.id, stage, now, { sending: true }))) {
			return null;
		}
		const { rendered, text } = renderStage({
			stage: "nudge",
			game: summary,
			split,
			now,
		});
		return finish(
			db,
			summary.id,
			stage,
			{ rendered, text },
			{
				onlyPersonIds: split.silentIds,
			},
		);
	}

	// lastCall
	const audience = union(split.silentIds, split.maybeIds);
	if (full || audience.length === 0) {
		await skipStage(db, summary.id, stage, now);
		return {
			gameId: summary.id,
			stage,
			sent: 0,
			failed: 0,
			quiet: full ? "Every spot is taken." : "Nobody left to ask.",
		};
	}
	if (!(await claim(db, summary.id, stage, now, { sending: true })))
		return null;
	const { rendered, text } = renderStage({
		stage: "lastCall",
		game: summary,
		split,
		now,
	});
	return finish(
		db,
		summary.id,
		stage,
		{ rendered, text },
		{ onlyPersonIds: audience },
	);
}

/**
 * One pass. Every game whose cycle could still be running is today's or
 * tomorrow's -- the earliest stage is five o'clock the evening before.
 */
export async function runRsvpCycle(
	db: Db,
	now: Date = new Date(),
): Promise<CycleRunResult> {
	const today = todayInRunTimezone(now);
	const rows = await db
		.select({
			id: game.id,
			date: game.date,
			startTime: game.startTime,
			callAt: game.callAt,
			nudgeAt: game.nudgeAt,
			lastCallAt: game.lastCallAt,
			decidedAt: game.decidedAt,
			lastEmailAt: game.lastEmailAt,
		})
		.from(game)
		.where(
			and(
				gte(game.date, today),
				lte(game.date, addDays(today, 1)),
				ne(game.status, "canceled"),
			),
		)
		.orderBy(asc(game.date), asc(game.startTime))
		.all();

	if (rows.length === 0) {
		return { skipped: "Nothing booked for tonight or tomorrow.", acted: [] };
	}

	const acted: StageOutcome[] = [];
	// Serially: two games in one window is already a pathology, and this keeps
	// two list sends from interleaving in the log.
	for (const row of rows) {
		const plan = planStage({
			date: row.date,
			startTime: row.startTime,
			stamps: stampsOf(row),
			lastEmailAt: row.lastEmailAt,
			now,
		});
		for (const stage of plan.skip) {
			await skipStage(db, row.id, stage, now);
		}
		if (plan.run) {
			const summary = await findGame(db, row.id);
			if (summary) {
				const outcome = await runStage(db, summary, plan.run, now);
				if (outcome) acted.push(outcome);
			}
		}
	}
	return { acted };
}
