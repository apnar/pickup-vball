import { todayInRunTimezone } from "@pickup-vball/api/run";
import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { creditCount, entryWhen } from "@/lib/credits";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/checkin/$gameId")({
	component: CheckInPage,
});

function players(n: number): string {
	return n === 1 ? "1 player" : `${n} players`;
}

const ANSWER: Record<string, string> = {
	waitlist: "Was on the waitlist",
	maybe: "Said maybe",
	out: "Said out",
};

/**
 * The sheet at the gym. Each tap is saved as it happens, so a second admin
 * or a reloaded phone sees the same ticks; nothing is charged until the
 * night is closed, and after that nothing on this page changes.
 */
function CheckInPage() {
	const { gameId } = Route.useParams();
	const queryClient = useQueryClient();
	const sheetOptions = orpc.checkin.sheet.queryOptions({ input: { gameId } });
	const sheet = useQuery(sheetOptions);
	const [adding, setAdding] = useState(false);
	const [query, setQuery] = useState("");
	const [armed, setArmed] = useState(false);

	const onError = (error: Error) => toast.error(error.message);
	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.checkin.key() });
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
		queryClient.invalidateQueries({ queryKey: orpc.credits.key() });
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
	};

	const set = useMutation(
		orpc.checkin.set.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({ queryKey: sheetOptions.queryKey }),
			onError: (error: Error) => {
				onError(error);
				queryClient.invalidateQueries({ queryKey: sheetOptions.queryKey });
			},
		}),
	);
	const close = useMutation(
		orpc.checkin.close.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					`Night closed. ${players(result.charged)} charged one credit each.`,
				);
				setArmed(false);
				refresh();
			},
			onError: (error: Error) => {
				onError(error);
				setArmed(false);
				refresh();
			},
		}),
	);

	if (sheet.isPending) {
		return <p className="m-0 text-subtle">Loading…</p>;
	}
	if (!sheet.data) {
		return (
			<div className="flex flex-col items-start gap-4">
				<p className="m-0 text-ink-soft">
					{sheet.error?.message ?? "That night is not on the schedule."}
				</p>
				<Link to="/admin">Back to nights</Link>
			</div>
		);
	}

	const { game, rows, others, guests, closedByName, opensLater } = sheet.data;
	const closed = Boolean(game.closedAt);
	const canceled = game.status === "canceled";
	const locked = closed || canceled || opensLater;
	const here = rows.filter((r) => r.checkedIn);
	const broke = here.filter((r) => r.balance <= 0).length;
	const tonight = game.date === todayInRunTimezone();

	/**
	 * Tick or untick, showing the change before the server answers: at a gym
	 * door a tap that takes a second to register gets tapped again.
	 */
	const toggle = (userId: string, next: boolean) => {
		queryClient.setQueryData(sheetOptions.queryKey, (old) => {
			if (!old) return old;
			const moved = old.others.find((o) => o.id === userId);
			return {
				...old,
				rows: moved
					? [
							...old.rows,
							{
								...moved,
								answer: null,
								checkedIn: true,
								walkIn: true,
								gone: false,
							},
						].sort((a, b) => a.name.localeCompare(b.name))
					: old.rows.map((r) =>
							r.id === userId ? { ...r, checkedIn: next } : r,
						),
				others: old.others.filter((o) => o.id !== userId),
			};
		});
		set.mutate({ gameId, userId, here: next });
	};

	const q = query.trim().toLowerCase();
	const walkIns = q
		? others.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8)
		: others.slice(0, 8);

	return (
		<div className="flex max-w-[640px] flex-col gap-5">
			<Link to="/admin" className="self-start font-semibold text-[14px]">
				← Nights
			</Link>

			<div className="flex flex-col gap-2">
				<span className="kicker text-amber">
					{tonight ? "Tonight" : "Night of"} · {game.dateLabel}
				</span>
				<h1 className="display m-0 text-[48px] leading-[0.92]">Check-in</h1>
				<span className="text-[15px] text-subtle">
					{game.timeLabel} · {game.gym.name}
				</span>
			</div>

			{closed ? (
				<div className="rounded-card bg-ok-bg px-[18px] py-4 text-ok">
					<p className="m-0 font-semibold">
						Closed{game.closedAt ? ` ${entryWhen(game.closedAt)}` : ""}
						{closedByName ? ` by ${closedByName}` : ""}. {players(here.length)}{" "}
						charged one credit each.
					</p>
					<p className="m-0 mt-1 text-[14px] text-ink-soft">
						Someone charged by mistake? Refund the night from their page under
						Players.
					</p>
				</div>
			) : canceled ? (
				<p className="m-0 rounded-card bg-warn-bg p-4 text-warn">
					This night was called off, so there is nobody to check in.
				</p>
			) : opensLater ? (
				<p className="m-0 rounded-card bg-surface p-4 text-ink-soft">
					Check-in opens on the day of the night.
				</p>
			) : null}

			<Panel className="flex items-center justify-between gap-3">
				<div className="flex flex-col">
					<span className="display tnum text-[40px] leading-none">
						{here.length}
						<span className="text-[22px] text-subtle"> / {rows.length}</span>
					</span>
					<span className="text-[14px] text-subtle">checked in</span>
				</div>
				{locked ? null : (
					<Button
						variant="outline"
						size="sm"
						aria-expanded={adding}
						onClick={() => setAdding((v) => !v)}
					>
						{adding ? "Done" : "+ Walk-in"}
					</Button>
				)}
			</Panel>

			{adding && !locked ? (
				<Panel variant="outline" className="flex flex-col gap-3">
					<label htmlFor="walk-in" className="font-semibold text-[14px]">
						Someone in the group who didn’t say they were in
					</label>
					<Input
						id="walk-in"
						type="search"
						autoComplete="off"
						placeholder="Search by name"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					{walkIns.length === 0 ? (
						<p className="m-0 text-[14px] text-subtle">
							{others.length === 0
								? "Everyone in the group is already on the sheet."
								: "Nobody matches. Guests without an account are settled with them directly."}
						</p>
					) : (
						<ul className="m-0 flex list-none flex-col gap-1 p-0">
							{walkIns.map((o) => (
								<li key={o.id}>
									<button
										type="button"
										onClick={() => toggle(o.id, true)}
										className="flex min-h-12 w-full items-center justify-between gap-3 rounded-field bg-surface px-3.5 text-left text-ink hover:bg-raised-hover"
									>
										<span className="font-semibold">{o.name}</span>
										<span
											className={`text-[14px] ${o.balance > 0 ? "text-subtle" : "text-danger"}`}
										>
											{creditCount(o.balance)}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</Panel>
			) : null}

			{locked ? null : (
				<p className="m-0 text-[14px] text-subtle">
					Tap a player when they arrive. Checked-in players are charged 1 credit
					when you close the night.
				</p>
			)}

			{rows.length === 0 ? (
				<p className="m-0 text-subtle">
					Nobody has said they’re in.{locked ? "" : " Add walk-ins above."}
				</p>
			) : (
				<ul className="m-0 flex list-none flex-col gap-2 p-0">
					{rows.map((r) => {
						const zero = r.balance <= 0;
						const sub = [
							zero
								? `${creditCount(r.balance)} · collect payment`
								: creditCount(r.balance),
							r.walkIn ? "Walk-in" : r.answer ? ANSWER[r.answer] : null,
						]
							.filter(Boolean)
							.join(" · ");
						return (
							<li key={r.id}>
								<button
									type="button"
									aria-pressed={r.checkedIn}
									disabled={locked}
									onClick={() => toggle(r.id, !r.checkedIn)}
									className="flex min-h-[60px] w-full items-center gap-3.5 rounded-[14px] border-[1.5px] border-surface bg-surface px-3.5 py-2 text-left text-ink disabled:cursor-default aria-pressed:border-amber aria-pressed:bg-raised-hover"
								>
									<span
										className={`inline-flex size-[30px] shrink-0 items-center justify-center rounded-[8px] ${r.checkedIn ? "bg-amber text-on-amber" : "border-2 border-line text-transparent"}`}
									>
										<svg
											aria-hidden="true"
											width="18"
											height="18"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth={3}
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<path d="M5 12l5 5 9-10" />
										</svg>
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="font-semibold text-[16px]">{r.name}</span>
										<span
											className={`text-[13px] ${zero ? "font-semibold text-danger" : "text-subtle"}`}
										>
											{sub}
										</span>
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}

			{guests.length > 0 ? (
				<p className="m-0 text-[14px] text-subtle">
					Also on the sheet as guests: {guests.join(", ")}. They have no
					account, so collect from them directly.
				</p>
			) : null}

			{locked ? null : (
				<div className="flex flex-col gap-2 border-line-soft border-t pt-4">
					<Button
						size="lg"
						variant={armed ? "destructive" : "default"}
						disabled={close.isPending || here.length === 0}
						onClick={() => (armed ? close.mutate({ gameId }) : setArmed(true))}
					>
						{armed
							? `Yes, close and charge ${here.length}`
							: `Close night · charge ${creditCount(here.length)}`}
					</Button>
					{armed ? (
						<Button variant="outline" size="sm" onClick={() => setArmed(false)}>
							Not yet
						</Button>
					) : null}
					<span className="text-center text-[13px] text-subtle">
						{broke === 0
							? "Everyone checked in has credits."
							: `${broke === 1 ? "1 checked-in player has" : `${broke} checked-in players have`} no credits left and will go below zero until they top up.`}
					</span>
				</div>
			)}
		</div>
	);
}
