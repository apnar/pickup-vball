import type { Headcount } from "@pickup-vball/api/routers/rsvp";

import {
	announceRemaining,
	formatRemaining,
	useClock,
} from "@/hooks/use-countdown";
import { headline, subline } from "@/lib/rsvp";

/**
 * Where the night stands and when the RSVP closes. Rendered on the home page
 * and on the page a cycle email lands on, because "did that work" is exactly
 * the question somebody has after tapping a button in an email.
 */

function stageAt(headcount: Headcount, key: string): string | null {
	return headcount.game.cycle.stages.find((s) => s.key === key)?.at ?? null;
}

/** Every timestamp on this page is the gym's clock, never the browser's. */
const RUN_TZ = "America/New_York";

export function clockLabel(at: string | Date): string {
	return new Date(at).toLocaleTimeString("en-US", {
		timeZone: RUN_TZ,
		hour: "numeric",
		minute: "2-digit",
	});
}

/** The one thing that stops a night: an admin calling it off. */
export function CalledOff({ headcount }: { headcount: Headcount }) {
	if (headcount.game.status !== "canceled") return null;
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-3 rounded-btn bg-danger-bg px-4 py-3 text-danger">
			<span className="display text-[26px]">Called off</span>
		</div>
	);
}

export function Countdown({ headcount }: { headcount: Headcount }) {
	const { game } = headcount;
	const closeAt = stageAt(headcount, "close");
	// Until answers close, count down to that; after, to the start. The
	// stamp is what moves it on, but the clock passing the close time does
	// too, so the page does not wait for the cron to tell it.
	const target =
		game.status === "canceled"
			? null
			: !game.decidedAt && closeAt
				? closeAt
				: game.cycle.startsAt;
	// Hooks run before the early return, always.
	const now = useClock(headcount.now, target);

	if (!target) return null;
	const closing =
		target === closeAt && closeAt !== null && now < Date.parse(closeAt);
	const shown = closing ? target : game.cycle.startsAt;
	const remaining = Date.parse(shown) - now;
	if (remaining <= 0) return null;

	// More than six hours out, a ticking clock is just noise.
	const coarse = remaining > 6 * 60 * 60 * 1000;
	return (
		<div role="timer" className="flex flex-col gap-1">
			<span className="kicker">{closing ? "RSVP closes" : "Starts"}</span>
			<span
				aria-hidden="true"
				className="tnum display text-[34px] leading-none"
			>
				{coarse ? clockLabel(shown) : formatRemaining(remaining)}
			</span>
			<span className="sr-only" aria-live="polite">
				{announceRemaining(
					remaining,
					closing ? "the RSVP closing" : "the start",
				)}
			</span>
		</div>
	);
}

/** The big count, the fill bar and the one-line summary of it. */
export function RsvpMeter({ headcount }: { headcount: Headcount }) {
	const { counts, capacity, game } = headcount;
	const pct = (n: number) => `${Math.min(100, (n / capacity) * 100)}%`;
	// Maybes ride on top of the ins, and neither can push the bar past the end.
	const maybeWidth = Math.max(0, Math.min(counts.maybe, capacity - counts.in));
	const left = capacity - counts.in;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<span className="tnum display text-[34px] leading-none">
					{counts.in}
					<span className="text-[20px] text-subtle"> / {capacity} in</span>
				</span>
				<span className="text-[14px] text-subtle">
					{left > 0 ? `${left} ${left === 1 ? "spot" : "spots"} left` : "Full"}
				</span>
			</div>
			{/*
			 * Solid for the ins, faded for the maybes. The graphic is hidden from
			 * screen readers and carried by the sentence after it.
			 */}
			<div className="meter relative" aria-hidden="true">
				<span
					className="absolute inset-y-0 left-0"
					style={{ width: pct(counts.in) }}
				/>
				<span
					className="absolute inset-y-0 opacity-35"
					style={{ left: pct(counts.in), width: pct(maybeWidth) }}
				/>
			</div>
			<p className="sr-only">
				{counts.in} in, {counts.maybe} maybe, {counts.out} out, {counts.silent}{" "}
				yet to answer. {capacity} spots.
			</p>
			<div className="flex flex-col gap-1">
				<p className="m-0 font-semibold text-[17px]">
					{headline(counts, capacity, game.status)}
				</p>
				<p className="m-0 text-[14px] text-subtle">
					{subline(counts, capacity, game.status)}
				</p>
			</div>
		</div>
	);
}

/** In, maybe, out and silent, as four small tiles. */
export function CountTiles({
	headcount,
	columns = "grid-cols-4",
}: {
	headcount: Headcount;
	/** Four across in a wide card; a narrow sidebar wants two. */
	columns?: string;
}) {
	const { counts } = headcount;
	return (
		<dl className={`m-0 grid gap-2 ${columns}`}>
			{(
				[
					["In", counts.in, "text-amber"],
					["Maybe", counts.maybe, "text-ink"],
					["Out", counts.out, "text-ink"],
					["No reply", counts.silent, "text-subtle"],
					...(counts.waitlist > 0
						? ([["Waitlist", counts.waitlist, "text-ink"]] as const)
						: []),
				] as const
			).map(([label, n, tone]) => (
				<div
					key={label}
					className="flex flex-col-reverse rounded-field bg-surface-alt px-3 py-2"
				>
					<dt className="text-[12px] text-subtle">{label}</dt>
					<dd className={`tnum display m-0 text-[26px] ${tone}`}>{n}</dd>
				</div>
			))}
		</dl>
	);
}

/**
 * The whole status block: a cancellation if there was one, the meter, the
 * four counts and the countdown to whatever happens next.
 */
export function RsvpStatus({ headcount }: { headcount: Headcount }) {
	return (
		<div className="flex flex-col gap-5">
			<CalledOff headcount={headcount} />
			<RsvpMeter headcount={headcount} />
			<CountTiles headcount={headcount} />
			<Countdown headcount={headcount} />
		</div>
	);
}
