import { ORPCError } from "@orpc/server";
import { createAuth } from "@pickup-vball/auth";
import { APIError } from "@pickup-vball/auth/errors";
import {
	countWrongCode,
	deletePhoneCheck,
	findPhoneCheck,
	prefsOf,
	putPhoneCheck,
	setPref,
} from "@pickup-vball/db/notify";
import {
	findPerson,
	findPersonByPhone,
	hasPassword,
	removePhone,
	setVerifiedPhone,
	unblockEmail,
} from "@pickup-vball/db/people";
import { NOTIFY_CHANNELS, NOTIFY_TOPICS } from "@pickup-vball/db/schema/notify";
import { OPTED_OUT_CODE, phoneCodeText } from "@pickup-vball/email";
import { getTexter } from "@pickup-vball/email/worker";
import { env } from "@pickup-vball/env/server";
import { z } from "zod";

import type { Context } from "../context";
import { isUniqueViolation } from "../db-errors";
import { protectedProcedure } from "../index";
import { choiceFor, TOPICS } from "../notify";
import {
	CODE_TTL_MS,
	formatUsPhone,
	hashCode,
	MAX_ATTEMPTS,
	newCode,
	nextSend,
	normalizeUsPhone,
	sameHash,
} from "../phone";

async function requireMe(db: Context["db"], userId: string) {
	const me = await findPerson(db, userId);
	if (!me) throw new ORPCError("UNAUTHORIZED");
	return me;
}

/**
 * Everything the notifications page shows: each topic as it stands for
 * this person, and what can reach them.
 */
async function notifyState(db: Context["db"], userId: string) {
	const me = await requireMe(db, userId);
	const [chosen, check] = await Promise.all([
		prefsOf(db, userId),
		findPhoneCheck(db, userId),
	]);
	const pending =
		check && check.expiresAt.getTime() > Date.now() ? check.phone : null;
	return {
		topics: TOPICS.map((t) => ({
			topic: t.topic,
			channel: choiceFor(t.topic, chosen.get(t.topic)),
		})),
		phone: me.phone ? formatUsPhone(me.phone) : null,
		smsOptedOut: me.smsOptedOutAt !== null,
		pendingPhone: pending ? formatUsPhone(pending) : null,
		email: me.email,
		emailBlocked: me.emailBlockedAt !== null,
		emailBlockedReason: me.emailBlockedReason,
		/** Ours, for "text START to ...". Empty until a number is set up. */
		textFrom: env.TELNYX_FROM_NUMBER
			? formatUsPhone(env.TELNYX_FROM_NUMBER)
			: null,
		textsDryRun: getTexter().dryRun,
	};
}

/**
 * A player's own account. Passwords are optional here: the emailed links are
 * the way most people get in, and they keep working either way.
 */
