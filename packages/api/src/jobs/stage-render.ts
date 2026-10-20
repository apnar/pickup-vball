/**
 * One stage of the cycle, rendered. Shared so the admin preview shows exactly
 * the email (and text) the job would send, down to who would get it -- a
 * preview that renders through a second code path is a preview of nothing.
 */

import type { Rendered } from "@pickup-vball/email";
import {
	rsvpCallEmail,
	rsvpCallText,
	rsvpConfirmedEmail,
	rsvpConfirmedText,
	rsvpFinalEmail,
	rsvpFinalText,
	rsvpLastCallEmail,
	rsvpLastCallText,
	rsvpNudgeEmail,
	rsvpNudgeText,
} from "@pickup-vball/email";

import { type Split, union } from "../audience";
import { CONFIRM_AT, PLAY_AT, type StageKey } from "../cycle";
import type { GameSummary } from "../games";
import { rsvpFacts } from "../mail";
import { todayInRunTimezone } from "../run";

export type StageRender = {
	rendered: Rendered;
	/** The same stage as a text, for whoever chose texts for it. */
	text: string;
	/** Who it goes to. The call goes to everybody asked about the night. */
	audience: string[];
};

export function renderStage(input: {
	stage: StageKey;
	game: GameSummary;
	split: Split;
	permitUrl: string | null;
	now: Date;
	/** Preview or override a verdict rather than deriving it from the count. */
	force?: "on" | "off";
}): StageRender {
	const { stage, game, split, now } = input;
	const facts = rsvpFacts(game, split);
	const needed = Math.max(0, CONFIRM_AT - split.yes);

	switch (stage) {
		case "call": {
			const call = {
				...facts,
				today: game.date === todayInRunTimezone(now),
				alreadyOn: split.yes >= CONFIRM_AT,
			};
			return {
				rendered: rsvpCallEmail(call),
				text: rsvpCallText(call),
				audience: split.askedIds,
			};
		}
		case "nudge":
			return {
				rendered: rsvpNudgeEmail({ ...facts, needed }),
				text: rsvpNudgeText({ ...facts, needed }),
				audience: split.silentIds,
			};
		case "confirmed":
			return {
				rendered: rsvpConfirmedEmail({
					...facts,
					permitUrl: input.permitUrl,
				}),
				text: rsvpConfirmedText(facts),
				audience: union(split.inIds, split.maybeIds),
			};
		case "lastCall": {
			const lastCall = {
				...facts,
				needed,
				wasConfirmed: game.status === "confirmed",
			};
			return {
				rendered: rsvpLastCallEmail(lastCall),
				text: rsvpLastCallText(lastCall),
				audience: union(split.silentIds, split.maybeIds),
			};
		}
		default: {
			const on = input.force ? input.force === "on" : split.yes >= PLAY_AT;
			const final = {
				...facts,
				decision: on ? ("on" as const) : ("off" as const),
				permitUrl: input.permitUrl,
			};
			return {
				rendered: rsvpFinalEmail(final),
				text: rsvpFinalText(final),
				// A cancellation goes wider than anything else in the cycle:
				// someone who missed every email is the one most likely to drive
				// to a locked gym out of habit, and a guest has no inbox at all.
				audience: on
					? union(split.inIds, split.maybeIds)
					: union(
							split.inIds,
							split.maybeIds,
							split.waitlistIds,
							split.silentIds,
							split.sponsorIds,
						),
			};
		}
	}
}
