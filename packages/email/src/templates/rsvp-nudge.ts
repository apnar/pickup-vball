import type { Rendered } from "../telnyx";
import {
	baseFacts,
	peopleAre,
	type RsvpFacts,
	render,
	spotsLeft,
} from "./rsvp";

/** Stage 02. The day of, spots left, and this reader has not answered. */
export function rsvpNudgeEmail(input: RsvpFacts): Rendered {
	const left = spotsLeft(input);
	return render({
		subject: `Tonight: ${input.inCount} in, ${left} left. Are you coming?`,
		title: "Are you coming tonight?",
		kicker: "Tonight",
		heading: "Are you coming tonight?",
		lead: `${peopleAre(input.inCount)} in for tonight so far. Please let us know either way by ${input.closeAt}.`,
		facts: [...baseFacts(input), { label: "Spots left", value: left }],
		notes: input.notes,
		answers: ["in", "maybe", "out"],
		tail: "This reminder only went to people who have not answered yet.",
		facts_: input,
	});
}
