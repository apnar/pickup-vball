/**
 * Phone numbers and the codes that prove one is yours. Pure apart from
 * WebCrypto, so the rules are tested without a database.
 */

/**
 * A US number as E.164, or null when it is not one. Takes it however
 * people type it: dots, dashes, brackets, spaces, a leading 1 or +1.
 * NANP rules: neither the area code nor the exchange starts with 0 or 1.
 * US only, because the number we text from is registered for the US.
 */
export function normalizeUsPhone(raw: string): string | null {
	let digits = raw.replace(/[\s().\-+]/g, "");
	if (!/^\d+$/.test(digits)) return null;
	if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
	if (digits.length !== 10) return null;
	if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
	return `+1${digits}`;
}

/** "+13015550100" as "(301) 555-0100", for showing a number back. */
export function formatUsPhone(e164: string): string {
	const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
	return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** How long a code works for. */
export const CODE_TTL_MS = 10 * 60_000;
/** Wrong codes before the outstanding one dies. */
export const MAX_ATTEMPTS = 5;
/** Between codes. */
export const RESEND_AFTER_MS = 60_000;
/**
 * Codes a day. Every one is a text we pay for, sent to a number somebody
 * typed: without a cap, one signed-in account is a way to make us text a
 * stranger all day.
 */
export const MAX_SENDS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60_000;

/** Six digits, uniform: the rejection skips the bias a plain modulo has. */
export function newCode(): string {
	const limit = 4_294_000_000; // largest multiple of 1e6 below 2^32
	for (;;) {
		const [n = 0] = crypto.getRandomValues(new Uint32Array(1));
		if (n < limit) return String(n % 1_000_000).padStart(6, "0");
	}
}

/**
 * What is stored instead of the code. Bound to the person and the number,
 * so a code for one number cannot verify another.
 */
export async function hashCode(
	secret: string,
	input: { userId: string; phone: string; code: string },
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${input.userId}|${input.phone}|${input.code}`),
	);
	return Array.from(new Uint8Array(mac), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

/** Equal hex strings, compared without returning early. */
export function sameHash(a: string, b: string): boolean {
	let diff = a.length ^ b.length;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	}
	return diff === 0;
}

export type SendWindow = { sends: number; windowStart: Date; lastSentAt: Date };

/**
 * Whether another code may go out now, and the counters if it does. The
 * day is a rolling one from the first code in it.
 */
export function nextSend(
	previous: SendWindow | null,
	now: Date,
):
	| { ok: true; window: SendWindow }
	| { ok: false; reason: "too-soon" | "too-many" } {
	const t = now.getTime();
	if (!previous || t - previous.windowStart.getTime() >= DAY_MS) {
		return {
			ok: true,
			window: { sends: 1, windowStart: now, lastSentAt: now },
		};
	}
	if (t - previous.lastSentAt.getTime() < RESEND_AFTER_MS) {
		return { ok: false, reason: "too-soon" };
	}
	if (previous.sends >= MAX_SENDS_PER_DAY) {
		return { ok: false, reason: "too-many" };
	}
	return {
		ok: true,
		window: {
			sends: previous.sends + 1,
			windowStart: previous.windowStart,
			lastSentAt: now,
		},
	};
}
