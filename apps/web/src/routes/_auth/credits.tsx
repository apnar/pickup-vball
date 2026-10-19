import { signed } from "@pickup-vball/api/credits";
import { Button } from "@pickup-vball/ui/components/button";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import BallMark from "@/components/ball-mark";
import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { PAYMENT } from "@/content/run";
import { balanceLine, balanceTone, entryWhen } from "@/lib/credits";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/credits")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(orpc.credits.mine.queryOptions()),
	component: CreditsPage,
});

/**
 * Your balance, how to top it up, and every change to it. Reads only: the
 * receipt email links here, and nothing a player can do on this page moves
 * a credit -- an admin adds them once the money arrives.
 */
function CreditsPage() {
	const mine = useQuery(orpc.credits.mine.queryOptions());
	const [copied, setCopied] = useState(false);
	const balance = mine.data?.balance ?? 0;
	const entries = mine.data?.entries ?? [];

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(PAYMENT.handle);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error(`Couldn’t copy. The handle is ${PAYMENT.handle}.`);
		}
	};

	return (
		<section className="flex flex-col gap-6 pt-8 pb-12 md:pt-10">
			<PageTitle title="Credits" />

			<div className="grid items-start gap-6 lg:grid-cols-2">
				<div className="flex flex-col gap-4">
					<Panel className="relative flex flex-col gap-1 overflow-hidden">
						<BallMark />
						<span className="kicker relative">Balance</span>
						<span
							className={`display tnum relative text-[96px] leading-[0.9] ${balanceTone(balance)}`}
						>
							{mine.isPending ? "–" : balance}
						</span>
						<span className="relative max-w-[40ch] text-[15px] text-ink-soft">
							{mine.isPending ? "Loading…" : balanceLine(balance, "you")}
						</span>
					</Panel>

					<Panel variant="outline" className="flex flex-col gap-3">
						<SectionKicker className="m-0">Getting more credits</SectionKicker>
						<ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px] leading-snug">
							<li className="flex gap-3">
								<span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-raised font-bold text-[13px]">
									1
								</span>
								{`Venmo Viroj $${PAYMENT.perNight} per credit ($${PAYMENT.perNight * 10} = 10 nights), or pay cash at the gym.`}
							</li>
							<li className="flex gap-3">
								<span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-raised font-bold text-[13px]">
									2
								</span>
								An admin adds the credits to your account, usually the same day,
								and you get an email when they do.
							</li>
						</ol>
						<div className="flex items-center justify-between gap-3 rounded-btn bg-surface px-3 py-2.5">
							<span className="flex min-w-0 flex-col">
								<span className="font-semibold">Viroj on Venmo</span>
								<span className="text-[14px] text-subtle">
									{PAYMENT.handle}
								</span>
							</span>
							<Button variant="outline" size="sm" onClick={copy}>
								<span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
							</Button>
						</div>
					</Panel>
				</div>

				<section aria-labelledby="hist-h" className="flex flex-col gap-3">
					<SectionKicker id="hist-h" className="m-0">
						History
					</SectionKicker>
					{entries.length === 0 ? (
						<p className="m-0 text-subtle">
							{mine.isPending
								? "Loading…"
								: "Nothing yet. Credits you buy and nights you play show up here."}
						</p>
					) : (
						<ul className="m-0 list-none overflow-hidden rounded-card bg-surface p-0">
							{entries.map((e) => (
								<li
									key={e.id}
									className="flex items-center justify-between gap-3 border-raised border-b px-4 py-3 last:border-b-0"
								>
									<span className="flex min-w-0 flex-col">
										<span className="font-semibold text-[15px]">{e.what}</span>
										<span className="text-[13px] text-subtle">
											{entryWhen(e.createdAt)}
											{e.reason === "played" ? "" : ` · ${e.by}`}
										</span>
									</span>
									<span
										className={`display tnum shrink-0 text-[22px] ${e.delta > 0 ? "text-amber" : "text-subtle"}`}
									>
										{signed(e.delta)}
									</span>
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</section>
	);
}
