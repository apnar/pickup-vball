import { button, escapeHtml, layout, muted, para, urlLink } from "../render";
import { SITE_NAME } from "../sender";
import type { Rendered } from "../telnyx";

export type WelcomeInput = { name: string | null; url: string };

const KEY_NOTE =
	"This link signs you in without a password. Please don't forward it: anyone who has it can sign in as you.";
const PASSWORD_NOTE =
	"Prefer a password? You can set one on your dashboard. The link keeps working either way.";

/**
 * Someone was added to the list. Their link is their key to the site, so
 * this one carries a concrete URL: no placeholders, no list footer.
 */
export function welcomeEmail(input: WelcomeInput): Rendered {
	const greeting = input.name ? `${input.name}, you` : "You";
	const lead = `${greeting} have been added to ${SITE_NAME}. The day before each night you will get an email asking if you are in, maybe or out. Tap your answer and you are set.`;
	const html = layout({
		title: `Welcome to ${SITE_NAME}`,
		kicker: "Welcome",
		heading: "You're on the list.",
		bodyHtml: [
			para(lead),
			button("Open the site", input.url),
			muted(`Or paste this into a browser:<br>${urlLink(input.url)}`),
			muted(escapeHtml(KEY_NOTE)),
			muted(escapeHtml(PASSWORD_NOTE)),
		].join("\n"),
	});
	const text = [lead, "", input.url, "", KEY_NOTE, "", PASSWORD_NOTE].join(
		"\n",
	);
	return { subject: `Welcome to ${SITE_NAME}`, html, text };
}
