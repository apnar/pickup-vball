import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import { initials } from "@/components/user-menu";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/roster")({
	component: RosterPage,
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.orpc.people.roster.queryOptions(),
		),
});

const pill = "rounded-full px-2 py-px font-semibold text-[12px]";

/**
 * Everybody in the group, most nights played first. It is the `user` table,
 * so the only things it can say about somebody are things the app actually
 * knows.
 */
function RosterPage() {
	const { data } = useQuery(orpc.people.roster.queryOptions());
	const people = data ?? [];

	return (
		<section className="pt-8 pb-12 md:pt-10">
			<PageTitle
				title="Roster"
				sub="Everyone in the group, with the most nights played first."
			/>
			{people.length === 0 ? (
				<p className="panel-outline mt-6 text-ink-soft">
					No one is on the roster yet.
				</p>
			) : (
				<ul className="m-0 mt-6 grid list-none grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-2 p-0">
					{people.map((p) => (
						<li
							key={p.id}
							className="flex items-center gap-3 rounded-field bg-surface-alt px-3 py-2.5"
						>
							<span
								aria-hidden="true"
								className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full font-bold text-[13px] ${
									p.isYou ? "bg-amber text-on-amber" : "bg-raised text-ink"
								}`}
							>
								{initials(p.name)}
							</span>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="flex min-w-0 items-center gap-1.5">
									<span className="truncate font-medium text-[15px]">
										{p.name}
									</span>
									{p.isYou ? (
										<span
											className={`${pill} shrink-0 bg-raised text-ink-soft`}
										>
											You
										</span>
									) : null}
								</span>
								<span className="truncate text-[13px] text-subtle">
									{p.games === 0
										? `No nights yet · joined ${p.since}`
										: `${p.games} ${p.games === 1 ? "night" : "nights"}${
												p.lastPlayed ? ` · last ${p.lastPlayed}` : ""
											}`}
								</span>
							</span>
							{/* No tag for an ordinary active player: that is the default,
							    and a grid of identical tags says nothing. Two tags means
							    somebody who runs the group is also sitting some out. */}
							{p.isAdmin || p.away ? (
								<span className="flex shrink-0 flex-col items-end gap-1">
									{p.isAdmin ? (
										<span className={`${pill} bg-raised text-ink-soft`}>
											Admin
										</span>
									) : null}
									{p.away ? (
										<span className={`${pill} bg-warn-bg text-warn`}>
											On a break
										</span>
									) : null}
								</span>
							) : null}
						</li>
					))}
				</ul>
			)}
			<p className="mt-4 max-w-[60ch] text-[14px] text-subtle">
				A night counts when you RSVP yourself in and stay in. Guests aren’t
				counted toward anyone. To bring someone new into the group, ask Viroj.
			</p>
		</section>
	);
}
