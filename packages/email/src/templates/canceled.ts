import { emailLink } from "../links";
import {
	button,
	escapeHtml,
	factsTable,
	layout,
	listFooter,
	listFooterText,
	muted,
	para,
} from "../render";
import type { Rendered } from "../telnyx";

export type CanceledInput = {
	dateLabel: string;
	timeLabel: string;
	location: string;
	siteUrl: string;
};

/**
 * An admin called a night off by hand. Never for the count: whoever is in
 * plays, so this only goes when something else stops the night.
 *
 * No answer buttons: there is nothing left to answer. It goes to everybody
 * asked about the night, answered or not, and to whoever signed up a guest,
 * because someone who missed every email is the one most likely to drive
 * to a locked gym out of habit, and a guest has no inbox here at all.
 */
export function canceledEmail(input: CanceledInput): Rendered {
	const heading = `No volleyball ${input.dateLabel}.`;
	const lead =
		"The organisers have had to call this night off. Sorry for the change, and look out for the next night's email.";
	const facts = [
		{ label: "When", value: `${input.dateLabel}, ${input.timeLabel}` },
		{ label: "Where", value: input.location },
	];
	const guestNote =
		"Signed up a guest who is not on the email list? They do not get these emails, so please let them know before they head over.";
	const link = emailLink(input.siteUrl, "/schedule");

	const html = layout({
		title: `Called off: ${input.dateLabel}`,
		kicker: "Called off",
		heading,
		bodyHtml: [
			para(lead),
			factsTable(facts),
			button("See the schedule", link),
			muted(escapeHtml(guestNote)),
		].join("\n"),
		footerHtml: listFooter(),
	});

	const text = [
		heading,
		"",
		lead,
		"",
		...facts.map((f) => `${f.label}: ${f.value}`),
		"",
		link,
		"",
		guestNote,
		"",
		listFooterText(),
	].join("\n");

	return {
		subject: `Called off: no volleyball ${input.dateLabel}.`,
		html,
		text,
	};
}
