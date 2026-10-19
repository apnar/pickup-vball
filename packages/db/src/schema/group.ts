import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * How a night is played. Chosen when it is booked: a 4 v 4 night is planned
 * that way, not what a short 6 v 6 night turns into.
 */
export const GAME_FORMATS = ["6v6", "4v4"] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

/** Coed, or reverse coed (women's-height net, the men's attack rule). */
export const NIGHT_TYPES = ["coed", "revco"] as const;
export type NightType = (typeof NIGHT_TYPES)[number];

/**
 * A kind of night the group runs -- "Sunday Night Volleyball", "Saturday
 * Night RevCo 6s" -- and who it is for. Every night is booked in one, takes
 * its format, type and spots from it as defaults, and is seen only by the
 * people in it. That last part is the point: it is how an advanced night is
 * kept to the people it is meant for, and it is enforced on the server.
 */
export const gameGroup = sqliteTable("game_group", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	format: text("format", { enum: GAME_FORMATS }).notNull().default("6v6"),
	nightType: text("night_type", { enum: NIGHT_TYPES })
		.notNull()
		.default("coed"),
	capacity: integer("capacity").notNull().default(42),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/** Who is in which group. A person can be in any number of them. */
export const groupMember = sqliteTable(
	"game_group_member",
	{
		id: text("id").primaryKey(),
		groupId: text("group_id")
			.notNull()
			.references(() => gameGroup.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [
		uniqueIndex("game_group_member_uidx").on(t.groupId, t.userId),
		index("game_group_member_user_idx").on(t.userId),
	],
);
