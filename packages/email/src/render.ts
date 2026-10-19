/**
 * Building blocks for the HTML and text parts of every email. Inline styles
 * only, one column, no images: this has to look right in whatever mail app
 * a phone happens to open.
 */

import { SITE_NAME } from "./sender";

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/**
 * Brevo replaces these in both bodies and headers when the request carries
 * `params` (or per-recipient `messageVersions[].params`). Only list emails
 * use them; never run escapeHtml over the output of this helper.
 */
export const PARAM = {
	name: "{{ params.name }}",
	unsubscribeUrl: "{{ params.unsubscribeUrl }}",
	/** The reader's sign-in token, in every link back to the site. */
	key: "{{ params.key }}",
} as const;

/**
 * Brevo runs its template language over the whole body whenever a request
 * carries `params`, which every list email does. That is how the three
 * placeholders above get filled, and also how a guest called `{% if %}` gets
 * the whole send rejected -- and the cycle then retries it every half hour.
 * This puts a zero-width space after any `{` that opens a tag, everywhere
 * except inside our own placeholders, so what a person typed renders as they
 * typed it and means nothing to Brevo. Runs last, over the finished email,
 * which is the one place that can tell our braces from theirs.
 */
export function sealTemplate(input: string): string {
	const keep = Object.values(PARAM)
		.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("|");
	const placeholders = new RegExp(keep, "g");
	let out = "";
	let last = 0;
	for (const match of input.matchAll(placeholders)) {
		out += neutralize(input.slice(last, match.index)) + match[0];
		last = match.index + match[0].length;
	}
	return out + neutralize(input.slice(last));
}

function neutralize(text: string): string {
	return text.replace(/\{(?=[{%#])/g, "{\u200b");
}

/*
 * The site is dark, but the body of an email stays light: half the mail apps
 * out there force their own background behind a dark one, or invert it, and a
 * navy card with amber text comes out unreadable. Only the header band carries
 * the site's colours. Every text colour here clears 4.5:1 against what it sits
 * on; amber is never used for text on white, where it does not.
 */
const NAVY = "#0E1726";
const AMBER = "#F2A93B";
const INK = "#1d2433";
const MUTED = "#4b5567";
const LINK = "#24365A";

const FONT =
	"font-family: 'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;";
const CONDENSED =
	"font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;";

const styles = {
	body: `margin:0; padding:0; background:#eef1f5; ${FONT} color:${INK};`,
	wrap: "max-width:560px; margin:0 auto; padding:24px 16px;",
	band: `background:${NAVY}; padding:16px 24px; border-radius:16px 16px 0 0;`,
	brand: `margin:0; ${CONDENSED} font-size:22px; line-height:1.1; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; color:${AMBER};`,
	card: "background:#ffffff; border:1px solid #d5dbe5; border-top:0; border-radius:0 0 16px 16px; padding:28px 24px;",
	kicker: `margin:0 0 8px; font-size:13px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:${MUTED};`,
	h1: `margin:0 0 16px; ${CONDENSED} font-size:30px; line-height:1.1; font-weight:800; text-transform:uppercase; letter-spacing:0.01em; color:${NAVY};`,
	p: "margin:0 0 14px; font-size:16px; line-height:1.5;",
	facts:
		"margin:0 0 18px; padding:0; border-collapse:collapse; font-size:16px; line-height:1.5;",
	factLabel: `padding:4px 12px 4px 0; font-size:12px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:${MUTED}; vertical-align:baseline; white-space:nowrap;`,
	factValue: "padding:4px 0; font-weight:600; vertical-align:baseline;",
	button: `display:inline-block; padding:13px 22px; background:${AMBER}; color:${NAVY} !important; text-decoration:none; ${CONDENSED} font-weight:700; font-size:17px; letter-spacing:0.04em; text-transform:uppercase; border-radius:12px;`,
	muted: `color:${MUTED}; font-size:14px; line-height:1.5;`,
	footer: `margin:16px 0 0; padding:0 4px; color:${MUTED}; font-size:12px; line-height:1.5;`,
	link: `color:${LINK}; text-decoration:underline;`,
} as const;

export type Fact = { label: string; value: string };

/** One escaped paragraph. */
export function para(text: string): string {
	return `<p style="${styles.p}">${escapeHtml(text)}</p>`;
}

/** Escaped paragraphs from a block of plain text (blank line = new paragraph). */
export function paragraphs(text: string): string {
	return text
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map(
			(block) =>
				`<p style="${styles.p}">${escapeHtml(block).replaceAll("\n", "<br>")}</p>`,
		)
		.join("\n");
}

/** A small label/value table, escaped. */
export function factsTable(facts: Fact[]): string {
	const rows = facts
		.map(
			(f) =>
				`<tr><td style="${styles.factLabel}">${escapeHtml(f.label)}</td><td style="${styles.factValue}">${escapeHtml(f.value)}</td></tr>`,
		)
		.join("");
	return `<table role="presentation" style="${styles.facts}">${rows}</table>`;
}

/** A call-to-action link styled as a button. `href` must already be safe. */
export function button(label: string, href: string): string {
	return `<p style="margin:20px 0 6px;"><a href="${escapeHtml(href)}" style="${styles.button}">${escapeHtml(label)}</a></p>`;
}

/** A URL shown as itself, for the "or paste this" lines. Escaped. */
export function urlLink(url: string): string {
	return `<a href="${escapeHtml(url)}" style="${styles.link} word-break:break-all;">${escapeHtml(url)}</a>`;
}

export function muted(html: string): string {
	return `<p style="${styles.p} ${styles.muted}">${html}</p>`;
}

/**
 * Footer for list emails: who this is and how to step away. There is no
 * unsubscribe-and-stay-on-the-roster -- email is how this group talks, so
 * leaving the email means stepping away from the nights for a while. The
 * link opens a form that asks for how long and why. Uses raw placeholders.
 */
export function listFooter(): string {
	return `<p style="${styles.footer}">You get these because you are in the group. Links in this email sign you in, so please don't forward it. Need time off for an injury, travel or anything else? <a href="${PARAM.unsubscribeUrl}" style="${styles.link}">Take a break</a> and we will keep your spot.</p>`;
}

export function listFooterText(): string {
	return `You get these because you are in the group.\nLinks in this email sign you in, so please don't forward it.\nNeed time off for an injury, travel or anything else? Take a break: ${PARAM.unsubscribeUrl}`;
}

export function layout(input: {
	title: string;
	kicker?: string;
	heading: string;
	bodyHtml: string;
	footerHtml?: string;
}): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="${styles.body}">
<div style="${styles.wrap}">
<div style="${styles.band}">
<p style="${styles.brand}">${escapeHtml(SITE_NAME)}</p>
</div>
<div style="${styles.card}">
${input.kicker ? `<p style="${styles.kicker}">${escapeHtml(input.kicker)}</p>\n` : ""}<h1 style="${styles.h1}">${escapeHtml(input.heading)}</h1>
${input.bodyHtml}
</div>
${input.footerHtml ?? ""}
</div>
</body>
</html>`;
}
