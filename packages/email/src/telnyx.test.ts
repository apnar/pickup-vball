import { describe, expect, it, vi } from "vitest";

import {
	chunk,
	EMAIL_BATCH_ENDPOINT,
	EMAIL_ENDPOINT,
	type EmailMessage,
	postEmail,
	postEmailBatch,
	serializeMessage,
} from "./telnyx";

const message: EmailMessage = {
	from: { email: "info@moco-pickup.com", name: "Run" },
	to: [{ email: "a@example.com", name: null }],
	subject: "Hi",
	html_body: "<p>Hi</p>",
	text_body: "Hi",
	tracking_settings: { open_tracking: false, click_tracking: false },
};

function response(status: number, payload: unknown) {
	return new Response(JSON.stringify(payload), { status });
}

function callOf(fetchImpl: ReturnType<typeof vi.fn>, n = 0) {
	const [url, init] = fetchImpl.mock.calls[n] as unknown as [
		string,
		RequestInit,
	];
	return {
		url,
		init,
		headers: init.headers as Record<string, string>,
		body: JSON.parse(init.body as string),
	};
}

describe("postEmail", () => {
	it("posts JSON with a bearer key and returns the message id", async () => {
		const fetchImpl = vi.fn(async () =>
			response(202, { data: { id: "e-1", status: "queued" } }),
		);
		const outcome = await postEmail(message, { apiKey: "k", fetch: fetchImpl });
		expect(outcome).toEqual({ ok: true, messageId: "e-1" });
		const call = callOf(fetchImpl);
		expect(call.url).toBe(EMAIL_ENDPOINT);
		expect(call.init.method).toBe("POST");
		expect(call.headers.authorization).toBe("Bearer k");
		expect(call.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
		expect(call.body.to).toEqual([{ email: "a@example.com" }]);
		expect(call.body.tracking_settings).toEqual({
			open_tracking: false,
			click_tracking: false,
		});
	});

	it("maps 4xx to a failure without retrying", async () => {
		const fetchImpl = vi.fn(async () =>
			response(422, { errors: [{ detail: "bad sender" }] }),
		);
		const outcome = await postEmail(message, { apiKey: "k", fetch: fetchImpl });
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.status).toBe(422);
			expect(outcome.error).toContain("bad sender");
		}
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("retries once on 5xx with the same idempotency key", async () => {
		vi.useFakeTimers();
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(response(503, {}))
			.mockResolvedValueOnce(response(202, { data: { id: "second" } }));
		const pending = postEmail(message, { apiKey: "k", fetch: fetchImpl });
		await vi.runAllTimersAsync();
		const outcome = await pending;
		vi.useRealTimers();
		expect(outcome).toEqual({ ok: true, messageId: "second" });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(callOf(fetchImpl, 0).headers["idempotency-key"]).toBe(
			callOf(fetchImpl, 1).headers["idempotency-key"],
		);
	});
});

describe("postEmailBatch", () => {
	it("sends { messages } and reads the 207 by index", async () => {
		const fetchImpl = vi.fn(async () =>
			response(207, {
				data: [{ id: "e-0" }, { id: "e-2" }],
				errors: [
					{ index: 1, code: "recipient_suppressed", message: "suppressed" },
				],
				meta: { total: 3, succeeded: 2, failed: 1 },
			}),
		);
		const outcome = await postEmailBatch([message, message, message], {
			apiKey: "k",
			fetch: fetchImpl,
		});
		expect(callOf(fetchImpl).url).toBe(EMAIL_BATCH_ENDPOINT);
		expect(callOf(fetchImpl).body.messages).toHaveLength(3);
		expect(outcome).toEqual({
			ok: true,
			ids: ["e-0", "e-2"],
			errors: [{ index: 1, error: "recipient_suppressed: suppressed" }],
		});
	});
});

describe("serializeMessage", () => {
	it("drops null names", () => {
		const out = serializeMessage({
			...message,
			from: { email: "s@example.com", name: null },
		});
		expect(out.from).toEqual({ email: "s@example.com" });
		expect(out.to).toEqual([{ email: "a@example.com" }]);
	});
});

describe("chunk", () => {
	it("splits into batches", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 2)).toEqual([]);
	});
});
