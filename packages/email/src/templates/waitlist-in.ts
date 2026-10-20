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

export type WaitlistInInput = {
	gameId: string;
	dateLabel: string;
	timeLabel: string;
	location: string;
	formatLabel: string;
	siteUrl: string;
	/**
	 * Set when the one who got the spot is a guest: the email then goes to
	 * whoever put them on the waitlist, and names them.
	 */
	guestName?: string | null;
};

/**
 * A spot opened on a full night and the next one in line got it. Their
 * answer is already "in" -- that is what joining the waitlist asked for --
 * so the button only opens the night, where they can switch to out.
 */
export function waitlistInEmail(input: WaitlistInInput): Rendered {
	const who = input.guestName ? `${input.guestName} is` : "You're";
	const subject = `${who} in for ${input.dateLabel}`;
	const lead = input.guestName
		? `A spot opened up and ${input.guestName}, your guest, was next on the waitlist, so they're in. Please pass it on.`
		: "A spot opened up and you were next on the waitlist, so you're in.";
	const tail = input.guestName
		? "If they can't make it after all, switch them to out so the spot goes to the next person."
		: "If you can't make it after all, switch to out so the spot goes to the next person.";
	const link = emailLink(input.siteUrl, `/rsvp/${input.gameId}`);
	const facts = [
		{ label: "When", value: `${input.dateLabel}, ${input.timeLabel}` },
		{ label: "Where", value: input.location },
		{ label: "Format", value: input.formatLabel },
	];

	const html = layout({
		title: subject,
		kicker: "Off the waitlist",
		heading: subject,
		bodyHtml: [
			para(lead),
			factsTable(facts),
			button("See the night", link),
			muted(escapeHtml(tail)),
		].join("\n"),
		footerHtml: listFooter(),
	});
	const text = [
		lead,
		"",
		...facts.map((f) => `${f.label}: ${f.value}`),
		"",
		`See the night: ${link}`,
		"",
		tail,
		"",
		listFooterText(),
	].join("\n");
	return { subject, html, text };
}
