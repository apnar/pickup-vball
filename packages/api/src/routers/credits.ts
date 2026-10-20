import { ORPCError } from "@orpc/server";
import {
	addEntry,
	balanceOf,
	type EntryRow,
	findEntry,
	isRefunded,
	listBalances,
	listEntries,
	totalsSince,
} from "@pickup-vball/db/credits";
import { findPerson, listPeople } from "@pickup-vball/db/people";
import { PAYMENT_METHODS } from "@pickup-vball/db/schema/credit";
import { creditsAddedEmail, creditsAddedText } from "@pickup-vball/email";
import { getMailer, siteUrl } from "@pickup-vball/email/worker";
import { z } from "zod";

import type { Context } from "../context";
import {
	describeEntry,
	ledgerCsv,
	MAX_CREDITS_AT_ONCE,
	METHOD_LABEL,
	monthStart,
} from "../credits";
import { isUniqueViolation } from "../db-errors";
import { adminProcedure, protectedProcedure } from "../index";
import { sendToList } from "../mail";
import { CREDIT_PRICE } from "../run";

const noteSchema = z
	.string()
	.trim()
	.max(200, "Please keep the note under 200 characters.");

const userIdSchema = z.string().min(1);

/** What a page shows for one ledger row. Same shape for admin and player. */
function present(row: EntryRow) {
	const { what, by } = describeEntry(row);
	return {
		id: row.id,
		userId: row.userId,
		playerName: row.playerName,
		delta: row.delta,
		reason: row.reason,
		balance: row.balance,
		createdAt: row.createdAt,
		what,
		by,
		/** The night a charge or refund was for. */
		gameId: row.gameId,
	};
}

async function requirePerson(db: Context["db"], userId: string) {
	const person = await findPerson(db, userId);
	if (!person) {
		throw new ORPCError("NOT_FOUND", {
			message: "That player could not be found.",
		});
	}
	return person;
}

/**
 * Charges in a history that have already been refunded, so the page can
 * stop offering the button. Worked out from the history itself: a refund row
 * names the same night as the charge it undoes.
 */
function refundedNights(rows: EntryRow[]): Set<string> {
	return new Set(
		rows
			.filter((r) => r.reason === "refund" && r.gameId)
			.map((r) => r.gameId as string),
	);
}

