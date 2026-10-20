import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { GAME_FORMATS, gameGroup, NIGHT_TYPES } from "./group";
import { gym } from "./gym";
import { permit } from "./permit";

/**
 * Where a night stands. A night is never called off for its count -- whoever
 * is in plays -- so `canceled` only ever comes from an admin, by hand. Nights
 * from before that rule may still say `canceled`, which is what happened.
 */
export const GAME_STATUSES = ["scheduled", "canceled"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export {
	GAME_FORMATS,
	type GameFormat,
	NIGHT_TYPES,
	type NightType,
} from "./group";

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
		/**
		 * Which group the night is for, and so who can see it and who is
		 * emailed about it. Required for every night booked since groups
		 * exist; null only on nights from before, which stay open to all.
		 * `restrict`: a group with nights cannot be deleted, and the router
		 * says so in words before D1 has to.
		 */
		groupId: text("group_id").references(() => gameGroup.id, {
			onDelete: "restrict",
		}),
		format: text("format", { enum: GAME_FORMATS }).notNull().default("6v6"),
		nightType: text("night_type", { enum: NIGHT_TYPES })
			.notNull()
			.default("coed"),
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
		lastCallAt: integer("last_call_at", { mode: "timestamp_ms" }),
		/**
		 * When answers closed: the 1 PM stage, or an admin calling the night
		 * off. Nothing is sent for it; the stamp is what freezes the sheet.
		 */
		decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
		/**
		 * When a cycle email actually left the building. Separate from the
		 * stamps above because the spacing rule between sends is about
		 * inboxes, not bookkeeping -- a stage that resolved without sending
		 * must not push the next one an hour and a half out.
		 */
		lastEmailAt: integer("last_email_at", { mode: "timestamp_ms" }),
		/** The game-day reminder went to the people in. Claimed like a stage. */
		reminderAt: integer("reminder_at", { mode: "timestamp_ms" }),
		/**
		 * When the group was last told a spot opened, so somebody flipping
		 * in and out does not text everybody each time.
		 */
		spotOpenAt: integer("spot_open_at", { mode: "timestamp_ms" }),

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
		// One night per gym at a time. Two groups can play at once, in two gyms.
		uniqueIndex("game_gym_date_time_uidx").on(
			table.gymId,
			table.date,
			table.startTime,
		),
		index("game_date_idx").on(table.date),
		index("game_gym_idx").on(table.gymId),
		index("game_group_idx").on(table.groupId),
	],
);
