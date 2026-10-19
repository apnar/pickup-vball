import { CAPACITY } from "@pickup-vball/api/run";
import { buttonVariants } from "@pickup-vball/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/schedule")({
	component: SchedulePage,
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(context.orpc.games.list.queryOptions()),
});

type Game = Awaited<
	ReturnType<typeof orpc.games.list.call>
>["upcoming"][number];

/**
 * The permit is on the page so a player can show it at the front desk if
 * the gym staff ask. The URL carries no token, so it is safe to open here.
 */
function PermitLink({ game }: { game: Game }) {
	if (!game.permit) return null;
	return (
		<a
			href={`/api/permits/${game.permit.id}/file`}
			target="_blank"
			rel="noreferrer"
			className={buttonVariants({
				variant: "outline",
				size: "sm",
				className: "no-underline",
			})}
		>
			Permit (PDF)
			<span className="sr-only"> for {game.dateLabel}</span>
		</a>
	);
}

/** One upcoming night: when, where, how many are in, and the way to RSVP. */
function NightCard({ game }: { game: Game }) {
	const fill = Math.min(100, Math.round((game.inCount / CAPACITY) * 100));
	return (
		<li className="panel flex flex-col gap-3.5">
			<div className="flex flex-col gap-1">
				<span className="font-semibold text-[14px] text-amber uppercase tracking-[0.12em]">
					{game.dateLabel}
				</span>
				<span className="display tnum text-[34px]">{game.timeLabel}</span>
			</div>
			<div className="flex flex-col gap-0.5">
				<span className="font-semibold">{game.gym.name}</span>
				{game.gym.address ? (
					<span className="text-[14px] text-subtle">{game.gym.address}</span>
				) : null}
				{game.gym.notes ? (
					<span className="text-[14px] text-subtle">{game.gym.notes}</span>
				) : null}
				{game.notes ? (
					<span className="text-[14px] text-ink-soft">{game.notes}</span>
				) : null}
			</div>
			<div className="flex flex-col gap-2">
				<span className="tnum text-[14px] text-subtle">
					<span className="font-semibold text-ink">{game.inCount}</span> /{" "}
					{CAPACITY} in
				</span>
				<div className="meter" aria-hidden="true">
					<span style={{ width: `${fill}%` }} />
				</div>
			</div>
			<div className="mt-auto flex flex-wrap gap-2 pt-1">
				<Link
					to="/rsvp/$gameId"
					params={{ gameId: game.id }}
					className={buttonVariants({
						size: "sm",
						className: "flex-1 no-underline",
					})}
				>
					RSVP
					<span className="sr-only"> for {game.dateLabel}</span>
				</Link>
				<PermitLink game={game} />
			</div>
			{game.permit ? null : (
				<span className="text-[13px] text-subtle">No permit on file yet.</span>
			)}
		</li>
	);
}

function SchedulePage() {
	const { data } = useQuery(orpc.games.list.queryOptions());
	const upcoming = data?.upcoming ?? [];
	const past = data?.past ?? [];

	return (
		<section className="pt-8 pb-12 md:pt-10">
			<PageTitle
				title="Schedule"
				sub="Every night with a gym booked. Open one to RSVP."
			/>
			<div className="mt-8">
				<SectionKicker>Coming up</SectionKicker>
				{upcoming.length === 0 ? (
					<p className="panel-outline m-0 text-ink-soft">
						No nights are booked right now. When a gym is booked, it will show
						up here and you’ll get an email.
					</p>
				) : (
					<ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4 p-0">
						{upcoming.map((g) => (
							<NightCard key={g.id} game={g} />
						))}
					</ul>
				)}
			</div>
			{past.length > 0 ? (
				<div className="mt-10">
					<SectionKicker>Recent nights</SectionKicker>
					<ul className="m-0 list-none overflow-hidden rounded-card bg-surface p-0">
						{past.map((g) => (
							<li
								key={g.id}
								className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-raised border-t px-4 py-3 first:border-t-0"
							>
								<span className="flex min-w-0 flex-col">
									<span className="font-semibold">{g.dateLabel}</span>
									<span className="text-[14px] text-subtle">
										{g.timeLabel} · {g.gym.name}
									</span>
								</span>
								<span className="flex items-center gap-3">
									<span className="tnum text-[14px] text-subtle">
										{g.inCount} in
									</span>
									<PermitLink game={g} />
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}
