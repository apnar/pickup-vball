import type { Rendered } from "../brevo";
import { baseFacts, peopleAre, type RsvpFacts, render } from "./rsvp";

export type RsvpNudgeInput = RsvpFacts & { needed: number };

/** Stage 02. The day of, still short, and this reader has not answered. */
export function rsvpNudgeEmail(input: RsvpNudgeInput): Rendered {
	const needed = `${input.needed} more`;
	return render({
		subject: `Tonight: ${input.inCount} in, ${needed} needed. Are you coming?`,
		title: "Are you coming tonight?",
		kicker: "Tonight",
		heading: "Are you coming tonight?",
		lead: `${peopleAre(input.inCount)} in for tonight so far. ${needed} would confirm the night. Please let us know either way.`,
		facts: [...baseFacts(input), { label: "Needed", value: needed }],
		notes: input.notes,
		answers: ["in", "maybe", "out"],
		tail: "This reminder only went to people who have not answered yet.",
		facts_: input,
	});
}
