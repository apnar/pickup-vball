import { formatUsPhone } from "@pickup-vball/api/phone";
import {
	RESPONSE_WINDOW,
	type ResponseRate,
} from "@pickup-vball/api/responses";
import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { BreakForm, describeBreak } from "@/components/break-form";
import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/users/")({
	component: AdminPeoplePage,
});

const thClass =
	"px-4 py-3.5 text-left font-semibold text-[13px] text-subtle uppercase tracking-[0.08em]";

const pill = (tone: "ok" | "warn" | "danger" | "neutral" | "accent") =>
	`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold text-[13px] ${
		tone === "ok"
			? "bg-ok-bg text-ok"
			: tone === "warn"
				? "bg-warn-bg text-warn"
				: tone === "danger"
					? "bg-danger-bg text-danger"
					: tone === "accent"
						? "bg-raised text-amber"
						: "bg-raised text-ink-soft"
	}`;

function when(value: Date | string | null | undefined): string {
	if (!value) return "";
	return new Date(value).toLocaleString("en-US", {
		timeZone: "America/New_York",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * How somebody has answered the last few invitations, in the width of a
 * table cell. Three counts over one denominator rather than three fractions:
 * the numbers are all out of the same handful of nights, and repeating "/ 8"
 * three times reads like three different measurements.
 *
 * `of` is how many of those nights this person was on the roster for, so
 * somebody added last week reads "of 1" and is not quietly accused of
 * ignoring nine emails that were sent before they joined.
 */
function Record({ rate }: { rate: ResponseRate }) {
	if (rate.of === 0) {
		return <span className="text-subtle">Not asked yet</span>;
	}
	return (
		<span className="tnum">
			<strong className="font-semibold text-ink">{rate.yes}</strong> in ·{" "}
			{rate.replied} replied
			{rate.onBreak > 0 ? ` · ${rate.onBreak} away` : ""} ·{" "}
			<span className="text-subtle">of {rate.of}</span>
		</span>
	);
}

/**
 * Everybody, in one table. The roster, the mailing list and the accounts are
 * the same rows, so there is one page for them rather than two that never
 * mention each other.
 */
function AdminPeoplePage() {
	const queryClient = useQueryClient();
	const { session } = Route.useRouteContext();
	const people = useQuery(orpc.people.list.queryOptions());
	const games = useQuery(orpc.games.list.queryOptions());
	const groups = useQuery(orpc.groups.list.queryOptions());
	const groupName = new Map((groups.data ?? []).map((g) => [g.id, g.name]));
	const [newGroups, setNewGroups] = useState<Set<string>>(new Set());

	const [newEmail, setNewEmail] = useState("");
	const [newName, setNewName] = useState("");
	/** Which row has its break form open, and which has an armed confirm. */
	const [pausing, setPausing] = useState<string | null>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);
	const [reason, setReason] = useState("");

	const onError = (error: Error) => toast.error(error.message);
	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
		queryClient.invalidateQueries({ queryKey: orpc.mail.key() });
		setPausing(null);
		setConfirmKey(null);
		setReason("");
	};

	const add = useMutation(
		orpc.people.add.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.emailed
						? `Added. Their sign-in link is ${result.dryRun ? "in the server log" : "on its way"}.`
						: "Added, but the welcome email didn't go out.",
				);
				setNewEmail("");
				setNewName("");
				setNewGroups(new Set());
				refresh();
			},
			onError,
		}),
	);
	const sendLink = useMutation(
		orpc.people.sendLink.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.dryRun ? "Link printed to the server log." : "Link sent.",
				);
				refresh();
			},
			onError,
		}),
	);
	const removePhone = useMutation(
		orpc.people.removePhone.mutationOptions({
			onSuccess: () => {
				toast.success("Number removed. Their texts go by email now.");
				refresh();
			},
			onError,
		}),
	);
	const rotateLink = useMutation(
		orpc.people.rotateLink.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.dryRun
						? "Old links no longer work. The new one is in the server log."
						: "Old links no longer work. A new one is on its way.",
				);
				refresh();
			},
			onError,
		}),
	);
	const suspend = useMutation(
		orpc.people.suspend.mutationOptions({
			onSuccess: () => {
				toast.success("Break started.");
				refresh();
			},
			onError,
		}),
	);
	const unsuspend = useMutation(
		orpc.people.unsuspend.mutationOptions({
			onSuccess: () => {
				toast.success("Break ended.");
				refresh();
			},
			onError,
		}),
	);
	const deactivate = useMutation(
		orpc.people.deactivate.mutationOptions({
			onSuccess: () => {
				toast.success("Deactivated and signed out everywhere.");
				refresh();
			},
			onError,
		}),
	);
	const reactivate = useMutation(
		orpc.people.reactivate.mutationOptions({
			onSuccess: () => {
				toast.success("Reactivated. Send them a link so they can sign in.");
				refresh();
			},
			onError,
		}),
	);
	/**
	 * One person says nothing arrived. Re-send them the stage that has most
	 * recently gone out for the next night -- targeted, so it never touches the
	 * cycle's own record of what is finished.
	 */
	const resendCycle = useMutation(
		orpc.mail.sendStage.mutationOptions({
			onSuccess: () => toast.success("Sent again."),
			onError,
		}),
	);
	const setRole = useMutation({
		mutationFn: async (input: { userId: string; role: "admin" | "user" }) => {
			const result = await authClient.admin.setRole(input);
			if (result.error) throw new Error(result.error.message);
			return result.data;
		},
		onSuccess: (_data, input) => {
			toast.success(
				input.role === "admin" ? "Now an admin." : "No longer an admin.",
			);
			refresh();
		},
		onError,
	});

	// The next night whose cycle has actually started, and the last stage of it
	// that resolved -- that is the email this person is missing. Once answers
	// have closed there is nothing left worth resending: every stage asks.
	const nextGame = (games.data?.upcoming ?? []).find((g) => g.callAt);
	const lastStage =
		nextGame && !nextGame.decidedAt
			? (
					[
						["lastCall", nextGame.lastCallAt],
						["nudge", nextGame.nudgeAt],
						["call", nextGame.callAt],
					] as const
				).find(([, at]) => at)?.[0]
			: undefined;
	const busy = suspend.isPending || unsuspend.isPending;

	// Deactivated rows are history, not roster, so they sit at the bottom.
	const rows = [...(people.data ?? [])].sort((a, b) =>
		a.effectiveStatus === "deactivated"
			? b.effectiveStatus === "deactivated"
				? 0
				: 1
			: b.effectiveStatus === "deactivated"
				? -1
				: 0,
	);

	return (
		<div className="flex flex-col gap-8">
			<PageTitle
				title="Players"
				sub="Everyone in the group: who gets the emails, who is taking a break, and how they sign in."
			/>

			<div className="flex max-w-[68ch] flex-col gap-3 text-ink-soft">
				<p className="m-0">
					Everyone here gets the emails about upcoming nights and can RSVP; the
					link in those emails is how they sign in. Someone injured or
					travelling can <strong className="text-ink">take a break</strong>: no
					emails and no spot until they're back, but their account and link keep
					working, and they can come back on their own.{" "}
					<strong className="text-ink">Deactivating</strong> is different: it
					removes access, signs them out everywhere and stops all email. Only an
					admin can deactivate someone or undo it.
				</p>
				<p className="m-0">
					<strong className="text-ink">Last {RESPONSE_WINDOW}</strong> shows how
					each person answered the last {RESPONSE_WINDOW} invitations: how many
					times they said yes, how many times they replied at all (a no counts
					as a reply), and how many they were away for. All three are out of the
					number after <em>of</em>, which is how many of those invitations they
					were on the list for, so someone who joined recently has a shorter
					record, not a worse one. Nights from before this was tracked aren't
					counted.
				</p>
			</div>

			<Panel className="flex flex-col gap-3.5">
				<SectionKicker className="m-0">Add a player</SectionKicker>
				<form
					className="flex flex-wrap items-end gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						add.mutate({
							email: newEmail,
							name: newName || undefined,
							groupIds: [...newGroups],
						});
					}}
				>
					<div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
						<Label htmlFor="new-email">Email</Label>
						<Input
							id="new-email"
							type="email"
							required
							value={newEmail}
							onChange={(e) => setNewEmail(e.target.value)}
						/>
					</div>
					<div className="flex min-w-[180px] flex-col gap-1.5">
						<Label htmlFor="new-name">Name</Label>
						<Input
							id="new-name"
							maxLength={40}
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
						/>
					</div>
					{(groups.data ?? []).length > 0 ? (
						<fieldset className="m-0 flex w-full flex-col gap-1.5 border-0 p-0">
							<legend className="mb-1.5 p-0 font-semibold text-[14px] text-subtle">
								Groups: which nights they’ll see
							</legend>
							<div className="flex flex-wrap gap-x-4 gap-y-1">
								{(groups.data ?? []).map((g) => (
									<label
										key={g.id}
										className="flex min-h-11 cursor-pointer items-center gap-2"
									>
										<input
											type="checkbox"
											className="size-5 accent-amber"
											checked={newGroups.has(g.id)}
											onChange={(e) => {
												const next = new Set(newGroups);
												if (e.target.checked) next.add(g.id);
												else next.delete(g.id);
												setNewGroups(next);
											}}
										/>
										{g.name}
									</label>
								))}
							</div>
						</fieldset>
					) : null}
					<Button type="submit" disabled={add.isPending}>
						Add and send link
					</Button>
				</form>
			</Panel>

			{/*
			 * The table has to fit the page at desktop widths: an overflow wrapper
			 * scrolls silently, and nobody notices the buttons off the right edge.
			 * So nothing in a row is nowrap except the timestamp -- the address
			 * breaks anywhere, and the actions wrap to a second line. The wrapper
			 * stays only for a phone, where six columns cannot fit whatever they do.
			 */}
			<div className="overflow-x-auto rounded-card bg-surface">
				<table className="w-full min-w-[1040px] border-collapse text-[15px]">
					<thead>
						<tr>
							<th scope="col" className={thClass}>
								Player
							</th>
							<th scope="col" className={thClass}>
								Role
							</th>
							<th scope="col" className={thClass}>
								Status
							</th>
							<th scope="col" className={thClass}>
								Groups
							</th>
							<th scope="col" className={thClass}>
								Credits
							</th>
							<th scope="col" className={thClass}>
								Last {RESPONSE_WINDOW}
							</th>
							<th scope="col" className={thClass}>
								Link sent
							</th>
							<th scope="col" className={thClass}>
								<span className="sr-only">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((p) => {
							const isSelf = p.id === session?.user.id;
							const admin = p.role === "admin";
							const gone = p.effectiveStatus === "deactivated";
							const away = p.effectiveStatus === "suspended";
							const killKey = `kill:${p.id}`;
							return (
								<tr
									key={p.id}
									className={`border-raised border-t align-top hover:bg-raised-hover [&>td]:px-4 [&>td]:py-3 ${gone ? "text-subtle" : ""}`}
								>
									<td className="min-w-[200px]">
										<Link
											to="/admin/users/$userId"
											params={{ userId: p.id }}
											className={`block font-semibold ${gone ? "text-subtle" : "text-ink"}`}
										>
											{p.name}
										</Link>
										<span className="wrap-anywhere block text-[14px] text-subtle">
											{p.email}
											{p.emailBlockedAt ? (
												<span className="text-warn"> · bouncing</span>
											) : null}
										</span>
										{p.phone ? (
											<span className="tnum block text-[14px] text-subtle">
												{formatUsPhone(p.phone)}
												{p.smsOptedOutAt ? (
													<span className="text-warn"> · texted STOP</span>
												) : null}
											</span>
										) : null}
									</td>
									<td>
										<span className={pill(admin ? "accent" : "neutral")}>
											{admin ? "Admin" : "Player"}
										</span>
									</td>
									<td>
										{gone ? (
											<span className={pill("danger")}>
												Deactivated
												{p.statusReason ? ` — ${p.statusReason}` : ""}
											</span>
										) : away ? (
											<span className={pill("warn")}>
												{describeBreak({
													suspendedUntil: p.suspendedUntil,
													reason: p.statusReason,
												})}
											</span>
										) : (
											<span className={pill("ok")}>Active</span>
										)}
										{p.statusChangedBy === "mail" ? (
											<span className="mt-1 block text-[13px] text-subtle">
												Via their email app
											</span>
										) : null}
									</td>
									<td className="min-w-[160px] text-[13px] text-ink-soft">
										{admin ? (
											<span className="text-subtle">All, as an admin</span>
										) : p.groupIds.length === 0 ? (
											<span className="text-warn">None: sees no nights</span>
										) : (
											p.groupIds
												.map((id) => groupName.get(id))
												.filter(Boolean)
												.join(", ")
										)}
									</td>
									<td
										className={`display tnum text-[20px] ${p.balance > 0 ? "text-ink" : "text-danger"}`}
									>
										{p.balance}
									</td>
									<td className="text-[14px] text-subtle">
										<Record rate={p.responses} />
									</td>
									<td className="whitespace-nowrap text-[14px] text-subtle">
										{p.linkSentAt ? when(p.linkSentAt) : "Never sent"}
									</td>
									<td className="min-w-[230px] text-right">
										<div className="flex flex-wrap justify-end gap-1">
											{gone ? (
												<Button
													variant="ghost"
													size="xs"
													disabled={reactivate.isPending}
													onClick={() => reactivate.mutate({ userId: p.id })}
												>
													Reactivate
												</Button>
											) : (
												<>
													<Button
														variant="ghost"
														size="xs"
														disabled={sendLink.isPending}
														onClick={() => sendLink.mutate({ userId: p.id })}
													>
														Send link
													</Button>
													{p.phone ? (
														<Button
															variant="ghost"
															size="xs"
															disabled={removePhone.isPending}
															title="Stops texts to this number. Only they can add a number back, by confirming a code."
															onClick={() =>
																removePhone.mutate({ userId: p.id })
															}
														>
															Remove number
														</Button>
													) : null}
													<Button
														variant="ghost"
														size="xs"
														disabled={rotateLink.isPending}
														title="Cancels every link they've been sent and emails a new one. Use it if one of their emails was forwarded."
														onClick={() => rotateLink.mutate({ userId: p.id })}
													>
														New link
													</Button>
													{away ? (
														<Button
															variant="ghost"
															size="xs"
															disabled={busy}
															onClick={() => unsuspend.mutate({ userId: p.id })}
														>
															End break
														</Button>
													) : (
														<Button
															variant="ghost"
															size="xs"
															onClick={() =>
																setPausing(pausing === p.id ? null : p.id)
															}
														>
															{pausing === p.id ? "Cancel break" : "Break…"}
														</Button>
													)}
													{nextGame && lastStage && !away ? (
														<Button
															variant="ghost"
															size="xs"
															disabled={resendCycle.isPending}
															onClick={() =>
																resendCycle.mutate({
																	gameId: nextGame.id,
																	stage: lastStage,
																	personIds: [p.id],
																})
															}
														>
															Resend last email
														</Button>
													) : null}
													<Button
														variant="ghost"
														size="xs"
														disabled={isSelf || setRole.isPending}
														onClick={() =>
															setRole.mutate({
																userId: p.id,
																role: admin ? "user" : "admin",
															})
														}
													>
														{admin ? "Remove admin" : "Make admin"}
													</Button>
													<Button
														variant={
															confirmKey === killKey ? "destructive" : "ghost"
														}
														size="xs"
														disabled={isSelf || deactivate.isPending}
														onClick={() =>
															setConfirmKey(
																confirmKey === killKey ? null : killKey,
															)
														}
													>
														Deactivate…
													</Button>
												</>
											)}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{rows.length === 0 ? (
					<p className="m-0 border-raised border-t px-4 py-4 text-subtle">
						No players yet. Add someone above and they'll get a sign-in link by
						email.
					</p>
				) : null}
			</div>

			{pausing ? (
				<Panel className="flex flex-col gap-3.5">
					<SectionKicker className="m-0">
						Break for {rows.find((p) => p.id === pausing)?.name}
					</SectionKicker>
					<BreakForm
						subject={rows.find((p) => p.id === pausing)?.name ?? "they"}
						pending={suspend.isPending}
						onCancel={() => setPausing(null)}
						onSubmit={(input) => suspend.mutate({ ...input, userId: pausing })}
					/>
				</Panel>
			) : null}

			{confirmKey?.startsWith("kill:") ? (
				<div className="flex flex-col gap-3.5 rounded-card border-[1.5px] border-danger-bg bg-danger-tile p-[18px] md:p-5">
					<SectionKicker className="m-0 text-danger">
						Deactivate {rows.find((p) => `kill:${p.id}` === confirmKey)?.name}
					</SectionKicker>
					<p className="m-0 max-w-[60ch] text-ink-soft">
						This removes their access, signs them out on every device, and stops
						all email to them, including messages sent to everyone. Their old
						sign-in links stop working. Nothing is deleted, and an admin can
						undo it. If they only need time off, a break is the better choice.
					</p>
					<form
						className="flex flex-wrap items-end gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							deactivate.mutate({
								userId: confirmKey.slice("kill:".length),
								reason: reason.trim() || undefined,
							});
						}}
					>
						<div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
							<Label htmlFor="kill-reason">Reason (optional)</Label>
							<Input
								id="kill-reason"
								maxLength={200}
								placeholder="Moved away"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="submit"
								variant="destructive"
								disabled={deactivate.isPending}
							>
								Deactivate
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setConfirmKey(null);
									setReason("");
								}}
							>
								Cancel
							</Button>
						</div>
					</form>
				</div>
			) : null}
		</div>
	);
}
