import { describe, expect, it } from "vitest";
import type { Person, SheetRow } from "./audience";
import { guestSuggestions, splitAudience, union } from "./audience";

const row = (over: Partial<SheetRow> & { name: string }): SheetRow => ({
	nameKey: over.name.trim().toLowerCase(),
	userId: null,
	addedBy: null,
	response: "in",
	...over,
});

const active: Person[] = [
	{ id: "u-ana", name: "Ana" },
	{ id: "u-beth", name: "Beth" },
	{ id: "u-chris", name: "Chris" },
	{ id: "u-omar", name: "Omar" },
];

describe("splitAudience", () => {
	it("counts guests toward the totals but never mails them", () => {
		const split = splitAudience(
			[
				row({ name: "Ana", userId: "u-ana" }),
				row({ name: "Marcus", addedBy: "u-ana" }),
				row({ name: "Beth", userId: "u-beth", response: "maybe" }),
			],
			active,
		);
		expect(split.yes).toBe(2);
		expect(split.inNames).toEqual(["Ana", "Marcus"]);
		// Marcus has no inbox, so he is not in the id set the mailer filters on.
		expect(split.inIds).toEqual(["u-ana"]);
		expect(split.maybeIds).toEqual(["u-beth"]);
		// Whoever put Marcus down can pass word along if the night is called off.
		expect(split.sponsorIds).toEqual(["u-ana"]);
	});

	it("keeps the waitlist apart from the ins and the outs", () => {
		const split = splitAudience(
			[
				row({ name: "Ana", userId: "u-ana" }),
				row({ name: "Beth", userId: "u-beth", response: "waitlist" }),
				row({ name: "Pat", addedBy: "u-chris", response: "waitlist" }),
				row({ name: "Omar", userId: "u-omar", response: "out" }),
			],
			active,
		);
		expect(split.yes).toBe(1);
		expect(split.out).toBe(1);
		expect(split.waitlist).toBe(2);
		expect(split.waitlistIds).toEqual(["u-beth"]);
		// Somebody waiting has answered; the reminder is not for them.
		expect(split.silentIds).toEqual(["u-chris"]);
		// A waiting guest's sponsor hears if the night is called off.
		expect(split.sponsorIds).toEqual(["u-chris"]);
	});

	it("does not accuse somebody of silence when a guest row has their name", () => {
		const split = splitAudience(
			[row({ name: "Ana", userId: "u-ana" }), row({ name: "beth " })],
			active,
		);
		// Beth's row is a guest row -- no user_id -- but her name is on the
		// sheet, so the morning reminder leaves her alone.
		expect(split.silentNames).toEqual(["Chris", "Omar"]);
		expect(split.silentIds).toEqual(["u-chris", "u-omar"]);
	});

	it("counts an out as answered, not silent", () => {
		const split = splitAudience(
			[row({ name: "Chris", userId: "u-chris", response: "out" })],
			active,
		);
		expect(split.out).toBe(1);
		expect(split.yes).toBe(0);
		expect(split.silent).toBe(3);
		expect(split.silentIds).not.toContain("u-chris");
	});

	it("has nobody silent when the sheet is empty of nobody", () => {
		const split = splitAudience([], []);
		expect(split).toMatchObject({ yes: 0, maybe: 0, out: 0, silent: 0 });
	});
});

describe("union", () => {
	it("merges without repeating anyone", () => {
		expect(union(["a", "b"], ["b", "c"], [])).toEqual(["a", "b", "c"]);
	});
});

describe("guestSuggestions", () => {
	const past = (...names: string[]) =>
		names.map((name) => ({ name, nameKey: name.trim().toLowerCase() }));

	it("keeps the order they were last brought in", () => {
		expect(guestSuggestions(past("Marcus", "Tone", "Big Rob"), [], 6)).toEqual([
			"Marcus",
			"Tone",
			"Big Rob",
		]);
	});

	it("collapses the same guest typed three different ways", () => {
		// Whatever spelling was used most recently is the one offered back.
		expect(
			guestSuggestions(past("Marcus", "marcus", " MARCUS "), [], 6),
		).toEqual(["Marcus"]);
	});

	it("does not offer somebody already on this night's sheet", () => {
		expect(guestSuggestions(past("Marcus", "Tone"), ["marcus"], 6)).toEqual([
			"Tone",
		]);
	});

	it("stops at the limit", () => {
		expect(guestSuggestions(past("A", "B", "C"), [], 2)).toEqual(["A", "B"]);
	});
});
