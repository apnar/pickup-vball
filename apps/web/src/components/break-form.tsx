import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { useId, useState } from "react";

/**
 * How long a break lasts. Weeks, because that is the unit injuries and trips
 * come in. 0 means open-ended: they come back when they say so.
 */
const DURATIONS = [
	{ weeks: 2, label: "Two weeks" },
	{ weeks: 4, label: "Four weeks" },
	{ weeks: 8, label: "Eight weeks" },
	{ weeks: 0, label: "Until further notice" },
] as const;

export type BreakInput = { reason?: string; until?: number };

/** The end of a break, as a timestamp. Null for open-ended. */
export function untilFromWeeks(weeks: number): number | undefined {
	if (weeks <= 0) return undefined;
	return Date.now() + weeks * 7 * 24 * 60 * 60 * 1000;
}

/**
 * Reason and duration, plus the sentence that says what stepping away
 * actually means. Used by a player on their own account and by an admin
 * doing it for somebody who asked them to.
 */
export function BreakForm({
	subject = "you",
	pending,
	onCancel,
	onSubmit,
}: {
	/** Whose break this is, for the notice: "you" or a first name. */
	subject?: string;
	pending?: boolean;
	onCancel: () => void;
	onSubmit: (input: BreakInput) => void;
}) {
	const reasonId = useId();
	const weeksId = useId();
	const [reason, setReason] = useState("");
	const [weeks, setWeeks] = useState<number>(4);
	const self = subject === "you";

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit({
					reason: reason.trim() || undefined,
					until: untilFromWeeks(weeks),
				});
			}}
		>
			<p className="m-0 max-w-[60ch] rounded-card bg-warn-bg p-4 text-[15px] text-warn leading-normal">
				{self ? "You" : subject} won't get emails about upcoming nights,
				including the one that goes out when a gym is booked, and{" "}
				{self ? "you" : "they"} won't be on a roster until{" "}
				{self ? "you're" : "they're"} back. The account stays, and the links in
				earlier emails still sign {self ? "you" : "them"} in.
			</p>
			<div className="flex flex-wrap items-end gap-4">
				<div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
					<Label htmlFor={reasonId}>Reason (optional)</Label>
					<Input
						id={reasonId}
						maxLength={200}
						placeholder="Injured, back in about a month"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</div>
				<div className="flex min-w-[200px] flex-col gap-1.5">
					<Label htmlFor={weeksId}>How long</Label>
					<select
						id={weeksId}
						className="min-h-12 w-full rounded-field border-[1.5px] border-line bg-deep px-3 text-ink"
						value={weeks}
						onChange={(e) => setWeeks(Number(e.target.value))}
					>
						{DURATIONS.map((d) => (
							<option key={d.weeks} value={d.weeks}>
								{d.label}
							</option>
						))}
					</select>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button type="submit" disabled={pending}>
					Start {self ? "my" : "their"} break
				</Button>
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

/** "Back on Oct 7 — injured" / "Away", for a pill or a status line. */
export function describeBreak(input: {
	suspendedUntil: Date | string | null;
	reason: string | null;
}): string {
	const until = input.suspendedUntil
		? new Date(input.suspendedUntil).toLocaleDateString("en-US", {
				timeZone: "America/New_York",
				month: "short",
				day: "numeric",
			})
		: null;
	const head = until ? `Back on ${until}` : "Away";
	return input.reason ? `${head} — ${input.reason}` : head;
}
