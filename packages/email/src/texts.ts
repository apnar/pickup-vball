/**
 * The text-message sibling of every list email: the same facts, cut to what
 * a lock screen shows, and a reply word where the email has buttons. Each
 * one carries a sign-in link to the night with the reader's key still a
 * placeholder, filled in when the text leaves the outbox.
 *
 * Kept to two segments at most (tested), and run through `toGsm` on the way
 * out, so the copy here can be written naturally.
 */

import { PARAM } from "./render";
import { SITE_NAME } from "./sender";
import type { CanceledInput } from "./templates/canceled";
import type { CreditsAddedInput } from "./templates/credits-added";
import type { LowCreditInput } from "./templates/low-credit";
import type { ReminderInput } from "./templates/reminder";
import { type RsvpFacts, spotsLeft } from "./templates/rsvp";
import type { RsvpCallInput } from "./templates/rsvp-call";
import type { SpotOpenInput } from "./templates/spot-open";
import type { WaitlistInInput } from "./templates/waitlist-in";

/** Every text opens with who it is from: carriers expect it, and so do people. */
export const TEXT_BRAND = `${SITE_NAME}:`;

/**
 * A sign-in link that lands on a night. `g` is shorthand for
 * `to=/rsvp/<id>`, which keeps the link inside the second segment.
 */
export function textLinkToNight(siteUrl: string, gameId: string): string {
	return `${siteUrl}/api/auth/link?k=${PARAM.key}&g=${encodeURIComponent(gameId)}`;
}

/** A sign-in link to anywhere else on the site. */
export function textLink(siteUrl: string, path: string): string {
	return `${siteUrl}/api/auth/link?k=${PARAM.key}&to=${encodeURIComponent(path)}`;
}

/** The gym's name: the part of "Name, Address" a text has room for. */
export function placeOf(location: string): string {
	return location.split(",")[0]?.trim() || location;
}

function line(...parts: (string | false | null | undefined)[]): string {
	return parts.filter(Boolean).join(" ");
}

function credits(n: number): string {
	return `${n} ${Math.abs(n) === 1 ? "credit" : "credits"}`;
}

function when(f: Pick<RsvpFacts, "dateLabel" | "timeLabel">): string {
	return `${f.dateLabel}, ${f.timeLabel}`;
}

/** Stage 01. */
export function rsvpCallText(input: RsvpCallInput): string {
	const day = input.today ? "tonight" : "tomorrow";
	return line(
		TEXT_BRAND,
		`Volleyball ${day} (${when(input)}) at ${placeOf(input.location)}. Are you in? Reply IN, OUT or MAYBE.`,
		textLinkToNight(input.siteUrl, input.gameId),
	);
}

/** Stage 02. */
export function rsvpNudgeText(input: RsvpFacts): string {
	return line(
		TEXT_BRAND,
		`Tonight, ${input.timeLabel} at ${placeOf(input.location)}: ${input.inCount} in, ${spotsLeft(input)} left. Coming? Reply IN, OUT or MAYBE.`,
		textLinkToNight(input.siteUrl, input.gameId),
	);
}

/** Stage 03. */
export function rsvpLastCallText(input: RsvpFacts): string {
	return line(
		TEXT_BRAND,
		`Last call for tonight: ${input.inCount} in, ${spotsLeft(input)} left. Answers close at ${input.closeAt}. Reply IN or OUT.`,
		textLinkToNight(input.siteUrl, input.gameId),
	);
}

/** An admin called a night off. */
export function canceledText(input: CanceledInput): string {
	return line(
		TEXT_BRAND,
		`Called off: no volleyball ${when(input)} at ${placeOf(input.location)}. Signed up a guest? Please let them know.`,
		textLink(input.siteUrl, "/schedule"),
	);
}

/** Off the waitlist. */
export function waitlistInText(input: WaitlistInInput): string {
	if (input.guestName) {
		return line(
			TEXT_BRAND,
			`Your guest ${input.guestName} got a spot: ${when(input)}, ${placeOf(input.location)}. Please pass it on. To switch them out:`,
			textLinkToNight(input.siteUrl, input.gameId),
		);
	}
	return line(
		TEXT_BRAND,
		`A spot opened and you're in for ${when(input)} at ${placeOf(input.location)}. Can't make it? Reply OUT.`,
		textLinkToNight(input.siteUrl, input.gameId),
	);
}

