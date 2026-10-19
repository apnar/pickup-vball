import { Link } from "@tanstack/react-router";

import GymMoneyNotice from "@/components/gym-money-notice";
import PageTitle from "@/components/page-title";
import RsvpBoard from "@/components/rsvp-board";
import SectionKicker from "@/components/section-kicker";
import { conditions } from "@/content/run";

/** What a player sees: the next night, who is coming, and how it all works. */
export default function PlayerHome() {
	return (
		<section className="flex flex-col gap-6 pt-8 pb-12 md:pt-10">
			<PageTitle
				size="hero"
				title="This week"
				sub="The next night on the schedule, and who’s coming."
			/>

			<GymMoneyNotice />
			<RsvpBoard />

			<section aria-labelledby="how-h" className="mt-6 flex flex-col gap-4">
				<SectionKicker id="how-h" className="m-0">
					How it works
				</SectionKicker>
				<dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
					{conditions.map((c) => (
						<div
							key={c.prop}
							className="flex flex-col gap-1 rounded-card bg-surface p-4"
						>
							<dt className="kicker">{c.prop}</dt>
							<dd className="m-0 flex flex-col gap-1">
								<span className="font-bold font-heading text-[22px] uppercase leading-tight tracking-[0.02em]">
									{c.val}
								</span>
								<span className="text-[14px] text-subtle">{c.rem}</span>
							</dd>
						</div>
					))}
				</dl>
				<p className="m-0 text-[14px] text-subtle">
					New to the group? Read the <Link to="/rules">house rules</Link>.
				</p>
			</section>
		</section>
	);
}
