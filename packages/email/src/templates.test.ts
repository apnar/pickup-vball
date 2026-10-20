import { describe, expect, it } from "vitest";

import { escapeHtml, PARAM } from "./render";
import {
	canceledEmail,
	creditsAddedEmail,
	messageEmail,
	type RsvpFacts,
	reminderEmail,
	resetPasswordEmail,
	rsvpCallEmail,
	rsvpLastCallEmail,
	rsvpNudgeEmail,
	verifyEmail,
	waitlistInEmail,
	welcomeEmail,
} from "./templates";

const site = "https://vball.moco-pickup.com";

const facts: RsvpFacts = {
	gameId: "g-1",
	dateLabel: "Mon, Sep 14",
	timeLabel: "7:30 – 10:00 PM",
	location: "Shady Grove <Middle> School",
	notes: "Park by the side door & bring water",
	siteUrl: site,
	inNames: ["Ana", "Marco"],
	maybeNames: ["Pete"],
	inCount: 7,
	capacity: 42,
	formatLabel: "4 v 4",
	closeAt: "1:00 PM",
};

describe("the cycle emails", () => {
	const call = rsvpCallEmail({ ...facts, today: false });
	const nudge = rsvpNudgeEmail(facts);
	const lastCall = rsvpLastCallEmail(facts);
	const all = [call, nudge, lastCall];

	it("escape whatever an admin typed", () => {
		expect(call.html).toContain("Shady Grove &lt;Middle&gt; School");
		expect(call.html).toContain("side door &amp; bring");
		expect(call.html).not.toContain("<Middle>");
	});

	it("say how the night is played", () => {
		for (const r of all) expect(r.text).toContain("Format: 4 v 4");
	});

	it("carry the unsubscribe placeholder in both parts", () => {
		for (const r of all) {
			expect(r.html).toContain(PARAM.unsubscribeUrl);
			expect(r.text).toContain(PARAM.unsubscribeUrl);
			expect(r.text.trim().length).toBeGreaterThan(0);
		}
	});

	it("send everyone back through their own sign-in link", () => {
		for (const r of all) {
			expect(r.html).toContain(PARAM.key);
			expect(r.text).toContain(PARAM.key);
		}
	});

	it("offer three answers before the last call and two at it", () => {
		for (const answer of ["in", "maybe", "out"]) {
			expect(call.text).toContain(`%2Frsvp%2Fg-1%3Fa%3D${answer}`);
			expect(nudge.text).toContain(`%2Frsvp%2Fg-1%3Fa%3D${answer}`);
		}
		// The last call exists to turn a maybe into an answer. Handing back the
		// button that made the problem is how answers close on five maybes.
		expect(lastCall.text).not.toContain("%3Fa%3Dmaybe");
	});

	it("say where the count stands, and never what it would take", () => {
		expect(call.subject).toBe(
			"Volleyball tomorrow, 7:30 – 10:00 PM. Are you in?",
		);
		expect(nudge.subject).toBe("Tonight: 7 in, 35 spots left. Are you coming?");
		expect(lastCall.subject).toBe("Last call for tonight: 7 in so far.");
		expect(call.text).toContain("Ana, Marco");
		// Whoever is in plays. No email may suggest a number the night needs.
		for (const r of all)
			expect(r.text).not.toMatch(/needed|confirm|called off/i);
	});

	it("name the close time they were given, not one of their own", () => {
		expect(call.text).toContain("Please answer by 1:00 PM tomorrow");
		expect(nudge.text).toContain("either way by 1:00 PM");
		expect(lastCall.text).toContain("Answers close at 1:00 PM");
		expect(lastCall.text).toContain("Answers close: 1:00 PM");
	});

	it("says tonight when the gym was booked the same day", () => {
		const today = rsvpCallEmail({ ...facts, today: true });
		expect(today.subject).toContain("tonight");
		expect(today.text).toContain("Volleyball tonight. Are you in?");
		// It may be past the close already: it names no deadline.
		expect(today.text).not.toContain("1:00 PM");
	});
});

describe("canceled", () => {
	const off = canceledEmail({
		dateLabel: facts.dateLabel,
		timeLabel: facts.timeLabel,
		location: facts.location,
		siteUrl: site,
	});

	it("says it is off without a headcount", () => {
		expect(off.subject).toBe("Called off: no volleyball Mon, Sep 14.");
		expect(off.text).not.toMatch(/\d+ in\b/);
	});

	it("tells a sponsor to pass it on", () => {
		expect(off.text).toContain("let them know before they head over");
	});

	it("asks nothing, but signs the reader in", () => {
		expect(off.text).not.toContain("%3Fa%3D");
		expect(off.text).toContain(PARAM.key);
		expect(off.text).toContain(PARAM.unsubscribeUrl);
	});
});

