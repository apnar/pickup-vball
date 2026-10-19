import { Button } from "@pickup-vball/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@pickup-vball/ui/components/dropdown-menu";
import {
	Link,
	useNavigate,
	useRouteContext,
	useRouter,
} from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

/**
 * The account menu, and only that. Everywhere you can go lives in the nav
 * beside it, so this holds the two things that are not places -- who you are
 * signed in as, and the way out -- plus the one page that is nobody else's
 * business.
 *
 * The address is a label rather than an item: it is the answer to "which
 * account is this", which matters when people get in from links mailed to
 * two different addresses, and it was never something you could click.
 */
/** "Viroj Suteerawongsa" -> "VS", for an avatar. */
export function initials(name: string): string {
	// Letters only: "Sam (guest)" is SG, not S(.
	const parts = name
		.split(/\s+/)
		.map((w) => w.match(/\p{L}/u)?.[0] ?? "")
		.filter(Boolean);
	const first = parts[0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
	return (first + last).toUpperCase() || "?";
}

export default function UserMenu() {
	const navigate = useNavigate();
	const router = useRouter();
	const { session } = useRouteContext({ from: "__root__" });

	if (!session) {
		return (
			<Link
				to="/login"
				className="flex min-h-11 items-center rounded-field px-3.5 font-semibold text-ink no-underline hover:bg-raised-hover hover:text-ink"
			>
				Sign in
			</Link>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						className="gap-2 rounded-full px-1.5 text-ink hover:text-ink md:pr-3.5"
					/>
				}
			>
				<span
					aria-hidden="true"
					className="inline-flex size-8 items-center justify-center rounded-full bg-amber font-bold text-[13px] text-on-amber"
				>
					{initials(session.user.name)}
				</span>
				<span className="sr-only md:not-sr-only">{session.user.name}</span>
			</DropdownMenuTrigger>
			{/* The popup takes the trigger's width by default, and the trigger is
			    a short name. An address needs more room than that. */}
			<DropdownMenuContent align="end" className="w-auto min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="px-2 pt-2 pb-1.5">
						<span className="kicker block text-[11px]">Signed in as</span>
						<span className="mt-1 block break-all text-ink text-xs">
							{session.user.email}
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						render={<Link to="/dashboard" className="no-underline" />}
					>
						Your account
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onClick={() => {
							authClient.signOut({
								fetchOptions: {
									onSuccess: async () => {
										// The session came from the root route; make the
										// router go and notice it is gone.
										await router.invalidate();
										navigate({ to: "/" });
									},
								},
							});
						}}
					>
						Sign out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
