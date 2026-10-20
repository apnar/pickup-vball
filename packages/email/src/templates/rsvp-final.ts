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
	urlLink,
} from "../render";
import type { Rendered } from "../telnyx";
import { baseFacts, nameList, peopleAre, type RsvpFacts } from "./rsvp";

export type RsvpFinalInput = RsvpFacts & {
	decision: "on" | "off";
	permitUrl: string | null;
};

/**
 * Stage 05. The verdict: the count is what it is.
 *
 * The only email in the cycle with no answer buttons: the question is closed.
 * When the answer is "off" it also goes wider than the rest -- to the people
 * who never answered, and to whoever signed up a guest -- because someone
 * who missed every email is the one most likely to drive to a locked gym out
 * of habit, and a guest has no inbox here at all.
 */
export function rsvpFinalEmail(input: RsvpFinalInput): Rendered {
	const on = input.decision === "on";
	const heading = on ? "On for tonight." : "No volleyball tonight.";
	const kicker = on ? "Confirmed" : "Called off";
	const lead = on
		? `${peopleAre(input.inCount)} in, so we are playing tonight.${input.inCount >= input.confirmAt ? "" : " That is fewer than usual, so sides may be smaller."} See you at the gym.`
		: `${peopleAre(input.inCount)} in, and we need at least ${input.playAt} to play, so tonight is called off. Thank you to everyone who answered. Look out for the next night's email.`;

	const facts = baseFacts(input);
	if (!on && input.maybeNames.length > 0) {
		facts.push({ label: "Maybe", value: nameList(input.maybeNames) });
	}

	const guestNote = on
		? "Signed up a guest who is not on the email list? They do not get these emails, so please pass the details on."
		: "Signed up a guest who is not on the email list? They do not get these emails, so please let them know before they head over.";
	const link = emailLink(input.siteUrl, on ? "/#rsvp" : "/schedule");

	const html = layout({
		title: on
			? `Volleyball is on: ${input.dateLabel}`
			: `Called off: ${input.dateLabel}`,
		kicker,
		heading,
		bodyHtml: [
			para(lead),
			factsTable(facts),
			input.notes && on ? para(input.notes) : "",
			on && input.permitUrl
				? muted(
						`If gym staff ask to see the permit, it is here: ${urlLink(input.permitUrl)}`,
					)
				: "",
			button(on ? "See who's in" : "See the schedule", link),
			muted(escapeHtml(guestNote)),
		]
			.filter(Boolean)
			.join("\n"),
		footerHtml: listFooter(),
	});

	const text = [
		heading,
		"",
		lead,
		"",
		...facts.map((f) => `${f.label}: ${f.value}`),
		...(input.notes && on ? ["", input.notes] : []),
		...(on && input.permitUrl ? ["", `Permit: ${input.permitUrl}`] : []),
		"",
		link,
		"",
		guestNote,
		"",
		listFooterText(),
	].join("\n");

	return {
		subject: on
			? `Volleyball is on tonight. ${input.inCount} in.`
			: `No volleyball tonight. ${input.inCount} in, ${input.playAt} needed.`,
		html,
		text,
	};
}
