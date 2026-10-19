import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { BreakForm, describeBreak } from "@/components/break-form";
import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { initials } from "@/components/user-menu";
import { PAYMENT } from "@/content/run";
import { authClient } from "@/lib/auth-client";
import { dollars, type MyContribution } from "@/lib/contributions";
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

/** A volleyball's seams, drawn faintly in the corner of the money card. */
function BallMark() {
	return (
		<svg
			aria-hidden="true"
			width="220"
			height="220"
			viewBox="0 0 220 220"
			fill="none"
			stroke="currentColor"
			strokeWidth={3}
			className="pointer-events-none absolute -top-[50px] -right-[60px] text-raised"
		>
			<circle cx="110" cy="110" r="100" />
			<path
				strokeLinecap="round"
				d="M110 110C150 80 160 40 140 15M110 110C116 159.6 145.6 188.3 177.3 183.5M110 110C64 90.4 24.4 101.7 12.7 131.5M132 122C172 92 182 52 165 26M88.6 123.1C94.6 172.7 124.2 201.4 155.2 199.6M109.4 85C63.4 65.3 23.8 76.7 9.8 104.4"
			/>
		</svg>
	);
}

/**
 * Where you stand on the current gym-money ask, if there is one, and how to
 * pay. Nothing here writes: an admin marks a payment once it arrives, so
 * there is no "I paid" button to press.
 */
function MoneyPanel({ money }: { money: MyContribution | null | undefined }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(PAYMENT.handle);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error(`Couldn’t copy. The handle is ${PAYMENT.handle}.`);
		}
	};

	return (
		<Panel className="relative flex flex-col gap-4 overflow-hidden">
			<BallMark />
			{money ? (
				<div className="relative flex flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="kicker">Your share of the gym</span>
						{money.status === "unpaid" ? (
							<span className={`${pill} bg-warn-bg text-warn`}>Unpaid</span>
						) : money.status === "paid" ? (
							<span className={`${pill} bg-ok-bg text-ok`}>Paid</span>
						) : (
							<span className={`${pill} bg-raised text-ink-soft`}>Excused</span>
						)}
					</div>
					<span
						className={`display tnum text-[72px] leading-[0.9] md:text-[96px] ${money.status === "unpaid" ? "text-amber" : "text-ink"}`}
					>
						{dollars(money.amount)}
					</span>
					<p className="m-0 max-w-[48ch] text-ink-soft">
						{money.status === "unpaid"
							? `${money.instructions} An admin marks it paid once it arrives.`
							: money.status === "paid"
								? "Paid. Thank you."
								: "You’re excused from this one. Nothing to pay."}
					</p>
				</div>
			) : (
				<div className="relative flex flex-col gap-1">
					<span className="kicker">Per night</span>
					<span className="display tnum text-[72px] text-amber leading-[0.9] md:text-[96px]">
						{dollars(PAYMENT.perNight)}
					</span>
					<p className="m-0 text-ink-soft">For each night you play.</p>
				</div>
			)}
			<div className="relative flex flex-col gap-3 border-raised border-t pt-3.5">
				<p className="m-0 text-[14px] text-subtle">{PAYMENT.line}</p>
				<div className="flex items-center justify-between gap-3 rounded-btn bg-surface-alt px-3 py-2.5">
					<span className="flex min-w-0 flex-col">
						<span className="font-semibold">Viroj on Venmo</span>
						<span className="text-[14px] text-subtle">{PAYMENT.handle}</span>
					</span>
					<Button variant="outline" size="sm" onClick={copy}>
						<span aria-live="polite">{copied ? "Copied" : "Copy handle"}</span>
					</Button>
				</div>
			</div>
		</Panel>
	);
}

function RouteComponent() {
	const { session } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const router = useRouter();
	const me = useQuery(orpc.people.me.queryOptions());
	const money = useQuery(orpc.contributions.mine.queryOptions());
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
						<SectionKicker>Gym money</SectionKicker>
						<MoneyPanel money={money.data} />
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
