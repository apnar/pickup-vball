/**
 * The copy that describes where a night's RSVPs stand. One place, because it
 * is read on the home page, on the confirm page a cycle email lands on, and
 * beside the guest box -- and three copies of a sentence drift apart.
 */

import type { Headcount } from "@pickup-vball/api/routers/rsvp";

export type RsvpAnswer = "in" | "maybe" | "out";

/** What a row can say: an answer, or waiting in line for a spot. */
export type RowResponse = RsvpAnswer | "waitlist";

/** Waiting is a yes that has not got a spot yet, so the picker shows In. */
export function asAnswer(response: RowResponse | null): RsvpAnswer | null {
	return response === "waitlist" ? "in" : response;
}

export const ANSWERS: readonly RsvpAnswer[] = ["in", "maybe", "out"];

export type Counts = Headcount["counts"];

type Limits = { confirmAt: number; playAt: number; capacity: number };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The one line at the top. First match wins. */
export function headline(
	counts: Counts,
	limits: Limits,
	status: "scheduled" | "confirmed" | "canceled",
	decided: boolean,
): string {
	if (status === "canceled") return "This night is off.";
	if (status === "confirmed") {
		return decided ? "It’s on. See you there." : "It’s on.";
	}
	if (counts.in >= limits.capacity) return "The night is full.";
	if (counts.in >= limits.confirmAt) return "Enough to confirm.";
	if (counts.in >= limits.playAt) return "Enough to play.";
	return "Still filling up.";
}

/**
 * The next threshold, in words, always with a number in it.
 *
 * The sheet holds more than the number that confirms a night, so "six spots
 * left" and "four more to confirm" are both true at once and side by side
 * they contradict each other. Lead with the number that decides whether
 * there is a night at all, and only mention spots once there is one.
 */
export function subline(
	counts: Counts,
	limits: Limits,
	status: "scheduled" | "confirmed" | "canceled",
): string {
	if (status === "canceled") {
		return `${counts.in} ${plural(counts.in, "was", "were")} in when the night was decided, and ${limits.playAt} are needed to play.`;
	}
	if (status === "confirmed") {
		const left = limits.capacity - counts.in;
		if (counts.waitlist > 0) {
			return `${counts.waitlist} on the waitlist. If you can’t make it after all, switch to out and the next person gets your spot.`;
		}
		if (left <= 0) {
			return "If you can’t make it after all, switch to out so the spot can go to someone else.";
		}
		return `${left} ${plural(left, "spot", "spots")} left.`;
	}
	if (counts.in >= limits.playAt) {
		const need = Math.max(0, limits.confirmAt - counts.in);
		const maybes = counts.maybe
			? ` ${counts.maybe} ${plural(counts.maybe, "maybe isn’t", "maybes aren’t")} counted.`
			: "";
		return need > 0
			? `${need} more to confirm the night.${maybes}`
			: `Confirmed as soon as the count is updated.${maybes}`;
	}
	const short = limits.playAt - counts.in;
	const quiet = counts.silent
		? ` ${counts.silent} ${plural(counts.silent, "person hasn’t", "people haven’t")} replied yet.`
		: " Everyone has replied.";
	return `${short} more needed to play.${quiet}`;
}

/** What the viewer's own answer means for them, under the picker. */
export function yourLine(
	answer: RowResponse | null,
	locked: boolean,
	place: number | null = null,
	full = false,
): string {
	if (locked) return "This night has been decided, so answers are closed.";
	switch (answer) {
		case "waitlist":
			return `You’re number ${place ?? "?"} on the waitlist. If a spot opens up, you’re moved in automatically and get an email.`;
		case "in":
			return "You’re in. If plans change, switch to out so your spot can go to someone else.";
		case "maybe":
			return "Maybe doesn’t hold a spot. You’ll still get the last-call email.";
		case "out":
			return "You’re out. Thanks for letting everyone know.";
		default:
			return full
				? "The night is full. Tap In to join the waitlist."
				: "You haven’t answered yet.";
	}
}

/**
 * What to say beside the guest box.
 *
 * Guests are for short nights. The group is asked several times over two
 * days and usually fills itself, and a box that reads the same at noon as it
 * does at the last call suggests every night needs outside help. Nothing
 * here stops anybody -- you can always add a name, and a guest you already
 * invited is not something to argue with a form about. Only the wording
 * changes.
 */
export function guestLine(
	counts: Counts,
	limits: Limits,
	lastCallPassed: boolean,
	locked: boolean,
): string {
	if (locked) return "Answers are closed for this night.";
	if (counts.in >= limits.confirmAt) {
		return `${counts.in} are in, so the night is covered. A guest now takes a spot someone in the group might want.`;
	}
	if (!lastCallPassed) {
		return "Guests help most on short nights. The group usually fills up by the last call, so it may be worth waiting.";
	}
	const short = limits.confirmAt - counts.in;
	return `The night is ${short} short of ${limits.confirmAt}. A guest would help.`;
}
