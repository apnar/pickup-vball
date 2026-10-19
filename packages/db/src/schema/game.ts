import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { gym } from "./gym";
import { permit } from "./permit";

/**
 * Where a night stands. `scheduled` until the RSVP cycle decides: `confirmed`
 * the moment CONFIRM_AT say yes (or at the final call with PLAY_AT),
 * `canceled` at the final call with fewer. Both numbers live in
 * packages/api/src/cycle.ts.
 */
export const GAME_STATUSES = ["scheduled", "confirmed", "canceled"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/**
 * How a night is played. Chosen when it is booked: a 4 v 4 night is planned
 * that way, not what a short 6 v 6 night turns into.
 */
export const GAME_FORMATS = ["6v6", "4v4"] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

/** A booked night. Only exists once a gym has been rented. */
export const game = sqliteTable(
	"game",
	{
		id: text("id").primaryKey(),
		/** YYYY-MM-DD in the gym's timezone. */
		date: text("date").notNull(),
		/** HH:MM, 24-hour. */
		startTime: text("start_time").notNull(),
		endTime: text("end_time"),
		/**
		 * The court. Required: a game is a rented gym at a time, and there is
		 * no such thing as one without a place. `restrict` rather than
		 * `set null` for the same reason -- a gym with games on it cannot be
		 * deleted, and the router says so in words before D1 has to.
		 */
		gymId: text("gym_id")
			.notNull()
			.references(() => gym.id, { onDelete: "restrict" }),
		notes: text("notes"),
		format: text("format", { enum: GAME_FORMATS }).notNull().default("6v6"),
		/**
		 * How many can say they're in. Set per night when it is booked; a
		 * player's yes past it is refused, an admin's is not.
		 */
		capacity: integer("capacity").notNull().default(42),
		permitId: text("permit_id").references(() => permit.id, {
			onDelete: "set null",
		}),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),

		status: text("status", { enum: GAME_STATUSES })
			.notNull()
			.default("scheduled"),

		/*
		 * One stamp per stage of the RSVP cycle. Each means the stage is
		 * RESOLVED, not that an email went out: a stage skipped because its
		 * condition was not met is stamped too, or the job would retry it
		 * every half hour for the rest of the day. What actually went out
		 * lives in `email_send`, one row per send, keyed by `game_id`.
		 */
		callAt: integer("call_at", { mode: "timestamp_ms" }),
		nudgeAt: integer("nudge_at", { mode: "timestamp_ms" }),
		/** Also the answer to "when did we reach CONFIRM_AT". Write-once. */
		confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
		lastCallAt: integer("last_call_at", { mode: "timestamp_ms" }),
		/** Stamped even when the verdict email is deliberately suppressed. */
		decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
		/**
		 * When a cycle email actually left the building. Separate from the
		 * stamps above because the spacing rule between sends is about
		 * inboxes, not bookkeeping -- a stage that resolved without sending
		 * must not push the next one an hour and a half out.
		 */
		lastEmailAt: integer("last_email_at", { mode: "timestamp_ms" }),

		/**
		 * When an admin closed the night at the gym, which is when everybody
		 * checked in was charged a credit. Write-once: the check-ins freeze,
		 * and a mistake after that is a refund on the ledger.
		 */
		closedAt: integer("closed_at", { mode: "timestamp_ms" }),
		closedBy: text("closed_by").references(() => user.id, {
			onDelete: "set null",
		}),

		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("game_date_time_uidx").on(table.date, table.startTime),
		index("game_date_idx").on(table.date),
		index("game_gym_idx").on(table.gymId),
	],
);
