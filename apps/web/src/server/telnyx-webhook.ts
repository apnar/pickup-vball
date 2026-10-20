import { handleInbound } from "@pickup-vball/api/sms-reply";
import { createDb } from "@pickup-vball/db";
import { finalizeText } from "@pickup-vball/db/notify";
import { blockEmail, setSmsOptOut } from "@pickup-vball/db/people";
import { OPTED_OUT_CODE, verifyTelnyxSignature } from "@pickup-vball/email";
import { env, waitUntil } from "@pickup-vball/env/server";
import { Hono } from "hono";

/**
 * Telnyx webhooks, email and text alike, all signed with the account's
 * Ed25519 key. Registered per email domain (README "Email", step 4) and on
 * the messaging profile (README "Texts").
 *
 * Email: an address that bounces hard or reports us as spam stops getting
 * email (`blockEmail`): their messages go by text if they have a number,
 * and otherwise they are put on an open-ended break -- never a
 * deactivation, since not being able to reach somebody is not grounds for
 * throwing them out of the group. People leave the email through our own
 * List-Unsubscribe header, which lands on /api/unsubscribe and never comes
 * through here; an `email.unsubscribed` only arrives if Telnyx's own
 * unsubscribe tracking gets switched back on, and it is treated the same.
 *
 * Texts: a reply is somebody answering a night (`handleInbound`), or a STOP
 * or START we mirror; a delivery report settles the outbox row.
 *
 * Telnyx wants an answer within two seconds and retries otherwise, so a
 * reply's work runs after the response; `sms_in` makes a retry harmless.
 */
export const telnyxWebhook = new Hono();

type Envelope = {
	data?: {
		event_type?: string;
		payload?: Record<string, unknown>;
	};
};

/** The address an email event is about: one recipient per callback. */
function recipientOf(payload: Record<string, unknown>): string | null {
	const to = payload.to;
	if (typeof to === "string") return to || null;
	if (to && typeof to === "object" && "email" in to) {
		const email = (to as { email?: unknown }).email;
		return typeof email === "string" ? email : null;
	}
	return null;
}

/**
 * Telnyx sends `email.bounced` for every kind of bounce; 30001 is the one
 * that says the address itself is no good. A full mailbox (30002), a
 * message that sat in the queue too long (30005) or a gateway hiccup say
 * nothing about the person.
 */
function dropReason(
	eventType: string,
	payload: Record<string, unknown>,
): string | null {
	if (eventType === "email.complained") {
		return "Marked one of our emails as spam.";
	}
	if (eventType === "email.unsubscribed") {
		return "Unsubscribed using their mail app.";
	}
	if (eventType === "email.bounced") {
		const evidence = payload.error_evidence as { code?: unknown } | undefined;
		if (String(evidence?.code ?? "") === "30001") {
			return "Emails to this address are bouncing.";
		}
	}
	return null;
}

telnyxWebhook.post("/", async (c) => {
	const publicKey = env.TELNYX_PUBLIC_KEY;
	if (!publicKey) return c.text("Not found.", 404);

	// The signature is over the bytes as sent, so read them before parsing.
	const rawBody = await c.req.text();
	const verified = await verifyTelnyxSignature({
		rawBody,
		signature: c.req.header("telnyx-signature-ed25519"),
		timestamp: c.req.header("telnyx-timestamp"),
		publicKey,
	});
	if (!verified) return c.text("Forbidden.", 403);

	let envelope: Envelope;
	try {
		envelope = JSON.parse(rawBody) as Envelope;
	} catch {
		return c.text("Invalid JSON.", 400);
	}
	const eventType = envelope.data?.event_type ?? "";
	const payload = envelope.data?.payload ?? {};

	if (eventType.startsWith("email.")) {
		const email = recipientOf(payload);
		const reason = dropReason(eventType, payload);
		if (!email || !reason) return c.json({ ok: true });
		const dropped = await blockEmail(createDb(), email, { reason });
		if (dropped) console.log(`telnyx webhook: ${eventType} -> ${dropped}`);
		return c.json({ ok: true, dropped });
	}

	if (eventType === "message.received") {
		const from = (payload.from as { phone_number?: unknown } | undefined)
			?.phone_number;
		const id = payload.id;
		if (typeof from !== "string" || typeof id !== "string") {
			return c.json({ ok: true });
		}
		const db = createDb();
		waitUntil(
			handleInbound(db, {
				id,
				from,
				text: typeof payload.text === "string" ? payload.text : "",
				autoresponseType:
					typeof payload.autoresponse_type === "string"
						? payload.autoresponse_type
						: null,
			}).then(
				(outcome) => console.log(`text in: ${outcome}`),
				(error) => console.error("text in failed", error),
			),
		);
		return c.json({ ok: true });
	}

	if (eventType === "message.finalized") {
		const id = payload.id;
		if (typeof id !== "string") return c.json({ ok: true });
		const to = Array.isArray(payload.to)
			? (payload.to as { phone_number?: string; status?: string }[])
			: [];
		const errors = Array.isArray(payload.errors)
			? (payload.errors as { code?: unknown; title?: unknown }[])
			: [];
		const delivered = to.some((t) => t.status === "delivered");
		const db = createDb();
		await finalizeText(db, id, {
			delivered,
			error: delivered
				? null
				: errors.map((e) => `${e.code}: ${e.title}`).join("; ") ||
					to.map((t) => t.status).join(", "),
		});
		if (errors.some((e) => String(e.code) === OPTED_OUT_CODE)) {
			for (const t of to) {
				if (t.phone_number) await setSmsOptOut(db, t.phone_number, true);
			}
		}
		return c.json({ ok: true });
	}
	return c.json({ ok: true });
});
