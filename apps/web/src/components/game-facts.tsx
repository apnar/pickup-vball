import type { Headcount } from "@pickup-vball/api/routers/rsvp";

import { clockLabel } from "@/components/rsvp-status";
import { rules } from "@/content/run";

/** The house rule a reverse coed night shows on its own page. */
const REVCO_RULE = rules.find((r) => r.title === "Reverse coed nights")?.body;

type Game = Headcount["game"];

/**
 * "2026-10-20" -> TUE / 20 / OCT, for the date block on a night's card. Read
 * as UTC noon: the string already is the gym's calendar day, and reading it
 * in the browser's zone could land it on the day before.
 */
export function dateParts(date: string) {
	const d = new Date(`${date}T12:00:00Z`);
	const part = (o: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(d);
	return {
		day: part({ weekday: "short" }).toUpperCase(),
		num: part({ day: "numeric" }),
		mon: part({ month: "short" }).toUpperCase(),
		long: part({
			weekday: "long",
			month: "short",
			day: "numeric",
		}).toUpperCase(),
	};
}

/** A maps search for the address, which is what every phone knows how to open. */
export function directionsUrl(game: Game): string {
	const q = game.gym.address
		? `${game.gym.name}, ${game.gym.address}`
		: game.gym.name;
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const icon = {
	width: 22,
	height: 22,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	className: "mt-0.5 shrink-0 text-subtle",
} as const;

/**
 * When and where, plus how to get in the door. Shown on the home page and on
 * the page a cycle email lands on -- somebody who just tapped "I'm in" from
 * the car wants the address more than anything else on the screen.
 */
export function GameFacts({ game }: { game: Game }) {
	const closes = game.cycle.stages.find((s) => s.key === "close")?.at ?? null;
	const open = game.status !== "canceled" && !game.decidedAt;
	return (
		<div className="flex flex-col rounded-card bg-surface">
			<div className="flex items-start gap-3.5 border-raised border-b px-[18px] py-4">
				<svg {...icon} aria-hidden="true">
					<circle cx="12" cy="12" r="9" />
					<path d="M12 7v5l3 2" />
				</svg>
				<div className="flex flex-col">
					<span className="font-semibold">
						{game.timeLabel} · {game.kindLabel}
					</span>
					{closes && open ? (
						<span className="text-[14px] text-subtle">
							RSVP closes {clockLabel(closes)}
						</span>
					) : null}
				</div>
			</div>
			<div className="flex items-start gap-3.5 px-[18px] py-4">
				<svg {...icon} aria-hidden="true">
					<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
					<circle cx="12" cy="9" r="2.5" />
				</svg>
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="font-semibold">{game.gym.name}</span>
					{game.gym.address ? (
						<span className="text-[14px] text-subtle">{game.gym.address}</span>
					) : null}
				</div>
				<a
					href={directionsUrl(game)}
					target="_blank"
					rel="noreferrer"
					className="flex min-h-11 items-center font-semibold text-[14px]"
				>
					Directions
				</a>
			</div>
			{game.revco && REVCO_RULE ? (
				<div className="mx-[18px] mb-4 rounded-field border-[1.5px] border-revco-line px-3.5 py-3">
					<p className="m-0 font-bold font-heading text-[16px] text-revco-text uppercase tracking-[0.04em]">
						Reverse coed
					</p>
					<p className="m-0 mt-1 text-[14px] text-ink-soft">{REVCO_RULE}</p>
				</div>
			) : null}
			{/* How to get in, kept on the gym so it is right every week. */}
			{game.gym.notes || game.notes || game.permit ? (
				<div className="flex flex-col gap-1.5 border-raised border-t px-[18px] py-4 text-[14px] text-ink-soft">
					{game.gym.notes ? <p className="m-0">{game.gym.notes}</p> : null}
					{game.notes ? <p className="m-0">{game.notes}</p> : null}
					{game.permit ? (
						<a
							href={`/api/permits/${game.permit.id}/file`}
							target="_blank"
							rel="noreferrer"
							className="font-semibold"
						>
							Gym permit (PDF)
						</a>
					) : null}
				</div>
			) : null}
		</div>
	);
}
