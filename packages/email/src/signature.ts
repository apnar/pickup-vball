/**
 * Telnyx signs every webhook, email and text alike, with Ed25519 over
 * `${timestamp}|${rawBody}`. The public key on the portal (Keys & Credentials)
 * is the raw 32 bytes, base64'd. Pure WebCrypto, so it runs in the Worker
 * and in tests without the Telnyx SDK.
 */

/** How far a signature's timestamp may be from our clock, in seconds. */
export const SIGNATURE_TOLERANCE_S = 300;

function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
	try {
		const binary = atob(value.trim());
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

/**
 * True when the body came from Telnyx and was signed within the tolerance.
 * The timestamp check is what stops a captured webhook being replayed later
 * -- a STOP from last month, say, sent again after somebody texted START.
 */
export async function verifyTelnyxSignature(input: {
	rawBody: string;
	signature: string | null | undefined;
	timestamp: string | null | undefined;
	publicKey: string;
	nowMs?: number;
}): Promise<boolean> {
	const { rawBody, signature, timestamp, publicKey } = input;
	if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
	const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
	if (Math.abs(now - Number(timestamp)) > SIGNATURE_TOLERANCE_S) return false;

	const keyBytes = fromBase64(publicKey);
	const sigBytes = fromBase64(signature);
	if (keyBytes?.byteLength !== 32 || sigBytes?.byteLength !== 64) return false;
	try {
		const key = await crypto.subtle.importKey(
			"raw",
			keyBytes,
			{ name: "Ed25519" },
			false,
			["verify"],
		);
		return await crypto.subtle.verify(
			{ name: "Ed25519" },
			key,
			sigBytes,
			new TextEncoder().encode(`${timestamp}|${rawBody}`),
		);
	} catch {
		return false;
	}
}
