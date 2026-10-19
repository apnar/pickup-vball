import { ORPCError } from "@orpc/server";
import { findGroup } from "@pickup-vball/db/groups";
import { GAME_FORMATS, game, NIGHT_TYPES } from "@pickup-vball/db/schema/game";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { scopeFor } from "../access";
import type { Context } from "../context";
import { isUniqueViolation } from "../db-errors";
import { findGame, findNextGame, listGames } from "../games";
import { adminProcedure, protectedProcedure } from "../index";
import { MAX_CAPACITY } from "../run";
import { promote } from "../waitlist";

const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");
const timeSchema = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM.");

const gameInput = z.object({
	date: dateSchema,
	startTime: timeSchema,
	endTime: timeSchema.nullable().optional(),
	gymId: z.string().min(1, "Pick a gym."),
	notes: z.string().trim().max(300).nullable().optional(),
	permitId: z.string().min(1).nullable().optional(),
	groupId: z.string().min(1, "Pick a group."),
	// No `.default()` on these: `update` takes this schema `.partial()`, and a
	// default there would quietly reset a night that was not edited. A new
	// night takes whatever is missing from its group instead.
	format: z.enum(GAME_FORMATS).optional(),
	nightType: z.enum(NIGHT_TYPES).optional(),
	capacity: z
		.number()
		.int("Spots must be a whole number.")
		.min(2, "A night needs at least 2 spots.")
		.max(MAX_CAPACITY, `A night can have at most ${MAX_CAPACITY} spots.`)
		.optional(),
});

async function requireGroup(db: Context["db"], id: string) {
	const group = await findGroup(db, id);
	if (!group) {
		throw new ORPCError("BAD_REQUEST", {
			message: "That group no longer exists. Pick another.",
		});
	}
	return group;
}

export const gamesRouter = {
	/**
	 * The next night on or after today in one of the caller's groups, or null.
	 * Players only: where and when the night is stays off the public pages,
	 * and a night in a group you are not in stays off yours.
	 */
	next: protectedProcedure.handler(async ({ context }) =>
		findNextGame(context.db, await scopeFor(context.db, context.person)),
	),

	/** Upcoming nights plus a few recent ones, for the schedule page. */
	list: protectedProcedure.handler(async ({ context }) =>
		listGames(context.db, 5, await scopeFor(context.db, context.person)),
	),

	create: adminProcedure
		.input(gameInput)
		.handler(async ({ context, input }) => {
			const group = await requireGroup(context.db, input.groupId);
			const id = crypto.randomUUID();
			try {
				await context.db.insert(game).values({
					id,
					date: input.date,
					startTime: input.startTime,
					endTime: input.endTime ?? null,
					gymId: input.gymId,
					notes: input.notes || null,
					permitId: input.permitId ?? null,
					groupId: group.id,
					format: input.format ?? group.format,
					nightType: input.nightType ?? group.nightType,
					capacity: input.capacity ?? group.capacity,
					createdBy: context.session.user.id,
				});
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new ORPCError("CONFLICT", {
						message:
							"That gym already has a night booked at that date and time.",
					});
				}
				throw error;
			}
			return findGame(context.db, id);
		}),

	update: adminProcedure
		.input(gameInput.partial().extend({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const { id, ...changes } = input;
			const existing = await findGame(context.db, id);
			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: "That night no longer exists.",
				});
			}
			await context.db
				.update(game)
				.set({
					...(changes.date !== undefined && { date: changes.date }),
					...(changes.startTime !== undefined && {
						startTime: changes.startTime,
					}),
					...(changes.endTime !== undefined && {
						endTime: changes.endTime ?? null,
					}),
					...(changes.gymId !== undefined && { gymId: changes.gymId }),
					...(changes.notes !== undefined && { notes: changes.notes || null }),
					...(changes.permitId !== undefined && {
						permitId: changes.permitId ?? null,
					}),
					...(changes.groupId !== undefined && {
						groupId: (await requireGroup(context.db, changes.groupId)).id,
					}),
					...(changes.format !== undefined && { format: changes.format }),
					...(changes.nightType !== undefined && {
						nightType: changes.nightType,
					}),
					...(changes.capacity !== undefined && {
						capacity: changes.capacity,
					}),
				})
				.where(eq(game.id, id));
			const updated = await findGame(context.db, id);
			// More spots means the front of the line gets them now.
			if (updated && changes.capacity !== undefined) {
				await promote(context.db, updated);
			}
			return updated;
		}),

	remove: adminProcedure
		.input(z.object({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			// A closed night has charges on the ledger pointing at it, and the
			// ledger does not lose rows. D1 would refuse anyway; this says why.
			const existing = await findGame(context.db, input.id);
			if (existing?.closedAt) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This night was closed and charged, so it stays on the books.",
				});
			}
			await context.db.delete(game).where(eq(game.id, input.id));
			return { ok: true };
		}),
};
