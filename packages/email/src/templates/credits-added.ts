import type { Rendered } from "../brevo";
import { emailLink } from "../links";
import {
	button,
	factsTable,
	layout,
	listFooter,
	listFooterText,
	para,
} from "../render";

export type CreditsAddedInput = {
	/** Credits added by this payment. */
	added: number;
	/** The balance after it, which may still be below zero. */
	balance: number;
	/** "Venmo", "Cash" or "Other". */
	method: string;
	/** Whole dollars received. */
	amountUsd: number;
	siteUrl: string;
};

function credits(n: number): string {
	return `${n} ${Math.abs(n) === 1 ? "credit" : "credits"}`;
}

/**
 * The receipt for a payment, to the one person who made it. Sent through the
 * list machinery so the button carries their own sign-in key, and it lands on
 * `/credits`, which shows the history and writes nothing.
 */
export function creditsAddedEmail(input: CreditsAddedInput): Rendered {
	const subject = `${credits(input.added)} added`;
	const link = emailLink(input.siteUrl, "/credits");
	const lead =
		input.balance > 0
			? `Thanks for paying. Your balance is now ${credits(input.balance)}, which covers your next ${input.balance === 1 ? "night" : `${input.balance} nights`}.`
			: `Thanks for paying. Your balance is now ${credits(input.balance)}, so you are still behind for nights already played.`;
	const facts = [
		{ label: "Added", value: credits(input.added) },
		{ label: "Paid", value: `$${input.amountUsd} by ${input.method}` },
		{ label: "Balance", value: credits(input.balance) },
	];

	const html = layout({
		title: subject,
		kicker: "Credits",
		heading: subject,
		bodyHtml: [
			para(lead),
			factsTable(facts),
			button("See your credits", link),
		].join("\n"),
		footerHtml: listFooter(),
	});
	const text = [
		lead,
		"",
		...facts.map((f) => `${f.label}: ${f.value}`),
		"",
		`See your credits: ${link}`,
		"",
		listFooterText(),
	].join("\n");
	return { subject, html, text };
}
