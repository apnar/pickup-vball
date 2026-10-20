import { createFileRoute, Link } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import { TEXTS } from "@/content/run";

export const Route = createFileRoute("/sms")({
	component: SmsPage,
});

/**
 * The text-message program, public on purpose: a carrier registering our
 * number reads this page to see who we text, about what, and how somebody
 * opted in. Nothing here is behind a sign-in, and nothing here is secret.
 */
function SmsPage() {
	return (
		<section className="pt-8 pb-12 md:pt-10">
			<PageTitle
				title="Texts"
				sub="How the group's text messages work, and how to stop them."
			/>
			<div className="panel mt-8 flex max-w-[68ch] flex-col gap-4">
				{TEXTS.program.map((p) => (
					<p key={p} className="m-0 text-ink-soft">
						{p}
					</p>
				))}
				<div className="flex flex-col gap-1 border-raised border-t pt-4">
					<span className="kicker">
						What you agree to when you add a number
					</span>
					<p className="m-0 text-ink-soft">“{TEXTS.consent}”</p>
				</div>
				<p className="m-0 text-ink-soft">
					{TEXTS.help} See also the <Link to="/privacy">privacy policy</Link>.
				</p>
			</div>
		</section>
	);
}
