import { Button, buttonVariants } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { BreakForm, describeBreak } from "@/components/break-form";
import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { initials } from "@/components/user-menu";
import { authClient } from "@/lib/auth-client";
import { balanceLine, balanceTone } from "@/lib/credits";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
	component: RouteComponent,
});

const pill = "rounded-full px-2.5 py-0.5 font-semibold text-[13px]";

/**
 * Passwords are optional here. Most people get in from the links we email
 * them; a password is for anyone who would rather type one.
 */
function PasswordPanel() {
	const queryClient = useQueryClient();
	const has = useQuery(orpc.account.hasPassword.queryOptions());
	const [open, setOpen] = useState(false);
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [busy, setBusy] = useState(false);

	const hasPassword = has.data?.hasPassword ?? false;

	const setPassword = useMutation(
		orpc.account.setPassword.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.account.key() });
				setOpen(false);
				setNext("");
				toast.success("Password set. The links in our emails still work too.");
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	const change = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		const result = await authClient.changePassword({
			currentPassword: current,
			newPassword: next,
		});
		setBusy(false);
		if (result.error) {
			toast.error(result.error.message || "That didn’t work. Try again.");
			return;
		}
		setOpen(false);
		setCurrent("");
		setNext("");
		toast.success("Password changed.");
	};

	return (
		<Panel className="flex flex-col gap-3.5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="m-0 text-ink-soft">
					{has.isLoading
						? "Checking..."
						: hasPassword
							? "You have a password. The links in our emails also sign you in."
							: "No password set. The links in our emails sign you in."}
				</p>
				{has.isLoading ? null : (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setOpen((v) => !v)}
					>
						{open
							? "Cancel"
							: hasPassword
								? "Change password"
								: "Set a password"}
					</Button>
				)}
			</div>
			{open ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={
						hasPassword
							? change
							: (e) => {
									e.preventDefault();
									setPassword.mutate({ newPassword: next });
								}
					}
				>
					{hasPassword ? (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="current-password">Current password</Label>
							<Input
								id="current-password"
								type="password"
								required
								autoComplete="current-password"
								value={current}
								onChange={(e) => setCurrent(e.target.value)}
							/>
						</div>
					) : null}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="new-password">New password</Label>
						<Input
							id="new-password"
							type="password"
							required
							minLength={8}
							autoComplete="new-password"
							value={next}
							onChange={(e) => setNext(e.target.value)}
						/>
					</div>
					<Button
						type="submit"
						size="sm"
						className="self-start"
						disabled={busy || setPassword.isPending}
					>
						Save password
					</Button>
				</form>
			) : null}
		</Panel>
	);
}

/** Where your balance stands, with the way to the full history. */
function CreditsPanel() {
	const mine = useQuery(orpc.credits.mine.queryOptions());
	const balance = mine.data?.balance ?? 0;
	return (
		<Panel className="flex flex-wrap items-center justify-between gap-4">
			<div className="flex items-center gap-4">
				<span
					className={`display tnum text-[56px] leading-[0.9] ${balanceTone(balance)}`}
				>
					{mine.isPending ? "–" : balance}
				</span>
				<span className="max-w-[28ch] text-[15px] text-ink-soft">
					{mine.isPending ? "Loading…" : balanceLine(balance, "you")}
				</span>
			</div>
			<Link
				to="/credits"
				className={buttonVariants({ variant: "outline", size: "sm" })}
			>
				History and how to pay
			</Link>
		</Panel>
	);
}

