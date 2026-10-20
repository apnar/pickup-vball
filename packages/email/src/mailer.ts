import { fillParams, sealTemplate } from "./render";
import {
	type Address,
	chunk,
	type EmailMessage,
	MAX_EMAILS_PER_BATCH,
	postEmail,
	postEmailBatch,
	type Rendered,
	type SendOutcome,
} from "./telnyx";

/** Someone on the list, with the link that takes them off it. */
export type ListRecipient = {
	email: string;
	name: string | null;
	unsubscribeUrl: string;
	/** Their sign-in token, substituted into every link back to the site. */
	linkToken: string | null;
};

export type ListResult = {
	attempted: number;
	sent: number;
	failed: { emails: string[]; error: string }[];
	messageIds: string[];
};

export type Mailer = {
	/** Whether emails are being logged instead of sent (no API key). */
	dryRun: boolean;
	/** One email to one person. Auth emails use this. */
	sendOne(
		to: Address,
		rendered: Rendered,
		opts?: { tags?: string[]; params?: Record<string, string> },
	): Promise<SendOutcome>;
	/**
	 * One email to everyone on the list, a copy per recipient so each one
	 * carries its own sign-in key and unsubscribe link.
	 */
	sendList(
		recipients: ListRecipient[],
		rendered: Rendered,
		opts?: { tags?: string[] },
	): Promise<ListResult>;
};

export type MailerOptions = {
	apiKey?: string | undefined;
	sender: Address;
	replyTo?: Address;
	fetch?: typeof fetch;
	log?: (line: string) => void;
};

function paramsFor(r: ListRecipient): Record<string, string> {
	return {
		name: r.name ?? "",
		unsubscribeUrl: r.unsubscribeUrl,
		key: r.linkToken ?? "",
	};
}

/**
 * RFC 8058 one-click unsubscribe, pointing at our own form's POST, which
 * starts an open-ended break. Ours rather than Telnyx's (its
 * `unsubscribe_tracking` is switched off on the domain): leaving the email
 * means stepping away from the nights, and only the site can do that.
 */
function unsubscribeHeaders(url: string | undefined) {
	if (!url) return undefined;
	return {
		"List-Unsubscribe": `<${url}>`,
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	};
}

export function createMailer(options: MailerOptions): Mailer {
	const log = options.log ?? ((line: string) => console.log(line));
	const apiKey = options.apiKey?.trim();
	const dryRun = !apiKey;

	// Sealed here, at the last door out, so no template can forget to, and
	// filled in after, so the seal never touches what goes in. See
	// `sealTemplate` for why a guest's name needs it.
	function message(
		to: Address,
		rendered: Rendered,
		params: Record<string, string> | undefined,
		tags: string[] | undefined,
	): EmailMessage {
		return {
			from: options.sender,
			to: [to],
			reply_to: options.replyTo,
			subject: fillParams(sealTemplate(rendered.subject), params),
			html_body: fillParams(sealTemplate(rendered.html), params, {
				html: true,
			}),
			text_body: fillParams(sealTemplate(rendered.text), params),
			headers: unsubscribeHeaders(params?.unsubscribeUrl),
			tags,
			tracking_settings: { open_tracking: false, click_tracking: false },
		};
	}

	/** Print the email instead of sending it, links clickable. */
	function logDryRun(label: string, m: EmailMessage) {
		log(
			[
				`[email dry run] ${label}`,
				`Subject: ${m.subject}`,
				"",
				m.text_body,
			].join("\n"),
		);
	}

	return {
		dryRun,

		async sendOne(to, rendered, opts) {
			const m = message(to, rendered, opts?.params, opts?.tags);
			if (!apiKey) {
				logDryRun(`to ${to.email}`, m);
				return { ok: true, messageId: "dry-run" };
			}
			return postEmail(m, { apiKey, fetch: options.fetch });
		},

		async sendList(recipients, rendered, opts) {
			const result: ListResult = {
				attempted: recipients.length,
				sent: 0,
				failed: [],
				messageIds: [],
			};
			if (recipients.length === 0) return result;
			const messages = recipients.map((r) =>
				message(
					{ email: r.email, name: r.name },
					rendered,
					paramsFor(r),
					opts?.tags,
				),
			);
			if (!apiKey) {
				// One copy is enough to read; it is the first reader's.
				const [first] = messages;
				if (first) logDryRun(`to ${recipients.length} subscriber(s)`, first);
				result.sent = recipients.length;
				result.messageIds.push("dry-run");
				return result;
			}
			for (const batch of chunk(messages, MAX_EMAILS_PER_BATCH)) {
				const outcome = await postEmailBatch(batch, {
					apiKey,
					fetch: options.fetch,
				});
				const emailsAt = (i: number) => batch[i]?.to[0]?.email ?? "";
				if (!outcome.ok) {
					result.failed.push({
						emails: batch.map((_, i) => emailsAt(i)),
						error: `${outcome.status}: ${outcome.error}`.slice(0, 500),
					});
					continue;
				}
				result.sent += batch.length - outcome.errors.length;
				result.messageIds.push(...outcome.ids);
				for (const e of outcome.errors) {
					result.failed.push({
						emails: [emailsAt(e.index)],
						error: e.error.slice(0, 500),
					});
				}
			}
			return result;
		},
	};
}
