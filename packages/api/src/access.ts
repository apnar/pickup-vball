import { groupIdsOf } from "@pickup-vball/db/groups";

import type { Context } from "./context";
import { isAdmin } from "./run";

/**
 * Which groups' nights a person may see: theirs, or every one (null) for an
 * admin. Read from D1 on every call, like the person themselves -- a player
 * taken out of a group must lose the night now, not when a cache runs out.
 */
export type Scope = string[] | null;

export async function scopeFor(
	db: Context["db"],
	person: { id: string; role?: string | null },
): Promise<Scope> {
	return isAdmin(person) ? null : groupIdsOf(db, person.id);
}

/**
 * Whether a night is visible. A night from before groups (no group) is open
 * to everybody; every night booked since has one.
 */
export function canSee(game: { groupId: string | null }, scope: Scope) {
	return (
		scope === null || game.groupId === null || scope.includes(game.groupId)
	);
}
