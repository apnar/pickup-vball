import { describe, expect, it } from "vitest";
import type { Answer, Invite } from "./responses";
import { NO_RESPONSES, tallyResponses } from "./responses";

const invite = (gameId: string, userId: string, onBreak = false): Invite => ({
	gameId,
	userId,
	onBreak,
});

const answer = (
	gameId: string,
	userId: string,
	response: Answer["response"] = "in",
): Answer => ({ gameId, userId, response });

describe("tallyResponses", () => {
	it("counts in, any answer, and breaks against the asks that person got", () => {
		const rates = tallyResponses(
			[
				invite("g1", "u-ana"),
				invite("g2", "u-ana"),
				invite("g3", "u-ana", true),
				invite("g1", "u-beth"),
			],
			[
				answer("g1", "u-ana"),
				answer("g2", "u-ana", "out"),
				answer("g1", "u-beth", "maybe"),
			],
		);
		expect(rates.get("u-ana")).toEqual({
			of: 3,
			yes: 1,
			replied: 2,
			onBreak: 1,
		});
		// Out and maybe are answers. Somebody who says maybe every week is
		// responsive, whatever else he is.
		expect(rates.get("u-beth")).toEqual({
			of: 1,
			yes: 0,
			replied: 1,
			onBreak: 0,
		});
	});

	it("gives a newcomer the denominator he was actually asked about", () => {
		const invites = [
			invite("g1", "u-old"),
			invite("g2", "u-old"),
			invite("g2", "u-new"),
		];
		const rates = tallyResponses(invites, []);
		expect(rates.get("u-old")?.of).toBe(2);
		expect(rates.get("u-new")?.of).toBe(1);
	});

	it("ignores an answer to a night this person was never invited to", () => {
		// Somebody deactivated after the fact, or a row left by a night whose
		// call never went out. Neither is a record anybody should carry.
		const rates = tallyResponses(
			[invite("g1", "u-ana")],
			[answer("g1", "u-ana"), answer("g9", "u-ana")],
		);
		expect(rates.get("u-ana")).toEqual({
			of: 1,
			yes: 1,
			replied: 1,
			onBreak: 0,
		});
	});

	it("has nothing to say about somebody nobody has asked", () => {
		expect(tallyResponses([], [answer("g1", "u-ana")]).size).toBe(0);
		expect(NO_RESPONSES).toEqual({ of: 0, yes: 0, replied: 0, onBreak: 0 });
	});

	it("does not let one person's break count against another", () => {
		const rates = tallyResponses(
			[invite("g1", "u-ana", true), invite("g1", "u-beth")],
			[answer("g1", "u-beth")],
		);
		expect(rates.get("u-ana")).toEqual({
			of: 1,
			yes: 0,
			replied: 0,
			onBreak: 1,
		});
		expect(rates.get("u-beth")?.onBreak).toBe(0);
	});
});
