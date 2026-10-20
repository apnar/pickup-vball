import { describe, expect, it, vi } from "vitest";

import { PARAM } from "./render";
import { createTexter, segmentsOf, toGsm } from "./sms";
import {
	canceledText,
	creditsAddedText,
	lowCreditText,
	messageText,
	phoneCodeText,
	reminderText,
	replyText,
	rsvpCallText,
	rsvpLastCallText,
	rsvpNudgeText,
	spotOpenText,
	waitlistInText,
} from "./texts";

const facts = {
	gameId: "3f2b8c1e-9d4a-4e6b-8a7c-1d2e3f4a5b6c",
	dateLabel: "Wednesday, September 30",
	timeLabel: "7:30 PM",
	location:
		"Montgomery Blair High School, 51 University Blvd E, Silver Spring, MD 20901",
	notes: null,
	siteUrl: "https://vball.moco-pickup.com",
	inNames: [],
	maybeNames: [],
	inCount: 11,
	capacity: 42,
	formatLabel: "6 v 6",
	closeAt: "1:00 PM",
	permitUrl:
		"https://vball.moco-pickup.com/api/permits/3f2b8c1e-9d4a-4e6b-8a7c-1d2e3f4a5b6c/file",
};

/** As it leaves: the key filled in at its full length, then made GSM. */
function asSent(text: string): string {
	return toGsm(text.replaceAll(PARAM.key, "a".repeat(32)));
}

const all: [string, string][] = [
	["call", rsvpCallText({ ...facts, today: false })],
	["call tonight", rsvpCallText({ ...facts, today: true })],
	["nudge", rsvpNudgeText(facts)],
	["last call", rsvpLastCallText(facts)],
	["canceled", canceledText(facts)],
	["waitlist", waitlistInText(facts)],
	[
		"waitlist guest",
		waitlistInText({ ...facts, guestName: "Christopher Montgomery" }),
	],
	[
		"credits",
		creditsAddedText({
			added: 10,
			balance: 12,
			method: "Venmo",
			amountUsd: 50,
			siteUrl: facts.siteUrl,
		}),
	],
	["reminder", reminderText({ ...facts, formatLabel: "6 v 6" })],
	["low credit", lowCreditText({ balance: 1, siteUrl: facts.siteUrl })],
	["spot open", spotOpenText({ ...facts, formatLabel: "6 v 6" })],
	["message", messageText({ text: "x".repeat(120), siteUrl: facts.siteUrl })],
	["code", phoneCodeText("123456")],
	["reply in", replyText({ kind: "in", night: { ...facts } })],
	[
		"reply waitlist",
		replyText({ kind: "waitlist", night: facts, position: 12 }),
	],
	["reply out", replyText({ kind: "out", night: facts })],
	["reply maybe", replyText({ kind: "maybe", night: facts })],
	[
		"reply closed",
		replyText({ kind: "closed", night: facts, closeAt: "1:00 PM" }),
	],
	["reply on break", replyText({ kind: "on-break", siteUrl: facts.siteUrl })],
	["reply none", replyText({ kind: "none", siteUrl: facts.siteUrl })],
	["reply unknown", replyText({ kind: "unknown", siteUrl: facts.siteUrl })],
];

describe("text templates", () => {
	it.each(all)("%s fits in two GSM segments", (_name, text) => {
		const sent = asSent(text);
		expect(sent).toBe(toGsm(sent));
		expect(segmentsOf(sent)).toBeLessThanOrEqual(2);
	});

	it("opens with who it is from, in plain quotes", () => {
		expect(asSent(rsvpNudgeText(facts))).toMatch(/^Viroj's Pickup: /);
	});

	it("links to the night with the reader's key still a placeholder", () => {
		const text = rsvpCallText({ ...facts, today: false });
		expect(text).toContain(
			`https://vball.moco-pickup.com/api/auth/link?k=${PARAM.key}&g=${facts.gameId}`,
		);
	});

	it("does not tell a guest's sponsor to reply OUT, which would be theirs", () => {
		expect(waitlistInText({ ...facts, guestName: "Sam" })).not.toContain(
			"Reply OUT",
		);
	});
});

describe("toGsm", () => {
	it("turns typographic punctuation plain and keeps GSM letters", () => {
		expect(toGsm("Viroj’s “night” – 7…")).toBe('Viroj\'s "night" - 7...');
		expect(toGsm("José Ñandú")).toBe("José Ñandu");
		expect(toGsm("Zoë Łukasz")).toBe("Zoe ?ukasz");
		expect(toGsm("gym 🏐")).toBe("gym ?");
	});
});

describe("segmentsOf", () => {
	it("counts GSM at 160 then 153, UCS-2 at 70 then 67", () => {
		expect(segmentsOf("a".repeat(160))).toBe(1);
		expect(segmentsOf("a".repeat(161))).toBe(2);
		expect(segmentsOf("a".repeat(306))).toBe(2);
		expect(segmentsOf("€".repeat(80))).toBe(1);
		expect(segmentsOf("’".repeat(70))).toBe(1);
		expect(segmentsOf("’".repeat(71))).toBe(2);
	});
});

describe("createTexter", () => {
	it("logs instead of sending without a key", async () => {
		const log = vi.fn();
		const fetchImpl = vi.fn();
		const texter = createTexter({ fetch: fetchImpl, log });
		expect(texter.dryRun).toBe(true);
		expect(await texter.send("+13015550100", "Viroj’s")).toEqual({
			ok: true,
			messageId: "dry-run",
		});
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(String(log.mock.calls[0]?.[0])).toContain("Viroj's");
	});

	it("posts from our number through the profile, in GSM", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: { id: "t-1" } }), { status: 200 }),
		);
		const texter = createTexter({
			apiKey: "k",
			from: "+13015550199",
			messagingProfileId: "p",
			webhookUrl: "https://x/api/telnyx/webhook",
			fetch: fetchImpl,
		});
		expect(await texter.send("+13015550100", "It’s on")).toEqual({
			ok: true,
			messageId: "t-1",
		});
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("https://api.telnyx.com/v2/messages");
		expect(JSON.parse(init.body as string)).toEqual({
			from: "+13015550199",
			to: "+13015550100",
			text: "It's on",
			messaging_profile_id: "p",
			webhook_url: "https://x/api/telnyx/webhook",
		});
	});

	it("passes Telnyx's error code through", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify({ errors: [{ code: "40300" }] }), {
					status: 422,
				}),
		);
		const texter = createTexter({ apiKey: "k", from: "+1", fetch: fetchImpl });
		const outcome = await texter.send("+13015550100", "x");
		expect(outcome).toMatchObject({ ok: false, status: 422, code: "40300" });
	});
});
