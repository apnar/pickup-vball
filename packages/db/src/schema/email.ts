import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { game } from "./game";

export const EMAIL_KINDS = [
	/** The stages of the RSVP cycle that send, in the order they fire. */
	"rsvp_call",
	"rsvp_nudge",
	"rsvp_last_call",
	/** An admin called a night off by hand. */
	"canceled",
	/** Anything an admin types on /admin/email. */
	"message",
	/** A spot opened on a full night and the next on the waitlist got it. */
	"waitlist_in",
	/** One player's receipt when an admin adds credits they paid for. */
	"credits_added",
	/** A few hours before a night, to the people who are in. */
	"reminder",
	/** A player's balance fell to the last credit when a night was closed. */
	"low_credit",
	/** A full night with nobody waiting has a spot again. */
	"spot_open",
	/**
	 * Legacy. Nothing writes these any more -- the RSVP cycle replaced the
	 * announce-on-booking email, and a night stopped being confirmed or
	 * called off by its count -- but rows from before may still carry them
	 * and the admin log renders them, so the union has to admit them.
	 */
	"announcement",
	"rsvp_confirmed",
	"rsvp_final",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/**
 * Who a send went to. `active` is everybody on the list; `everyone` adds the
 * people who have stepped away for a while. Nobody deactivated is in either.
 */
export const EMAIL_AUDIENCES = ["active", "everyone"] as const;
export type EmailAudience = (typeof EMAIL_AUDIENCES)[number];

/** One row per list send (not per recipient), for the admin log and debugging. */
export const emailSend = sqliteTable(
	"email_send",
	{
		id: text("id").primaryKey(),
		kind: text("kind", { enum: EMAIL_KINDS }).notNull(),
		gameId: text("game_id").references(() => game.id, {
			onDelete: "set null",
		}),
		subject: text("subject").notNull(),
		audience: text("audience", { enum: EMAIL_AUDIENCES })
			.notNull()
			.default("active"),
		/** How many got it by email. */
		recipientCount: integer("recipient_count").notNull(),
		/** How many it was queued to by text (`sms_out` rows carry `send_id`). */
		textCount: integer("text_count").notNull().default(0),
		failedCount: integer("failed_count").notNull().default(0),
		/** JSON array of Telnyx message ids, one per copy sent. */
		messageIds: text("message_ids").notNull().default("[]"),
		/** JSON array of { emails, error } for copies Telnyx refused. */
		errors: text("errors").notNull().default("[]"),
		sentBy: text("sent_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("email_send_game_idx").on(table.gameId)],
);
