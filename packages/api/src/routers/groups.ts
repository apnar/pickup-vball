import { ORPCError } from "@orpc/server";
import {
	countGroupGames,
	createGroup,
	deleteGroup,
	findGroup,
	groupIdsOf,
	listGroups,
	listMemberships,
	setMembers,
	updateGroup,
} from "@pickup-vball/db/groups";
import { GAME_FORMATS, NIGHT_TYPES } from "@pickup-vball/db/schema/group";
import { z } from "zod";

import type { Context } from "../context";
import { isUniqueViolation } from "../db-errors";
import { adminProcedure, protectedProcedure } from "../index";
import { MAX_CAPACITY } from "../run";

const groupInput = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Give the group a name.")
		.max(60, "Names can be up to 60 characters."),
	format: z.enum(GAME_FORMATS),
	nightType: z.enum(NIGHT_TYPES),
	capacity: z
		.number()
		.int("Spots must be a whole number.")
		.min(2, "A night needs at least 2 spots.")
		.max(MAX_CAPACITY, `A night can have at most ${MAX_CAPACITY} spots.`),
});

function nameTaken(): never {
	throw new ORPCError("CONFLICT", {
		message: "There is already a group with that name.",
	});
}

async function requireGroup(db: Context["db"], id: string) {
	const group = await findGroup(db, id);
	if (!group) {
		throw new ORPCError("NOT_FOUND", {
			message: "That group no longer exists.",
		});
	}
	return group;
}

export const groupsRouter = {
	/** Every group with who is in it, for the admin pages. */
	list: adminProcedure.handler(async ({ context }) => {
		const [groups, memberships] = await Promise.all([
			listGroups(context.db),
			listMemberships(context.db),
		]);
		return groups.map((g) => ({
			...g,
			memberIds: memberships
				.filter((m) => m.groupId === g.id)
				.map((m) => m.userId),
		}));
	}),

	/** The caller's own groups, by name. Never anybody else's. */
	mine: protectedProcedure.handler(async ({ context }) => {
		const [groups, mine] = await Promise.all([
			listGroups(context.db),
			groupIdsOf(context.db, context.person.id),
		]);
		return groups
			.filter((g) => mine.includes(g.id))
			.map((g) => ({ id: g.id, name: g.name }));
	}),

	create: adminProcedure
		.input(groupInput)
		.handler(async ({ context, input }) => {
			try {
				return { id: await createGroup(context.db, input) };
			} catch (error) {
				if (isUniqueViolation(error)) nameTaken();
				throw error;
			}
		}),

	/**
	 * Change a group's name or its defaults. Nights already booked keep what
	 * they were booked with: the defaults are where a new night starts.
	 */
	update: adminProcedure
		.input(groupInput.partial().extend({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const { id, ...fields } = input;
			await requireGroup(context.db, id);
			try {
				await updateGroup(context.db, id, fields);
			} catch (error) {
				if (isUniqueViolation(error)) nameTaken();
				throw error;
			}
			return { ok: true };
		}),

	/** Only an empty group: its nights are history, and the ledger points at them. */
	remove: adminProcedure
		.input(z.object({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const group = await requireGroup(context.db, input.id);
			const nights = await countGroupGames(context.db, group.id);
			if (nights > 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: `${group.name} has ${nights === 1 ? "1 night" : `${nights} nights`} booked in it. Move or delete ${nights === 1 ? "it" : "them"} first.`,
				});
			}
			await deleteGroup(context.db, group.id);
			return { ok: true };
		}),

	/** Who is in one group, all at once. */
	setMembers: adminProcedure
		.input(
			z.object({
				id: z.string().min(1),
				userIds: z.array(z.string().min(1)).max(1000),
			}),
		)
		.handler(async ({ context, input }) => {
			await requireGroup(context.db, input.id);
			await setMembers(context.db, input.id, input.userIds);
			return { ok: true };
		}),
};