export const creditsRouter = {
	/**
	 * Your own balance and history. Never anybody else's: the only filter is
	 * the session's id, read from D1 like everything that decides access.
	 */
	mine: protectedProcedure.handler(async ({ context }) => {
		const rows = await listEntries(context.db, { userId: context.person.id });
		return {
			balance: rows[0]?.balance ?? 0,
			entries: rows.map(present),
		};
	}),

	/** Everything the ledger page shows above the table, plus the table. */
	ledger: adminProcedure
		.input(
			z.object({
				direction: z.enum(["added", "used"]).optional(),
				userId: userIdSchema.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const month = monthStart();
			const [rows, totals, people, balances] = await Promise.all([
				listEntries(context.db, input),
				totalsSince(context.db, month.since),
				listPeople(context.db),
				listBalances(context.db),
			]);
			// Only people the ledger has heard of: somebody who has never paid
			// or played is not behind, and an admin who never plays would sit
			// in this count forever.
			const atOrBelowZero = people.filter((p) => {
				const balance = balances.get(p.id);
				return (
					p.effectiveStatus !== "deactivated" &&
					balance !== undefined &&
					balance <= 0
				);
			}).length;
			return {
				month: month.label,
				added: totals.added,
				used: totals.used,
				atOrBelowZero,
				entries: rows.map(present),
			};
		}),

	/** The whole ledger, oldest first, as CSV text for a download. */
	exportCsv: adminProcedure.handler(async ({ context }) => {
		const rows = await listEntries(context.db, { limit: 100_000 });
		return { csv: ledgerCsv(rows.reverse()) };
	}),

	/** One player's page: who they are, where they stand, how they got there. */
	person: adminProcedure
		.input(z.object({ userId: userIdSchema }))
		.handler(async ({ context, input }) => {
			const person = await requirePerson(context.db, input.userId);
			const rows = await listEntries(context.db, { userId: person.id });
			const refunded = refundedNights(rows);
			return {
				person: {
					id: person.id,
					name: person.name,
					email: person.email,
					role: person.role,
					status: person.effectiveStatus,
					createdAt: person.createdAt,
				},
				balance: rows[0]?.balance ?? 0,
				entries: rows.map((row) => ({
					...present(row),
					refundable:
						row.reason === "played" &&
						row.gameId !== null &&
						!refunded.has(row.gameId),
				})),
			};
		}),

	/**
	 * Money came in. Records it and emails the player a receipt. The credits
	 * are the thing; the receipt is a courtesy, so a send that fails is
	 * reported rather than undoing a payment that really happened.
	 */
	add: adminProcedure
		.input(
			z.object({
				userId: userIdSchema,
				credits: z
					.number()
					.int("Whole credits only.")
					.min(1, "Add at least one credit.")
					.max(
						MAX_CREDITS_AT_ONCE,
						`That's more than ${MAX_CREDITS_AT_ONCE} credits. Add them in two goes if it's right.`,
					),
				method: z.enum(PAYMENT_METHODS),
				note: noteSchema.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const person = await requirePerson(context.db, input.userId);
			const amountUsd = input.credits * CREDIT_PRICE;
			await addEntry(context.db, {
				userId: person.id,
				delta: input.credits,
				reason: "purchase",
				method: input.method,
				amountUsd,
				note: input.note || null,
				createdBy: context.person.id,
			});
			const balance = await balanceOf(context.db, person.id);

			let emailed = false;
			try {
				// "everyone" so somebody on a break still gets their receipt;
				// nobody deactivated is in either audience.
				const receipt = {
					added: input.credits,
					balance,
					method: METHOD_LABEL[input.method],
					amountUsd,
					siteUrl: siteUrl(),
				};
				const result = await sendToList(context.db, {
					kind: "credits_added",
					rendered: creditsAddedEmail(receipt),
					text: creditsAddedText(receipt),
					sentBy: context.person.id,
					audience: "everyone",
					onlyPersonIds: [person.id],
				});
				emailed = (result?.sent ?? 0) + (result?.texted ?? 0) > 0;
			} catch (error) {
				console.error("credits receipt failed", error);
			}
			return { balance, emailed, dryRun: getMailer().dryRun };
		}),

	/**
	 * Anything that is not a payment or a charge: a mistake put right, a
	 * credit given as thanks, one taken back. Always with a reason, because
	 * the ledger is the only explanation anybody will have later.
	 */
	adjust: adminProcedure
		.input(
			z.object({
				userId: userIdSchema,
				delta: z
					.number()
					.int("Whole credits only.")
					.min(-MAX_CREDITS_AT_ONCE)
					.max(MAX_CREDITS_AT_ONCE)
					.refine((n) => n !== 0, "Enter a number other than zero."),
				note: noteSchema.min(1, "Say why, so the history makes sense."),
			}),
		)
		.handler(async ({ context, input }) => {
			const person = await requirePerson(context.db, input.userId);
			await addEntry(context.db, {
				userId: person.id,
				delta: input.delta,
				reason: "correction",
				note: input.note,
				createdBy: context.person.id,
			});
			return { balance: await balanceOf(context.db, person.id) };
		}),

	/**
	 * Give back one night's charge -- somebody checked in by mistake, or who
	 * had to leave hurt. Once per charge: `credit_entry_refund_uidx` holds the
	 * line if the check here is beaten by a double tap.
	 */
	refund: adminProcedure
		.input(
			z.object({ entryId: z.string().min(1), note: noteSchema.optional() }),
		)
		.handler(async ({ context, input }) => {
			const charge = await findEntry(context.db, input.entryId);
			if (charge?.reason !== "played" || !charge.gameId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only a night's charge can be refunded.",
				});
			}
			const already = () =>
				new ORPCError("CONFLICT", {
					message: "That night has already been refunded.",
				});
			if (await isRefunded(context.db, charge.gameId, charge.userId)) {
				throw already();
			}
			try {
				await addEntry(context.db, {
					userId: charge.userId,
					delta: 1,
					reason: "refund",
					gameId: charge.gameId,
					note: input.note || null,
					createdBy: context.person.id,
				});
			} catch (error) {
				if (isUniqueViolation(error)) throw already();
				throw error;
			}
			return { balance: await balanceOf(context.db, charge.userId) };
		}),
};
