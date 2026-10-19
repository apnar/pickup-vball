import { isAdmin } from "@pickup-vball/api/run";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";

export const Route = createFileRoute("/_admin")({
	beforeLoad: ({ context, location }) => {
		if (!context.session) {
			throw redirect({ to: "/login", search: { redirect: location.href } });
		}
		if (!isAdmin(context.session.user)) {
			throw redirect({ to: "/" });
		}
		return { session: context.session };
	},
	component: AdminLayout,
});

const tabClass =
	"flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-field px-3 font-semibold text-subtle no-underline hover:bg-raised-hover hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink";

const TABS = [
	{ to: "/admin", label: "Nights", exact: true },
	{ to: "/admin/groups", label: "Groups" },
	{ to: "/admin/gyms", label: "Gyms" },
	{ to: "/admin/permits", label: "Permits" },
	{ to: "/admin/credits", label: "Give credits" },
	{ to: "/admin/ledger", label: "Credits ledger" },
	{ to: "/admin/users", label: "Players" },
	{ to: "/admin/email", label: "Email" },
	{ to: "/admin/cycle", label: "RSVP emails" },
] as const;

/**
 * A sidebar on a desktop, where admin work mostly happens, and a row of
 * scrolling tabs on a phone, where it has to fit above the content.
 */
function AdminLayout() {
	return (
		<div className="flex flex-col gap-6 pt-6 pb-12 lg:flex-row lg:gap-10 lg:pt-8">
			<aside className="lg:w-[220px] lg:shrink-0">
				<p className="display mb-3 hidden px-3 text-[22px] tracking-[0.06em] lg:block">
					<span className="text-amber">Admin</span>
				</p>
				<nav
					aria-label="Admin"
					className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
				>
					{TABS.map((t) => (
						<Link
							key={t.to}
							to={t.to}
							activeOptions={{ exact: "exact" in t }}
							className={tabClass}
						>
							{t.label}
						</Link>
					))}
				</nav>
			</aside>
			<div className="min-w-0 flex-1">
				<Outlet />
			</div>
		</div>
	);
}
