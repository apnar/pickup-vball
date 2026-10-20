import type { Rendered } from "../telnyx";
import {
	baseFacts,
	peopleAre,
	type RsvpFacts,
	render,
	spotsLeft,
} from "./rsvp";

/** Stage 03. Late morning, spots left. The email that resolves a maybe. */
export function rsvpLastCallEmail(input: RsvpFacts): Rendered {
	return render({
		subject: `Last call for tonight: ${input.inCount} in so far.`,
		title: "Last call",
		kicker: "Last call",
		heading: "Can you make it tonight?",
		lead: `${peopleAre(input.inCount)} in so far, with ${spotsLeft(input)} left. Answers close at ${input.closeAt}, and teams are made from whoever is in.`,
		facts: [
			...baseFacts(input),
			{ label: "Answers close", value: input.closeAt },
		],
		notes: input.notes,
		// No Maybe. This email exists to resolve maybes, and handing one back
		// the button that made the problem is how teams get made around five
		// people nobody can count on.
		answers: ["in", "out"],
		tail: "A maybe does not hold a spot, so please pick in or out.",
		facts_: input,
	});
}
