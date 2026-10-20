import type { Rendered } from "../telnyx";
import { baseFacts, peopleAre, type RsvpFacts, render } from "./rsvp";

export type RsvpLastCallInput = RsvpFacts & {
	needed: number;
	/** The night was confirmed, and then enough people dropped back out. */
	wasConfirmed: boolean;
};

/** Stage 04. Mid-afternoon, still short. The email that resolves a maybe. */
export function rsvpLastCallEmail(input: RsvpLastCallInput): Rendered {
	const rule = `At ${input.decideAt} we make the final call: with ${input.playAt} or more in, the night is on; with fewer, it is called off.`;
	return render({
		subject: `Last call for tonight: ${input.inCount} in so far.`,
		title: "Last call",
		kicker: "Last call",
		heading: "Can you make it tonight?",
		lead: input.wasConfirmed
			? `The night was confirmed, but a few people have since dropped out and ${peopleAre(input.inCount)} in now. ${rule}`
			: `${peopleAre(input.inCount)} in so far, and ${input.needed} more would confirm the night. ${rule}`,
		facts: [
			...baseFacts(input),
			{ label: "Final call", value: input.decideAt },
		],
		notes: input.notes,
		// No Maybe. This email exists to resolve maybes, and handing one back
		// the button that made the problem is how a night reaches the verdict
		// with six in and five maybes.
		answers: ["in", "out"],
		tail: "A maybe does not count at the final call, so please pick in or out.",
		facts_: input,
	});
}
