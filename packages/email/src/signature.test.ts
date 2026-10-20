import { describe, expect, it } from "vitest";

import { verifyTelnyxSignature } from "./signature";

function toBase64(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function keypair() {
	const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
		"sign",
		"verify",
	])) as CryptoKeyPair;
	const raw = (await crypto.subtle.exportKey(
		"raw",
		pair.publicKey,
	)) as ArrayBuffer;
	return { privateKey: pair.privateKey, publicKey: toBase64(raw) };
}

async function sign(privateKey: CryptoKey, timestamp: string, body: string) {
	const sig = await crypto.subtle.sign(
		{ name: "Ed25519" },
		privateKey,
		new TextEncoder().encode(`${timestamp}|${body}`),
	);
	return toBase64(sig);
}

describe("verifyTelnyxSignature", () => {
	const nowMs = 1_800_000_000_000;
	const timestamp = String(nowMs / 1000);
	const rawBody = '{"data":{"event_type":"message.received"}}';

	it("accepts a body signed with the matching key", async () => {
		const { privateKey, publicKey } = await keypair();
		const signature = await sign(privateKey, timestamp, rawBody);
		expect(
			await verifyTelnyxSignature({
				rawBody,
				signature,
				timestamp,
				publicKey,
				nowMs,
			}),
		).toBe(true);
	});

	it("refuses a changed body, another key, or a missing header", async () => {
		const { privateKey, publicKey } = await keypair();
		const other = await keypair();
		const signature = await sign(privateKey, timestamp, rawBody);
		const base = { signature, timestamp, publicKey, nowMs };
		expect(
			await verifyTelnyxSignature({ ...base, rawBody: `${rawBody} ` }),
		).toBe(false);
		expect(
			await verifyTelnyxSignature({
				...base,
				rawBody,
				publicKey: other.publicKey,
			}),
		).toBe(false);
		expect(
			await verifyTelnyxSignature({ ...base, rawBody, signature: null }),
		).toBe(false);
		expect(
			await verifyTelnyxSignature({ ...base, rawBody, publicKey: "nope" }),
		).toBe(false);
	});

	it("refuses a signature from more than five minutes ago", async () => {
		const { privateKey, publicKey } = await keypair();
		const old = String(nowMs / 1000 - 301);
		const signature = await sign(privateKey, old, rawBody);
		expect(
			await verifyTelnyxSignature({
				rawBody,
				signature,
				timestamp: old,
				publicKey,
				nowMs,
			}),
		).toBe(false);
	});
});
