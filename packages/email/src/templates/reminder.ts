import { emailLink } from "../links";
import {
	button,
	factsTable,
	layout,
	listFooter,
	listFooterText,
	para,
} from "../render";
import type { Rendered } from "../telnyx";

export type ReminderInput = {
	gameId: string;
	dateLabel: string;
	timeLabel: string;
	location: string;
	formatLabel: string;
	notes: string | null;
	siteUrl: string;
};

/**
 * A few hours before a night that is on, to the people who are in. The
 * answers are closed by then, so there is nothing to tap but the night.
 */
export function reminderEmail(input: ReminderInput): Rendered {
	const subject = `See you tonight at ${input.timeLabel}`;
	const link = emailLink(input.siteUrl, `/rsvp/${input.gameId}`);
	const facts = [
		{ label: "When", value: `${input.dateLabel}, ${input.timeLabel}` },
		{ label: "Where", value: input.location },
		{ label: "Format", value: input.formatLabel },
	];
	const lead = "The night is on and you're in. Bring water and court shoes.";

	const html = layout({
		title: subject,
		kicker: "Tonight",
		heading: subject,
		bodyHtml: [
			para(lead),
			factsTable(facts),
			input.notes ? para(input.notes) : "",
			button("See the night", link),
		]
			.filter(Boolean)
			.join("\n"),
		footerHtml: listFooter(),
	});
	const text = [
		lead,
		"",
		...facts.map((f) => `${f.label}: ${f.value}`),
		...(input.notes ? ["", input.notes] : []),
		"",
		`See the night: ${link}`,
		"",
		listFooterText(),
	].join("\n");
	return { subject, html, text };
}
