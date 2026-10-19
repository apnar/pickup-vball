import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { game } from "./game";

/**
 * Why a balance moved. `played` is written only by closing a night;
 * `refund` gives one of those back; `purchase` is money an admin received;
 * `correction` is anything else, either way, with a note saying why.
 */
export const CREDIT_REASONS = [
	"purchase",
	"played",
	"refund",
	"correction",
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

/** How a purchase was paid. Only a purchase has one. */
export const PAYMENT_METHODS = ["venmo", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * The credit ledger. A row is never updated or deleted: a mistake is put
 * right by another row, so the history always adds up to the balance and
 * says how it got there. A person's balance is `sum(delta)` over their rows;
 * there is no balance column anywhere to drift from it.
 *
 * Both foreign keys `restrict`. Nobody is ever deleted -- people are
 * deactivated -- and a night that has been charged for is part of the books,
 * which `games.remove` says in words before D1 has to.
 */
export const creditEntry = sqliteTable(
	"credit_entry",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		/** Whole credits, never zero. */
		delta: integer("delta").notNull(),
		reason: text("reason", { enum: CREDIT_REASONS }).notNull(),
		/** The night a `played` or `refund` row is about. */
		gameId: text("game_id").references(() => game.id, {
			onDelete: "restrict",
		}),
		method: text("method", { enum: PAYMENT_METHODS }),
		/** Whole dollars received, on a purchase. */
		amountUsd: integer("amount_usd"),
		note: text("note"),
		/** The admin. On a `played` row, the one who closed the night. */
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [
		index("credit_entry_user_idx").on(t.userId, t.createdAt),
		index("credit_entry_created_idx").on(t.createdAt),
		/**
		 * One charge per person per night, and one refund of it. The charge
		 * index is what makes a second "close night" fail outright -- its
		 * whole batch rolls back -- rather than charge everybody twice.
		 */
		uniqueIndex("credit_entry_played_uidx")
			.on(t.gameId, t.userId)
			.where(sql`${t.reason} = 'played'`),
		uniqueIndex("credit_entry_refund_uidx")
			.on(t.gameId, t.userId)
			.where(sql`${t.reason} = 'refund'`),
	],
);

/**
 * Who turned up, ticked off by an admin at the gym. Freely toggled until the
 * night is closed (`game.closed_at`); closing charges one credit per row here
 * and freezes them. Deleting a night that was never closed takes its
 * check-ins with it.
 */
export const checkIn = sqliteTable(
	"check_in",
	{
		id: text("id").primaryKey(),
		gameId: text("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		/** They had not said they were in when they were checked in. */
		walkIn: integer("walk_in", { mode: "boolean" }).notNull().default(false),
		checkedInBy: text("checked_in_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [uniqueIndex("check_in_game_user_uidx").on(t.gameId, t.userId)],
);
