import { ORPCError } from "@orpc/server";
import { effectiveStatus, findPersonState } from "@pickup-vball/db/people";
import { type RsvpAnswer, rsvp } from "@pickup-vball/db/schema/rsvp";
import { and, eq } from "drizzle-orm";

import { canSee, scopeFor } from "./access";
import type { Context } from "./context";
import { findGame, type GameSummary } from "./games";
import { confirmIfReady } from "./jobs/rsvp-cycle";
import { nameKeyOf } from "./run";
import { addRow, answerRow, promote } from "./waitlist";

type Db = Context["db"];

async function statusOf(db: Db, userId: string) {
	const state = await findPersonState(db, userId);
	return state ? effectiveStatus(state) : "active";
}

/** Anybody deactivated is simply not here, cached session or not. */
export async function requireHere(db: Db, userId: string) {
	if ((await statusOf(db, userId)) === "deactivated") {
		throw new ORPCError("FORBIDDEN", {
			message: "That account is deactivated.",
		});
	}
}

export async function requireSpot(db: Db, userId: string) {
	const status = await statusOf(db, userId);
	if (status === "deactivated") {
		throw new ORPCError("FORBIDDEN", {
			message: "That account is deactivated.",
		});
	}
	if (status === "suspended") {
		throw new ORPCError("BAD_REQUEST", {
			message: "You're on a break. Mark yourself as back first.",
		});
	}
}

/**
 * A night the caller may answer: it exists, it is in one of their groups,
 * and it was not called off. One outside their groups reads as not there at
 * all -- the same answer as a made-up id, so an id cannot be probed.
 */
export async function requireGame(
	db: Db,
	person: { id: string; role?: string | null },
	id: string,
) {
	const game = await findGame(db, id);
	if (!game || !canSee(game, await scopeFor(db, person))) {
		throw new ORPCError("NOT_FOUND", {
			message: "That night is not on the schedule.",
		});
	}
	if (game.status === "canceled") {
		throw new ORPCError("BAD_REQUEST", {
			message: "That night was called off, so there is nothing to answer.",
		});
	}
	return game;
}

/** Where an answer left them: in, in line, or not holding a spot. */
export type Landed = "in" | "waitlist" | "other";

/**
 * One person's own answer to one night, by any route -- a tap on the site
 * or a text. Checks they may (in their group, not called off, not on a
 * break for a yes), writes it through the waitlist rules, then lets the
 * line move and the night confirm.
 */
export async function recordAnswer(
	db: Db,
	person: { id: string; name: string; role?: string | null },
	gameId: string,
	answer: RsvpAnswer,
): Promise<{ game: GameSummary; landed: Landed }> {
	const game = await requireGame(db, person, gameId);
	// Saying no never needs a spot; saying yes does.
	if (answer === "out") {
		await requireHere(db, person.id);
	} else {
		await requireSpot(db, person.id);
	}

	let landed: Landed;
	const mine = await db
		.select({ id: rsvp.id, response: rsvp.response })
		.from(rsvp)
		.where(and(eq(rsvp.gameId, game.id), eq(rsvp.userId, person.id)))
		.get();

	if (mine) {
		landed = await answerRow(db, game, mine, { response: answer });
	} else {
		// Somebody may have typed your name in already, back when the box
		// took any name. Claim it rather than colliding with the unique
		// index.
		const nameKey = nameKeyOf(person.name);
		const claimed = await db
			.select({ id: rsvp.id, response: rsvp.response })
			.from(rsvp)
			.where(and(eq(rsvp.gameId, game.id), eq(rsvp.nameKey, nameKey)))
			.get();
		if (claimed) {
			landed = await answerRow(db, game, claimed, {
				response: answer,
				userId: person.id,
			});
		} else {
			landed = await addRow(db, game, {
				id: crypto.randomUUID(),
				gameId: game.id,
				name: person.name,
				nameKey,
				response: answer,
				userId: person.id,
				addedBy: person.id,
			});
		}
	}

	// The confirming yes takes effect immediately rather than at the next
	// cron pass. Awaited rather than deferred: nothing plumbs an execution
	// context to oRPC, and the cron would catch it anyway.
	await promote(db, game);
	await confirmIfReady(db, game.id);
	return { game, landed };
}
