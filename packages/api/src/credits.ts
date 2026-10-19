import type {
	CreditReason,
	PaymentMethod,
} from "@pickup-vball/db/schema/credit";

import { formatGameDate, RUN_TIMEZONE, runInstant } from "./run";

/*
 * The words and numbers around the credit ledger. Pure, like cycle.ts: the
 * web app bundles this file, so it must not reach drizzle or
 * `cloudflare:workers`.
 */

export const METHOD_LABEL: Record<PaymentMethod, string> = {
	venmo: "Venmo",
	cash: "Cash",
	other: "Other",
};

/** The most an admin can add or take in one go; a typo guard, not policy. */
export const MAX_CREDITS_AT_ONCE = 200;

export type DescribableEntry = {
	reason: CreditReason;
	method: PaymentMethod | null;
	amountUsd: number | null;
	note: string | null;
	night: { date: string; gymName: string } | null;
	byName: string | null;
};

/**
 * One ledger row in words, the same for the admin's ledger and the player's
 * own history. `by` says "Check-in" for a charge rather than the admin who
 * closed the night: what charged you was turning up.
 */
export function describeEntry(entry: DescribableEntry): {
	what: string;
	by: string;
} {
	const night = entry.night ? formatGameDate(entry.night.date) : null;
	const by = entry.reason === "played" ? "Check-in" : (entry.byName ?? "Admin");
	switch (entry.reason) {
		case "purchase": {
			const how = entry.method ? METHOD_LABEL[entry.method] : "Paid";
			const paid =
				entry.amountUsd !== null ? `${how} $${entry.amountUsd}` : how;
			return { what: withNote(`Paid · ${paid}`, entry.note), by };
		}
		case "played":
			return {
				what: night ? `Played · ${night} · ${entry.night?.gymName}` : "Played",
				by,
			};
		case "refund":
			return {
				what: withNote(night ? `Refund · ${night}` : "Refund", entry.note),
				by,
			};
		case "correction":
			return { what: withNote("Correction", entry.note), by };
	}
}

function withNote(what: string, note: string | null): string {
	return note ? `${what} · ${note}` : what;
}

/** "+10", "−1": the sign always shown, and a real minus. */
export function signed(delta: number): string {
	return delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "0";
}

/**
 * The first instant of the current month on the gym's calendar, and its
 * name. "This month" on the ledger means October in Maryland, not in UTC,
 * where it starts four hours early.
 */
export function monthStart(now: Date = new Date()): {
	since: Date;
	label: string;
} {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: RUN_TIMEZONE,
		year: "numeric",
		month: "2-digit",
	}).formatToParts(now);
	const year = parts.find((p) => p.type === "year")?.value ?? "1970";
	const month = parts.find((p) => p.type === "month")?.value ?? "01";
	const label = new Intl.DateTimeFormat("en-US", {
		timeZone: "UTC",
		month: "long",
	}).format(new Date(`${year}-${month}-15T12:00:00Z`));
	return { since: runInstant(`${year}-${month}-01`, "00:00"), label };
}

export type CsvEntry = DescribableEntry & {
	createdAt: Date;
	playerName: string;
	playerEmail: string;
	delta: number;
	balance: number;
};

/**
 * The ledger as a spreadsheet. Text cells that open with `=`, `+`, `-` or
 * `@` get a leading apostrophe: a spreadsheet would otherwise run a note
 * like "=HYPERLINK(...)" as a formula. The numeric columns are left alone,
 * because "-1" is a number there and must stay one.
 */
export function ledgerCsv(rows: CsvEntry[]): string {
	const header = [
		"Date",
		"Player",
		"Email",
		"Reason",
		"Details",
		"By",
		"Change",
		"Balance",
		"Dollars",
	];
	const lines = rows.map((row) => {
		const { what, by } = describeEntry(row);
		return [
			text(isoInRunTimezone(row.createdAt)),
			text(row.playerName),
			text(row.playerEmail),
			text(row.reason),
			text(what),
			text(by),
			String(row.delta),
			String(row.balance),
			row.amountUsd === null ? "" : String(row.amountUsd),
		].join(",");
	});
	return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

function text(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** "2026-10-18 20:41" on the gym's clock. */
function isoInRunTimezone(at: Date): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: RUN_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(at);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
