import {
	and,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	lte,
	sql,
} from "drizzle-orm";

import type { createDb } from "./index";
import { user } from "./schema/auth";
import {
	type NotifyChannel,
	type NotifyTopic,
	notifyPref,
	phoneCheck,
	type SmsKind,
	type SmsStatus,
	smsIn,
	smsOut,
} from "./schema/notify";

type Db = ReturnType<typeof createDb>;

/*
 * Every read and write of the notification tables: choices, phone checks,
 * and the text outbox and inbox. The person's own phone and opt-out columns
 * are `people.ts`'s, like the rest of their row.
 */

/** Everybody's choice for one topic, by user id. No entry means the default. */
export async function prefsForTopic(
	db: Db,
	topic: NotifyTopic,
): Promise<Map<string, NotifyChannel>> {
	const rows = await db
		.select({ userId: notifyPref.userId, channel: notifyPref.channel })
		.from(notifyPref)
		.where(eq(notifyPref.topic, topic))
		.all();
	return new Map(rows.map((r) => [r.userId, r.channel]));
}

/** One person's choices, by topic. */
export async function prefsOf(
	db: Db,
	userId: string,
): Promise<Map<NotifyTopic, NotifyChannel>> {
	const rows = await db
		.select({ topic: notifyPref.topic, channel: notifyPref.channel })
		.from(notifyPref)
		.where(eq(notifyPref.userId, userId))
		.all();
	return new Map(rows.map((r) => [r.topic, r.channel]));
}

export async function setPref(
	db: Db,
	userId: string,
	topic: NotifyTopic,
	channel: NotifyChannel,
): Promise<void> {
	await db
		.insert(notifyPref)
		.values({ userId, topic, channel, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [notifyPref.userId, notifyPref.topic],
			set: { channel, updatedAt: new Date() },
		});
}

export type PhoneCheck = typeof phoneCheck.$inferSelect;

export async function findPhoneCheck(
	db: Db,
	userId: string,
): Promise<PhoneCheck | null> {
	const row = await db
		.select()
		.from(phoneCheck)
		.where(eq(phoneCheck.userId, userId))
		.get();
	return row ?? null;
}

/** Start (or restart) a check. Replaces whatever code was outstanding. */
export async function putPhoneCheck(
	db: Db,
	row: Omit<PhoneCheck, "attempts">,
): Promise<void> {
	await db
		.insert(phoneCheck)
		.values({ ...row, attempts: 0 })
		.onConflictDoUpdate({
			target: phoneCheck.userId,
			set: {
				phone: row.phone,
				codeHash: row.codeHash,
				expiresAt: row.expiresAt,
				attempts: 0,
				sends: row.sends,
				windowStart: row.windowStart,
				lastSentAt: row.lastSentAt,
			},
		});
}

/**
 * Count a wrong code. In SQL rather than read-add-write, so five guesses
 * fired at once still count as five.
 */
export async function countWrongCode(db: Db, userId: string): Promise<void> {
	await db
		.update(phoneCheck)
		.set({ attempts: sql`${phoneCheck.attempts} + 1` })
		.where(eq(phoneCheck.userId, userId));
}

export async function deletePhoneCheck(db: Db, userId: string): Promise<void> {
	await db.delete(phoneCheck).where(eq(phoneCheck.userId, userId));
}

export type QueuedText = {
	userId: string;
	gameId?: string | null;
	sendId?: string | null;
	kind: SmsKind;
	toPhone: string;
	body: string;
	sendAfter: Date;
};

/**
 * Put texts in the outbox. Chunked: D1 allows a hundred bound parameters a
 * statement and a row here binds eight.
 */
export async function queueTexts(db: Db, texts: QueuedText[]): Promise<void> {
	const rows = texts.map((t) => ({
		id: crypto.randomUUID(),
		userId: t.userId,
		gameId: t.gameId ?? null,
		sendId: t.sendId ?? null,
		kind: t.kind,
		toPhone: t.toPhone,
		body: t.body,
		sendAfter: t.sendAfter,
	}));
	for (let i = 0; i < rows.length; i += 10) {
		await db.insert(smsOut).values(rows.slice(i, i + 10));
	}
}

/** A claimed text, with what the drain needs to know about its reader now. */
export type ClaimedText = {
	id: string;
	userId: string;
	gameId: string | null;
	kind: SmsKind;
	toPhone: string;
	body: string;
	person: {
		phone: string | null;
		smsOptedOutAt: Date | null;
		status: string;
		banned: boolean | null;
		linkToken: string | null;
	} | null;
};

/**
 * Take up to `limit` texts that are due. One UPDATE ... RETURNING, so two
 * drains running at once (the cron and a send's own) never get the same
 * row. A row a drain claimed and never came back for is failed rather than
 * retried: it may well have gone, and a second copy of "you're in" is worse
 * than a missing one when the email went too.
 */
