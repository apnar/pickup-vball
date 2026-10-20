import { memberIdsOf } from "@pickup-vball/db/groups";
import { prefsForTopic, queueTexts } from "@pickup-vball/db/notify";
import {
	type Audience,
	ensureLinkToken,
	ensureUnsubscribeToken,
	listRecipients,
	markLinkSent,
	type Recipient,
} from "@pickup-vball/db/people";
import { type EmailKind, emailSend } from "@pickup-vball/db/schema/email";
import { game } from "@pickup-vball/db/schema/game";
import { rsvp } from "@pickup-vball/db/schema/rsvp";
import type {
	ListRecipient,
	ListResult,
	Rendered,
	SendOutcome,
} from "@pickup-vball/email";
import {
	messageEmail,
	messageText,
	type RsvpFacts,
	welcomeEmail,
} from "@pickup-vball/email";
import { getMailer, siteUrl } from "@pickup-vball/email/worker";
import { asc, eq } from "drizzle-orm";

import { type Split, splitAudience } from "./audience";
import type { Context } from "./context";
import { STAGE } from "./cycle";
import type { GameSummary } from "./games";
import { kickDrain } from "./jobs/sms-drain";
import { channelsFor, choiceFor, KIND_TOPIC, textSendAfter } from "./notify";
import { formatGameTime } from "./run";

type Db = Context["db"];

export type { EmailKind };

/**
 * `texted` is how many were queued a text. A queued text counts as reaching
 * them: the outbox owns it from there.
 */
export type ListSendResult = ListResult & { sendId: string; texted: number };

export function unsubscribeUrl(token: string): string {
	return `${siteUrl()}/api/unsubscribe/${token}`;
}

/**
 * The concrete sign-in link for one person. Unlike the links inside list
 * templates, this one is not a placeholder: it goes into an email
 * addressed to exactly one subscriber.
 */
export function welcomeLinkUrl(token: string): string {
	return `${siteUrl()}/api/auth/link?k=${token}&to=%2F%23rsvp`;
}

export function permitUrl(game: GameSummary): string | null {
	return game.permit ? `${siteUrl()}/api/permits/${game.permit.id}/file` : null;
}

/** Every fact the cycle emails share about one night. */
export function rsvpFacts(game: GameSummary, split: Split): RsvpFacts {
	return {
		gameId: game.id,
		dateLabel: game.dateLabel,
		timeLabel: game.timeLabel,
		location: game.location,
		notes: game.notes,
		siteUrl: siteUrl(),
		inNames: split.inNames,
		maybeNames: split.maybeNames,
		inCount: split.yes,
		capacity: game.capacity,
		formatLabel: game.kindLabel,
		closeAt: formatGameTime(STAGE.close.at),
	};
}

/** The sheet for a game, in the shape the audience split wants. */
export async function readSheet(db: Db, gameId: string) {
	return db
		.select({
			name: rsvp.name,
			nameKey: rsvp.nameKey,
			userId: rsvp.userId,
			addedBy: rsvp.addedBy,
			response: rsvp.response,
		})
		.from(rsvp)
		.where(eq(rsvp.gameId, gameId))
		.orderBy(asc(rsvp.createdAt))
		.all();
}

/**
 * Everybody active who is asked about a night: the members of its group. A
 * night from before groups has none and stays open to the whole list. Every
 * cycle email's audience is cut from this, so nobody hears about a night
 * they cannot open.
 */
export async function listAskedFor(
	db: Db,
	groupId: string | null,
): Promise<Recipient[]> {
	const active = await listRecipients(db, "active");
	if (!groupId) return active;
	const members = new Set(await memberIdsOf(db, groupId));
	return active.filter((p) => members.has(p.id));
}

/** The sheet and the night's people together, split into who hears what. */
export async function readSplit(db: Db, gameId: string): Promise<Split> {
	const night = await db
		.select({ groupId: game.groupId })
		.from(game)
		.where(eq(game.id, gameId))
		.get();
	const [rows, active] = await Promise.all([
		readSheet(db, gameId),
		listAskedFor(db, night?.groupId ?? null),
	]);
	return splitAudience(
		rows,
		active.map((p) => ({ id: p.id, name: p.name ?? "" })),
	);
}

export function renderMessage(input: {
	subject: string;
	body: string;
}): Rendered {
	return messageEmail({ ...input, siteUrl: siteUrl() });
}

/**
 * A group update as a text: what the admin wrote for texts, or the subject
 * when they wrote nothing. An update's body can run to pages; its subject
 * is the line somebody wrote to be read on its own.
 */
export function renderMessageText(input: {
	subject: string;
	text?: string | undefined;
}): string {
	return messageText({
		text: input.text?.trim() || input.subject,
		siteUrl: siteUrl(),
	});
}

