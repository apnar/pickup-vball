import type { Rendered } from "../brevo";
import { type ContributionFacts, dollars, render } from "./contribution";

export type ContributionReminderInput = ContributionFacts & { body: string };

const TAIL =
	"This reminder only went to people whose payment has not been marked yet.";

/**
 * The second ask, sent by hand to whoever is still on the unpaid side of the
 * ledger. The subject is fixed here rather than left to the admin: the number
 * is the whole point of the email, and it should be readable without opening
 * it.
 */
export function contributionReminderEmail(
	input: ContributionReminderInput,
): Rendered {
	return render({
		...input,
		subject: `Reminder: ${dollars(input.amount)} for the gym`,
		heading: "A quick reminder",
		tail: TAIL,
	});
}

/** Prefilled in the reminder box, and editable there. */
export const CONTRIBUTION_REMINDER_BODY = [
	"This is a reminder about the gym money request that went out recently. Your share has not been marked as paid yet.",
	"You can pay using the details below. If you have already paid, thank you, and sorry for the extra email.",
].join("\n\n");
