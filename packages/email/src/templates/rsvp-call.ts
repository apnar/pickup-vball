import type { Rendered } from "../telnyx";
import { baseFacts, type RsvpFacts, render } from "./rsvp";

export type RsvpCallInput = RsvpFacts & {
	/** The night is today, not tomorrow -- a gym booked late. */
	today: boolean;
};

/** Stage 01. The evening before: there is a gym, who is coming? */
export function rsvpCallEmail(input: RsvpCallInput): Rendered {
	const day = input.today ? "tonight" : "tomorrow";
	const heading = `Volleyball ${day}. Are you in?`;

	return render({
		subject: `Volleyball ${day}, ${input.timeLabel}. Are you in?`,
		title: heading,
		kicker: input.today ? "Tonight" : "Tomorrow",
		heading,
		// A night booked on the day may be booked after the close time, so
		// only the evening-before call names it.
		lead: input.today
			? "Tap an answer below to let everyone know if you are coming."
			: `Tap an answer below to let everyone know if you are coming. Please answer by ${input.closeAt} tomorrow.`,
		facts: baseFacts(input),
		notes: input.notes,
		answers: ["in", "maybe", "out"],
		tail: 'Maybe keeps you on the reminders but does not hold a spot. Only an "I\'m in" does.',
		facts_: input,
	});
}
