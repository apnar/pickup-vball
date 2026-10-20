import { createFileRoute, Link } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import { PRIVACY } from "@/content/run";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
});

/** Public, like /sms: the text-message registration links to it. */
function PrivacyPage() {
	return (
		<section className="pt-8 pb-12 md:pt-10">
			<PageTitle title="Privacy" sub="What the site keeps, and why." />
			<div className="panel mt-8 flex max-w-[68ch] flex-col gap-5">
				{PRIVACY.map((s) => (
					<div key={s.heading} className="flex flex-col gap-1.5">
						<h2 className="m-0 font-bold font-heading text-[20px] uppercase leading-tight tracking-[0.04em]">
							{s.heading}
						</h2>
						<p className="m-0 text-ink-soft">{s.body}</p>
					</div>
				))}
				<p className="m-0 text-ink-soft">
					How the texts work: <Link to="/sms">texts</Link>.
				</p>
			</div>
		</section>
	);
}
