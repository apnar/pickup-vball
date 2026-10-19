import {
	CYCLE_NUMBERS,
	STAGE_COOLDOWN_MINUTES,
	STAGES,
} from "@pickup-vball/api/cycle";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/cycle")({
	component: AdminCyclePage,
});

const RUN_TZ = "America/New_York";

function when(value: string | null): string {
	if (!value) return "";
	return new Date(value).toLocaleString("en-US", {
		timeZone: RUN_TZ,
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

const pill = (tone: "ok" | "warn" | "danger" | "neutral" | "pending") =>
	`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold text-[13px] ${
		tone === "ok"
			? "bg-ok-bg text-ok"
			: tone === "warn"
				? "bg-warn-bg text-warn"
				: tone === "danger"
					? "bg-danger-bg text-danger"
					: tone === "neutral"
						? "bg-raised text-ink-soft"
						: "border-[1.5px] border-line text-subtle"
	}`;

/**
 * What the job does, rendered from the same constants the job reads. The
 * whole point of the page is that it cannot describe a schedule the code is
 * not keeping -- so nothing here is a hand-typed time or threshold.
 */
function AdminCyclePage() {
	const cycle = useQuery(orpc.mail.cycle.queryOptions());
	const games = cycle.data ?? [];

	return (
		<section>
			<PageTitle
				title="RSVP emails"
				sub="What the site sends for each night, and when. It checks every half hour and sends these on its own, so there is nothing to do by hand."
			/>

			<div className="mt-8">
				<SectionKicker>The schedule</SectionKicker>
				<ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4 p-0">
					{STAGES.map((stage) => (
						<li key={stage.key}>
							<Panel className="flex h-full flex-col gap-3.5">
								<div className="flex flex-col gap-1">
									<span className="kicker tnum">Step {stage.num}</span>
									<h3 className="m-0 text-[24px] leading-tight tracking-[0.02em]">
										{stage.title}
									</h3>
									<p className="m-0 font-bold font-heading text-[19px] text-amber tracking-[0.02em] first-letter:uppercase">
										{stage.when}
									</p>
								</div>
								<p className="m-0 text-ink-soft">{stage.says}</p>
								<div className="mt-auto flex flex-col gap-1 border-line-soft border-t pt-3">
									<span className="kicker">Who gets it</span>
									<span>{stage.who}</span>
									<span className="text-[14px] text-subtle">{stage.aside}</span>
								</div>
							</Panel>
						</li>
					))}
				</ol>
				<p className="mt-4 mb-0 max-w-[70ch] text-[14px] text-subtle">
					Times are the gym's local time, and daylight saving is handled
					automatically. Two RSVP emails about the same night never go out
					within {STAGE_COOLDOWN_MINUTES} minutes of each other, except the
					verdict, which is never held back.
				</p>
			</div>

			<div className="mt-10">
				<SectionKicker>The numbers</SectionKicker>
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
					{CYCLE_NUMBERS.map((n) => (
						<Panel key={n.label} className="flex flex-col gap-2">
							<span className="display tnum text-[56px] text-amber">
								{n.value}
							</span>
							<h3 className="m-0 text-[22px] leading-tight tracking-[0.02em]">
								{n.label}
							</h3>
							<p className="m-0 text-[15px] text-ink-soft">{n.body}</p>
						</Panel>
					))}
				</div>
				<p className="mt-4 mb-0 max-w-[70ch] text-[14px] text-subtle">
					A maybe does not count toward any of these numbers. It only decides
					who gets the last call.
				</p>
			</div>

			<div className="mt-10">
				<SectionKicker>Upcoming nights</SectionKicker>
				{games.length === 0 ? (
					<p className="m-0 text-subtle">
						No nights booked, so there is nothing scheduled to send.
					</p>
				) : (
					<ul className="m-0 flex list-none flex-col gap-4 p-0">
						{games.map((g) => (
							<li key={g.gameId}>
								<Panel className="flex flex-col gap-3.5">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="flex min-w-0 flex-col gap-1">
											<span className="display text-[28px]">{g.dateLabel}</span>
											<span className="text-[14px] text-subtle">
												{g.timeLabel} · {g.gym}
											</span>
										</div>
										<span
											className={pill(
												g.status === "confirmed"
													? "ok"
													: g.status === "canceled"
														? "danger"
														: "neutral",
											)}
										>
											{g.status === "confirmed"
												? "On"
												: g.status === "canceled"
													? "Off"
													: "Not decided yet"}
										</span>
									</div>
									<div className="tnum flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-subtle">
										<span>
											<strong className="font-extrabold font-heading text-[22px] text-amber">
												{g.counts.in}
											</strong>{" "}
											in
										</span>
										<span>
											<strong className="font-extrabold font-heading text-[22px] text-ink">
												{g.counts.maybe}
											</strong>{" "}
											maybe
										</span>
										<span>
											<strong className="font-extrabold font-heading text-[22px] text-subtle">
												{g.counts.silent}
											</strong>{" "}
											no reply
										</span>
									</div>
									<div className="flex flex-wrap gap-2 border-line-soft border-t pt-3.5">
										{g.stages.map((stage) => (
											<span
												key={stage.key}
												className={pill(
													stage.failed > 0
														? "warn"
														: stage.sentAt
															? "ok"
															: stage.doneAt
																? "neutral"
																: "pending",
												)}
											>
												{stage.num} {stage.title}
												{stage.sentAt
													? ` · ${when(stage.sentAt)}`
													: stage.doneAt
														? " · skipped"
														: " · waiting"}
												{stage.failed > 0 ? ` · ${stage.failed} failed` : ""}
											</span>
										))}
									</div>
								</Panel>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
