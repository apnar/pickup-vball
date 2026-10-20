import { ORPCError } from "@orpc/server";
import {
	effectiveStatus,
	findPersonState,
	listRecipients,
} from "@pickup-vball/db/people";
import { user } from "@pickup-vball/db/schema/auth";
import { RSVP_ANSWERS, rsvp } from "@pickup-vball/db/schema/rsvp";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { canSee, scopeFor } from "../access";
import { recordAnswer, requireGame, requireHere, requireSpot } from "../answer";
import { guestSuggestions, splitAudience } from "../audience";
import type { Context } from "../context";
import { findGame, findNextGame, type GameSummary } from "../games";
import { protectedProcedure } from "../index";
import { listAskedFor } from "../mail";
import { isAdmin, nameKeyOf } from "../run";
import { addRow, answerRow, promote, waitlistOrder } from "../waitlist";

const nameSchema = z
	.string()
	.trim()
	.min(1, "Enter a name.")
	.max(40, "Names can be up to 40 characters.")
	// Braces are template syntax, and a name is the one thing on the
	// sheet a player types that ends up in everybody's email. The mailer
	// neutralises them anyway; this just says no at the box.
	.refine((v) => !/[{}]/.test(v), "Names can't contain { or }.");

const answerSchema = z.enum(RSVP_ANSWERS);

async function listGame(
	db: Context["db"],
	game: GameSummary,
	userId: string | null,
) {
	const rows = await db
		.select({
			id: rsvp.id,
			name: rsvp.name,
			nameKey: rsvp.nameKey,
			response: rsvp.response,
			userId: rsvp.userId,
			addedBy: rsvp.addedBy,
			addedByName: user.name,
		})
		.from(rsvp)
		// Left, not inner: `added_by` is null on every row that predates the
		// column, and those names still have to appear on the sheet.
		.leftJoin(user, eq(rsvp.addedBy, user.id))
		.where(eq(rsvp.gameId, game.id))
		.orderBy(asc(rsvp.createdAt));

	// Place in line, 1 for the front. Its own read because the line is
	// ordered by when each row joined it, not by when the row was made.
	const line = await waitlistOrder(db, game.id);
	const place = new Map(line.map((id, i) => [id, i + 1]));
	const meRow = userId ? rows.find((r) => r.userId === userId) : undefined;

	// Asked of D1, not of `session.user`: the session cookie caches the user
	// for five minutes, and a stale copy here would leave somebody who just
	// stepped away still able to take a spot.
	const state = userId ? await findPersonState(db, userId) : null;

	// Who has not said a word. Only the server can work this out -- the client
	// never sees a user id -- and it is the number the morning reminder is about.
	const active = await listAskedFor(db, game.groupId);
	const split = splitAudience(
		rows.map((r) => ({
			name: r.name,
			nameKey: r.nameKey,
			userId: r.userId,
			addedBy: r.addedBy,
			response: r.response,
		})),
		active.map((p) => ({ id: p.id, name: p.name ?? "" })),
	);

	// Who this person has brought before. Their own history only, and never a
	// name that is already on this night's sheet -- the box would just refuse it.
	const brought = userId
		? await db
				.select({ name: rsvp.name, nameKey: rsvp.nameKey })
				.from(rsvp)
				.where(
					and(
						eq(rsvp.addedBy, userId),
						isNull(rsvp.userId),
						ne(rsvp.gameId, game.id),
					),
				)
				.orderBy(desc(rsvp.createdAt))
				.limit(40)
		: [];

	return {
		game,
		capacity: game.capacity,
		/** The caller's own row, so the board can mark it "you". */
		me: meRow?.id ?? null,
		/** Where the caller stands in line, or null when not waiting. */
		myPlace: meRow ? (place.get(meRow.id) ?? null) : null,
		/** Whether a new yes would wait in line rather than get a spot. */
		full: split.yes >= game.capacity || split.waitlist > 0,
		/** The caller's own state, so the board knows which button to show. */
		viewer: state
			? {
					status: effectiveStatus(state),
					suspendedUntil: state.suspendedUntil,
					reason: state.statusReason,
				}
			: null,
		counts: {
			in: split.yes,
			maybe: split.maybe,
			out: split.out,
			waitlist: split.waitlist,
			silent: split.silent,
		},
		silentNames: split.silentNames,
		/** Names to offer back in the guest box, most recently brought first. */
		guestSuggestions: guestSuggestions(
			brought,
			rows.map((r) => r.nameKey),
			6,
		),
		/**
		 * The instant this payload was built. The countdown seeds its clock
		 * from this so the server render and the first client render agree;
		 * see apps/web/src/hooks/use-countdown.ts.
		 */
		now: new Date().toISOString(),
		rsvps: rows.map((r) => ({
			id: r.id,
			name: r.name,
			response: r.response,
			/** Place in line when waiting, 1 for the front. */
			place: place.get(r.id) ?? null,
			/** Whether the caller is allowed to change this one. */
			mine: canSet(r, userId, false),
			/** Somebody with no account, whom another player is vouching for. */
			guest: r.userId === null,
			/**
			 * Who put them on the sheet, so the room knows whose guest it is
			 * and who to ask when they do not turn up. Null on a member's own
			 * row and on guest rows that predate the column.
			 */
			addedByName: r.userId === null ? r.addedByName : null,
		})),
	};
}