/** How many people a send of this audience would reach right now. */
export async function countRecipients(
	db: Db,
	audience: Audience = "active",
): Promise<number> {
	return (await listRecipients(db, audience)).length;
}

/** Both numbers at once, for the audience picker. */
export async function recipientCounts(
	db: Db,
): Promise<{ active: number; everyone: number }> {
	const [active, everyone] = await Promise.all([
		countRecipients(db, "active"),
		countRecipients(db, "everyone"),
	]);
	return { active, everyone };
}

/**
 * Send one message to the list (or a subset by id), each person by the
 * channel they chose for this kind of message, and record the outcome in
 * `email_send`. Returns null when nobody would receive it.
 *
 * `audience` defaults to "active", which is what game email always wants:
 * somebody on a break does not need to hear that a gym is booked. Only
 * the ad-hoc message ever passes "everyone", and nothing reaches anybody
 * deactivated -- `listRecipients` will not return them at all.
 *
 * `text` is the text-message version. Without one, everybody gets the
 * email, whatever they chose: a send with nothing to text is still a send.
 * Texts are queued, not sent: `kickDrain` sends the first few dozen as this
 * request ends and the per-minute cron does the rest.
 */
export async function sendToList(
	db: Db,
	opts: {
		kind: EmailKind;
		gameId?: string | null;
		rendered: Rendered;
		text?: string | null;
		sentBy?: string | null;
		audience?: Audience;
		onlyPersonIds?: string[];
		now?: Date;
	},
): Promise<ListSendResult | null> {
	const now = opts.now ?? new Date();
	const audience = opts.audience ?? "active";
	let people = await listRecipients(db, audience);
	if (opts.onlyPersonIds) {
		const wanted = new Set(opts.onlyPersonIds);
		people = people.filter((p) => wanted.has(p.id));
	}
	if (people.length === 0) return null;

	const topic = KIND_TOPIC[opts.kind];
	const prefs = await prefsForTopic(db, topic);
	const byEmail: Recipient[] = [];
	const byText: (Recipient & { phone: string })[] = [];
	for (const p of people) {
		const ways = channelsFor(choiceFor(topic, prefs.get(p.id)), {
			canEmail: !p.emailBlocked,
			canText: !!opts.text && !!p.phone && !p.smsOptedOut,
		});
		if (ways.email) byEmail.push(p);
		if (ways.text && p.phone) byText.push({ ...p, phone: p.phone });
	}
	if (byEmail.length === 0 && byText.length === 0) return null;

	const recipients: ListRecipient[] = byEmail.map((p) => ({
		email: p.email,
		name: p.name,
		unsubscribeUrl: unsubscribeUrl(p.unsubscribeToken ?? ""),
		linkToken: p.linkToken,
	}));
	const result = await getMailer().sendList(recipients, opts.rendered, {
		tags: [opts.kind],
	});
	const sendId = crypto.randomUUID();
	await db.insert(emailSend).values({
		id: sendId,
		kind: opts.kind,
		gameId: opts.gameId ?? null,
		subject: opts.rendered.subject,
		audience,
		recipientCount: result.attempted,
		textCount: byText.length,
		failedCount: result.attempted - result.sent,
		messageIds: JSON.stringify(result.messageIds),
		errors: JSON.stringify(result.failed),
		sentBy: opts.sentBy ?? null,
	});
	if (opts.text && byText.length > 0) {
		const sendAfter = textSendAfter(now);
		await queueTexts(
			db,
			byText.map((p) => ({
				userId: p.id,
				gameId: opts.gameId ?? null,
				sendId,
				kind: opts.kind,
				toPhone: p.phone,
				body: opts.text as string,
				sendAfter,
			})),
		);
		kickDrain(db);
	}
	return { ...result, texted: byText.length, sendId };
}

/**
 * Send someone their way in: the welcome email, carrying their own sign-in
 * link. Used when an admin adds them, resends a link, or someone asks for
 * one from the login page.
 */
export async function sendWelcome(
	db: Db,
	userId: string,
	person: { email: string; name: string | null },
): Promise<SendOutcome> {
	const token = await ensureLinkToken(db, userId);
	const outcome = await getMailer().sendOne(
		{ email: person.email, name: person.name },
		welcomeEmail({ name: person.name, url: welcomeLinkUrl(token) }),
		{ tags: ["welcome"] },
	);
	if (outcome.ok) await markLinkSent(db, userId);
	return outcome;
}

/** The pair of tokens a one-off personalised send needs. */
export async function tokensFor(
	db: Db,
	userId: string,
): Promise<{ key: string; unsubscribeUrl: string }> {
	const [key, token] = await Promise.all([
		ensureLinkToken(db, userId),
		ensureUnsubscribeToken(db, userId),
	]);
	return { key, unsubscribeUrl: unsubscribeUrl(token) };
}
