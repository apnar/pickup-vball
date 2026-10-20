import { ORPCError } from "@orpc/server";
import {
	checkInPerson,
	closeNight,
	listBalances,
	listCheckIns,
	uncheckPerson,
} from "@pickup-vball/db/credits";
import { listPeople } from "@pickup-vball/db/people";
import type { RsvpResponse } from "@pickup-vball/db/schema/rsvp";
import { z } from "zod";

import type { Context } from "../context";
import { isUniqueViolation } from "../db-errors";
import { findGame } from "../games";
import { adminProcedure } from "../index";
import { tellLowCredit } from "../jobs/alerts";
import { readSheet } from "../mail";
import { todayInRunTimezone } from "../run";

const gameIdSchema = z.string().min(1);

/**
 * A night that can be checked in: it exists, it was not called off, and it
 * is not still in the future. Closed nights pass -- the sheet is read-only
 * then, and each write says so in its own words.
 */
async function requireNight(db: Context["db"], gameId: string) {
	const game = await findGame(db, gameId);
	if (!game) {
		throw new ORPCError("NOT_FOUND", {
			message: "That night is not on the schedule.",
		});
	}
	if (game.status === "canceled") {
		throw new ORPCError("BAD_REQUEST", {
			message: "That night was called off, so there is nobody to check in.",
		});
	}
	if (game.date > todayInRunTimezone()) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Check-in opens on the day of the night.",
		});
	}
	return game;
}

function alreadyClosed(): never {
	throw new ORPCError("CONFLICT", {
		message:
			"This night is closed and everyone checked in has been charged. Use a refund on the player's page to fix a mistake.",
	});
}

export const checkinRouter = {
	/**
	 * The sheet at the gym: everybody who said they were in, plus anybody
	 * checked in without saying so, each with their balance so an admin can
	 * collect from whoever is out of credits while they are standing there.
	 */
	sheet: adminProcedure
		.input(z.object({ gameId: gameIdSchema }))
		.handler(async ({ context, input }) => {
			const game = await findGame(context.db, input.gameId);
			if (!game) {
				throw new ORPCError("NOT_FOUND", {
					message: "That night is not on the schedule.",
				});
			}
			const [checkIns, sheet, people, balances] = await Promise.all([
				listCheckIns(context.db, game.id),
				readSheet(context.db, game.id),
				listPeople(context.db),
				listBalances(context.db),
			]);
			const here = new Map(checkIns.map((c) => [c.userId, c.walkIn]));
			const answers = new Map<string, RsvpResponse>();
			for (const row of sheet) {
				if (row.userId) answers.set(row.userId, row.response);
			}
			const byName = (a: { name: string }, b: { name: string }) =>
				a.name.localeCompare(b.name);

			const everyone = people.map((p) => ({
				id: p.id,
				name: p.name,
				balance: balances.get(p.id) ?? 0,
				answer: answers.get(p.id) ?? null,
				checkedIn: here.has(p.id),
				walkIn: here.get(p.id) ?? false,
				// Somebody deactivated since they were checked in stays on a
				// closed night's sheet; they just cannot be added to a new one.
				gone: p.effectiveStatus === "deactivated",
			}));
			const onSheet = (p: (typeof everyone)[number]) =>
				p.checkedIn || (p.answer === "in" && !p.gone);
			const closedBy = game.closedBy
				? (people.find((p) => p.id === game.closedBy)?.name ?? null)
				: null;

			return {
				game,
				closedByName: closedBy,
				opensLater: game.date > todayInRunTimezone(),
				rows: everyone.filter(onSheet).sort(byName),
				/** Everybody else still in the group, for the walk-in search. */
				others: everyone
					.filter((p) => !onSheet(p) && !p.gone)
					.sort(byName)
					.map(({ id, name, balance }) => ({ id, name, balance })),
				/**
				 * Names on the sheet with no account. Nothing here can charge
				 * them; the page lists them so nobody is surprised at the door.
				 */
				guests: sheet
					.filter((r) => r.userId === null && r.response === "in")
					.map((r) => r.name),
			};
		}),

	/** Tick or untick one person. */
	set: adminProcedure
		.input(
			z.object({
				gameId: gameIdSchema,
				userId: z.string().min(1),
				here: z.boolean(),
			}),
		)
		.handler(async ({ context, input }) => {
			const game = await requireNight(context.db, input.gameId);
			if (game.closedAt) alreadyClosed();

			if (!input.here) {
				await uncheckPerson(context.db, input);
				return { ok: true };
			}
			const people = await listPeople(context.db);
			const person = people.find((p) => p.id === input.userId);
			if (!person || person.effectiveStatus === "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "That player is not in the group.",
				});
			}
			const sheet = await readSheet(context.db, game.id);
			const saidIn = sheet.some(
				(r) => r.userId === person.id && r.response === "in",
			);
			const ticked = await checkInPerson(context.db, {
				gameId: game.id,
				userId: person.id,
				walkIn: !saidIn,
				by: context.person.id,
			});
			// Not ticked is either "already was", which is fine, or "closed a
			// moment ago", which is not; ask the night which.
			if (!ticked && (await findGame(context.db, game.id))?.closedAt) {
				alreadyClosed();
			}
			return { ok: true };
		}),

	/**
	 * Close the night and charge one credit to everybody checked in. Once:
	 * `closeNight` makes a second close fail rather than charge twice.
	 */
	close: adminProcedure
		.input(z.object({ gameId: gameIdSchema }))
		.handler(async ({ context, input }) => {
			const game = await requireNight(context.db, input.gameId);
			if (game.closedAt) alreadyClosed();
			let result: Awaited<ReturnType<typeof closeNight>>;
			try {
				result = await closeNight(context.db, {
					gameId: game.id,
					by: context.person.id,
				});
			} catch (error) {
				if (isUniqueViolation(error)) alreadyClosed();
				throw error;
			}
			if (!result.closed) alreadyClosed();
			// The charge stands whatever the alert does.
			await tellLowCredit(context.db, game.id).catch((error) =>
				console.error("low credit alert failed", error),
			);
			return { charged: result.charged };
		}),
};
