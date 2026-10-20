import { emailLink } from "../links";
import { button, layout, listFooter, listFooterText, para } from "../render";
import type { Rendered } from "../telnyx";

export type LowCreditInput = {
	/** What is left after the night just closed. One, or less. */
	balance: number;
	siteUrl: string;
};

function credits(n: number): string {
	return `${n} ${Math.abs(n) === 1 ? "credit" : "credits"}`;
}

/**
 * The balance fell to the last credit when a night was closed. A heads-up,
 * not a bill: a negative balance never stops anybody playing.
 */
export function lowCreditEmail(input: LowCreditInput): Rendered {
	const subject =
		input.balance > 0
			? `You're down to ${credits(input.balance)}`
			: `Your balance is ${credits(input.balance)}`;
	const link = emailLink(input.siteUrl, "/credits");
	const lead =
		input.balance > 0
			? `You have ${credits(input.balance)} left after the last night. When you top up, an admin adds the credits and you'll get a receipt.`
			: `Your balance is ${credits(input.balance)} after the last night. When you pay, an admin adds the credits and you'll get a receipt.`;

	const html = layout({
		title: subject,
		kicker: "Credits",
		heading: subject,
		bodyHtml: [para(lead), button("See your credits", link)].join("\n"),
		footerHtml: listFooter(),
	});
	const text = [
		lead,
		"",
		`See your credits: ${link}`,
		"",
		listFooterText(),
	].join("\n");
	return { subject, html, text };
}
