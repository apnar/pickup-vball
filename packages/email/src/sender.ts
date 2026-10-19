import type { Address } from "./brevo";

/**
 * The name at the top of every email and in the From line. Mirrors SITE_NAME
 * in apps/web/src/content/run.ts; change both together.
 */
export const SITE_NAME = "Viroj’s Pickup";

/**
 * The verified sender in Brevo.
 *
 * The address is a placeholder carried over from the site this one was copied
 * from, until email is set up for this group's own domain. Brevo refuses a
 * sender it has not verified, so change it only after the new one is.
 */
export const SENDER: Address = {
	name: SITE_NAME,
	email: "info@moco-pickup.com",
};