describe("reminder", () => {
	const input = {
		gameId: "g-1",
		dateLabel: facts.dateLabel,
		timeLabel: facts.timeLabel,
		location: facts.location,
		formatLabel: facts.formatLabel,
		notes: null,
		siteUrl: site,
	};

	it("keeps the permit link token-free: gym staff see it", () => {
		const r = reminderEmail({
			...input,
			permitUrl: `${site}/api/permits/abc/file`,
		});
		expect(r.text).toContain(`${site}/api/permits/abc/file`);
		expect(r.text).not.toContain("/api/permits/abc/file?k=");
	});

	it("leaves the permit out when there is none", () => {
		expect(reminderEmail({ ...input, permitUrl: null }).text).not.toContain(
			"Permit",
		);
	});
});

describe("message", () => {
	const message = messageEmail({
		subject: "Gym closed <tonight>",
		body: "Boiler blew.\n\nSee you next week & bring a jacket.",
		siteUrl: site,
	});
	it("escapes and keeps its footer", () => {
		expect(message.html).toContain("Gym closed &lt;tonight&gt;");
		expect(message.html).toContain(PARAM.unsubscribeUrl);
	});
});

describe("welcome", () => {
	const url = `${site}/api/auth/link?k=abc123&to=%2F%23rsvp`;
	const welcome = welcomeEmail({ name: "Pete", url });

	it("carries a concrete link, not a placeholder", () => {
		expect(welcome.text).toContain(url);
		expect(welcome.html).toContain(escapeHtml(url));
		expect(welcome.html).not.toContain("{{ params");
		expect(welcome.text).not.toContain("{{ params");
	});

	it("says the link is a key and mentions the password option", () => {
		expect(welcome.subject).toBe("Welcome to Viroj’s Pickup");
		expect(welcome.text).toContain("don't forward it");
		expect(welcome.text).toContain("password");
	});
});

describe("auth templates", () => {
	const url = `${site}/api/auth/verify-email?token=x&callbackURL=%2Fdashboard`;
	const verify = verifyEmail({ name: "Kyle <script>", url });
	const reset = resetPasswordEmail({ name: "Pete", url });

	it("have no unsubscribe footer", () => {
		for (const r of [verify, reset]) {
			expect(r.html).not.toContain("{{ params");
			expect(r.text).not.toContain("{{ params");
		}
	});

	it("include the link in both parts and escape names", () => {
		expect(verify.html).toContain(
			'href="https://vball.moco-pickup.com/api/auth/verify-email?token=x&amp;callbackURL=%2Fdashboard"',
		);
		expect(verify.text).toContain(url);
		expect(verify.html).toContain("Kyle &lt;script&gt;");
		expect(reset.text).toContain(url);
	});
});

describe("credits added", () => {
	const paid = creditsAddedEmail({
		added: 10,
		balance: 12,
		method: "Venmo",
		amountUsd: 50,
		siteUrl: site,
	});
	const behind = creditsAddedEmail({
		added: 1,
		balance: -2,
		method: "Cash",
		amountUsd: 5,
		siteUrl: site,
	});

	it("says what was added in the subject", () => {
		expect(paid.subject).toBe("10 credits added");
		expect(behind.subject).toBe("1 credit added");
	});

	it("puts the payment and the new balance in the facts", () => {
		expect(paid.text).toContain("Paid: $50 by Venmo");
		expect(paid.text).toContain("Balance: 12 credits");
		expect(paid.text).toContain("covers your next 12 nights");
		expect(behind.text).toContain("Balance: -2 credits");
		expect(behind.text).toContain("still behind");
	});

	it("links to the credits page through the reader's own key", () => {
		for (const r of [paid, behind]) {
			expect(r.html).toContain("%2Fcredits");
			expect(r.html).toContain(PARAM.key);
			expect(r.text).toContain(PARAM.unsubscribeUrl);
		}
	});
});

describe("off the waitlist", () => {
	const base = {
		gameId: "g-9",
		dateLabel: "Tue, Oct 20",
		timeLabel: "7:30 – 10:00 PM",
		location: "Magruder High School",
		formatLabel: "4 v 4",
		siteUrl: site,
	};
	const you = waitlistInEmail(base);
	const guest = waitlistInEmail({ ...base, guestName: "Pat <b>" });

	it("tells the player they're in", () => {
		expect(you.subject).toBe("You're in for Tue, Oct 20");
		expect(you.text).toContain("you were next on the waitlist");
		expect(you.text).toContain("Format: 4 v 4");
	});

	it("tells a sponsor their guest is in, escaped", () => {
		expect(guest.subject).toBe("Pat <b> is in for Tue, Oct 20");
		expect(guest.html).toContain("Pat &lt;b&gt;");
		expect(guest.html).not.toContain("Pat <b>");
	});

	it("opens the night through the reader's own key, and records nothing", () => {
		expect(you.html).toContain("%2Frsvp%2Fg-9");
		expect(you.html).toContain(PARAM.key);
		expect(you.html).not.toContain("%3Fa%3D");
	});
});