/** A payment receipt. */
export function creditsAddedText(input: CreditsAddedInput): string {
	return line(
		TEXT_BRAND,
		`${credits(input.added)} added ($${input.amountUsd} by ${input.method}). Your balance is ${credits(input.balance)}.`,
		textLink(input.siteUrl, "/credits"),
	);
}

/** The game-day reminder, a few hours before a night. */
export function reminderText(input: ReminderInput): string {
	return line(
		TEXT_BRAND,
		`See you tonight at ${input.timeLabel}: ${input.location}.`,
		textLinkToNight(input.siteUrl, input.gameId),
	);
}

/** Down to the last credit after a night was closed. */
export function lowCreditText(input: LowCreditInput): string {
	return line(
		TEXT_BRAND,
		input.balance > 0
			? `You're down to ${credits(input.balance)}. Time to top up:`
			: `Your balance is ${credits(input.balance)}. Time to top up:`,
		textLink(input.siteUrl, "/credits"),
	);
}

/** A full night with nobody waiting has room again. */
export function spotOpenText(input: SpotOpenInput): string {
	return line(
		TEXT_BRAND,
		`A spot opened for ${when(input)} at ${placeOf(input.location)}. Reply IN to take it.`,
		textLinkToNight(input.siteUrl, input.gameId),
	);
}

/** An admin's group update: the short version they wrote for texts. */
export function messageText(input: { text: string; siteUrl: string }): string {
	return line(TEXT_BRAND, input.text.trim(), textLink(input.siteUrl, "/"));
}

/**
 * The code that proves a number is theirs. Doubles as the notice carriers
 * want at opt-in: who, what, how often, cost, STOP and HELP.
 */
export function phoneCodeText(code: string): string {
	return line(
		TEXT_BRAND,
		`your code is ${code}. It expires in 10 minutes.`,
		"You'll get texts about nights you play; frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.",
	);
}

/** The night a reply was about, as the reply names it. */
export type ReplyNight = Pick<
	RsvpFacts,
	"gameId" | "dateLabel" | "timeLabel" | "location" | "siteUrl"
> & { inCount: number };

/**
 * What we text back when somebody answers by text. Every one names the
 * night, so an IN that landed on a night they did not mean is easy to see,
 * and links to it, so it is easy to fix.
 */
export function replyText(
	input:
		| { kind: "in" | "out" | "maybe"; night: ReplyNight }
		| { kind: "waitlist"; night: ReplyNight; position: number }
		| { kind: "closed"; night: ReplyNight; closeAt: string }
		| { kind: "on-break" | "none" | "unknown"; siteUrl: string },
): string {
	switch (input.kind) {
		case "in":
			return line(
				TEXT_BRAND,
				`You're in for ${when(input.night)} at ${placeOf(input.night.location)}. ${input.night.inCount} in so far.`,
				textLinkToNight(input.night.siteUrl, input.night.gameId),
			);
		case "waitlist":
			return line(
				TEXT_BRAND,
				`${when(input.night)} is full, so you're #${input.position} on the waitlist. You'll hear if a spot opens.`,
				textLinkToNight(input.night.siteUrl, input.night.gameId),
			);
		case "out":
			return line(
				TEXT_BRAND,
				`Got it, you're out for ${when(input.night)}. Thanks for letting us know.`,
				textLinkToNight(input.night.siteUrl, input.night.gameId),
			);
		case "maybe":
			return line(
				TEXT_BRAND,
				`Marked maybe for ${when(input.night)}. A maybe doesn't hold a spot; reply IN or OUT when you know.`,
				textLinkToNight(input.night.siteUrl, input.night.gameId),
			);
		case "closed":
			return line(
				TEXT_BRAND,
				`Answers for ${when(input.night)} closed at ${input.closeAt}, so nothing changed. Need to drop out? Tell an admin.`,
			);
		case "on-break":
			return line(
				TEXT_BRAND,
				"You're on a break, so you can't take a spot yet. Mark yourself back here:",
				textLink(input.siteUrl, "/dashboard"),
			);
		case "none":
			return line(
				TEXT_BRAND,
				"There's no night open to answer right now. The next one will come with its own text.",
			);
		case "unknown":
			return line(
				TEXT_BRAND,
				"Reply IN, OUT or MAYBE to answer for the latest night we texted you about, or answer on the site:",
				textLink(input.siteUrl, "/"),
			);
	}
}
