import { emailLink } from "../links";
import {
	button,
	factsTable,
	layout,
	listFooter,
	listFooterText,
	muted,
	para,
} from "../render";
import type { Rendered } from "../telnyx";

export type SpotOpenInput = {
	gameId: string;
	dateLabel: string;
	timeLabel: string;
	location: string;
	formatLabel: string;
	siteUrl: string;
};

/**
 * A night that was full has room, and nobody is waiting for it. Only to the
 * people who asked for these: it is off unless they turn it on.
 */
export function spotOpenEmail(input: SpotOpenInput): Rendered {
	const subject = `A spot opened for ${input.dateLabel}`;
	const link = emailLink(input.siteUrl, `/rsvp/${input.gameId}?a=in`);
	const facts = [
		{ label: "When", value: `${input.dateLabel}, ${input.timeLabel}` },
		{ label: "Where", value: input.location },
		{ label: "Format", value: input.formatLabel },
	];
	const lead =
		"The night was full and somebody dropped out. The spot goes to whoever says in first.";
	const tail = "You get these because you turned on spot alerts.";

	const html = layout({
		title: subject,
		kicker: "Spot open",
		heading: subject,
		bodyHtml: [
			para(lead),
			factsTable(facts),
			button("I'm in", link),
			muted(tail),
		].join("\n"),
		footerHtml: listFooter(),
	});
	const text = [
		lead,
		"",
		...facts.map((f) => `${f.label}: ${f.value}`),
		"",
		`I'm in: ${link}`,
		"",
		tail,
		"",
		listFooterText(),
	].join("\n");
	return { subject, html, text };
}
