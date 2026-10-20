/**
 * The RSVP cycle: what a night asks the group, when, and when the asking
 * stops. This is the only place those facts exist. The job runs off it, the
 * admin write-up page renders it, and the times below are interpolated into
 * both -- so the page cannot describe a schedule the code is not keeping.
 *
 * There is no headcount anywhere in it. A night is never called off for
 * being short: whoever is in plays. Only an admin cancels a night, by hand,
 * for a reason a count cannot know (the gym is shut, the roads are ice).
 *
 * Pure by design: nothing here may import drizzle, the Worker env, or anything
 * that reaches them, because the web app pulls this into the client bundle.
 */

import type { EmailKind } from "@pickup-vball/db/schema/email";

/**
 * No two cycle emails about the same night land closer than this. A night
 * booked late in the afternoon would otherwise fire several stages in one
 * pass, one of which tells the reader they have not answered a message they
 * never got.
 */
export const STAGE_COOLDOWN_MINUTES = 90;

/**
 * The game-day reminder goes this long before a night, to the people who
 * are in. Not a stage: it asks nothing, and the answers are closed by the
 * time it goes.
 */
export const REMINDER_LEAD_HOURS = 3;

/**
 * At most one "a spot opened" per night in this long, so somebody flipping
 * in and out does not message everybody each time.
 */
export const SPOT_OPEN_COOLDOWN_MINUTES = 60;

export type StageKey = "call" | "nudge" | "lastCall" | "close";

/** The stages that send something. The close only stamps. */
export type EmailStageKey = Exclude<StageKey, "close">;

/** The `game` column that records a stage as resolved. */
export type StageColumn = "callAt" | "nudgeAt" | "lastCallAt" | "decidedAt";

export type Stage = {
	key: StageKey;
	/** "01".."04", for the write-up. */
	num: string;
	column: StageColumn;
	/** What a send of it is logged as. Null for the close, which sends nothing. */
	kind: EmailKind | null;
	/** Days from the game's date. -1 is the evening before. */
	dayOffset: number;
	/** HH:MM on the gym's clock. */
	at: string;
	/* The write-up, rendered by /admin/cycle. Nobody types these twice. */
	when: string;
	who: string;
	title: string;
	says: string;
	aside: string;
};

/*
 * Answers close at 1 PM because the house rules say so: confirm by 1 PM on
 * the day, and teams are made from whoever is in. The reminder and the last
 * call sit far enough ahead of it to keep the ninety-minute spacing. A night
 * that starts earlier still gets every stage that falls before its start;
 * past the start, the close is recorded and nothing else goes out (see R0 in
 * jobs/plan.ts).
 */
export const STAGES: readonly Stage[] = [
	{
		key: "call",
		num: "01",
		column: "callAt",
		kind: "rsvp_call",
		dayOffset: -1,
		at: "17:00",
		when: "5:00 PM, the day before",
		who: "Everyone active in the group",
		title: "The call",
		says: "There is a night tomorrow, here is the gym, and here are three buttons: in, maybe, out.",
		aside: "Maybe keeps someone on the reminders without holding a spot.",
	},
	{
		key: "nudge",
		num: "02",
		column: "nudgeAt",
		kind: "rsvp_nudge",
		dayOffset: 0,
		at: "09:00",
		when: "9:00 AM on the day",
		who: "Only the people who have not answered",
		title: "Reminder",
		says: "Lists everyone who has already said yes. Anyone who has answered is left alone. Not sent once every spot is taken.",
		aside: "One reminder, to the people who have not replied.",
	},
	{
		key: "lastCall",
		num: "03",
		column: "lastCallAt",
		kind: "rsvp_last_call",
		dayOffset: 0,
		at: "11:30",
		when: "11:30 AM on the day",
		who: "The maybes, and anyone who still has not answered",
		title: "Last call",
		says: "The last chance for a maybe to become a yes before answers close. Not sent once every spot is taken.",
		aside:
			"An hour and a half before answers close, so there is still time to change plans.",
	},
	{
		key: "close",
		num: "04",
		column: "decidedAt",
		kind: null,
		dayOffset: 0,
		at: "13:00",
		when: "1:00 PM on the day",
		who: "Nobody. Nothing is sent.",
		title: "Answers close",
		says: "The sheet freezes and teams are made from whoever is in. However many that is, the night goes ahead.",
		aside: "The house rules' 1 PM deadline.",
	},
];

export type EmailStage = Stage & { key: EmailStageKey; kind: EmailKind };

/** The stages that send something, for the preview and resend buttons. */
export const EMAIL_STAGES = STAGES.filter(
	(s): s is EmailStage => s.kind !== null,
);

export const EMAIL_STAGE = Object.fromEntries(
	EMAIL_STAGES.map((s) => [s.key, s]),
) as Record<EmailStageKey, EmailStage>;

export const STAGE = Object.fromEntries(
	STAGES.map((s) => [s.key, s]),
) as Record<StageKey, Stage>;
