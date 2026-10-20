import { env } from "@pickup-vball/env/server";

import { createMailer, type Mailer } from "./mailer";
import { SENDER } from "./sender";
import { createTexter, type Texter } from "./sms";

/**
 * The mailer for this Worker. Without TELNYX_API_KEY (the usual local setup)
 * it logs every email to the console instead of sending it.
 */
export function getMailer(): Mailer {
	return createMailer({ apiKey: env.TELNYX_API_KEY, sender: SENDER });
}

/**
 * The texter for this Worker. Same key as the mailer, so a local setup with
 * none logs texts too; delivery reports come back to our webhook.
 */
export function getTexter(): Texter {
	return createTexter({
		apiKey: env.TELNYX_API_KEY,
		from: env.TELNYX_FROM_NUMBER,
		messagingProfileId: env.TELNYX_MESSAGING_PROFILE_ID || undefined,
		webhookUrl: `${siteUrl()}/api/telnyx/webhook`,
	});
}

/** Public origin used for links inside emails. */
export function siteUrl(): string {
	return env.BETTER_AUTH_URL.replace(/\/$/, "");
}
