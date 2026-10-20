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

type Status = "scheduled" | "canceled";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The one line at the top. There is no number a night has to reach --
 * whoever is in plays -- so the only things worth saying are whether it
 * was called off and whether there is still room.
 */
export function headline(
	counts: Counts,
	capacity: number,
	status: Status,
): string {
	// The banner above already says "Called off"; this says what it means.
	if (status === "canceled") return "The organisers had to cancel.";
	if (counts.in >= capacity) return "The night is full.";
	return "Room for more.";
}

/** The line under it: who is waiting, or who has not said anything yet. */
export function subline(
	counts: Counts,
	capacity: number,
	status: Status,
): string {
	if (status === "canceled") {
		return "Look out for the next night’s email.";
	}
	if (counts.waitlist > 0) {
		return `${counts.waitlist} on the waitlist. If you can’t make it after all, switch to out and the next person gets your spot.`;
	}
	if (counts.in >= capacity) {
		return "If you can’t make it after all, switch to out so the spot can go to someone else.";
	}
	return counts.silent
		? `${counts.silent} ${plural(counts.silent, "person hasn’t", "people haven’t")} replied yet.`
		: "Everyone has replied.";
}

/** What the viewer's own answer means for them, under the picker. */
export function yourLine(
	answer: RowResponse | null,
	locked: boolean,
	place: number | null = null,
	full = false,
): string {
	if (locked) return "Answers are closed for this night.";
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
 * What to say beside the guest box. Nothing here stops anybody -- you can
 * always add a name, and a guest you already invited is not something to
 * argue with a form about. A guest takes a spot like anyone else, so the
 * only thing worth saying is whether there is one.
 */
export function guestLine(
	counts: Counts,
	capacity: number,
	locked: boolean,
): string {
	if (locked) return "Answers are closed for this night.";
	const left = capacity - counts.in;
	if (left <= 0 || counts.waitlist > 0) {
		return "The night is full, so a guest joins the waitlist.";
	}
	return `${left} ${plural(left, "spot", "spots")} left. A guest takes one like anyone else.`;
}
