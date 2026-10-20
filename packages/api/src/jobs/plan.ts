/**
 * What the cycle should do about one game, right now. Pure: no database, no
 * mailer, no clock of its own -- which is the only reason the whole schedule
 * can be tested without standing up D1 and waiting for a real night.
 */

import { STAGE_COOLDOWN_MINUTES, STAGES, type StageKey } from "../cycle";
import { addDays, runInstant } from "../run";

export type Stamps = Record<StageKey, Date | null>;

export type Plan = {
	/** Stages whose moment has passed unused. Resolve them, send nothing. */
	skip: StageKey[];
	/** The one stage to act on, if any. */
	run: StageKey | null;
	/** For the log. */
	reason: string;
};

/** When a stage falls for a given game date. */
export function stageInstant(
	key: StageKey,
	date: string,
	stages = STAGES,
): Date | null {
	const stage = stages.find((s) => s.key === key);
	if (!stage) return null;
	return runInstant(addDays(date, stage.dayOffset), stage.at);
}

export type PlanInput = {
	date: string;
	startTime: string;
	stamps: Stamps;
	/** When a cycle email for this game last actually went out. */
	lastEmailAt: Date | null;
	now: Date;
};

/**
 * The rules, in order of who wins:
 *
 * R0  Past the start, nothing is emailed -- a reminder to answer at 7:35
 *     reaches people already in the parking lot -- but the close is still
 *     recorded, so a dropped cron pass cannot leave a sheet open forever.
 *
 * R1  The opening call is never skipped, whatever time it is noticed. Stage
 *     one is not "the 5 PM email", it is "have these people been told this
 *     game exists". Running the prod first would email somebody "you have not
 *     answered" about a run nobody ever mentioned.
 *
 * R2  At most one stage per pass, and it is the LATEST one due. An overdue
 *     stage is abandoned, not delivered late: a 9 AM "you have not answered"
 *     landing at noon, next to the last call, is two emails saying the same
 *     thing badly -- and once answers have closed, a stage asking for one
 *     has nothing left to ask.
 *
 * R3  Ninety minutes between actual sends. The close sends nothing, so it
 *     neither waits for the cooldown nor consumes it.
 */
export function planStage(input: PlanInput): Plan {
	const { date, startTime, stamps, lastEmailAt, now } = input;
	const unresolved = (key: StageKey) => stamps[key] === null;

	// R0
	if (now.getTime() >= runInstant(date, startTime).getTime()) {
		const stale = STAGES.filter(
			(s) => s.key !== "close" && unresolved(s.key),
		).map((s) => s.key);
		return unresolved("close")
			? {
					skip: stale,
					run: "close",
					reason: "Past the start: closing answers, emailing nobody.",
				}
			: { skip: stale, run: null, reason: "Past the start." };
	}

	const due = STAGES.filter(
		(s) =>
			unresolved(s.key) &&
			(stageInstant(s.key, date)?.getTime() ?? Number.POSITIVE_INFINITY) <=
				now.getTime(),
	);
	if (due.length === 0) {
		return { skip: [], run: null, reason: "Nothing due." };
	}

	// R1
	const call = due.find((s) => s.key === "call");
	if (call) {
		return {
			skip: [],
			run: "call",
			reason: "The list has not been told this game exists.",
		};
	}

	// R2
	const chosen = due[due.length - 1];
	if (!chosen) {
		return { skip: [], run: null, reason: "Nothing due." };
	}
	const skip = due.slice(0, -1).map((s) => s.key);

	// R3
	if (chosen.key !== "close" && lastEmailAt) {
		const since = now.getTime() - lastEmailAt.getTime();
		if (since < STAGE_COOLDOWN_MINUTES * 60_000) {
			return {
				skip: [],
				run: null,
				reason: `Last email was ${Math.round(since / 60_000)} minutes ago; holding.`,
			};
		}
	}

	return {
		skip,
		run: chosen.key,
		reason:
			skip.length > 0
				? `Running ${chosen.key}; ${skip.join(", ")} went by unused.`
				: `Running ${chosen.key}.`,
	};
}
