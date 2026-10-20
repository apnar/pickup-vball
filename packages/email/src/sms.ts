/**
 * Texts through Telnyx's Messaging API. Pure, like the mailer: the key, the
 * number and fetch come in, so it runs in tests without bindings.
 */

import { TELNYX_API } from "./telnyx";

export const SMS_ENDPOINT = `${TELNYX_API}/messages`;

/*
 * GSM-7, the alphabet a plain text is sent in: 160 characters a segment, or
 * 153 once a message runs to several. One character outside it -- a curly
 * apostrophe is enough, and "Viroj’s" has one -- sends the whole message as
 * UCS-2 at 70 a segment, which is three times the price and splits a link
 * across segments on some phones.
 */
const GSM_BASIC =
	"@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** These cost two characters each: an escape, then the character. */
const GSM_EXTENDED = "^{}\\[~]|€";
const GSM = new Set([...GSM_BASIC, ...GSM_EXTENDED]);

const PLAIN: Record<string, string> = {
	"‘": "'",
	"’": "'",
	"‚": "'",
	"′": "'",
	"“": '"',
	"”": '"',
	"„": '"',
	"″": '"',
	"–": "-",
	"—": "-",
	"−": "-",
	"…": "...",
	"•": "-",
	"·": "-",
	" ": " ",
	" ": " ",
	" ": " ",
	"​": "",
};

/**
 * Make a text fit GSM-7: typographic punctuation to its plain form, accents
 * GSM lacks taken off the letter, and anything still left over (an emoji in
 * a gym's name) to "?". A text is read once on a lock screen; keeping it
 * one alphabet matters more than a perfect é in an address.
 */
export function toGsm(input: string): string {
	let out = "";
	for (const ch of input) {
		const plain = PLAIN[ch] ?? ch;
		for (const c of plain) {
			if (GSM.has(c)) {
				out += c;
				continue;
			}
			const bare = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
			out += [...bare].every((b) => GSM.has(b)) && bare ? bare : "?";
		}
	}
	return out;
}

/** How many segments a text is billed as. */
export function segmentsOf(text: string): number {
	const chars = [...text];
	if (chars.every((c) => GSM.has(c))) {
		const length = chars.reduce(
			(n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1),
			0,
		);
		return length <= 160 ? 1 : Math.ceil(length / 153);
	}
	// UCS-2 counts UTF-16 units: an emoji is two.
	return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}

export type SmsOutcome =
	| { ok: true; messageId: string }
	| { ok: false; status: number; error: string; code?: string };

/**
 * One text. Not retried here: the outbox row is the retry, and a request
 * that timed out may well have been sent.
 */
export async function postSms(
	input: {
		from: string;
		to: string;
		text: string;
		messagingProfileId?: string;
		webhookUrl?: string;
	},
	opts: { apiKey: string; fetch?: typeof fetch },
): Promise<SmsOutcome> {
	const fetchImpl = opts.fetch ?? fetch;
	let response: Response;
	try {
		response = await fetchImpl(SMS_ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${opts.apiKey}`,
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				from: input.from,
				to: input.to,
				text: input.text,
				messaging_profile_id: input.messagingProfileId,
				webhook_url: input.webhookUrl,
			}),
		});
	} catch (error) {
		return {
			ok: false,
			status: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	if (response.ok) {
		const data = (await response.json().catch(() => ({}))) as {
			data?: { id?: string };
		};
		return { ok: true, messageId: data.data?.id ?? "" };
	}
	const raw = await response.text().catch(() => "");
	let code: string | undefined;
	try {
		code = (JSON.parse(raw) as { errors?: { code?: string }[] }).errors?.[0]
			?.code;
	} catch {}
	return {
		ok: false,
		status: response.status,
		error: raw || response.statusText || `HTTP ${response.status}`,
		...(code ? { code: String(code) } : {}),
	};
}

/**
 * Telnyx's code for a number that texted STOP. The send is refused on its
 * side; we mirror it so their texts go by email instead.
 */
export const OPTED_OUT_CODE = "40300";

export type Texter = {
	/** Whether texts are being logged instead of sent (no API key). */
	dryRun: boolean;
	send(to: string, text: string): Promise<SmsOutcome>;
};

export type TexterOptions = {
	apiKey?: string | undefined;
	/** Our number, E.164. */
	from?: string | undefined;
	messagingProfileId?: string | undefined;
	/** Where delivery reports go; the profile's webhook otherwise. */
	webhookUrl?: string | undefined;
	fetch?: typeof fetch;
	log?: (line: string) => void;
};

export function createTexter(options: TexterOptions): Texter {
	const log = options.log ?? ((line: string) => console.log(line));
	const apiKey = options.apiKey?.trim();
	return {
		dryRun: !apiKey,
		async send(to, text) {
			const body = toGsm(text);
			if (!apiKey) {
				log(`[text dry run] to ${to}\n${body}`);
				return { ok: true, messageId: "dry-run" };
			}
			if (!options.from) {
				return {
					ok: false,
					status: 0,
					error: "TELNYX_FROM_NUMBER is not set.",
				};
			}
			return postSms(
				{
					from: options.from,
					to,
					text: body,
					messagingProfileId: options.messagingProfileId,
					webhookUrl: options.webhookUrl,
				},
				{ apiKey, fetch: options.fetch },
			);
		},
	};
}
