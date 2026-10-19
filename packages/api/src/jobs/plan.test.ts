import { describe, expect, it } from "vitest";

import type { StageKey } from "../cycle";
import { runInstant } from "../run";
import { planStage, type Stamps } from "./plan";

/** A Monday night, starting at 7:30 like most of them. */
const DATE = "2026-09-14";
const START = "19:30";

const at = (date: string, time: string) => runInstant(date, time);

const stamps = (done: Partial<Stamps> = {}): Stamps => ({
	call: null,
	nudge: null,
	confirmed: null,
	lastCall: null,
	final: null,
	...done,
});

const plan = (now: Date, over: Partial<Parameters<typeof planStage>[0]> = {}) =>
	planStage({
		date: DATE,
		startTime: START,
		stamps: stamps(),
		lastEmailAt: null,
		now,
		...over,
	});

describe("the ordinary week", () => {
	it("does nothing before five the evening before", () => {
		expect(plan(at("2026-09-13", "16:30")).run).toBeNull();
	});

	it("calls the group at five the evening before", () => {
		expect(plan(at("2026-09-13", "17:00")).run).toBe("call");
	});

	it("reminds at nine if the call went out yesterday", () => {
		const p = plan(at(DATE, "09:00"), {
			stamps: stamps({ call: at("2026-09-13", "17:00") }),
			lastEmailAt: at("2026-09-13", "17:00"),
		});
		expect(p.run).toBe("nudge");
		expect(p.skip).toEqual([]);
	});

	it("last-calls at half eleven, then decides at one", () => {
		const done = {
			stamps: stamps({
				call: at("2026-09-13", "17:00"),
				nudge: at(DATE, "09:00"),
			}),
			lastEmailAt: at(DATE, "09:00"),
		};
		expect(plan(at(DATE, "11:30"), done).run).toBe("lastCall");
		expect(
			plan(at(DATE, "13:00"), {
				stamps: stamps({ ...done.stamps, lastCall: at(DATE, "11:30") }),
				lastEmailAt: at(DATE, "11:30"),
			}).run,
		).toBe("final");
	});

	it("leaves ninety minutes between the reminder and the last call", () => {
		// The spacing rule would hold the last call if the two were closer;
		// this is the test that notices when somebody moves one of them.
		const p = plan(at(DATE, "11:30"), {
			stamps: stamps({
				call: at("2026-09-13", "17:00"),
				nudge: at(DATE, "09:00"),
			}),
			lastEmailAt: at(DATE, "09:00"),
		});
		expect(p.run).toBe("lastCall");
	});
});

describe("a gym booked late", () => {
	// Booked at ten on the day. The five-o'clock-yesterday call is overdue,
	// and so is the nine o'clock reminder.
	it("tells the group it exists before reminding anyone about it", () => {
		const p = plan(at(DATE, "10:00"));
		expect(p.run).toBe("call");
		expect(p.silent).toBe(false);
	});

	it("holds the next stage for ninety minutes", () => {
		const p = plan(at(DATE, "11:00"), {
			stamps: stamps({ call: at(DATE, "10:00") }),
			lastEmailAt: at(DATE, "10:00"),
		});
		expect(p.run).toBeNull();
		expect(p.reason).toMatch(/holding/);
	});

	it("abandons the stale reminder rather than sending it late", () => {
		const p = plan(at(DATE, "11:30"), {
			stamps: stamps({ call: at(DATE, "10:00") }),
			lastEmailAt: at(DATE, "10:00"),
		});
		expect(p.run).toBe("lastCall");
		expect(p.skip).toEqual<StageKey[]>(["nudge"]);
	});
});

describe("the verdict is not optional", () => {
	it("ignores the cooldown -- half an hour after a late last call", () => {
		// A last call held by the cooldown until half twelve leaves the
		// verdict well inside the ninety minutes. The day somebody makes
		// `final` respect it, this test says whether anyone gets told.
		const p = plan(at(DATE, "13:00"), {
			stamps: stamps({
				call: at("2026-09-13", "17:00"),
				nudge: at(DATE, "09:00"),
				lastCall: at(DATE, "12:30"),
			}),
			lastEmailAt: at(DATE, "12:30"),
		});
		expect(p.run).toBe("final");
	});

	it("records a missed verdict after the start but emails nobody", () => {
		const p = plan(at(DATE, "20:00"), {
			stamps: stamps({ call: at("2026-09-13", "17:00") }),
		});
		expect(p.run).toBe("final");
		expect(p.silent).toBe(true);
		expect(p.skip).toEqual(expect.arrayContaining(["nudge", "lastCall"]));
	});

	it("goes quiet once the verdict is in", () => {
		const p = plan(at(DATE, "21:00"), {
			stamps: stamps({
				call: at("2026-09-13", "17:00"),
				nudge: at(DATE, "09:00"),
				lastCall: at(DATE, "11:30"),
				final: at(DATE, "13:00"),
			}),
		});
		expect(p.run).toBeNull();
	});
});

describe("the week the clocks change", () => {
	it("still calls the evening before, an hour of offset notwithstanding", () => {
		// 2026-03-09 is the Monday after spring-forward. The call is at
		// UTC-5, the night itself at UTC-4.
		const p = planStage({
			date: "2026-03-09",
			startTime: START,
			stamps: stamps(),
			lastEmailAt: null,
			now: at("2026-03-08", "17:00"),
		});
		expect(p.run).toBe("call");
	});
});
