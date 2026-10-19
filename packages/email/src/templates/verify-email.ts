import type { Rendered } from "../brevo";
import { button, escapeHtml, layout, muted, para, urlLink } from "../render";

export type VerifyEmailInput = { name: string; url: string };

/** Better Auth email verification. No list footer: this is not a list email. */
export function verifyEmail(input: VerifyEmailInput): Rendered {
	const lead = `${input.name}, please confirm that this is your email address.`;
	const ignore = "Didn't sign up? You can ignore this email.";
	const html = layout({
		title: "Confirm your email",
		kicker: "Account",
		heading: "Confirm your email.",
		bodyHtml: [
			para(lead),
			button("Confirm my email", input.url),
			muted(
				`If the button doesn't work, paste this into a browser:<br>${urlLink(input.url)}`,
			),
			muted(escapeHtml(ignore)),
		].join("\n"),
	});
	const text = [lead, "", input.url, "", ignore].join("\n");
	return { subject: "Confirm your email", html, text };
}
