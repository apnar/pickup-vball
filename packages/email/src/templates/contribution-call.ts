import type { Rendered } from "../brevo";
import { type ContributionFacts, render } from "./contribution";

export type ContributionCallInput = ContributionFacts & {
	subject: string;
	body: string;
};

const TAIL =
	"You are getting this because you are in the group. Everyone in it got the same email.";

/** The ask, sent to everybody who is playing. */
export function contributionCallEmail(input: ContributionCallInput): Rendered {
	return render({
		...input,
		heading: input.subject,
		tail: TAIL,
	});
}

/**
 * What an admin sees in the box before they touch it. Standing copy, not a
 * template: it is prefilled and editable, so a call that wants different
 * words gets them. The amount is deliberately absent from the prose -- the
 * facts table carries the number, and one place for it means the two cannot
 * disagree after an edit.
 */
export function contributionCallDefaults(_amount: number): {
	subject: string;
	body: string;
} {
	return {
		subject: "Gym money",
		body: [
			"The gym rental has been paid, and this is everyone's share of it.",
			"The amount is the same for everyone in the group, however many nights you made it to: the gym was booked for all of them.",
			"How to pay is below. Once your payment comes in you will be marked as paid, and you will not get any reminders.",
		].join("\n\n"),
	};
}
