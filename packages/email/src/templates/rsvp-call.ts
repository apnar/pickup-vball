import type { Rendered } from "../telnyx";
import { baseFacts, type RsvpFacts, render } from "./rsvp";

export type RsvpCallInput = RsvpFacts & {
	/** The night is today, not tomorrow -- a gym booked late. */
	today: boolean;
	/** Enough said yes on the site before the email went out. It happens. */
	alreadyOn: boolean;
};

/** Stage 01. The evening before: there is a gym, who is coming? */
export function rsvpCallEmail(input: RsvpCallInput): Rendered {
	const day = input.today ? "tonight" : "tomorrow";
	const heading = input.alreadyOn
		? "The night is on."
		: `Volleyball ${day}. Are you in?`;

	return render({
		subject: input.alreadyOn
			? `Volleyball is on: ${input.dateLabel}. Are you in?`
			: `Volleyball ${day}, ${input.timeLabel}. Are you in?`,
		title: heading,
		kicker: input.today ? "Tonight" : "Tomorrow",
		heading,
		lead: input.alreadyOn
			? `${input.confirmAt} people signed up before this email went out, so the night is confirmed. Please still tap an answer below so the count is right.`
			: `Tap an answer below to let everyone know if you are coming. ${input.confirmAt} in confirms the night, and we need at least ${input.playAt} to play.`,
		facts: baseFacts(input),
		notes: input.notes,
		answers: ["in", "maybe", "out"],
		tail: `Maybe keeps you on the reminders but does not hold a spot. Only an "I'm in" counts toward the ${input.confirmAt}.`,
		facts_: input,
	});
}
