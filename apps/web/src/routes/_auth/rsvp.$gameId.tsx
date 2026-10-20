import { Button, buttonVariants } from "@pickup-vball/ui/components/button";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { dateParts, GameFacts } from "@/components/game-facts";
import PageTitle from "@/components/page-title";
import { ResponsePicker } from "@/components/response-picker";
import { awayLine, inLabelFor, Roster } from "@/components/rsvp-board";
import { RsvpStatus } from "@/components/rsvp-status";
import { headcountOptions, useRsvps } from "@/hooks/use-rsvps";
import type { RowResponse, RsvpAnswer } from "@/lib/rsvp";

/**
 * Where every button in every cycle email lands, and the detail page for a
 * night.
 *
 * It reads. It does not write. Mail clients fetch link targets on their own,
 * and acting on a bare GET once quietly unsubscribed people who had never
 * clicked anything -- see `apps/web/src/server/unsubscribe.ts`. So the link
 * carries the answer, the page shows it, and a person taps once to record
 * it. The mutation is a POST that only an onClick fires; nothing in
 * `beforeLoad`, the loader or render touches the database.
 */
export const Route = createFileRoute("/_auth/rsvp/$gameId")({
	// `.catch` rather than a hard failure: mail clients rewrite URLs, and a
	// mangled answer should show the picker, not an error page.
	validateSearch: z.object({
		a: z.enum(["in", "maybe", "out"]).optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ a: search.a }),
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(headcountOptions(params.gameId)),
	head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
	component: RsvpConfirmPage,
});

const DONE: Record<RowResponse, string> = {
	in: "You’re in. See you there.",
	waitlist: "You’re on the waitlist.",
	maybe: "Saved as maybe.",
	out: "You’re out. Thanks for letting us know.",
};

/**
 * The button says "Save", not the answer again. When it repeated the answer
 * under a highlighted cell with the same words, people took it for a label
 * of what they had already done and left with nothing recorded.
 */
const CONFIRM: Record<RsvpAnswer, string> = {
	in: "Save: I’m in",
	maybe: "Save: maybe",
	out: "Save: I’m out",
};

function RsvpConfirmPage() {
	const { gameId } = Route.useParams();
	const { a } = Route.useSearch();
	const { data } = useQuery(headcountOptions(gameId));
	const { headcount, isPending, respond, comeBack, backPending } =
		useRsvps(gameId);
	const [picked, setPicked] = useState<RsvpAnswer | null>(a ?? null);
	const [done, setDone] = useState<RowResponse | null>(null);

	const state = headcount ?? data ?? null;

	if (!state) {
		return (
			<section className="flex flex-col items-start gap-6 pt-8 pb-12 md:pt-10">
				<PageTitle
					title="Night not found"
					sub="It may have been moved or cancelled. Nothing was recorded."
				/>
				<Link to="/schedule" className={buttonVariants()}>
					See the schedule
				</Link>
			</section>
		);
	}

	const { game, viewer, me, rsvps, myPlace, full } = state;
	const away = viewer?.status === "suspended";
	const locked = game.status === "canceled" || Boolean(game.decidedAt);
	const mine = me ? (rsvps.find((r) => r.id === me)?.response ?? null) : null;
	const d = dateParts(game.date);

	return (
		<section className="flex flex-col gap-8 pt-6 pb-12 md:pt-10">
			<div className="flex flex-col gap-3">
				<Link
					to="/"
					className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 px-2 font-semibold text-ink no-underline hover:text-ink"
				>
					<svg
						aria-hidden="true"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M15 5l-7 7 7 7" />
					</svg>
					This week
				</Link>
				<span className="font-semibold text-[14px] text-amber tracking-[0.12em]">
					{d.long}
				</span>
				<PageTitle
					title={
						done
							? DONE[done]
							: game.status === "canceled"
								? "Called off"
								: locked
									? "Answers are closed"
									: "Are you in?"
					}
				/>
			</div>

			<div className="flex flex-wrap items-start gap-8">
				<div className="flex min-w-0 flex-[999_1_480px] flex-col gap-6">
					<Panel className="flex flex-col gap-4">
						{locked ? (
							<p className="m-0 text-ink-soft">
								{game.status === "canceled"
									? "This night was called off, so there is nothing to answer."
									: "Answers for this night are closed. Teams are made from whoever is in."}
							</p>
						) : away ? (
							<div className="flex flex-col items-start gap-3 rounded-btn bg-warn-bg p-4 text-warn">
								<p className="m-0 text-[15px]">
									{awayLine(viewer)} Come back first and then your answer will
									count.
								</p>
								<Button
									size="sm"
									disabled={backPending}
									onClick={() => comeBack()}
								>
									I’m back
								</Button>
							</div>
						) : done ? (
							<div className="flex flex-wrap gap-2.5">
								<Link to="/" hash="rsvp" className={buttonVariants()}>
									See this week
								</Link>
								<Button variant="outline" onClick={() => setDone(null)}>
									Change it
								</Button>
							</div>
						) : (
							<>
								<ResponsePicker
									name="confirm-answer"
									legend={
										mine === "waitlist"
											? `You’re number ${myPlace ?? "?"} on the waitlist. Change it?`
											: mine
												? `Your answer is ${mine}. Change it?`
												: full
													? "The night is full. In joins the waitlist."
													: "Pick your answer"
									}
									value={picked}
									disabled={isPending}
									onPick={setPicked}
									pending
									inLabel={inLabelFor(mine, myPlace, full)}
								/>
								<Button
									size="lg"
									className="w-full"
									disabled={isPending || !picked}
									onClick={async () => {
										if (!picked) return;
										try {
											const result = await respond(picked);
											setDone(result?.myPlace ? "waitlist" : picked);
										} catch {
											// The toast already said so.
										}
									}}
								>
									{picked === "in" && full && mine !== "in"
										? mine === "waitlist"
											? "Save: stay on the waitlist"
											: "Save: join the waitlist"
										: picked
											? CONFIRM[picked]
											: "Pick an answer first"}
								</Button>
								<p className="m-0 text-[14px] text-subtle">
									Your answer is saved when you tap the button. Mail apps open
									links on their own, so the link alone doesn’t change anything.
								</p>
							</>
						)}
					</Panel>

					<Panel>
						<RsvpStatus headcount={state} />
					</Panel>

					<Roster headcount={state} locked={locked} isPending={isPending} />
				</div>

				<aside
					aria-label="Night details"
					className="flex min-w-0 flex-[1_1_280px] flex-col gap-4"
				>
					<GameFacts game={game} />
				</aside>
			</div>
		</section>
	);
}
