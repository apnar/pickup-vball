import { asc, count, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { createDb } from "./index";
import { game } from "./schema/game";
import {
	type GameFormat,
	gameGroup,
	groupMember,
	type NightType,
} from "./schema/group";

type Db = ReturnType<typeof createDb>;

/*
 * Every read and write of the groups and who is in them, the way `people.ts`
 * owns `user`. Who may see a night is decided from these rows, so nothing
 * else writes them.
 */

export type GroupFields = {
	name: string;
	format: GameFormat;
	nightType: NightType;
	capacity: number;
};

export type GroupRow = GroupFields & { id: string };

export async function listGroups(db: Db): Promise<GroupRow[]> {
	return db
		.select({
			id: gameGroup.id,
			name: gameGroup.name,
			format: gameGroup.format,
			nightType: gameGroup.nightType,
			capacity: gameGroup.capacity,
		})
		.from(gameGroup)
		.orderBy(asc(gameGroup.name))
		.all();
}

export async function findGroup(db: Db, id: string): Promise<GroupRow | null> {
	const row = await db
		.select({
			id: gameGroup.id,
			name: gameGroup.name,
			format: gameGroup.format,
			nightType: gameGroup.nightType,
			capacity: gameGroup.capacity,
		})
		.from(gameGroup)
		.where(eq(gameGroup.id, id))
		.get();
	return row ?? null;
}

export async function createGroup(db: Db, fields: GroupFields) {
	const id = crypto.randomUUID();
	await db.insert(gameGroup).values({ id, ...fields });
	return id;
}

export async function updateGroup(
	db: Db,
	id: string,
	fields: Partial<GroupFields>,
) {
	await db.update(gameGroup).set(fields).where(eq(gameGroup.id, id));
}

/** How many nights were booked in a group: a group with any cannot go. */
export async function countGroupGames(db: Db, id: string): Promise<number> {
	const row = await db
		.select({ n: count() })
		.from(game)
		.where(eq(game.groupId, id))
		.get();
	return row?.n ?? 0;
}

/** Its memberships go with it (cascade); its nights must already be gone. */
export async function deleteGroup(db: Db, id: string) {
	await db.delete(gameGroup).where(eq(gameGroup.id, id));
}

/** Every membership, for the admin pages that show them all at once. */
export async function listMemberships(
	db: Db,
): Promise<{ groupId: string; userId: string }[]> {
	return db
		.select({ groupId: groupMember.groupId, userId: groupMember.userId })
		.from(groupMember)
		.all();
}

/** The groups one person is in: what decides which nights they see. */
export async function groupIdsOf(db: Db, userId: string): Promise<string[]> {
	const rows = await db
		.select({ groupId: groupMember.groupId })
		.from(groupMember)
		.where(eq(groupMember.userId, userId))
		.all();
	return rows.map((r) => r.groupId);
}

/** The people in one group: who is asked about its nights. */
export async function memberIdsOf(db: Db, groupId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: groupMember.userId })
		.from(groupMember)
		.where(eq(groupMember.groupId, groupId))
		.all();
	return rows.map((r) => r.userId);
}

/**
 * Replace a set of memberships in one D1 batch, which is one transaction:
 * delete then insert, the way permit coverage is written. Twenty rows a
 * statement for D1's cap of a hundred bound parameters.
 */
async function replace(
	db: Db,
	clear: BatchItem<"sqlite">,
	pairs: { groupId: string; userId: string }[],
) {
	const inserts = chunk(pairs, 20).map((rows) =>
		db
			.insert(groupMember)
			.values(rows.map((r) => ({ id: crypto.randomUUID(), ...r }))),
	);
	await db.batch([clear, ...inserts]);
}

export async function setMembers(db: Db, groupId: string, userIds: string[]) {
	await replace(
		db,
		db.delete(groupMember).where(eq(groupMember.groupId, groupId)),
		[...new Set(userIds)].map((userId) => ({ groupId, userId })),
	);
}

export async function setGroupsOf(db: Db, userId: string, groupIds: string[]) {
	await replace(
		db,
		db.delete(groupMember).where(eq(groupMember.userId, userId)),
		[...new Set(groupIds)].map((groupId) => ({ groupId, userId })),
	);
}

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}
