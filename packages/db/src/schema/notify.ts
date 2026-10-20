import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { EMAIL_KINDS, emailSend } from "./email";
import { game } from "./game";

/**
 * The kinds of message a player can choose a channel for. Labels, defaults
 * and which of them cannot be switched off live in
 * `packages/api/src/notify.ts`, next to the arithmetic that reads them.
 */
export const NOTIFY_TOPICS = [
	"call",
	"nudge",
	"canceled",
	"waitlist_in",
	"reminder",
	"spot_open",
	"low_credit",
	"credits_added",
	"message",
] as const;
export type NotifyTopic = (typeof NOTIFY_TOPICS)[number];

export const NOTIFY_CHANNELS = ["off", "email", "text", "both"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/**
 * A player's choice for one topic. No row means the default, so nothing has
 * to be written for somebody who never opens the page, and a default can
 * change for everybody who has not chosen.
 */
export const notifyPref = sqliteTable(
	"notify_pref",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		topic: text("topic", { enum: NOTIFY_TOPICS }).notNull(),
		channel: text("channel", { enum: NOTIFY_CHANNELS }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.topic] })],
);

/**
 * A number somebody is in the middle of proving is theirs. One per person:
 * asking again replaces it. The code itself is never stored, only an HMAC
 * of it, so a copy of the database cannot finish anybody's check.
 */
export const phoneCheck = sqliteTable("phone_check", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	phone: text("phone").notNull(),
	codeHash: text("code_hash").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
	/** Wrong codes typed against this one. Five and it is dead. */
	attempts: integer("attempts").notNull().default(0),
	/** Codes sent since `window_start`, for the daily cap. */
	sends: integer("sends").notNull().default(0),
	windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
	lastSentAt: integer("last_sent_at", { mode: "timestamp_ms" }).notNull(),
});

/** What a text in the outbox is: a list send's kind, or a reply. */
export const SMS_KINDS = [...EMAIL_KINDS, "reply"] as const;
export type SmsKind = (typeof SMS_KINDS)[number];

/**
 * - `queued` — waiting for a drain, possibly until `send_after`.
 * - `sending` — claimed by a drain that has not come back yet.
 * - `sent` / `delivered` / `failed` — what Telnyx said, by API then webhook.
 * - `skipped` — not sent on purpose: the night started, the number
 *   changed, they texted STOP, or they left.
 */
export const SMS_STATUSES = [
	"queued",
	"sending",
	"sent",
	"delivered",
	"failed",
	"skipped",
] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

/**
 * Every text we send, one row per person. Texts go one request each, and a
 * Worker on the free plan gets fifty outside calls a run, so a send to the
 * group is written here and drained a few dozen at a time
 * (`api/src/jobs/sms-drain.ts`). It is also the record a reply is read
 * against: IN means the night we last texted them about.
 */
export const smsOut = sqliteTable(
	"sms_out",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		gameId: text("game_id").references(() => game.id, {
			onDelete: "set null",
		}),
		sendId: text("send_id").references(() => emailSend.id, {
			onDelete: "set null",
		}),
		kind: text("kind", { enum: SMS_KINDS }).notNull(),
		/** The number it was meant for when it was queued. */
		toPhone: text("to_phone").notNull(),
		/**
		 * With the sign-in key still a placeholder: the drain fills it from the
		 * person's row, so a rotated key is respected and no row in this table
		 * is a live way in.
		 */
		body: text("body").notNull(),
		status: text("status", { enum: SMS_STATUSES }).notNull().default("queued"),
		/** Not before this. Quiet hours push it to the morning. */
		sendAfter: integer("send_after", { mode: "timestamp_ms" }).notNull(),
		telnyxId: text("telnyx_id"),
		error: text("error"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		sentAt: integer("sent_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("sms_out_queue_idx").on(table.status, table.sendAfter),
		index("sms_out_user_idx").on(table.userId, table.createdAt),
		index("sms_out_telnyx_idx").on(table.telnyxId),
		index("sms_out_send_idx").on(table.sendId),
	],
);

/**
 * Every text that reached us, keyed by Telnyx's id so a webhook delivered
 * twice is acted on once. `outcome` is what we made of it, for debugging.
 */
export const smsIn = sqliteTable(
	"sms_in",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		fromPhone: text("from_phone").notNull(),
		text: text("text").notNull(),
		outcome: text("outcome"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("sms_in_user_idx").on(table.userId, table.createdAt)],
);
