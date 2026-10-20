import { describe, expect, it } from "vitest";

import {
	channelsFor,
	choiceFor,
	KIND_TOPIC,
	TOPICS,
	textSendAfter,
} from "./notify";
import { runInstant } from "./run";

const both = { canEmail: true, canText: true };

describe("choiceFor", () => {
	it("uses the default until somebody chooses", () => {
		expect(choiceFor("call", undefined)).toBe("email");
		expect(choiceFor("spot_open", undefined)).toBe("off");
		expect(choiceFor("call", "text")).toBe("text");
	});

	it("will not turn a required topic off", () => {
		expect(choiceFor("canceled", "off")).toBe("email");
		expect(choiceFor("call", "off")).toBe("off");
	});

	it("has a topic for every kind, and an Off for none of the required", () => {
		for (const t of TOPICS) {
			if (t.required) expect(t.default).not.toBe("off");
		}
		expect(KIND_TOPIC.rsvp_last_call).toBe("nudge");
	});
});

describe("channelsFor", () => {
	it("sends what was chosen when both channels work", () => {
		expect(channelsFor("email", both)).toEqual({ email: true, text: false });
		expect(channelsFor("text", both)).toEqual({ email: false, text: true });
		expect(channelsFor("both", both)).toEqual({ email: true, text: true });
		expect(channelsFor("off", both)).toEqual({ email: false, text: false });
	});

	it("falls back to email when texts cannot reach them", () => {
		const noText = { canEmail: true, canText: false };
		expect(channelsFor("text", noText)).toEqual({ email: true, text: false });
		expect(channelsFor("both", noText)).toEqual({ email: true, text: false });
	});

	it("falls back to text when the address bounced", () => {
		const noEmail = { canEmail: false, canText: true };
		expect(channelsFor("email", noEmail)).toEqual({
			email: false,
			text: true,
		});
		expect(channelsFor("both", noEmail)).toEqual({ email: false, text: true });
	});

	it("sends nothing when nothing can reach them", () => {
		const none = { canEmail: false, canText: false };
		expect(channelsFor("both", none)).toEqual({ email: false, text: false });
		expect(channelsFor("text", none)).toEqual({ email: false, text: false });
	});
});

describe("textSendAfter", () => {
	it("goes now in the daytime", () => {
		const now = runInstant("2026-10-24", "13:00");
		expect(textSendAfter(now)).toEqual(now);
	});

	it("holds a late-night text until 8 the next morning", () => {
		const now = runInstant("2026-10-24", "23:30");
		expect(textSendAfter(now)).toEqual(runInstant("2026-10-25", "08:00"));
	});

	it("holds an early-morning text until 8 the same morning", () => {
		const now = runInstant("2026-10-25", "02:00");
		expect(textSendAfter(now)).toEqual(runInstant("2026-10-25", "08:00"));
	});

	it("finds 8 AM on the far side of the clocks going back", () => {
		// 2026-11-01 is the end of daylight time in New York.
		const now = runInstant("2026-10-31", "22:00");
		const after = textSendAfter(now);
		expect(after).toEqual(runInstant("2026-11-01", "08:00"));
		expect(after.toISOString()).toBe("2026-11-01T13:00:00.000Z");
	});
});