function RouteComponent() {
	const { session } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const router = useRouter();
	const me = useQuery(orpc.people.me.queryOptions());
	const [taking, setTaking] = useState(false);
	const [resent, setResent] = useState(false);

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
		queryClient.invalidateQueries({ queryKey: orpc.rsvp.key() });
	};
	const onError = (error: Error) => toast.error(error.message);

	const takeBreak = useMutation(
		orpc.people.suspend.mutationOptions({
			onSuccess: () => {
				setTaking(false);
				refresh();
				toast.success("Your break is set. See you when you’re back.");
			},
			onError,
		}),
	);
	const comeBack = useMutation(
		orpc.people.unsuspend.mutationOptions({
			onSuccess: () => {
				refresh();
				toast.success("Welcome back. You’ll get emails about nights again.");
			},
			onError,
		}),
	);

	const resend = async () => {
		if (!session) return;
		const result = await authClient.sendVerificationEmail({
			email: session.user.email,
			callbackURL: "/dashboard",
		});
		if (result.error) {
			toast.error(result.error.message || "Couldn’t send it. Try again.");
			return;
		}
		setResent(true);
		toast.success("Sent. If it doesn’t arrive, check your spam folder.");
	};

	const signOut = () => {
		authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					// The session came from the root route; make the router go
					// and notice it is gone.
					await router.invalidate();
					navigate({ to: "/" });
				},
			},
		});
	};

	const name = session?.user.name ?? "";
	const verified = session?.user.emailVerified ?? false;
	const away = me.data?.status === "suspended";
	const since = session
		? new Date(session.user.createdAt).toLocaleDateString("en-US", {
				month: "long",
				year: "numeric",
				timeZone: "America/New_York",
			})
		: null;

	return (
		<section className="pt-8 pb-12 md:pt-10">
			<PageTitle title="Your account" />

			<div className="mt-6 grid items-start gap-8 lg:grid-cols-2">
				<div className="flex flex-col gap-8">
					<Panel className="flex items-center gap-4">
						<span
							aria-hidden="true"
							className="display inline-flex size-[72px] shrink-0 items-center justify-center rounded-full bg-amber text-[32px] text-on-amber"
						>
							{initials(name)}
						</span>
						<div className="flex min-w-0 flex-col gap-0.5">
							<p className="display m-0 break-words text-[34px] leading-none">
								{name}
							</p>
							{since ? (
								<span className="text-[14px] text-subtle">
									Member since {since}
								</span>
							) : null}
						</div>
					</Panel>

					<div>
						<SectionKicker>Contact</SectionKicker>
						<Panel>
							<dl className="m-0 flex flex-col">
								<div className="flex flex-col gap-1 pb-3">
									<dt className="kicker">Name</dt>
									<dd className="m-0">{name}</dd>
								</div>
								<div className="flex flex-col gap-1 border-raised border-t pt-3">
									<dt className="kicker">Email</dt>
									<dd className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
										<span className="break-all">{session?.user.email}</span>
										{verified ? (
											<span className={`${pill} bg-ok-bg text-ok`}>
												Verified
											</span>
										) : (
											<>
												<span className={`${pill} bg-warn-bg text-warn`}>
													Not verified
												</span>
												{resent ? (
													<span className="text-[14px] text-subtle">
														Sent. Check your inbox.
													</span>
												) : (
													<Button variant="link" size="sm" onClick={resend}>
														Send the verification email again
													</Button>
												)}
											</>
										)}
									</dd>
								</div>
							</dl>
						</Panel>
					</div>

					<div>
						<SectionKicker>Taking a break</SectionKicker>
						<Panel className="flex flex-col gap-3.5">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p className="m-0 text-ink-soft">
									{me.isLoading
										? "Checking..."
										: away
											? `${describeBreak({
													suspendedUntil: me.data?.suspendedUntil ?? null,
													reason: me.data?.reason ?? null,
												})}. You won’t get emails about nights or be on the list until you’re back.`
											: "You’re active. You’ll get an email when a night is booked, and you can RSVP."}
								</p>
								{me.isLoading ? null : away ? (
									<Button
										size="sm"
										disabled={comeBack.isPending}
										onClick={() => comeBack.mutate({})}
									>
										I’m back
									</Button>
								) : (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setTaking((v) => !v)}
									>
										{taking ? "Cancel" : "Take a break"}
									</Button>
								)}
							</div>
							{taking && !away ? (
								<BreakForm
									pending={takeBreak.isPending}
									onCancel={() => setTaking(false)}
									onSubmit={(input) => takeBreak.mutate(input)}
								/>
							) : null}
						</Panel>
					</div>

					<div>
						<SectionKicker>Password</SectionKicker>
						<PasswordPanel />
					</div>
				</div>

				<div className="flex flex-col gap-8">
					<div>
						<SectionKicker>Credits</SectionKicker>
						<CreditsPanel />
					</div>

					<div className="flex flex-col gap-3">
						<Button variant="outline" className="w-full" onClick={signOut}>
							Sign out
						</Button>
						<p className="m-0 text-[14px] text-subtle">
							Leaving the group for good? Let an admin know. That’s the one
							thing you can’t do from this page.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
