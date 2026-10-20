import type { createDb } from "@pickup-vball/db";
import { claimTexts, settleText } from "@pickup-vball/db/notify";
import { setSmsOptOut } from "@pickup-vball/db/people";
import { game } from "@pickup-vball/db/schema/game";
import { fillParams, OPTED_OUT_CODE } from "@pickup-vball/email";
import { getTexter } from "@pickup-vball/email/worker";
import { waitUntil } from "@pickup-vball/env/server";
import { inArray } from "drizzle-orm";

import { runInstant } from "../run";

type Db = ReturnType<typeof createDb>;

/**
 * How many texts one run sends. A Worker on the free plan gets fifty
 * outside calls a run; each text is one, and the run that queued them may
 * have spent a couple on email already. The rest wait a minute for the
 * cron's own run.
 */
export const DRAIN_BUDGET = 40;

export type DrainResult = { sent: number; failed: number; skipped: number };

/**
 * One drain per request, the first time anything in it queues a text. Keyed
 * on the request's own `db` (every request makes its own), so it holds
 * nothing across requests. A second send in the same request leaves its
 * texts to the per-minute cron rather than spend a second budget: two
 * would be past the fifty calls a run gets.
 */
const kicked = new WeakSet<object>();

/** Send what was just queued as this request winds up, not after it. */
export function kickDrain(db: Db): void {
	if (kicked.has(db)) return;
	kicked.add(db);
	waitUntil(
		drainTexts(db, new Date(), KICK_BUDGET).then(
			(r) => (r.sent || r.failed) && console.log("texts", JSON.stringify(r)),
			(error) => console.error("text drain failed", error),
		),
	);
}

/** Less than a cron run's: the request may already have spent some on email. */
const KICK_BUDGET = 30;

/**
 * Send what is due from the outbox. Each text is checked against the
 * person as they are now, not as they were when it was queued: a number
 * removed, a STOP, a deactivation, or a night that has already started all
 * turn it into `skipped` rather than a text.
 */
export async function drainTexts(
	db: Db,
	now: Date = new Date(),
	budget: number = DRAIN_BUDGET,
): Promise<DrainResult> {
	const result: DrainResult = { sent: 0, failed: 0, skipped: 0 };
	const texts = await claimTexts(db, now, budget);
	if (texts.length === 0) return result;

	const gameIds = [
		...new Set(texts.map((t) => t.gameId).filter((id): id is string => !!id)),
	];
	const starts = new Map(
		gameIds.length === 0
			? []
			: (
					await db
						.select({ id: game.id, date: game.date, startTime: game.startTime })
						.from(game)
						.where(inArray(game.id, gameIds))
						.all()
				).map((g) => [g.id, runInstant(g.date, g.startTime).getTime()]),
	);

	const texter = getTexter();
	for (const text of texts) {
		const p = text.person;
		const skip = !p
			? "They are not in the group any more."
			: p.status === "deactivated" || p.banned
				? "They are not in the group any more."
				: p.phone !== text.toPhone
					? "Their number changed."
					: p.smsOptedOutAt
						? "They texted STOP."
						: text.gameId &&
								text.kind !== "reply" &&
								(starts.get(text.gameId) ?? 0) <= now.getTime()
							? "The night had already started."
							: null;
		if (skip) {
			await settleText(db, text.id, { status: "skipped", error: skip });
			result.skipped++;
			continue;
		}
		const body = fillParams(text.body, { key: p?.linkToken ?? "" });
		const outcome = await texter.send(text.toPhone, body);
		if (outcome.ok) {
			await settleText(db, text.id, {
				status: "sent",
				telnyxId: outcome.messageId,
			});
			result.sent++;
			continue;
		}
		if (outcome.code === OPTED_OUT_CODE) {
			await setSmsOptOut(db, text.toPhone, true);
		}
		await settleText(db, text.id, {
			status: "failed",
			error: `${outcome.status}: ${outcome.error}`,
		});
		result.failed++;
	}
	return result;
}
