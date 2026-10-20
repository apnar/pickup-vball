import { ORPCError } from "@orpc/server";
import { outboxCounts } from "@pickup-vball/db/notify";
import { EMAIL_AUDIENCES, emailSend } from "@pickup-vball/db/schema/email";
import { game } from "@pickup-vball/db/schema/game";
import { canceledEmail, canceledText, fillParams } from "@pickup-vball/email";
import { getMailer, getTexter, siteUrl } from "@pickup-vball/email/worker";
import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { z } from "zod";

import { union } from "../audience";
import type { Context } from "../context";
import { EMAIL_STAGE, type EmailStageKey, STAGES } from "../cycle";
import { findGame, listGames } from "../games";
import { adminProcedure } from "../index";
import { renderStage } from "../jobs/stage-render";
import {
	countRecipients,
	readSplit,
	recipientCounts,
	renderMessage,
	renderMessageText,
	sendToList,
	tokensFor,
} from "../mail";

const gameIdSchema = z.object({ gameId: z.string().min(1) });

const stageSchema = z.enum(
	Object.keys(EMAIL_STAGE) as [EmailStageKey, ...EmailStageKey[]],
);

const messageSchema = z.object({
	subject: z.string().trim().min(1, "Enter a subject.").max(120),
	body: z.string().trim().min(1, "Enter a message.").max(5000),
	/**
	 * Who hears it. "active" is everybody on the list; "everyone" also reaches
	 * the people who have stepped away, for the rare thing they would want
	 * anyway ("the season is moving to Thursdays"). Neither reaches anybody
	 * deactivated. The cycle emails never offer the choice.
	 */
	audience: z.enum(EMAIL_AUDIENCES).default("active"),
	/**
	 * The text-message version, for whoever chose texts for group updates.
	 * Short: a text is read on a lock screen. Blank means the subject.
	 */
	text: z.string().trim().max(300).optional(),
});

async function requireGame(db: Context["db"], id: string) {
	const found = await findGame(db, id);
	if (!found) {
		throw new ORPCError("NOT_FOUND", {
			message: "That night no longer exists.",
		});
	}
	return found;
}

function nobody(): never {
	throw new ORPCError("BAD_REQUEST", {
		message: "There is nobody in the group to send to.",
	});
}

