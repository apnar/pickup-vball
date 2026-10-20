import { describe, expect, it } from "vitest";

import { keywordOf, parseReply, pickNight } from "./sms-parse";

describe("parseReply", () => {
	it("reads the answer whatever the case or punctuation", () => {
		expect(parseReply("IN")).toBe("in");
		expect(parseReply(" in! ")).toBe("in");
		expect(parseReply("Yes")).toBe("in");
		expect(parseReply("I'm in")).toBe("in");
		expect(parseReply("I’m in 🏐")).toBe("in");
		expect(parseReply("out.")).toBe("out");
		expect(parseReply("No")).toBe("out");
		expect(parseReply("Maybe?")).toBe("maybe");
	});

	it("does not guess at a sentence", () => {
		expect(parseReply("No problem, I'm in")).toBeNull();
		expect(parseReply("in a meeting, will check later")).toBeNull();
		expect(parseReply("")).toBeNull();
		expect(parseReply("STOP")).toBeNull();
	});
});

describe("keywordOf", () => {
	it("knows the carrier words", () => {
		expect(keywordOf("stop")).toBe("stop");
		expect(keywordOf("Unsubscribe")).toBe("stop");
		expect(keywordOf("START")).toBe("start");
		expect(keywordOf("in")).toBeNull();
	});
});

describe("pickNight", () => {
	const now = new Date("2026-10-24T16:00:00Z");
	const later = new Date("2026-10-24T23:30:00Z");
	const night = (
		id: string,
		over: Partial<Parameters<typeof pickNight>[0][number]> = {},
	) => ({
		id,
		startsAt: later,
		status: "scheduled",
		decidedAt: null,
		...over,
	});

	it("takes the newest open night", () => {
		expect(pickNight([night("a"), night("b")], now)).toEqual({
			kind: "open",
			id: "a",
		});
	});

	it("passes over a decided night to an open one", () => {
		expect(
			pickNight([night("a", { decidedAt: now }), night("b")], now),
		).toEqual({ kind: "open", id: "b" });
	});

	it("says closed when the only live night is decided", () => {
		expect(pickNight([night("a", { decidedAt: now })], now)).toEqual({
			kind: "closed",
			id: "a",
		});
	});

	it("ignores nights that started or were called off", () => {
		expect(
			pickNight(
				[
					night("a", { startsAt: new Date("2026-10-24T15:00:00Z") }),
					night("b", { status: "canceled" }),
				],
				now,
			),
		).toEqual({ kind: "none" });
	});
});
