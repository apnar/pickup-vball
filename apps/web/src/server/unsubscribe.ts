import { createDb } from "@pickup-vball/db";
import {
	findPersonByUnsubscribeToken,
	suspend,
	unsuspend,
} from "@pickup-vball/db/people";
import { escapeHtml } from "@pickup-vball/email";
import { Hono } from "hono";

import { SITE_NAME } from "@/content/run";

/*
 * These pages are served straight from the Worker, outside the React app, so
 * they carry the site's look in a style block of their own: the same tokens
 * as packages/ui/src/styles/globals.css, written out by hand. Nothing loads
 * from anywhere else -- the form has to work from a mail app's in-app browser
 * with JavaScript off, and the fonts fall back to the system's when Barlow is
 * not installed.
 */
const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0E1726; color: #EEF2F7; font-family: "Barlow", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 17px; line-height: 1.5; }
.wrap { max-width: 520px; margin: 0 auto; padding: 28px 16px 48px; }
.brand { margin: 0 0 20px; font-family: "Barlow Condensed", "Arial Narrow", Arial, sans-serif; font-weight: 800; font-size: 24px; letter-spacing: 0.04em; text-transform: uppercase; color: #F2A93B; }
.card { background: #16223A; border-radius: 16px; padding: 20px; }
.kicker { margin: 0 0 6px; font-size: 13px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #A7B4C8; }
h1 { margin: 0 0 12px; font-family: "Barlow Condensed", "Arial Narrow", Arial, sans-serif; font-weight: 800; font-size: 32px; line-height: 1.05; text-transform: uppercase; color: #EEF2F7; }
p { margin: 0 0 14px; }
.sub { color: #D3DCE8; }
form { margin: 20px 0 0; }
.field { margin: 0 0 18px; border: 0; padding: 0; min-width: 0; }
legend.label { padding: 0; }
.label { display: block; margin: 0 0 8px; font-size: 13px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #A7B4C8; }
input[type="text"] { width: 100%; min-height: 48px; padding: 10px 14px; border: 1.5px solid #3A4C70; border-radius: 10px; background: #0A111D; color: #EEF2F7; font: inherit; }
input[type="text"]::placeholder { color: #A7B4C8; }
.choice { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; margin: 0 0 6px; border-radius: 10px; background: #121D31; cursor: pointer; }
.choice:hover { background: #1C2A45; }
.choice input { width: 20px; height: 20px; margin: 0; accent-color: #F2A93B; }
button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 22px; border: 0; border-radius: 12px; background: #F2A93B; color: #0E1726; font-family: "Barlow Condensed", "Arial Narrow", Arial, sans-serif; font-weight: 700; font-size: 18px; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer; }
button:hover { background: #F5B95A; }
a { color: #F2A93B; }
.back { margin: 20px 0 0; font-size: 15px; }
:focus-visible { outline: 2px solid #F2A93B; outline-offset: 2px; }
`;

/** How long a break lasts. Weeks, because that is how injuries are measured. */
const DURATIONS = [
	{ value: "2", label: "Two weeks" },
	{ value: "4", label: "Four weeks", checked: true },
	{ value: "8", label: "Eight weeks" },
	{ value: "0", label: "Until I come back" },
] as const;

/** `body` and `formHtml` are HTML: callers escape what they put in them. */
function page(input: {
	heading: string;
	body: string;
	formHtml?: string;
	home: string;
}) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(input.heading)} | ${escapeHtml(SITE_NAME)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="wrap">
<p class="brand">${escapeHtml(SITE_NAME)}</p>
<div class="card">
<p class="kicker">Your spot</p>
<h1>${escapeHtml(input.heading)}</h1>
<p class="sub">${input.body}</p>
${input.formHtml ?? ""}
</div>
<p class="back"><a href="${escapeHtml(input.home)}">Back to the site</a></p>
</main>
</body>
</html>`;
}

function html(body: string, status: 200 | 404 = 200) {
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

/** Where a break ends, from the form's number of weeks. 0 means never. */
function untilFrom(weeks: string | undefined): Date | null {
	const n = Number(weeks);
	if (!Number.isFinite(n) || n <= 0) return null;
	return new Date(Date.now() + n * 7 * 24 * 60 * 60 * 1000);
}

function dateLabel(value: Date): string {
	return value.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		timeZone: "America/New_York",
	});
}

/**
 * The footer link from list emails lands here. There is no unsubscribe that
 * leaves somebody on the roster: email is how this group talks, so stepping
 * away from the email is stepping away from the nights. This asks
 * for how long and why, and holds their spot until then.
 *
 * It has to work from a plain tap in a mail app with no JavaScript, which is
 * why it is a real form. The GET only *shows* it -- mail clients prefetch
 * link targets, and the old version quietly unsubscribed people when they did.
 */
export const unsubscribe = new Hono();

unsubscribe.get("/:token", async (c) => {
	const token = c.req.param("token");
	const home = new URL("/", c.req.url).toString();
	const person = await findPersonByUnsubscribeToken(createDb(), token);
	if (!person || person.status === "deactivated") {
		return html(
			page({
				heading: "This link is no longer valid.",
				body: "It may belong to an account that is no longer active. Nothing has changed.",
				home,
			}),
			404,
		);
	}

	if (person.status === "suspended") {
		return html(
			page({
				heading: "You're already on a break.",
				body: `${escapeHtml(person.email)} is not getting emails about upcoming nights and is off the sheet. Ready to come back?`,
				formHtml: `<form method="post" action="/api/unsubscribe/${escapeHtml(token)}/back"><button type="submit">I'm back</button></form>`,
				home,
			}),
		);
	}

	const choices = DURATIONS.map(
		(d) =>
			`<label class="choice"><input type="radio" name="weeks" value="${d.value}"${"checked" in d && d.checked ? " checked" : ""}> ${escapeHtml(d.label)}</label>`,
	).join("");

	return html(
		page({
			heading: "Taking a break?",
			body: "While you are on a break you won't get emails about upcoming nights or have a spot on the sheet. Your account stays as it is, and one tap brings you back.",
			formHtml: `<form method="post" action="/api/unsubscribe/${escapeHtml(token)}">
<div class="field"><label class="label" for="reason">Reason (optional)</label><input type="text" id="reason" name="reason" maxlength="200" placeholder="Sprained ankle, back in a month"></div>
<fieldset class="field"><legend class="label">How long</legend>${choices}</fieldset>
<button type="submit">Start my break</button>
</form>`,
			home,
		}),
	);
});

/**
 * The form posts here, and so do mail clients honouring
 * List-Unsubscribe-Post -- which send no fields at all, so that lands as an
 * open-ended break with no reason. Exactly what "unsubscribe" used to mean.
 */
unsubscribe.post("/:token", async (c) => {
	const token = c.req.param("token");
	const home = new URL("/", c.req.url).toString();
	const db = createDb();
	const person = await findPersonByUnsubscribeToken(db, token);
	if (!person || person.status === "deactivated") {
		return c.text("This link is no longer valid.", 404);
	}

	let reason: string | undefined;
	let until: Date | null = null;
	try {
		const form = await c.req.parseBody();
		reason = typeof form.reason === "string" ? form.reason : undefined;
		until = untilFrom(typeof form.weeks === "string" ? form.weeks : undefined);
	} catch {
		// A one-click unsubscribe from a mail app: no body, no form.
	}

	await suspend(db, { userId: person.id, reason, until, by: "mail" });

	// One-click clients want a bare 200, not a page.
	if (!c.req.header("accept")?.includes("text/html")) {
		return c.text("Done. You are on a break.", 200);
	}
	return html(
		page({
			heading: until ? `See you ${dateLabel(until)}.` : "You're on a break.",
			body: until
				? `${escapeHtml(person.email)} won't get emails about upcoming nights until then, and you will be back on the list automatically. You can come back sooner at any time.`
				: `${escapeHtml(person.email)} won't get emails about upcoming nights until you come back. One tap brings you back.`,
			formHtml: `<form method="post" action="/api/unsubscribe/${escapeHtml(token)}/back"><button type="submit">Cancel my break</button></form>`,
			home,
		}),
	);
});

unsubscribe.post("/:token/back", async (c) => {
	const token = c.req.param("token");
	const home = new URL("/", c.req.url).toString();
	const db = createDb();
	const person = await findPersonByUnsubscribeToken(db, token);
	if (!person || person.status === "deactivated") {
		return c.text("This link is no longer valid.", 404);
	}
	await unsuspend(db, person.id);
	return html(
		page({
			heading: "Welcome back.",
			body: `${escapeHtml(person.email)} will get emails about upcoming nights again, and you can sign up for a spot.`,
			home,
		}),
	);
});
