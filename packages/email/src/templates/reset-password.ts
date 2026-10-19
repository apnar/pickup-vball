import type { Rendered } from "../brevo";
import { button, escapeHtml, layout, muted, para, urlLink } from "../render";

export type ResetPasswordInput = { name: string; url: string };

/** Better Auth password reset. No list footer: this is not a list email. */
export function resetPasswordEmail(input: ResetPasswordInput): Rendered {
	const lead = `${input.name}, use the button below to choose a new password. The link expires in an hour.`;
	const ignore =
		"Didn't ask for this? You can ignore this email. Your password has not changed.";
	const html = layout({
		title: "Reset your password",
		kicker: "Account",
		heading: "Reset your password.",
		bodyHtml: [
			para(lead),
			button("Reset my password", input.url),
			muted(`Or paste this into a browser:<br>${urlLink(input.url)}`),
			muted(escapeHtml(ignore)),
		].join("\n"),
	});
	const text = [lead, "", input.url, "", ignore].join("\n");
	return { subject: "Reset your password", html, text };
}
