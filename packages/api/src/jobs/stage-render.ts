/**
 * One stage of the cycle, rendered. Shared so the admin preview shows exactly
 * the email (and text) the job would send, down to who would get it -- a
 * preview that renders through a second code path is a preview of nothing.
 */

import type { Rendered } from "@pickup-vball/email";
import {
	rsvpCallEmail,
	rsvpCallText,
	rsvpLastCallEmail,
	rsvpLastCallText,
	rsvpNudgeEmail,
	rsvpNudgeText,
} from "@pickup-vball/email";

import { type Split, union } from "../audience";
import type { EmailStageKey } from "../cycle";
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
	stage: EmailStageKey;
	game: GameSummary;
	split: Split;
	now: Date;
}): StageRender {
	const { stage, game, split, now } = input;
	const facts = rsvpFacts(game, split);

	switch (stage) {
		case "call": {
			const call = { ...facts, today: game.date === todayInRunTimezone(now) };
			return {
				rendered: rsvpCallEmail(call),
				text: rsvpCallText(call),
				audience: split.askedIds,
			};
		}
		case "nudge":
			return {
				rendered: rsvpNudgeEmail(facts),
				text: rsvpNudgeText(facts),
				audience: split.silentIds,
			};
		case "lastCall":
			return {
				rendered: rsvpLastCallEmail(facts),
				text: rsvpLastCallText(facts),
				audience: union(split.silentIds, split.maybeIds),
			};
	}
}
