/**
 * Thin client for Telnyx's email endpoints. Pure: takes the API key and
 * (optionally) a fetch implementation, so it runs in tests without any
 * Cloudflare bindings.
 */

export const TELNYX_API = "https://api.telnyx.com/v2";
export const EMAIL_ENDPOINT = `${TELNYX_API}/email_messages`;
export const EMAIL_BATCH_ENDPOINT = `${TELNYX_API}/email_messages/batch`;

/**
 * Telnyx takes up to 1,000 messages per batch request. One request per
 * list send matters on the Workers free plan, which allows a run 50
 * outside calls and the texts want most of them.
 */
export const MAX_EMAILS_PER_BATCH = 1000;

export type Address = { email: string; name?: string | null };

/** A fully rendered email: subject plus HTML and plain-text bodies. */
export type Rendered = { subject: string; html: string; text: string };

/** One message as Telnyx takes it, already filled in for its one reader. */
export type EmailMessage = {
	from: Address;
	to: Address[];
	reply_to?: Address;
	subject: string;
	html_body: string;
	text_body: string;
	headers?: Record<string, string>;
	tags?: string[];
	/**
	 * Off on every message, whatever the domain says. Click tracking would
	 * rewrite each link through Telnyx, and every link carries a sign-in
	 * token; the open pixel is nobody's business.
	 */
	tracking_settings: { open_tracking: false; click_tracking: false };
};

export type SendOutcome =
	| { ok: true; messageId: string }
	| { ok: false; status: number; error: string };

/** What a batch did, item by item, in the order the messages went in. */
export type BatchOutcome =
	| {
			ok: true;
			ids: string[];
			errors: { index: number; error: string }[];
	  }
	| { ok: false; status: number; error: string };

const RETRY_DELAY_MS = 500;

function toAddress(a: Address) {
	return a.name ? { email: a.email, name: a.name } : { email: a.email };
}

/** Strip null names so Telnyx does not reject the payload. */
export function serializeMessage(m: EmailMessage): Record<string, unknown> {
	return {
		...m,
		from: toAddress(m.from),
		to: m.to.map(toAddress),
		reply_to: m.reply_to ? toAddress(m.reply_to) : undefined,
	};
}

type Attempt =
	| { ok: true; status: number; data: unknown }
	| { ok: false; status: number; error: string };

async function attempt(
	url: string,
	body: unknown,
	opts: { apiKey: string; fetch: typeof fetch; idempotencyKey?: string },
): Promise<Attempt> {
	let response: Response;
	try {
		response = await opts.fetch(url, {
			method: "POST",
			headers: {
				authorization: `Bearer ${opts.apiKey}`,
				accept: "application/json",
				"content-type": "application/json",
				...(opts.idempotencyKey
					? { "idempotency-key": opts.idempotencyKey }
					: {}),
			},
			body: JSON.stringify(body),
		});
	} catch (error) {
		return {
			ok: false,
			status: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	if (response.status >= 200 && response.status < 300) {
		const data = await response.json().catch(() => ({}));
		return { ok: true, status: response.status, data };
	}
	const text = await response.text().catch(() => "");
	return {
		ok: false,
		status: response.status,
		error: text || response.statusText || `HTTP ${response.status}`,
	};
}

/**
 * POST once, and once more on a network error, a rate limit or a server
 * error. The retry carries the same idempotency key, so a request that did
 * land the first time is not sent twice.
 */
async function post(
	url: string,
	body: unknown,
	opts: { apiKey: string; fetch?: typeof fetch },
): Promise<Attempt> {
	const call = {
		apiKey: opts.apiKey,
		fetch: opts.fetch ?? fetch,
		idempotencyKey: crypto.randomUUID(),
	};
	const first = await attempt(url, body, call);
	if (first.ok) return first;
	const retryable =
		first.status === 0 || first.status === 429 || first.status >= 500;
	if (!retryable) return first;
	await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
	return attempt(url, body, call);
}

/** One email to one reader. */
export async function postEmail(
	message: EmailMessage,
	opts: { apiKey: string; fetch?: typeof fetch },
): Promise<SendOutcome> {
	const result = await post(EMAIL_ENDPOINT, serializeMessage(message), opts);
	if (!result.ok) return result;
	const data = result.data as { data?: { id?: string } };
	return { ok: true, messageId: data.data?.id ?? "" };
}

/**
 * Up to MAX_EMAILS_PER_BATCH emails in one request. Telnyx answers 207 once
 * the batch as a whole is accepted, with failures by index into what was
 * sent; `ids` is the accepted messages' ids, in no promised order.
 */
export async function postEmailBatch(
	messages: EmailMessage[],
	opts: { apiKey: string; fetch?: typeof fetch },
): Promise<BatchOutcome> {
	const result = await post(
		EMAIL_BATCH_ENDPOINT,
		{ messages: messages.map(serializeMessage) },
		opts,
	);
	if (!result.ok) return result;
	const data = result.data as {
		data?: { id?: string }[];
		errors?: { index?: number; code?: string; message?: string }[];
	};
	const accepted = Array.isArray(data.data) ? data.data : [];
	const refused = Array.isArray(data.errors) ? data.errors : [];
	return {
		ok: true,
		ids: accepted.map((d) => d.id ?? "").filter(Boolean),
		errors: refused
			.filter((e) => typeof e.index === "number")
			.map((e) => ({
				index: e.index as number,
				error: [e.code, e.message].filter(Boolean).join(": "),
			})),
	};
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}
