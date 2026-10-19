import { describe, expect, it } from "vitest";

import { canSee } from "./access";

describe("canSee", () => {
	const sunday = { groupId: "grp-sunday" };

	it("shows a player the nights in their groups and no others", () => {
		expect(canSee(sunday, ["grp-sunday", "grp-revco"])).toBe(true);
		expect(canSee(sunday, ["grp-revco"])).toBe(false);
	});

	it("shows somebody in no group nothing that has a group", () => {
		expect(canSee(sunday, [])).toBe(false);
	});

	it("shows an admin everything", () => {
		expect(canSee(sunday, null)).toBe(true);
	});

	it("keeps a night from before groups open to everybody", () => {
		expect(canSee({ groupId: null }, [])).toBe(true);
	});
});
