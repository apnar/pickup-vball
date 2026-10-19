/**
 * The RSVP cycle: what a night asks the group, when, and what it does with the
 * answers. This is the only place those facts exist. The job runs off it, the
 * admin write-up page renders it, and the numbers below are interpolated into
 * both -- so the page cannot describe a schedule the code is not keeping.
 *
 * Pure by design: nothing here may import drizzle, the Worker env, or anything
 * that reaches them, because the web app pulls this into the client bundle.
 */

import type { EmailKind } from "@pickup-vball/db/schema/email";

import { DEFAULT_CAPACITY } from "./run";

/**
 * Twelve in confirms a night: two full sides of six. The twelfth yes sends
 * "it's on" early and stops the reminders.
 */
export const CONFIRM_AT = 12;

/** Fewer than eight at the verdict and the night is called off. */
export const PLAY_AT = 8;

/**
 * No two cycle emails about the same night land closer than this. A night
 * booked late in the afternoon would otherwise fire several stages in one
 * pass, one of which tells the reader they have not answered a message they
 * never got.
 */
export const STAGE_COOLDOWN_MINUTES = 90;

export type StageKey = "call" | "nudge" | "confirmed" | "lastCall" | "final";

/** The `game` column that records a stage as resolved. */
export type StageColumn =
	| "callAt"
	| "nudgeAt"
	| "confirmedAt"
	| "lastCallAt"
	| "decidedAt";

export type Stage = {
	key: StageKey;
	/** "01".."05", for the write-up. */
	num: string;
	column: StageColumn;
	kind: EmailKind;
	/** Days from the game's date. -1 is the evening before. */
	dayOffset: number;
	/** HH:MM on the gym's clock, or null when a count fires it, not the clock. */
	at: string | null;
	/* The write-up, rendered by /admin/cycle. Nobody types these twice. */
	when: string;
	who: string;
	title: string;
	says: string;
	aside: string;
};

/*
 * The verdict is at 1 PM because the house rules say so: confirm by 1 PM on
 * the day, and teams are made from whoever is in. The reminder and the last
 * call sit far enough ahead of it to keep the ninety-minute spacing. A night
 * that starts earlier still gets every stage that falls before its start;
 * past the start, the verdict is recorded and nobody is emailed (see R0 in
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
		says: `Sent only if fewer than ${CONFIRM_AT} are in. Lists everyone who has already said yes. Anyone who has answered is left alone.`,
		aside:
			"One reminder, to the people who have not replied, and only when it is needed.",
	},
	{
		key: "confirmed",
		num: "03",
		column: "confirmedAt",
		kind: "rsvp_confirmed",
		dayOffset: 0,
		at: null,
		when: `the moment the ${CONFIRM_AT}th yes comes in`,
		who: "Everyone who said in or maybe",
		title: "It's on",
		says: `The ${CONFIRM_AT}th yes confirms the night, whatever time it arrives. Sent once and never taken back by the job.`,
		aside: `${CONFIRM_AT} is two full sides of six.`,
	},
	{
		key: "lastCall",
		num: "04",
		column: "lastCallAt",
		kind: "rsvp_last_call",
		dayOffset: 0,
		at: "11:30",
		when: "11:30 AM on the day",
		who: "The maybes, and anyone who still has not answered",
		title: "Last call",
		says: `Sent only if the night is still short of ${CONFIRM_AT}. The last chance for a maybe to become a yes.`,
		aside:
			"An hour and a half before the verdict, so there is still time to change plans.",
	},
	{
		key: "final",
		num: "05",
		column: "decidedAt",
		kind: "rsvp_final",
		dayOffset: 0,
		at: "13:00",
		when: "1:00 PM on the day",
		who: "Everyone who answered. If it is off, everyone else too.",
		title: "The verdict",
		says: `${PLAY_AT} or more in and the night is on. Fewer and it is off. If it was already on and still is, nothing is sent: the answer has not changed.`,
		aside:
			"The house rules' 1 PM deadline: teams are made from whoever is in, and everyone has the afternoon to make other plans.",
	},
];

/** The stages a clock fires. Stage 03 is fired by a count, so it is not here. */
export const CLOCK_STAGES: readonly Stage[] = STAGES.filter(
	(s) => s.at !== null,
);

export const STAGE = Object.fromEntries(
	STAGES.map((s) => [s.key, s]),
) as Record<StageKey, Stage>;

/** The numbers, for the write-up. Same constants the job counts with. */
export const CYCLE_NUMBERS = [
	{
		value: CONFIRM_AT,
		label: "Confirm",
		body: "Two full sides of six. The night is confirmed early and the reminders stop.",
	},
	{
		value: PLAY_AT,
		label: "Minimum",
		body: "Below this at the verdict, the night is called off.",
	},
	{
		value: DEFAULT_CAPACITY,
		label: "Spots",
		body: "The usual number. Each night sets its own when it is booked, and once it is full a player's yes is refused.",
	},
] as const;
