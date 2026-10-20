import { ORPCError } from "@orpc/server";
import {
	countInbound,
	queueTexts,
	recentlyTextedGames,
	recordInbound,
	setInboundOutcome,
} from "@pickup-vball/db/notify";
import { findPersonByPhone, setSmsOptOut } from "@pickup-vball/db/people";
import { rsvp } from "@pickup-vball/db/schema/rsvp";
import { type ReplyNight, replyText } from "@pickup-vball/email";
import { siteUrl } from "@pickup-vball/email/worker";
import { and, eq } from "drizzle-orm";

import { recordAnswer } from "./answer";
import type { Context } from "./context";
import { STAGE } from "./cycle";
import { findGame, type GameSummary } from "./games";
import { kickDrain } from "./jobs/sms-drain";
import { formatGameTime } from "./run";
import { keywordOf, parseReply, pickNight } from "./sms-parse";
import { waitlistOrder } from "./waitlist";

type Db = Context["db"];

/** How far back a text can still be what a reply answers. */
const LOOKBACK_MS = 7 * 24 * 60 * 60_000;

function nightOf(game: GameSummary): ReplyNight {
	return {
		gameId: game.id,
		dateLabel: game.dateLabel,
		timeLabel: game.timeLabel,
		location: game.location,
		siteUrl: siteUrl(),
		inCount: game.inCount,
	};
}

export type Inbound = {
	/** Telnyx's message id: a webhook delivered twice is acted on once. */
	id: string;
	from: string;
	text: string;
	/** STOP, START or HELP when Telnyx answered it itself. */
	autoresponseType?: string | null;
};

/** Act on one text from somebody. Returns what we made of it. */
export async function handleInbound(
	db: Db,
	message: Inbound,
	now: Date = new Date(),
): Promise<string> {
	const person = await findPersonByPhone(db, message.from);
	const fresh = await recordInbound(db, {
		id: message.id,
		userId: person?.id ?? null,
		fromPhone: message.from,
		text: message.text,
	});
	if (!fresh) return "duplicate";

	const outcome = await decide(db, message, person, now);
	await setInboundOutcome(db, message.id, outcome);
	return outcome;
}

async function decide(
	db: Db,
	message: Inbound,
	person: Awaited<ReturnType<typeof findPersonByPhone>>,
	now: Date,
): Promise<string> {
	// Telnyx has already answered these and blocks or unblocks the number on
	// its side. Mirrored by phone, not person: a STOP from a number somebody
	// has since removed still means that number.
	const auto = message.autoresponseType?.toUpperCase();
	const keyword =
		auto === "STOP"
			? "stop"
			: auto === "START"
				? "start"
				: keywordOf(message.text);
	if (keyword) {
		await setSmsOptOut(db, message.from, keyword === "stop");
		return keyword;
	}
	if (auto === "HELP") return "help";
	// A stranger texting our number gets nothing back: every reply is a
	// text we pay for, to a number nobody vouched for.
	if (!person) return "unknown-number";

	const reply = async (body: string, gameId: string | null = null) => {
		await queueTexts(db, [
			{
				userId: person.id,
				gameId,
				kind: "reply",
				toPhone: message.from,
				body,
				// They just texted us; quiet hours are for texts nobody asked for.
				sendAfter: now,
			},
		]);
		kickDrain(db);
	};

	const answer = parseReply(message.text);
	if (!answer) {
		// One explanation an hour. Two auto-responders talking to each other
		// would otherwise trade texts until somebody noticed the bill.
		const since = new Date(now.getTime() - 60 * 60_000);
		if ((await countInbound(db, person.id, "unknown", since)) === 0) {
			await reply(replyText({ kind: "unknown", siteUrl: siteUrl() }));
		}
		return "unknown";
	}

	const gameIds = await recentlyTextedGames(
		db,
		person.id,
		new Date(now.getTime() - LOOKBACK_MS),
	);
	const games = (
		await Promise.all(gameIds.map((id) => findGame(db, id)))
	).filter((g): g is GameSummary => g !== null);
	const picked = pickNight(
		games.map((g) => ({
			id: g.id,
			startsAt: new Date(g.cycle.startsAt),
			status: g.status,
			decidedAt: g.decidedAt,
		})),
		now,
	);
	if (picked.kind === "none") {
		await reply(replyText({ kind: "none", siteUrl: siteUrl() }));
		return "no-night";
	}
	const target = games.find((g) => g.id === picked.id) as GameSummary;
	if (picked.kind === "closed") {
		await reply(
			replyText({
				kind: "closed",
				night: nightOf(target),
				decideAt: formatGameTime(STAGE.final.at ?? "13:00"),
			}),
			target.id,
		);
		return "closed";
	}

	let landed: Awaited<ReturnType<typeof recordAnswer>>["landed"];
	try {
		({ landed } = await recordAnswer(db, person, target.id, answer));
	} catch (error) {
		if (
			error instanceof ORPCError &&
			error.code === "BAD_REQUEST" &&
			/break/.test(error.message)
		) {
			await reply(replyText({ kind: "on-break", siteUrl: siteUrl() }));
			return "on-break";
		}
		if (error instanceof ORPCError) {
			// Not in the night's group any more, or it was called off between
			// our text and theirs.
			await reply(replyText({ kind: "none", siteUrl: siteUrl() }));
			return `refused: ${error.code}`;
		}
		throw error;
	}

	const after = (await findGame(db, target.id)) ?? target;
	const mine =
		landed === "waitlist"
			? await db
					.select({ id: rsvp.id, response: rsvp.response })
					.from(rsvp)
					.where(and(eq(rsvp.gameId, target.id), eq(rsvp.userId, person.id)))
					.get()
			: null;
	// Still waiting, unless the line moved them straight in.
	if (mine?.response === "waitlist") {
		const line = await waitlistOrder(db, target.id);
		await reply(
			replyText({
				kind: "waitlist",
				night: nightOf(after),
				position: line.indexOf(mine.id) + 1 || line.length,
			}),
			target.id,
		);
		return "waitlist";
	}
	await reply(replyText({ kind: answer, night: nightOf(after) }), target.id);
	return answer;
}
