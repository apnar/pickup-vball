import { describe, expect, it, vi } from "vitest";

import { createMailer, type ListRecipient } from "./mailer";

const sender = { email: "info@moco-pickup.com", name: "Run" };
const rendered = { subject: "S", html: "<p>{{ params.name }}</p>", text: "T" };

function recipients(n: number): ListRecipient[] {
	return Array.from({ length: n }, (_, i) => ({
		email: `p${i}@example.com`,
		name: i % 2 ? `Player ${i}` : null,
		unsubscribeUrl: `https://vball.moco-pickup.com/api/unsubscribe/t${i}`,
		linkToken: `k${i}`,
	}));
}

describe("createMailer", () => {
	it("dry-runs when there is no API key", async () => {
		const log = vi.fn();
		const fetchImpl = vi.fn();
		const mailer = createMailer({
			apiKey: undefined,
			sender,
			fetch: fetchImpl,
			log,
		});
		expect(mailer.dryRun).toBe(true);
		const one = await mailer.sendOne({ email: "a@example.com" }, rendered);
		expect(one).toEqual({ ok: true, messageId: "dry-run" });
		const list = await mailer.sendList(recipients(3), rendered);
		expect(list.sent).toBe(3);
		expect(list.failed).toEqual([]);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalled();
		expect(String(log.mock.calls[0]?.[0])).toContain("Subject: S");
	});

	it("fills the placeholders in a dry-run log so the link is clickable", async () => {
		const log = vi.fn();
		const mailer = createMailer({ apiKey: undefined, sender, log });
		const withLink = {
			subject: "S",
			html: "<p>x</p>",
			text: "Sign in: https://vball.moco-pickup.com/api/auth/link?k={{ params.key }}",
		};
		await mailer.sendList(recipients(2), withLink);
		expect(String(log.mock.calls[0]?.[0])).toContain(
			"https://vball.moco-pickup.com/api/auth/link?k=k0",
		);
		log.mockClear();
		await mailer.sendOne({ email: "a@example.com" }, withLink, {
			params: { key: "solo" },
		});
		expect(String(log.mock.calls[0]?.[0])).toContain("link?k=solo");
	});

	it("sends one batch with a filled-in copy per recipient", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						data: [{ id: "m0" }, { id: "m1" }, { id: "m2" }],
						errors: [],
					}),
					{ status: 207 },
				),
		);
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		const withKey = {
			subject: "S",
			html: '<p>{{ params.name }}</p><a href="x?k={{ params.key }}">in</a>',
			text: "x?k={{ params.key }} {{ params.unsubscribeUrl }}",
		};
		const result = await mailer.sendList(recipients(3), withKey, {
			tags: ["rsvp_call"],
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [, init] = fetchImpl.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const { messages } = JSON.parse(init.body as string);
		expect(messages).toHaveLength(3);
		expect(messages[1]).toMatchObject({
			to: [{ email: "p1@example.com", name: "Player 1" }],
			html_body: '<p>Player 1</p><a href="x?k=k1">in</a>',
			text_body: "x?k=k1 https://vball.moco-pickup.com/api/unsubscribe/t1",
			headers: {
				"List-Unsubscribe":
					"<https://vball.moco-pickup.com/api/unsubscribe/t1>",
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
			tags: ["rsvp_call"],
		});
		// Nobody's copy carries anybody else's key.
		expect(messages[0].text_body).toContain("k=k0 ");
		expect(messages[2].text_body).toContain("k=k2 ");
		expect(result).toEqual({
			attempted: 3,
			sent: 3,
			failed: [],
			messageIds: ["m0", "m1", "m2"],
		});
	});

	it("splits more than a thousand recipients across requests", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: [], errors: [] }), {
					status: 207,
				}),
		);
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		await mailer.sendList(recipients(1001), rendered);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("escapes a name filled into the HTML part", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: [{ id: "m" }] }), {
					status: 207,
				}),
		);
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		await mailer.sendList(
			[
				{
					email: "a@example.com",
					name: "<b>A</b>",
					unsubscribeUrl: "u",
					linkToken: "t",
				},
			],
			rendered,
		);
		const [, init] = fetchImpl.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(JSON.parse(init.body as string).messages[0].html_body).toBe(
			"<p>&lt;b&gt;A&lt;/b&gt;</p>",
		);
	});

	it("reports the copies Telnyx refused without losing the others", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						data: [{ id: "m0" }],
						errors: [{ index: 1, code: "recipient_suppressed" }],
					}),
					{ status: 207 },
				),
		);
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		const result = await mailer.sendList(recipients(2), rendered);
		expect(result.sent).toBe(1);
		expect(result.failed).toEqual([
			{ emails: ["p1@example.com"], error: "recipient_suppressed" },
		]);
	});

	it("counts the whole batch as failed when the request is refused", async () => {
		const fetchImpl = vi.fn(async () => new Response("nope", { status: 400 }));
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		const result = await mailer.sendList(recipients(2), rendered);
		expect(result.sent).toBe(0);
		expect(result.failed).toEqual([
			{ emails: ["p0@example.com", "p1@example.com"], error: "400: nope" },
		]);
	});

	it("sends nothing for an empty list", async () => {
		const fetchImpl = vi.fn();
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		const result = await mailer.sendList([], rendered);
		expect(result.attempted).toBe(0);
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
