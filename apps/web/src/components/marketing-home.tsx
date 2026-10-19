import { buttonVariants } from "@pickup-vball/ui/components/button";
import { Link } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { conditions, SITE_AREA } from "@/content/run";

/**
 * What a stranger sees. What the group is and how to join, but not the gym,
 * not the start time, not who is coming. Those are for people in the group.
 */

/**
 * The standing facts, minus the two that would tell a stranger where and
 * when to turn up: the time and the named gyms become one vague "Where".
 */
const publicConditions = [
	conditions.find((c) => c.prop === "Nights"),
	{
		prop: "Where",
		val: SITE_AREA,
		rem: "School gyms around the county. Players see the address for each night.",
	},
	conditions.find((c) => c.prop === "Format"),
	conditions.find((c) => c.prop === "Cost"),
]
	.filter((c) => c !== undefined)
	.map((c) =>
		// The cost line names the payment handle. That is for players.
		c.prop === "Cost" ? { ...c, rem: "Paid for each night you play." } : c,
	);

const howToJoin = [
	{
		title: "It’s invite only",
		body: "New players are added by Viroj. There is no sign-up form.",
	},
	{
		title: "Know someone who plays?",
		body: "Ask them to introduce you to Viroj.",
	},
	{
		title: "Already in the group?",
		body: "Every email from us has a link that signs you in. You can also sign in with your email address.",
	},
];

export default function MarketingHome() {
	return (
		<>
			<section className="pt-8 pb-10 md:pt-10">
				<PageTitle
					size="hero"
					title="Pickup volleyball, most weeknights."
					sub={`An invite-only indoor volleyball group in ${SITE_AREA}. Players sign in to see the schedule and RSVP for each night.`}
				/>
				<div className="mt-6 flex flex-wrap gap-2.5">
					<Link
						to="/login"
						className={buttonVariants({ className: "no-underline" })}
					>
						Sign in
					</Link>
					<Link
						to="/rules"
						className={buttonVariants({
							variant: "outline",
							className: "no-underline",
						})}
					>
						House rules
					</Link>
				</div>
			</section>

			<section className="pb-10" aria-labelledby="about-h">
				<SectionKicker id="about-h">About the nights</SectionKicker>
				<dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
					{publicConditions.map((c) => (
						<div key={c.prop} className="panel flex flex-col gap-1.5">
							<dt className="kicker">{c.prop}</dt>
							<dd className="m-0 flex flex-col gap-1.5">
								<span className="display text-[28px] leading-none">
									{c.val}
								</span>
								<span className="text-[14px] text-subtle">{c.rem}</span>
							</dd>
						</div>
					))}
				</dl>
			</section>

			<section className="pb-12" aria-labelledby="join-h">
				<SectionKicker id="join-h">How to join</SectionKicker>
				<ol className="panel-outline m-0 flex list-none flex-col gap-4">
					{howToJoin.map((step, i) => (
						<li key={step.title} className="flex gap-3">
							<span
								aria-hidden="true"
								className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-raised font-bold text-[13px]"
							>
								{i + 1}
							</span>
							<span className="flex flex-col gap-0.5">
								<span className="font-semibold">{step.title}</span>
								<span className="text-ink-soft">{step.body}</span>
							</span>
						</li>
					))}
				</ol>
			</section>
		</>
	);
}