export async function claimTexts(
	db: Db,
	now: Date,
	limit: number,
): Promise<ClaimedText[]> {
	await db
		.update(smsOut)
		.set({ status: "failed", error: "The drain that took it never finished." })
		.where(
			and(
				eq(smsOut.status, "sending"),
				lt(smsOut.sendAfter, new Date(now.getTime() - 15 * 60_000)),
			),
		);
	const claimed = await db
		.update(smsOut)
		.set({ status: "sending", sendAfter: now })
		.where(
			inArray(
				smsOut.id,
				db
					.select({ id: smsOut.id })
					.from(smsOut)
					.where(and(eq(smsOut.status, "queued"), lte(smsOut.sendAfter, now)))
					.orderBy(smsOut.createdAt)
					.limit(limit),
			),
		)
		.returning({
			id: smsOut.id,
			userId: smsOut.userId,
			gameId: smsOut.gameId,
			kind: smsOut.kind,
			toPhone: smsOut.toPhone,
			body: smsOut.body,
		});
	if (claimed.length === 0) return [];
	const people = await db
		.select({
			id: user.id,
			phone: user.phone,
			smsOptedOutAt: user.smsOptedOutAt,
			status: user.status,
			banned: user.banned,
			linkToken: user.linkToken,
		})
		.from(user)
		.where(inArray(user.id, [...new Set(claimed.map((c) => c.userId))]))
		.all();
	const byId = new Map(people.map(({ id, ...p }) => [id, p]));
	return claimed.map((c) => ({ ...c, person: byId.get(c.userId) ?? null }));
}

/** What became of a text once the drain tried it. */
export async function settleText(
	db: Db,
	id: string,
	result: {
		status: Extract<SmsStatus, "sent" | "failed" | "skipped">;
		telnyxId?: string | null;
		error?: string | null;
	},
): Promise<void> {
	await db
		.update(smsOut)
		.set({
			status: result.status,
			telnyxId: result.telnyxId ?? null,
			error: result.error?.slice(0, 500) ?? null,
			sentAt: result.status === "sent" ? new Date() : null,
		})
		.where(eq(smsOut.id, id));
}

/**
 * Telnyx's last word on a text, from the `message.finalized` webhook. Only
 * moves a row on from `sent`, so a late or repeated webhook cannot undo it.
 */
export async function finalizeText(
	db: Db,
	telnyxId: string,
	result: { delivered: boolean; error?: string | null },
): Promise<void> {
	await db
		.update(smsOut)
		.set({
			status: result.delivered ? "delivered" : "failed",
			error: result.error?.slice(0, 500) ?? null,
		})
		.where(and(eq(smsOut.telnyxId, telnyxId), eq(smsOut.status, "sent")));
}

/** How many texts are waiting, and how many of those are due now. */
export async function outboxCounts(
	db: Db,
	now: Date,
): Promise<{ queued: number; due: number }> {
	const row = await db
		.select({
			queued: sql<number>`count(*)`,
			due: sql<number>`coalesce(sum(case when ${smsOut.sendAfter} <= ${now.getTime()} then 1 else 0 end), 0)`,
		})
		.from(smsOut)
		.where(eq(smsOut.status, "queued"))
		.get();
	return { queued: row?.queued ?? 0, due: row?.due ?? 0 };
}

/**
 * The nights we have texted somebody about lately, newest first: what a
 * bare IN or OUT can mean. The caller picks the first one still open.
 */
export async function recentlyTextedGames(
	db: Db,
	userId: string,
	since: Date,
): Promise<string[]> {
	const rows = await db
		.select({ gameId: smsOut.gameId })
		.from(smsOut)
		.where(
			and(
				eq(smsOut.userId, userId),
				isNotNull(smsOut.gameId),
				gte(smsOut.createdAt, since),
				inArray(smsOut.status, ["sent", "delivered", "sending"]),
				sql`${smsOut.kind} != 'reply'`,
			),
		)
		.orderBy(desc(smsOut.createdAt))
		.limit(20)
		.all();
	return [...new Set(rows.map((r) => r.gameId as string))];
}

/**
 * Write down a text that reached us. False when Telnyx has already
 * delivered this one, which it will if we were slow to answer.
 */
export async function recordInbound(
	db: Db,
	row: { id: string; userId: string | null; fromPhone: string; text: string },
): Promise<boolean> {
	const result = await db
		.insert(smsIn)
		.values({ ...row, text: row.text.slice(0, 320) })
		.onConflictDoNothing()
		.run();
	return result.meta.changes === 1;
}

export async function setInboundOutcome(
	db: Db,
	id: string,
	outcome: string,
): Promise<void> {
	await db.update(smsIn).set({ outcome }).where(eq(smsIn.id, id));
}

/** How many texts from this person we answered with `outcome` since then. */
export async function countInbound(
	db: Db,
	userId: string,
	outcome: string,
	since: Date,
): Promise<number> {
	const row = await db
		.select({ n: sql<number>`count(*)` })
		.from(smsIn)
		.where(
			and(
				eq(smsIn.userId, userId),
				eq(smsIn.outcome, outcome),
				gte(smsIn.createdAt, since),
			),
		)
		.get();
	return row?.n ?? 0;
}
