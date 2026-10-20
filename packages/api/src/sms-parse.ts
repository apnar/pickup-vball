/*
 * Answering a night by text: what a reply means, and which night it is
 * about. Pure, so it is tested without a database; the handler that acts on
 * it is sms-reply.ts.
 */

const ANSWERS: Record<string, "in" | "out" | "maybe"> = {
	IN: "in",
	YES: "in",
	Y: "in",
	"IM IN": "in",
	OUT: "out",
	NO: "out",
	N: "out",
	"IM OUT": "out",
	MAYBE: "maybe",
	M: "maybe",
};

/** What carriers and Telnyx treat as opting out, and back in. */
const STOP_WORDS = new Set([
	"STOP",
	"STOPALL",
	"UNSUBSCRIBE",
	"CANCEL",
	"END",
	"QUIT",
]);
const START_WORDS = new Set(["START", "UNSTOP"]);

/** A reply squeezed to its words: case, punctuation and emoji gone. */
function squeeze(text: string): string {
	return text
		.toUpperCase()
		.replace(/[’']/g, "")
		.replace(/[^A-Z0-9 ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * The answer a text gives, or null when it is not one. The whole message
 * has to be the answer: "No problem, I'm in" is not a NO, and guessing at
 * a sentence is how somebody gets marked out of a night they meant to play.
 */
export function parseReply(text: string): "in" | "out" | "maybe" | null {
	return ANSWERS[squeeze(text)] ?? null;
}

export function keywordOf(text: string): "stop" | "start" | null {
	const word = squeeze(text);
	if (STOP_WORDS.has(word)) return "stop";
	if (START_WORDS.has(word)) return "start";
	return null;
}

export type NightState = {
	id: string;
	startsAt: Date;
	status: string;
	decidedAt: Date | null;
};

/**
 * Which night a bare IN or OUT is about: the newest one we texted them
 * about that is still open. One whose answers have closed says so rather
 * than quietly answering an older night; one that started or was called
 * off is not a candidate at all.
 */
export function pickNight(
	nights: NightState[],
	now: Date,
):
	| { kind: "open"; id: string }
	| { kind: "closed"; id: string }
	| { kind: "none" } {
	const live = nights.filter(
		(n) => n.status !== "canceled" && n.startsAt.getTime() > now.getTime(),
	);
	const open = live.find((n) => n.decidedAt === null);
	if (open) return { kind: "open", id: open.id };
	const closed = live[0];
	return closed ? { kind: "closed", id: closed.id } : { kind: "none" };
}
