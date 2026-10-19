import type { Headcount } from "@pickup-vball/api/routers/rsvp";
import { Button, buttonVariants } from "@pickup-vball/ui/components/button";
import { Panel } from "@pickup-vball/ui/components/panel";
import { Link, useRouteContext } from "@tanstack/react-router";

import { dateParts, GameFacts } from "@/components/game-facts";
import { GuestPanel } from "@/components/guest-panel";
import { ResponsePicker } from "@/components/response-picker";
import {
	Countdown,
	CountTiles,
	RsvpMeter,
	Verdict,
} from "@/components/rsvp-status";
import SectionKicker from "@/components/section-kicker";
import { initials } from "@/components/user-menu";
import { useRsvps } from "@/hooks/use-rsvps";
import { type RsvpAnswer, yourLine } from "@/lib/rsvp";

type Row = Headcount["rsvps"][number];

/** A break, in words: "You're taking a break: knee, until October 7." */
export function awayLine(viewer: Headcount["viewer"]): string {
	return `You’re taking a break${viewer?.reason ? `: ${viewer.reason}` : ""}${
		viewer?.suspendedUntil
			? `, until ${new Date(viewer.suspendedUntil).toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					timeZone: "America/New_York",
				})}`
			: ""
	}.`;
}

const GROUPS: { answer: RsvpAnswer; title: string }[] = [
	{ answer: "in", title: "Who’s in" },
	{ answer: "maybe", title: "Maybe" },
	{ answer: "out", title: "Out" },
];

/**
 * The next night: its card with your answer on it, who is coming, and the
 * guest box. The whole of the player home page apart from the sidebar.
 */
export default function RsvpBoard() {
	const {
		headcount,
		isPending,
		add,
		respond,
		setResponse,
		removeGuest,
		comeBack,
		backPending,
	} = useRsvps();
	const { session } = useRouteContext({ from: "__root__" });

	if (!headcount) {
		return (
			<section id="rsvp" className="scroll-mt-6">
				<Panel className="flex flex-col items-start gap-3">
					<h2 className="display m-0 text-[32px]">No nights booked yet</h2>
					<p className="m-0 max-w-[52ch] text-subtle">
						When the next gym is booked it will show up here, and you’ll get an
						email the evening before asking if you’re in.
					</p>
					<Link
						to="/schedule"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						See the schedule
					</Link>
				</Panel>
			</section>
		);
	}

	const { game, me, viewer, rsvps } = headcount;
	const away = viewer?.status === "suspended";
	// Once the verdict is in, the sheet is a record rather than a question.
	const locked = game.status === "canceled" || Boolean(game.decidedAt);
	const mine = me ? (rsvps.find((r) => r.id === me)?.response ?? null) : null;
	const d = dateParts(game.date);

	return (
		<div className="flex flex-wrap items-start gap-8">
			<section
				id="rsvp"
				aria-labelledby="next-h"
				className="flex min-w-0 flex-[999_1_520px] scroll-mt-6 flex-col gap-8"
			>
				<article className="panel flex flex-col gap-5">
					<div className="flex items-start gap-4">
						<div className="flex min-w-[56px] flex-col items-center">
							<span className="font-semibold text-[13px] text-amber tracking-[0.12em]">
								{d.day}
							</span>
							<span className="display text-[40px] leading-none">{d.num}</span>
							<span className="text-[12px] text-subtle uppercase tracking-[0.08em]">
								{d.mon}
							</span>
						</div>
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							<h2 id="next-h" className="kicker m-0">
								Next night
							</h2>
							<span className="font-medium text-[17px]">{game.timeLabel}</span>
							<span className="text-[15px] text-subtle">{game.gym.name}</span>
						</div>
					</div>

					<Verdict headcount={headcount} />
					<RsvpMeter headcount={headcount} />

					{away ? (
						// No spot while they are away, but coming back is one tap --
						// the button they want is the one that ends the break.
						<div className="flex flex-col items-start gap-3 rounded-btn bg-warn-bg p-4 text-warn">
							<p className="m-0 text-[15px]">
								{awayLine(viewer)} You won’t be counted for this night.
							</p>
							<Button
								size="sm"
								disabled={backPending}
								onClick={() => comeBack()}
							>
								I’m back
							</Button>
						</div>
					) : (
						<div className="flex flex-col gap-2">
							<ResponsePicker
								name="my-response"
								legend={`Your answer, ${session?.user.name}`}
								value={mine}
								disabled={isPending || locked}
								onPick={(answer) => respond(answer)}
							/>
							<p className="m-0 text-[14px] text-subtle">
								{yourLine(mine, locked)}
							</p>
						</div>
					)}
				</article>

				<Roster
					headcount={headcount}
					locked={locked}
					isPending={isPending}
					setResponse={setResponse}
				/>

				<GuestPanel
					headcount={headcount}
					locked={locked}
					isPending={isPending}
					add={add}
					removeGuest={removeGuest}
				/>
			</section>

			<aside
				aria-label="Night details"
				className="flex min-w-0 flex-[1_1_280px] flex-col gap-4"
			>
				<GameFacts game={game} />
				<Panel className="flex flex-col gap-5">
					<CountTiles headcount={headcount} columns="grid-cols-2" />
					<Countdown headcount={headcount} />
				</Panel>
			</aside>
		</div>
	);
}

