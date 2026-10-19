import { createFileRoute } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import { rules } from "@/content/run";

export const Route = createFileRoute("/rules")({
	component: RulesPage,
});

function RulesPage() {
	return (
		<section className="pt-8 pb-12 md:pt-10">
			<PageTitle
				title="House rules"
				sub="A few things that keep every night safe and fun for everyone."
			/>
			{/* A real ordered list, so the numbering is read out once; the drawn
			    number is for the eye only. */}
			<ol className="m-0 mt-8 grid list-none grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4 p-0">
				{rules.map((rule, i) => (
					<li key={rule.title} className="panel flex flex-col gap-3">
						<span
							aria-hidden="true"
							className="display tnum text-[40px] text-amber leading-none"
						>
							{String(i + 1).padStart(2, "0")}
						</span>
						<h2 className="m-0 font-bold font-heading text-[22px] uppercase leading-tight tracking-[0.04em]">
							{rule.title}
						</h2>
						<p className="m-0 text-ink-soft">{rule.body}</p>
					</li>
				))}
			</ol>
		</section>
	);
}
