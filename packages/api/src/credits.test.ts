import { describe, expect, it } from "vitest";

import {
	type CsvEntry,
	describeEntry,
	ledgerCsv,
	monthStart,
	signed,
} from "./credits";

const base = {
	method: null,
	amountUsd: null,
	note: null,
	night: null,
	byName: "Viroj Suteerawongsa",
} as const;

describe("describeEntry", () => {
	it("says how a purchase was paid", () => {
		expect(
			describeEntry({
				...base,
				reason: "purchase",
				method: "venmo",
				amountUsd: 50,
			}),
		).toEqual({ what: "Paid · Venmo $50", by: "Viroj Suteerawongsa" });
	});

	it("credits a charge to check-in, not to the admin who closed the night", () => {
		expect(
			describeEntry({
				...base,
				reason: "played",
				night: { date: "2026-10-13", gymName: "Magruder" },
			}),
		).toEqual({ what: "Played · Tue, Oct 13 · Magruder", by: "Check-in" });
	});

	it("keeps the note on a correction and a refund", () => {
		expect(
			describeEntry({ ...base, reason: "correction", note: "Double charge" })
				.what,
		).toBe("Correction · Double charge");
		expect(
			describeEntry({
				...base,
				reason: "refund",
				note: "Left early, hurt",
				night: { date: "2026-10-13", gymName: "Magruder" },
			}).what,
		).toBe("Refund · Tue, Oct 13 · Left early, hurt");
	});

	it("falls back when the admin has gone", () => {
		expect(
			describeEntry({ ...base, reason: "correction", byName: null }).by,
		).toBe("Admin");
	});
});

describe("signed", () => {
	it("always shows the sign, with a real minus", () => {
		expect(signed(10)).toBe("+10");
		expect(signed(-1)).toBe("−1");
		expect(signed(0)).toBe("0");
	});
});

describe("monthStart", () => {
	it("starts the month at midnight in Maryland", () => {
		// 2:00 AM UTC on Nov 1 is still October 31 on the gym's clock.
		const late = monthStart(new Date("2026-11-01T02:00:00Z"));
		expect(late.label).toBe("October");
		expect(late.since.toISOString()).toBe("2026-10-01T04:00:00.000Z");
	});

	it("follows the offset into standard time", () => {
		const dec = monthStart(new Date("2026-12-15T17:00:00Z"));
		expect(dec.label).toBe("December");
		expect(dec.since.toISOString()).toBe("2026-12-01T05:00:00.000Z");
	});
});

describe("ledgerCsv", () => {
	const row: CsvEntry = {
		...base,
		reason: "correction",
		note: '=HYPERLINK("x")',
		createdAt: new Date("2026-10-18T00:41:00Z"),
		playerName: "Lee, Marcus",
		playerEmail: "marcus@example.com",
		delta: -1,
		balance: 4,
	};
	const csv = ledgerCsv([row]);
	const [header, line] = csv.split("\r\n");

	it("has a header and dates on the gym's clock", () => {
		expect(header).toBe(
			"Date,Player,Email,Reason,Details,By,Change,Balance,Dollars",
		);
		expect(line?.startsWith("2026-10-17 20:41,")).toBe(true);
	});

	it("quotes commas and keeps numbers as numbers", () => {
		expect(line).toContain('"Lee, Marcus"');
		expect(line).toContain(",-1,4,");
	});

	it("defuses a formula in a text cell", () => {
		expect(
			ledgerCsv([{ ...row, playerName: "=cmd" }]).split("\r\n")[1],
		).toContain(",'=cmd,");
		// The note reaches the Details cell after a prefix, so it is inert there.
		expect(line).toContain('"Correction · =HYPERLINK(""x"")"');
	});
});
