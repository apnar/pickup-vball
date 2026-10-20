import { describe, expect, it } from "vitest";

import {
	formatUsPhone,
	hashCode,
	MAX_SENDS_PER_DAY,
	newCode,
	nextSend,
	normalizeUsPhone,
	sameHash,
} from "./phone";

describe("normalizeUsPhone", () => {
	it("takes a number however it is typed", () => {
		for (const raw of [
			"3015550100",
			"(301) 555-0100",
			"301.555.0100",
			"1 301 555 0100",
			"+1 (301) 555-0100",
		]) {
			expect(normalizeUsPhone(raw)).toBe("+13015550100");
		}
	});

	it("refuses what is not a US number", () => {
		for (const raw of [
			"",
			"555-0100",
			"+44 20 7946 0958",
			"0015550100",
			"3011550100",
			"301555010x",
			"23015550100",
		]) {
			expect(normalizeUsPhone(raw)).toBeNull();
		}
	});

	it("shows a number back the way people write it", () => {
		expect(formatUsPhone("+13015550100")).toBe("(301) 555-0100");
	});
});

describe("codes", () => {
	it("are six digits", () => {
		for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
	});

	it("hash to something bound to the person and the number", async () => {
		const base = { userId: "u", phone: "+13015550100", code: "123456" };
		const a = await hashCode("s", base);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(sameHash(a, await hashCode("s", base))).toBe(true);
		expect(
			sameHash(a, await hashCode("s", { ...base, phone: "+13015550101" })),
		).toBe(false);
		expect(sameHash(a, await hashCode("s", { ...base, userId: "v" }))).toBe(
			false,
		);
		expect(sameHash(a, await hashCode("t", base))).toBe(false);
		expect(sameHash(a, a.slice(0, 63))).toBe(false);
	});
});

describe("nextSend", () => {
	const t0 = new Date("2026-10-20T12:00:00Z");
	const at = (ms: number) => new Date(t0.getTime() + ms);

	it("lets the first code go", () => {
		expect(nextSend(null, t0)).toEqual({
			ok: true,
			window: { sends: 1, windowStart: t0, lastSentAt: t0 },
		});
	});

	it("wants a minute between codes", () => {
		const w = { sends: 1, windowStart: t0, lastSentAt: t0 };
		expect(nextSend(w, at(30_000))).toEqual({ ok: false, reason: "too-soon" });
		expect(nextSend(w, at(60_000))).toMatchObject({
			ok: true,
			window: { sends: 2 },
		});
	});

	it("stops at the daily cap and starts again a day later", () => {
		const w = { sends: MAX_SENDS_PER_DAY, windowStart: t0, lastSentAt: t0 };
		expect(nextSend(w, at(3_600_000))).toEqual({
			ok: false,
			reason: "too-many",
		});
		expect(nextSend(w, at(24 * 3_600_000))).toMatchObject({
			ok: true,
			window: { sends: 1 },
		});
	});
});