export const accountRouter = {
	/** Whether the caller has a password at all. */
	hasPassword: protectedProcedure.handler(async ({ context }) => ({
		hasPassword: await hasPassword(context.db, context.session.user.id),
	})),

	/** Set a first password. Changing an existing one goes through the client. */
	setPassword: protectedProcedure
		.input(z.object({ newPassword: z.string().min(8) }))
		.handler(async ({ context, input }) => {
			try {
				await createAuth().api.setPassword({
					body: { newPassword: input.newPassword },
					headers: context.headers,
				});
			} catch (error) {
				// PASSWORD_TOO_SHORT, PASSWORD_ALREADY_SET and friends.
				if (error instanceof APIError) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							error.message ||
							"That password could not be set. Please try again.",
					});
				}
				throw error;
			}
			return { hasPassword: true };
		}),

	/** The notifications page: choices, phone, and what can reach them. */
	notify: protectedProcedure.handler(async ({ context }) =>
		notifyState(context.db, context.person.id),
	),

	/** One topic's channel. Off is refused where the topic requires one. */
	setNotify: protectedProcedure
		.input(
			z.object({
				topic: z.enum(NOTIFY_TOPICS),
				channel: z.enum(NOTIFY_CHANNELS),
			}),
		)
		.handler(async ({ context, input }) => {
			if (
				input.channel === "off" &&
				TOPICS.find((t) => t.topic === input.topic)?.required
			) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This one is about a night you said yes to, so it can't be off.",
				});
			}
			await setPref(context.db, context.person.id, input.topic, input.channel);
			return notifyState(context.db, context.person.id);
		}),

	/**
	 * Text a code to a number, to prove it is theirs. The code goes straight
	 * out rather than through the outbox, which would keep it in a table.
	 * Ticking the consent box is required: it is the opt-in a carrier will
	 * ask us to show.
	 */
	startPhone: protectedProcedure
		.input(z.object({ phone: z.string().max(40), consent: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const phone = normalizeUsPhone(input.phone);
			if (!phone) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Enter a 10-digit US mobile number.",
				});
			}
			const me = await requireMe(context.db, context.person.id);
			if (me.phone === phone) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That's already your number.",
				});
			}
			const holder = await findPersonByPhone(context.db, phone);
			if (holder && holder.id !== me.id) {
				throw new ORPCError("CONFLICT", {
					message:
						"That number is on another account. Ask an admin if it should be yours.",
				});
			}

			const now = new Date();
			const previous = await findPhoneCheck(context.db, me.id);
			const allowed = nextSend(previous, now);
			if (!allowed.ok) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message:
						allowed.reason === "too-soon"
							? "Wait a minute before asking for another code."
							: "That's all the codes for today. Try again tomorrow.",
				});
			}
			const code = newCode();
			await putPhoneCheck(context.db, {
				userId: me.id,
				phone,
				codeHash: await hashCode(env.BETTER_AUTH_SECRET, {
					userId: me.id,
					phone,
					code,
				}),
				expiresAt: new Date(now.getTime() + CODE_TTL_MS),
				...allowed.window,
			});

			const texter = getTexter();
			const sent = await texter.send(phone, phoneCodeText(code));
			if (!sent.ok) {
				console.error("phone code failed", sent.status, sent.code);
				throw new ORPCError("BAD_REQUEST", {
					message:
						sent.code === OPTED_OUT_CODE
							? "That number has texted STOP to us. Text START to our number first, then try again."
							: "We couldn't text that number. Check it and try again.",
				});
			}
			return { phone: formatUsPhone(phone), dryRun: texter.dryRun };
		}),

	/** Type the code back. Right, and the number is theirs. */
	confirmPhone: protectedProcedure
		.input(
			z.object({
				code: z
					.string()
					.trim()
					.regex(/^\d{6}$/, "Enter the 6-digit code."),
			}),
		)
		.handler(async ({ context, input }) => {
			const userId = context.person.id;
			const check = await findPhoneCheck(context.db, userId);
			if (!check || check.expiresAt.getTime() <= Date.now()) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That code has expired. Ask for a new one.",
				});
			}
			if (check.attempts >= MAX_ATTEMPTS) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Too many tries. Ask for a new code.",
				});
			}
			const hash = await hashCode(env.BETTER_AUTH_SECRET, {
				userId,
				phone: check.phone,
				code: input.code,
			});
			if (!sameHash(hash, check.codeHash)) {
				await countWrongCode(context.db, userId);
				throw new ORPCError("BAD_REQUEST", {
					message: "That code isn't right.",
				});
			}
			try {
				await setVerifiedPhone(context.db, userId, check.phone);
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new ORPCError("CONFLICT", {
						message:
							"That number is on another account. Ask an admin if it should be yours.",
					});
				}
				throw error;
			}
			await deletePhoneCheck(context.db, userId);
			return notifyState(context.db, userId);
		}),

	/** No more texts. Anything set to text goes by email instead. */
	removePhone: protectedProcedure.handler(async ({ context }) => {
		await removePhone(context.db, context.person.id);
		await deletePhoneCheck(context.db, context.person.id);
		return notifyState(context.db, context.person.id);
	}),

	/** They say their address works again; email resumes. */
	retryEmail: protectedProcedure.handler(async ({ context }) => {
		await unblockEmail(context.db, context.person.id);
		return notifyState(context.db, context.person.id);
	}),
};
