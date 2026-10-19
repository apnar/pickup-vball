import { isAdmin } from "@pickup-vball/api/run";
import { Link, useRouteContext } from "@tanstack/react-router";

import { SITE_NAME } from "@/content/run";

import UserMenu from "./user-menu";

const linkClass =
	"flex min-h-11 items-center rounded-field px-3.5 font-semibold text-subtle no-underline hover:bg-raised-hover hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink";

/**
 * The top bar. On a phone it is the name and the account menu only; the
 * places a player goes most move to the tab bar along the bottom
 * (`<TabBar>`), within reach of a thumb.
 */
export default function Header() {
	// From the root route's context: no extra fetch, no skeleton flash, and
	// the server renders the same nav the browser will.
	const { session } = useRouteContext({ from: "__root__" });

	return (
		<header className="border-line-soft border-b bg-deep">
			<div className="mx-auto flex min-h-16 w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-2 md:min-h-[68px] md:px-[clamp(16px,4vw,40px)]">
				<div className="flex flex-wrap items-center gap-x-7 gap-y-1">
					<Link
						to="/"
						className="display text-[22px] text-ink tracking-[0.06em] no-underline hover:text-ink"
					>
						{SITE_NAME}
					</Link>
					<nav aria-label="Main" className="hidden gap-1 md:flex">
						{session ? (
							<>
								<Link
									to="/"
									activeOptions={{ exact: true }}
									className={linkClass}
								>
									This week
								</Link>
								<Link to="/schedule" className={linkClass}>
									Schedule
								</Link>
								<Link to="/roster" className={linkClass}>
									Roster
								</Link>
							</>
						) : null}
						<Link to="/rules" className={linkClass}>
							Rules
						</Link>
						{session && isAdmin(session.user) ? (
							<Link to="/admin" className={linkClass}>
								Admin
							</Link>
						) : null}
					</nav>
				</div>
				<div className="flex items-center gap-1">
					{/* Signed out, Rules has no tab bar to live in on a phone. */}
					{session ? null : (
						<Link to="/rules" className={`${linkClass} md:hidden`}>
							Rules
						</Link>
					)}
					<UserMenu />
				</div>
			</div>
		</header>
	);
}

const tabClass =
	"flex min-h-[52px] flex-col items-center justify-center gap-1 font-semibold text-[12px] text-subtle no-underline hover:text-ink aria-[current=page]:text-amber";

const icon = {
	width: 22,
	height: 22,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

/**
 * The phone's main navigation, pinned to the bottom of the screen. Players
 * only: a stranger has one page worth visiting and a sign-in link.
 */
export function TabBar() {
	const { session } = useRouteContext({ from: "__root__" });
	if (!session) return null;
	const admin = isAdmin(session.user);

	return (
		<nav
			aria-label="Main"
			className={`sticky bottom-0 z-40 grid border-line-soft border-t bg-deep px-2 pt-1.5 pb-[max(14px,env(safe-area-inset-bottom))] md:hidden ${admin ? "grid-cols-5" : "grid-cols-4"}`}
		>
			<Link to="/" activeOptions={{ exact: true }} className={tabClass}>
				<svg {...icon} aria-hidden="true">
					<rect x="3" y="5" width="18" height="16" rx="2" />
					<path d="M3 10h18M8 3v4M16 3v4" />
				</svg>
				This week
			</Link>
			<Link to="/schedule" className={tabClass}>
				<svg {...icon} aria-hidden="true">
					<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
				</svg>
				Schedule
			</Link>
			<Link to="/roster" className={tabClass}>
				<svg {...icon} aria-hidden="true">
					<circle cx="9" cy="8" r="3.5" />
					<path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5" />
					<path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.2 3.5 5" />
				</svg>
				Roster
			</Link>
			{admin ? (
				<Link to="/admin" className={tabClass}>
					<svg {...icon} aria-hidden="true">
						<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
					</svg>
					Admin
				</Link>
			) : null}
			<Link to="/dashboard" className={tabClass}>
				<svg {...icon} aria-hidden="true">
					<circle cx="12" cy="8" r="4" />
					<path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
				</svg>
				Account
			</Link>
		</nav>
	);
}
