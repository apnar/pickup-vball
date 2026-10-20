import { Toaster } from "@pickup-vball/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { SITE_AREA, SITE_NAME } from "@/content/run";
import { getUser } from "@/functions/get-user";
import type { orpc } from "@/utils/orpc";

import Header, { TabBar } from "../components/header";

import appCss from "../index.css?url";
export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	/**
	 * Every page needs to know whether it is talking to a player or a
	 * stranger, so the session is read once here and flows down as context.
	 * Runs on each client navigation: one server-function round trip, and no
	 * D1 read while the five-minute cookie cache holds.
	 */
	beforeLoad: async () => ({ session: await getUser() }),

	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{ name: "theme-color", content: "#0A111D" },
			{
				title: SITE_NAME,
			},
			{
				name: "description",
				content:
					"Invite-only pickup volleyball in Montgomery County, MD. RSVP for this week's nights.",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			// An amber ball on navy. SVG for browsers that take it, the .ico for
			// the ones that do not (Safari among them), and the 180px PNG for a
			// home screen.
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
			{ rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	const { session } = Route.useRouteContext();

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<div className="flex min-h-svh flex-col">
					<Header />
					<div className="mx-auto w-full max-w-[1200px] flex-1 px-5 md:px-[clamp(16px,4vw,40px)]">
						<main>
							<Outlet />
						</main>
					</div>
					<footer className="mx-auto flex w-full max-w-[1200px] flex-wrap justify-between gap-2 px-5 pt-10 pb-8 text-[13px] text-subtle leading-6 md:px-[clamp(16px,4vw,40px)]">
						<span>
							{SITE_NAME} · {SITE_AREA} · <Link to="/sms">Texts</Link> ·{" "}
							<Link to="/privacy">Privacy</Link>
						</span>
						{session ? (
							<Link to="/rules" className="md:hidden">
								House rules
							</Link>
						) : (
							<span>
								Already in the group? <Link to="/login">Sign in</Link>.
							</span>
						)}
					</footer>
					<TabBar />
				</div>
				<Toaster richColors />
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
}
