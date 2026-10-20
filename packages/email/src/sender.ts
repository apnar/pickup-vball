import type { Address } from "./telnyx";

/**
 * The name at the top of every email and in the From line. Mirrors SITE_NAME
 * in apps/web/src/content/run.ts; change both together.
 */
export const SITE_NAME = "Viroj’s Pickup";

/**
 * The From address. Telnyx sends from any address on a domain verified in
 * the account (moco-pickup.com, README "Email"); the mailbox itself is a
 * placeholder carried over from the site this one was copied from, and
 * replies to it go wherever that domain's mail goes.
 */
export const SENDER: Address = {
	name: SITE_NAME,
	email: "info@moco-pickup.com",
};