export const mailRouter = {
	/** Whether emails actually leave the building (TELNYX_API_KEY is set). */
	status: adminProcedure.handler(async ({ context }) => ({
		dryRun: getMailer().dryRun,
		textsDryRun: getTexter().dryRun,
		outbox: await outboxCounts(context.db, new Date()),
		counts: await recipientCounts(context.db),
	})),

	/**
	 * What one stage of the cycle would say about a game right now, rendered
	 * against the live count. Nothing is sent and nothing is stamped.
	 */
	previewStage: adminProcedure
		.input(gameIdSchema.extend({ stage: stageSchema }))
		.handler(async ({ context, input }) => {
			const found = await requireGame(context.db, input.gameId);
			const split = await readSplit(context.db, found.id);
			const { rendered, text, audience } = renderStage({
				stage: input.stage,
				game: found,
				split,
				now: new Date(),
			});
			return {
				...rendered,
				textMessage: text,
				stage: input.stage,
				recipientCount: audience.length,
			};
		}),

	/**
	 * Send one stage by hand. The cycle does this on its own; this is for the
	 * times it should not have to wait -- a gym booked at four, or a resend to
	 * one person who says nothing arrived.
	 *
	 * With `personIds` it goes only to them and touches no stamp at all, so a
	 * resend cannot make the job think a stage is finished.
	 */
	sendStage: adminProcedure
		.input(
			gameIdSchema.extend({
				stage: stageSchema,
				personIds: z.array(z.string().min(1)).min(1).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const found = await requireGame(context.db, input.gameId);
			if (found.status === "canceled") {
				throw new ORPCError("BAD_REQUEST", {
					message: "That night was called off, so there is nothing to ask.",
				});
			}
			const split = await readSplit(context.db, found.id);
			const { rendered, text, audience } = renderStage({
				stage: input.stage,
				game: found,
				split,
				now: new Date(),
			});
			const result = await sendToList(context.db, {
				kind: EMAIL_STAGE[input.stage].kind,
				gameId: found.id,
				rendered,
				text,
				sentBy: context.session.user.id,
				onlyPersonIds: input.personIds ?? audience,
			});
			if (!result) nobody();
			if (!input.personIds && result.sent + result.texted > 0) {
				// A real send by hand still counts as one for the spacing rule.
				await context.db
					.update(game)
					.set({ lastEmailAt: new Date() })
					.where(eq(game.id, found.id));
			}
			return result;
		}),

	/**
	 * Where every upcoming game stands in its cycle, for the admin table.
	 */
	cycle: adminProcedure.handler(async ({ context }) => {
		const { upcoming } = await listGames(context.db, 0);
		const sends = await context.db
			.select({
				gameId: emailSend.gameId,
				kind: emailSend.kind,
				failedCount: emailSend.failedCount,
				recipientCount: emailSend.recipientCount,
				createdAt: emailSend.createdAt,
			})
			.from(emailSend)
			.where(gte(emailSend.createdAt, new Date(Date.now() - 30 * 86400_000)))
			.orderBy(asc(emailSend.createdAt))
			.all();

		return Promise.all(
			upcoming.map(async (g) => {
				const split = await readSplit(context.db, g.id);
				return {
					gameId: g.id,
					dateLabel: g.dateLabel,
					timeLabel: g.timeLabel,
					gym: g.gym.name,
					status: g.status,
					cycle: g.cycle,
					counts: {
						in: split.yes,
						maybe: split.maybe,
						out: split.out,
						silent: split.silent,
					},
					stages: STAGES.map((stage) => {
						const sent = sends.filter(
							(x) => x.gameId === g.id && x.kind === stage.kind,
						);
						const last = sent[sent.length - 1];
						return {
							key: stage.key,
							num: stage.num,
							title: stage.title,
							doneAt: (g[stage.column] as Date | null)?.toISOString() ?? null,
							sentAt: last?.createdAt.toISOString() ?? null,
							recipients: last?.recipientCount ?? 0,
							failed: last?.failedCount ?? 0,
						};
					}),
				};
			}),
		);
	}),

	/**
	 * Call a night off by hand. Never for the count -- whoever is in plays --
	 * but for what a count cannot know: the gym is shut, the roads are ice.
	 * It goes wider than anything in the cycle: someone who missed every
	 * email is the one most likely to drive to a locked gym out of habit, and
	 * a guest has no inbox here at all, so whoever signed one up hears too.
	 */
	cancel: adminProcedure
		.input(gameIdSchema)
		.handler(async ({ context, input }) => {
			const found = await requireGame(context.db, input.gameId);
			if (found.closedAt) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That night was played and closed at the gym.",
				});
			}
			const now = new Date();
			// Conditional, so a double click cannot tell everybody twice.
			const claimed = await context.db
				.update(game)
				.set({ status: "canceled", decidedAt: now, lastEmailAt: now })
				.where(and(eq(game.id, found.id), ne(game.status, "canceled")))
				.run();
			if (claimed.meta.changes !== 1) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That night is already called off.",
				});
			}

			const split = await readSplit(context.db, found.id);
			const facts = {
				dateLabel: found.dateLabel,
				timeLabel: found.timeLabel,
				location: found.location,
				siteUrl: siteUrl(),
			};
			const result = await sendToList(context.db, {
				kind: "canceled",
				gameId: found.id,
				rendered: canceledEmail(facts),
				text: canceledText(facts),
				sentBy: context.session.user.id,
				onlyPersonIds: union(
					split.inIds,
					split.maybeIds,
					split.waitlistIds,
					split.silentIds,
					split.sponsorIds,
				),
			});
			return (
				result ?? {
					attempted: 0,
					sent: 0,
					texted: 0,
					failed: [],
					messageIds: [],
					sendId: null,
				}
			);
		}),

	previewMessage: adminProcedure
		.input(messageSchema)
		.handler(async ({ context, input }) => ({
			...renderMessage(input),
			textMessage: renderMessageText(input),
			recipientCount: await countRecipients(context.db, input.audience),
		})),

	/** Send an ad hoc message to the list, or only to yourself as a test. */
	sendMessage: adminProcedure
		.input(messageSchema.extend({ toSelf: z.boolean().default(false) }))
		.handler(async ({ context, input }) => {
			const rendered = renderMessage(input);
			if (input.toSelf) {
				const me = context.session.user;
				// The test copy has to render its links like the real thing. The
				// admin is a person like everybody else now, so their own tokens
				// are already sitting on their row.
				const { key, unsubscribeUrl } = await tokensFor(context.db, me.id);
				const outcome = await getMailer().sendOne(
					{ email: me.email, name: me.name },
					rendered,
					{
						tags: ["message", "test"],
						params: { name: me.name, unsubscribeUrl, key },
					},
				);
				if (!outcome.ok) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: `The email could not be sent: ${outcome.error}`,
					});
				}
				// And the text, when the admin can get texts: the version they
				// wrote is the one most likely to need a second look.
				let texted = 0;
				if (context.person.phone && !context.person.smsOptedOut) {
					const sms = await getTexter().send(
						context.person.phone,
						fillParams(renderMessageText(input), { key }),
					);
					texted = sms.ok ? 1 : 0;
				}
				return {
					attempted: 1,
					sent: 1,
					texted,
					failed: [],
					messageIds: [outcome.messageId],
					sendId: null,
				};
			}
			const result = await sendToList(context.db, {
				kind: "message",
				rendered,
				text: renderMessageText(input),
				sentBy: context.session.user.id,
				audience: input.audience,
			});
			if (!result) nobody();
			return result;
		}),

	/** The last few list sends, newest first. */
	recent: adminProcedure.handler(async ({ context }) => {
		const rows = await context.db
			.select()
			.from(emailSend)
			.orderBy(desc(emailSend.createdAt))
			.limit(20)
			.all();
		return rows.map((row) => ({
			...row,
			messageIds: JSON.parse(row.messageIds) as string[],
			errors: JSON.parse(row.errors) as { emails: string[]; error: string }[],
		}));
	}),
};
