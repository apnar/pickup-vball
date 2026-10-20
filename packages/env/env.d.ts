/// <reference types="@cloudflare/workers-types" />

// Keep in sync with the `vars`, secrets and bindings in apps/web/wrangler.jsonc.
export interface CloudflareEnv {
	/** D1 database binding. */
	DB: D1Database;
	/** R2 bucket holding gym permit PDFs. */
	PERMITS: R2Bucket;
	/** Secret: `wrangler secret put BETTER_AUTH_SECRET` (or .dev.vars locally). */
	BETTER_AUTH_SECRET: string;
	/** Public origin of the deployed Worker (wrangler.jsonc `vars`). */
	BETTER_AUTH_URL: string;
	/**
	 * Secret: `wrangler secret put TELNYX_API_KEY` (or .dev.vars locally).
	 * Optional: without it emails and texts are logged to the console, not
	 * sent.
	 */
	TELNYX_API_KEY?: string;
	/**
	 * Secret: `wrangler secret put TELNYX_PUBLIC_KEY`. The account's Ed25519
	 * public key (base64), which signs every webhook to /api/telnyx/webhook.
	 * Without it the webhook route answers 404.
	 */
	TELNYX_PUBLIC_KEY?: string;
	/**
	 * Our texting number, E.164 (wrangler.jsonc `vars`). Empty until one is
	 * bought and registered; texts then fail rather than send.
	 */
	TELNYX_FROM_NUMBER?: string;
	/** The messaging profile the number is on (wrangler.jsonc `vars`). */
	TELNYX_MESSAGING_PROFILE_ID?: string;
}

declare module "cloudflare:workers" {
	namespace Cloudflare {
		interface Env extends CloudflareEnv {}
	}
}
