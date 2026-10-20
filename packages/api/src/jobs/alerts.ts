import { listBalances, listCheckIns } from "@pickup-vball/db/credits";
import { game } from "@pickup-vball/db/schema/game";
import {
	lowCreditEmail,
	lowCreditText,
	reminderEmail,
	reminderText,
	spotOpenEmail,
	spotOpenText,
} from "@pickup-vball/email";
import { siteUrl } from "@pickup-vball/email/worker";
import { and, eq, isNull, lt, or } from "drizzle-orm";

import { union } from "../audience";
import type { Context } from "../context";
import {
	REMINDER_LEAD_HOURS,
	SPOT_OPEN_COOLDOWN_MINUTES,
	STAGE,
} from "../cycle";
import { findGame, type GameSummary } from "../games";
import { readSplit, sendToList } from "../mail";
import { runInstant, todayInRunTimezone } from "../run";

type Db = Context["db"];

/*
 * The three alerts that are not part of the RSVP cycle. Each reads the
 * person's choice like any other send; the spot alert is off unless they
 * turn it on.
 */

export type ReminderOutcome = { gameId: string; sent: number; texted: number };

/**
 * The game-day reminder, for tonight's nights that are on. Run with the
 * cycle every half hour. Claimed with a conditional stamp like a stage, so
 * two runs cannot both send it; a night that is on before its verdict (a
 * daytime start) counts once twelve are in.
 */
export async function sendReminders(
	db: Db,
	now: Date = new Date(),
): Promise<ReminderOutcome[]> {
	const today = todayInRunTimezone(now);
	const rows = await db
		.select({
			id: game.id,
			date: game.date,
			startTime: game.startTime,
			decidedAt: game.decidedAt,
		})
		.from(game)
		.where(
			and(
				eq(game.date, today),
				eq(game.status, "confirmed"),
				isNull(game.reminderAt),
			),
		)
		.all();

	const verdict = runInstant(today, STAGE.final.at ?? "13:00").getTime();
	const out: ReminderOutcome[] = [];
	for (const row of rows) {
		const starts = runInstant(row.date, row.startTime).getTime();
		const due = starts - REMINDER_LEAD_HOURS * 60 * 60_000;
		if (now.getTime() < due || now.getTime() >= starts) continue;
		// Confirmed early, before a verdict that could still call it off.
		if (!row.decidedAt && starts > verdict) continue;
		const claimed = await db
			.update(game)
			.set({ reminderAt: now })
			.where(and(eq(game.id, row.id), isNull(game.reminderAt)))
			.run();
		if (claimed.meta.changes !== 1) continue;

		const summary = await findGame(db, row.id);
		if (!summary) continue;
		const split = await readSplit(db, row.id);
		const facts = {
			gameId: summary.id,
			dateLabel: summary.dateLabel,
			timeLabel: summary.timeLabel,
			location: summary.location,
			formatLabel: summary.kindLabel,
			notes: summary.notes,
			siteUrl: siteUrl(),
		};
		const result = await sendToList(db, {
			kind: "reminder",
			gameId: summary.id,
			rendered: reminderEmail(facts),
			text: reminderText(facts),
			onlyPersonIds: split.inIds,
			now,
		});
		out.push({
			gameId: summary.id,
			sent: result?.sent ?? 0,
			texted: result?.texted ?? 0,
		});
	}
	return out;
}

/**
 * After a night is closed: everybody it took from two credits to one. Only
 * that crossing -- not every night spent below it, which would be a
 * message a night for the people most likely to be behind already.
 */
export async function tellLowCredit(db: Db, gameId: string): Promise<void> {
	const [sheet, balances] = await Promise.all([
		listCheckIns(db, gameId),
		listBalances(db),
	]);
	// Charged one each, so "fell to one" is a balance of exactly one now.
	const ids = sheet
		.map((c) => c.userId)
		.filter((id) => (balances.get(id) ?? 0) === 1);
	if (ids.length === 0) return;
	const input = { balance: 1, siteUrl: siteUrl() };
	await sendToList(db, {
		kind: "low_credit",
		gameId,
		rendered: lowCreditEmail(input),
		text: lowCreditText(input),
		// Somebody on a break still owes what they owe.
		audience: "everyone",
		onlyPersonIds: ids,
	});
}

/**
 * A night that was full has a spot again and nobody is waiting for it:
 * tell the group members who are not in, if they asked to hear. `before`
 * is the night as it was before the write, which is how "was full" is
 * known; `promote` passes it, since every write that frees a spot ends
 * there.
 */
export async function tellSpotOpen(
	db: Db,
	before: GameSummary,
	now: Date = new Date(),
): Promise<void> {
	if (before.inCount < before.capacity) return;
	const after = await findGame(db, before.id);
	if (
		!after ||
		after.status === "canceled" ||
		after.decidedAt ||
		after.waitCount > 0 ||
		after.inCount >= after.capacity ||
		new Date(after.cycle.startsAt).getTime() <= now.getTime()
	) {
		return;
	}
	const cooled = new Date(now.getTime() - SPOT_OPEN_COOLDOWN_MINUTES * 60_000);
	const claimed = await db
		.update(game)
		.set({ spotOpenAt: now })
		.where(
			and(
				eq(game.id, after.id),
				or(isNull(game.spotOpenAt), lt(game.spotOpenAt, cooled)),
			),
		)
		.run();
	if (claimed.meta.changes !== 1) return;

	const split = await readSplit(db, after.id);
	const facts = {
		gameId: after.id,
		dateLabel: after.dateLabel,
		timeLabel: after.timeLabel,
		location: after.location,
		formatLabel: after.kindLabel,
		siteUrl: siteUrl(),
	};
	await sendToList(db, {
		kind: "spot_open",
		gameId: after.id,
		rendered: spotOpenEmail(facts),
		text: spotOpenText(facts),
		// Who has not taken a spot: the silent and the maybes. Somebody who
		// said out has said so.
		onlyPersonIds: union(split.silentIds, split.maybeIds),
		now,
	});
}
