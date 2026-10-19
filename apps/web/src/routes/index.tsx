import { createFileRoute } from "@tanstack/react-router";

import MarketingHome from "@/components/marketing-home";
import PlayerHome from "@/components/player-home";
import { nextHeadcountOptions } from "@/hooks/use-rsvps";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
	component: HomeComponent,
	// Strangers get no headcount and have no balance, so there is nothing to
	// prefetch for them. Players get both, so the credit notice is in the
	// first paint rather than popping in under the hero.
	loader: ({ context }) =>
		context.session
			? Promise.all([
					context.queryClient.ensureQueryData(nextHeadcountOptions()),
					context.queryClient.ensureQueryData(orpc.credits.mine.queryOptions()),
				])
			: null,
});

function HomeComponent() {
	const { session } = Route.useRouteContext();
	return session ? <PlayerHome /> : <MarketingHome />;
}