/**
 * Who is coming, grouped by answer. Your own guests carry a small picker so
 * you can change their answer for them; nobody else's row is yours to touch,
 * which the server enforces too.
 */
export function Roster({
	headcount,
	locked,
	isPending,
	setResponse,
}: {
	headcount: Headcount;
	locked: boolean;
	isPending: boolean;
	setResponse?: (rowId: string, answer: RsvpAnswer) => void;
}) {
	const { rsvps, me, counts } = headcount;

	if (rsvps.length === 0) {
		return (
			<section aria-labelledby="roster-h" className="flex flex-col gap-2">
				<SectionKicker id="roster-h" className="m-0">
					Who’s in
				</SectionKicker>
				<p className="m-0 text-subtle">Nobody has answered yet.</p>
			</section>
		);
	}

	return (
		<section aria-labelledby="roster-h" className="flex flex-col gap-6">
			{GROUPS.map(({ answer, title }) => {
				const rows = rsvps.filter((r) => r.response === answer);
				if (rows.length === 0 && answer !== "in") return null;
				return (
					<div key={answer} className="flex flex-col gap-2.5">
						<SectionKicker
							id={answer === "in" ? "roster-h" : undefined}
							className="m-0"
						>
							{title} <span className="tnum text-subtle">{rows.length}</span>
						</SectionKicker>
						{rows.length === 0 ? (
							<p className="m-0 text-subtle">Nobody yet.</p>
						) : (
							<ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
								{rows.map((r) => (
									<RosterChip
										key={r.id}
										row={r}
										you={r.id === me}
										dim={answer !== "in"}
										editable={Boolean(
											setResponse && r.guest && r.mine && !locked,
										)}
										isPending={isPending}
										onPick={(a) => setResponse?.(r.id, a)}
									/>
								))}
							</ul>
						)}
					</div>
				);
			})}
			{counts.silent > 0 ? (
				<p className="m-0 text-[14px] text-subtle">
					{counts.silent}{" "}
					{counts.silent === 1 ? "person hasn’t" : "people haven’t"} replied
					yet.
				</p>
			) : null}
		</section>
	);
}

function RosterChip({
	row,
	you,
	dim,
	editable,
	isPending,
	onPick,
}: {
	row: Row;
	you: boolean;
	dim: boolean;
	editable: boolean;
	isPending: boolean;
	onPick: (answer: RsvpAnswer) => void;
}) {
	// Whose guest this is, so the group knows who to ask about them.
	const note = row.guest
		? row.addedByName
			? `Guest of ${row.addedByName}`
			: "Guest"
		: you
			? "You"
			: null;
	return (
		<li className="flex min-w-0 flex-col gap-2 rounded-field bg-surface-alt px-2.5 py-2">
			<div className="flex min-w-0 items-center gap-2.5">
				<span
					aria-hidden="true"
					className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full font-bold text-[13px] ${
						you
							? "bg-amber text-on-amber"
							: dim
								? "bg-raised text-subtle"
								: "bg-raised text-ink"
					}`}
				>
					{initials(row.name)}
				</span>
				<span className="flex min-w-0 flex-col">
					<span
						className={`truncate font-medium text-[15px] ${dim ? "text-ink-soft" : ""}`}
					>
						{row.name}
					</span>
					{note ? (
						<span className="truncate text-[12px] text-subtle">{note}</span>
					) : null}
				</span>
			</div>
			{editable ? (
				<ResponsePicker
					size="small"
					name={`rsvp-${row.id}`}
					legend={`Answer for ${row.name}`}
					value={row.response}
					disabled={isPending}
					onPick={onPick}
				/>
			) : null}
		</li>
	);
}