export type Headcount = Awaited<ReturnType<typeof listGame>>;

/**
 * Whose answer is whose. You answer for yourself and for guests you put on
 * the sheet; an admin answers for anybody. Another player's row is theirs.
 *
 * A guest row with no `addedBy` predates the column, so nobody owns it and
 * anybody may sort it out.
 */
function canSet(
	row: { userId: string | null; addedBy: string | null },
	userId: string | null,
	admin: boolean,
): boolean {
	if (admin) return true;
	if (!userId) return false;
	if (row.userId === userId) return true;
	if (row.userId === null)
		return row.addedBy === userId || row.addedBy === null;
	return false;
}

/** The whole payload, freshly counted, after a write. */
async function reread(context: Context, gameId: string, fallback: GameSummary) {
	return listGame(
		context.db,
		(await findGame(context.db, gameId)) ?? fallback,
		context.session?.user.id ?? null,
	);
}

export const rsvpRouter = {
	/** Headcount for a night; defaults to the next one. Null when nothing is booked. */
	list: protectedProcedure
		.input(z.object({ gameId: z.string().min(1).optional() }))
		.handler(async ({ context, input }) => {
			const scope = await scopeFor(context.db, context.person);
			const game = input.gameId
				? await findGame(context.db, input.gameId)
				: await findNextGame(context.db, scope);
			if (!game || !canSee(game, scope)) return null;
			return listGame(context.db, game, context.session.user.id);
		}),

	/**
	 * Your own answer. What the buttons in every cycle email eventually call
	 * -- the email link lands on a page, and the page waits for a tap. A text
	 * reply comes in through the webhook and the same `recordAnswer`.
	 */
	respond: protectedProcedure
		.input(z.object({ gameId: z.string().min(1), answer: answerSchema }))
		.handler(async ({ context, input }) => {
			const { game } = await recordAnswer(
				context.db,
				context.person,
				input.gameId,
				input.answer,
			);
			return reread(context, game.id, game);
		}),

	/**
	 * Put a guest's name in. They arrive In; that is what adding means.
	 *
	 * Guests only. Everybody on the list has their own buttons and their own
	 * emails, and typing a regular's name in for them takes the answer out of
	 * their hands -- it also marks them answered, so the morning reminder skips the
	 * one person who has not actually said anything.
	 */
	add: protectedProcedure
		.input(z.object({ gameId: z.string().min(1), name: nameSchema }))
		.handler(async ({ context, input }) => {
			const game = await requireGame(context.db, context.person, input.gameId);
			const me = context.session.user;
			await requireHere(context.db, me.id);

			const name = input.name.replace(/\s+/g, " ");
			const nameKey = nameKeyOf(name);

			// "everyone" rather than "active": somebody sitting a month out is
			// still on the roster, and dragging them back as a guest is not how
			// a break ends. An admin keeps the old behaviour -- somebody has to
			// be able to fix the sheet by hand.
			if (!isAdmin(me)) {
				const roster = await listRecipients(context.db, "everyone");
				// Their spelling, not whatever was typed into the box.
				const listed = roster.find((p) => nameKeyOf(p.name ?? "") === nameKey);
				if (listed) {
					throw new ORPCError("BAD_REQUEST", {
						message: `${listed.name} is in the group and answers for themselves.`,
					});
				}
			}

			const existing = await context.db
				.select({
					id: rsvp.id,
					userId: rsvp.userId,
					addedBy: rsvp.addedBy,
					response: rsvp.response,
				})
				.from(rsvp)
				.where(and(eq(rsvp.gameId, game.id), eq(rsvp.nameKey, nameKey)))
				.get();

			if (existing) {
				// Re-adding a name must not overwrite a deliberate answer that
				// is not yours to overwrite. Somebody who said Out stays Out
				// until they say otherwise -- otherwise a typo could push the
				// count over the line and fire the confirmation email.
				if (!canSet(existing, me.id, isAdmin(me))) {
					throw new ORPCError("FORBIDDEN", {
						message: `${name} has already answered for themselves.`,
					});
				}
				await answerRow(
					context.db,
					game,
					existing,
					{
						response: "in",
						...(existing.addedBy === null && { addedBy: me.id }),
					},
					isAdmin(me),
				);
			} else {
				await addRow(
					context.db,
					game,
					{
						id: crypto.randomUUID(),
						gameId: game.id,
						name,
						nameKey,
						response: "in",
						userId: null,
						addedBy: me.id,
					},
					isAdmin(me),
				);
			}

			await promote(context.db, game);
			return reread(context, game.id, game);
		}),

	/**
	 * Set one name's answer. Idempotent on purpose: the old toggle flipped a
	 * boolean, which has no meaning with three states and lands anywhere at
	 * all when two people tap the same card at once.
	 */
	setResponse: protectedProcedure
		.input(
			z.object({
				gameId: z.string().min(1),
				id: z.string().min(1),
				answer: answerSchema,
			}),
		)
		.handler(async ({ context, input }) => {
			const game = await requireGame(context.db, context.person, input.gameId);
			const me = context.session.user;
			await requireHere(context.db, me.id);

			const row = await context.db
				.select({
					id: rsvp.id,
					name: rsvp.name,
					userId: rsvp.userId,
					addedBy: rsvp.addedBy,
					response: rsvp.response,
				})
				.from(rsvp)
				.where(and(eq(rsvp.id, input.id), eq(rsvp.gameId, game.id)))
				.get();
			if (!row) {
				throw new ORPCError("NOT_FOUND", {
					message: "That name is not on this night's sheet.",
				});
			}
			if (!canSet(row, me.id, isAdmin(me))) {
				throw new ORPCError("FORBIDDEN", {
					message: `You can't change ${row.name}'s answer.`,
				});
			}
			if (row.userId === me.id && input.answer !== "out") {
				await requireSpot(context.db, me.id);
			}

			await answerRow(
				context.db,
				game,
				row,
				{ response: input.answer },
				isAdmin(me) && row.userId !== me.id,
			);

			await promote(context.db, game);
			return reread(context, game.id, game);
		}),

	/**
	 * Take a guest back off the sheet. Only a guest, and only yours.
	 *
	 * A member's row is never deleted by anybody -- an answer they gave is
	 * theirs to change, and "out" is how they say it. A guest has no way to
	 * say anything, so whoever vouched for them has to be able to undo it.
	 */
	removeGuest: protectedProcedure
		.input(z.object({ gameId: z.string().min(1), id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const game = await requireGame(context.db, context.person, input.gameId);
			if (game.decidedAt) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Answers for this night are closed, so the sheet can no longer change.",
				});
			}
			const me = context.session.user;
			await requireHere(context.db, me.id);

			const row = await context.db
				.select({
					id: rsvp.id,
					name: rsvp.name,
					userId: rsvp.userId,
					addedBy: rsvp.addedBy,
				})
				.from(rsvp)
				.where(and(eq(rsvp.id, input.id), eq(rsvp.gameId, game.id)))
				.get();
			if (!row) {
				throw new ORPCError("NOT_FOUND", {
					message: "That name is not on this night's sheet.",
				});
			}
			if (row.userId !== null) {
				throw new ORPCError("FORBIDDEN", {
					message: `${row.name} is in the group and can take themselves off.`,
				});
			}
			if (!canSet(row, me.id, isAdmin(me))) {
				throw new ORPCError("FORBIDDEN", {
					message: `Only the person who added ${row.name}, or an admin, can take them off.`,
				});
			}

			await context.db.delete(rsvp).where(eq(rsvp.id, row.id));

			// A guest who was in leaves a spot for the front of the line.
			await promote(context.db, game);
			return reread(context, game.id, game);
		}),
};
