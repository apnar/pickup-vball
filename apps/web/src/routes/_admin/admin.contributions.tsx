import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { Textarea } from "@pickup-vball/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
	type Preview,
	PreviewPanel,
	reportSend,
} from "@/components/email-preview";
import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { dollars } from "@/lib/contributions";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/contributions")({
	component: AdminContributionsPage,
});

const thClass =
	"px-4 py-3.5 text-left font-semibold text-[13px] text-subtle uppercase tracking-[0.08em]";

const pill = (tone: "ok" | "warn" | "neutral") =>
	`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold text-[13px] ${
		tone === "ok"
			? "bg-ok-bg text-ok"
			: tone === "warn"
				? "bg-warn-bg text-warn"
				: "bg-raised text-ink-soft"
	}`;

const filterClass = (selected: boolean) =>
	`min-h-11 cursor-pointer rounded-full border-[1.5px] px-[18px] font-semibold text-[15px] ${
		selected
			? "border-ink bg-ink text-ground"
			: "border-line bg-transparent text-ink hover:bg-raised-hover"
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

type PreviewKey = "call" | "reminder";
type CallDraft = {
	subject: string;
	body: string;
	amount: number;
	instructions: string;
};

/** The order the ledger reads in: who still owes, then the excused, then the paid. */
const STATUS_RANK = { unpaid: 0, excused: 1, paid: 2 } as const;

const FILTERS = [
	{ value: "all", label: "All" },
	{ value: "unpaid", label: "Unpaid" },
	{ value: "paid", label: "Paid" },
	{ value: "excused", label: "Excused" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

/** One number with its label, the tile row the ledger opens with. */
function Tile({
	label,
	value,
	note,
	accent = false,
}: {
	label: string;
	value: string;
	note?: string;
	accent?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1 rounded-card bg-surface p-[18px]">
			<span className="kicker">{label}</span>
			<span
				className={`display tnum text-[40px] leading-none ${accent ? "text-amber" : "text-ink"}`}
			>
				{value}
			</span>
			{note ? <span className="text-[14px] text-subtle">{note}</span> : null}
		</div>
	);
}

function CallForm({
	initial,
	count,
	busy,
	canSend,
	armed,
	onPreview,
	onSendToMe,
	onArm,
	onSend,
}: {
	initial: Omit<CallDraft, "amount"> & { amount: number | null };
	count: number;
	busy: boolean;
	canSend: boolean;
	armed: boolean;
	onPreview: (draft: CallDraft) => void;
	onSendToMe: (draft: CallDraft) => void;
	onArm: () => void;
	onSend: (draft: CallDraft) => void;
}) {
	const [form, setForm] = useState({
		subject: initial.subject,
		body: initial.body,
		amount: initial.amount === null ? "" : String(initial.amount),
		instructions: initial.instructions,
	});
	const set =
		<K extends keyof typeof form>(key: K) =>
		(value: (typeof form)[K]) =>
			setForm((f) => ({ ...f, [key]: value }));

	/** The server does the real validating; this only stops an empty box. */
	const draft = (): CallDraft | null => {
		const amount = Number(form.amount);
		if (!Number.isInteger(amount) || amount <= 0) {
			toast.error("Enter an amount in whole dollars.");
			return null;
		}
		return { ...form, amount };
	};
	const withDraft = (fn: (d: CallDraft) => void) => () => {
		const d = draft();
		if (d) fn(d);
	};

	return (
		<Panel className="flex flex-col gap-3.5">
			<SectionKicker className="m-0">Ask the group to chip in</SectionKicker>
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					withDraft(onPreview)();
				}}
			>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="call-subject">Subject</Label>
					<Input
						id="call-subject"
						required
						maxLength={120}
						value={form.subject}
						onChange={(e) => set("subject")(e.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="call-body">Message</Label>
					<Textarea
						id="call-body"
						required
						maxLength={5000}
						rows={8}
						className="min-h-40"
						value={form.body}
						onChange={(e) => set("body")(e.target.value)}
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="call-amount">Amount</Label>
						<Input
							id="call-amount"
							type="number"
							required
							min={1}
							step={1}
							inputMode="numeric"
							value={form.amount}
							onChange={(e) => set("amount")(e.target.value)}
						/>
						<p className="m-0 text-[14px] text-subtle">
							Whole dollars, per person.
						</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="call-instructions">How to pay</Label>
						<Input
							id="call-instructions"
							required
							maxLength={200}
							placeholder="Venmo @Viroj7, or cash at the gym."
							value={form.instructions}
							onChange={(e) => set("instructions")(e.target.value)}
						/>
						<p className="m-0 text-[14px] text-subtle">
							One line. It's saved and filled in for next time.
						</p>
					</div>
				</div>
				<p className="m-0 text-[14px] text-subtle">
					Goes to the {count} active {count === 1 ? "player" : "players"}.
					People taking a break aren't asked.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button type="submit" variant="outline" size="sm" disabled={busy}>
						Preview
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={withDraft(onSendToMe)}
					>
						Send to me first
					</Button>
					<Button
						type="button"
						variant={armed ? "default" : "outline"}
						size="sm"
						disabled={!canSend || busy}
						onClick={armed ? withDraft(onSend) : onArm}
					>
						{armed ? `Yes, send to ${count}` : `Send (${count})`}
					</Button>
				</div>
			</form>
		</Panel>
	);
}

function ReminderForm({
	initial,
	count,
	away,
	lastRemindedAt,
	busy,
	canSend,
	armed,
	onPreview,
	onSendToMe,
	onArm,
	onSend,
}: {
	initial: string;
	count: number;
	away: number;
	lastRemindedAt: Date | string | null;
	busy: boolean;
	canSend: boolean;
	armed: boolean;
	onPreview: (body: string) => void;
	onSendToMe: (body: string) => void;
	onArm: () => void;
	onSend: (body: string) => void;
}) {
	const [body, setBody] = useState(initial);
	const owing = count + away;
	return (
		<Panel className="flex flex-col gap-3.5">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<SectionKicker className="m-0">Send a reminder</SectionKicker>
				<span className="text-[14px] text-subtle">
					<span className="tnum">{owing}</span> still unpaid
				</span>
			</div>
			{owing === 0 ? (
				<p className="m-0 text-ink-soft">
					Everyone has paid. You can close this request.
				</p>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onPreview(body);
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="reminder-body">Message</Label>
						<Textarea
							id="reminder-body"
							required
							maxLength={5000}
							rows={6}
							className="min-h-32"
							value={body}
							onChange={(e) => setBody(e.target.value)}
						/>
						<p className="m-0 text-[14px] text-subtle">
							The amount and how to pay come from the original request; only
							this message changes.
							{away > 0
								? ` ${away} of the unpaid ${away === 1 ? "is" : "are"} taking a break and won't get this.`
								: ""}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button type="submit" variant="outline" size="sm" disabled={busy}>
							Preview
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={busy || !body}
							onClick={() => onSendToMe(body)}
						>
							Send to me first
						</Button>
						<Button
							type="button"
							variant={armed ? "default" : "outline"}
							size="sm"
							disabled={!canSend || busy || count === 0}
							onClick={armed ? () => onSend(body) : onArm}
						>
							{armed ? `Yes, send to ${count}` : `Send (${count})`}
						</Button>
						{lastRemindedAt ? (
							<span className="text-[14px] text-subtle">
								Last reminder {when(lastRemindedAt)}
							</span>
						) : null}
					</div>
				</form>
			)}
		</Panel>
	);
}

function AdminContributionsPage() {
	const queryClient = useQueryClient();
	const status = useQuery(orpc.mail.status.queryOptions());
	const current = useQuery(orpc.contributions.current.queryOptions());
	const history = useQuery(orpc.contributions.history.queryOptions());

	const [preview, setPreview] = useState<
		(Preview & { recipientCount: number; key: PreviewKey }) | null
	>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");

	const onError = (error: Error) => toast.error(error.message);
	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.contributions.key() });
		queryClient.invalidateQueries({ queryKey: orpc.mail.key() });
		setConfirmKey(null);
	};

	const previewCall = useMutation(
		orpc.contributions.previewCall.mutationOptions({
			onSuccess: (data) => setPreview({ ...data, key: "call" }),
			onError,
		}),
	);
	const sendCall = useMutation(
		orpc.contributions.sendCall.mutationOptions({
			onSuccess: (result, input) => {
				if (input.toSelf) {
					toast.success("Sent to you. Check your inbox.");
				} else {
					reportSend(result);
					setPreview(null);
				}
				refresh();
			},
			onError,
		}),
	);
	const previewReminder = useMutation(
		orpc.contributions.previewReminder.mutationOptions({
			onSuccess: (data) => setPreview({ ...data, key: "reminder" }),
			onError,
		}),
	);
	const sendReminder = useMutation(
		orpc.contributions.sendReminder.mutationOptions({
			onSuccess: (result, input) => {
				if (input.toSelf) {
					toast.success("Sent to you. Check your inbox.");
				} else {
					reportSend(result);
					setPreview(null);
				}
				refresh();
			},
			onError,
		}),
	);
	const mark = useMutation(
		orpc.contributions.mark.mutationOptions({ onSuccess: refresh, onError }),
	);
	const close = useMutation(
		orpc.contributions.close.mutationOptions({
			onSuccess: () => {
				toast.success("Request closed.");
				setPreview(null);
				refresh();
			},
			onError,
		}),
	);

	const busy =
		previewCall.isPending ||
		sendCall.isPending ||
		previewReminder.isPending ||
		sendReminder.isPending;
	const data = current.data;
	const open = data?.open ?? null;

	const ledger = open
		? [...open.ledger].sort((a, b) => {
				// Deactivated rows are history, not roster, so they sit at the bottom.
				const goneA = a.personStatus === "deactivated" ? 1 : 0;
				const goneB = b.personStatus === "deactivated" ? 1 : 0;
				if (goneA !== goneB) return goneA - goneB;
				const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
				return rank !== 0 ? rank : a.name.localeCompare(b.name);
			})
		: [];
	const shown =
		filter === "all" ? ledger : ledger.filter((row) => row.status === filter);

	return (
		<div className="flex flex-col gap-8">
			<PageTitle
				title="Gym money"
				sub="Ask the group to chip in for the gym, and keep track of who has paid."
			/>

			{status.data?.dryRun ? (
				<p className="m-0 rounded-card bg-warn-bg p-4 text-warn">
					BREVO_API_KEY isn't set here, so emails are printed to the server log
					instead of being sent. Everything else works normally.
				</p>
			) : null}

			{current.isLoading || !data ? (
				<p className="m-0 text-subtle">Loading…</p>
			) : open ? (
				<section aria-labelledby="open-call" className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<span className="kicker">
							Open request · since {when(open.openedAt)}
						</span>
						<SectionKicker id="open-call" className="m-0">
							{open.subject}
						</SectionKicker>
						<p className="m-0 text-[14px] text-subtle">
							{dollars(open.amount)} per person · sent to{" "}
							<span className="tnum">{open.sentTo}</span>
							{open.failed > 0 ? `, ${open.failed} failed` : ""}
						</p>
					</div>

					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3.5">
						<Tile
							label="Collected"
							value={dollars(open.tally.collected)}
							note={`of ${dollars(open.tally.expected)}`}
							accent
						/>
						<Tile
							label="Paid"
							value={String(open.tally.paid)}
							note={`of ${open.tally.billed}`}
						/>
						<Tile label="Unpaid" value={String(open.tally.unpaid)} />
						{open.tally.excused > 0 ? (
							<Tile label="Excused" value={String(open.tally.excused)} />
						) : null}
					</div>

					<fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
						<legend className="sr-only">Show</legend>
						{FILTERS.map((f) => (
							<button
								key={f.value}
								type="button"
								aria-pressed={filter === f.value}
								className={filterClass(filter === f.value)}
								onClick={() => setFilter(f.value)}
							>
								{f.label}
							</button>
						))}
					</fieldset>

					<div className="overflow-x-auto rounded-card bg-surface">
						<table className="w-full min-w-[640px] border-collapse text-[15px]">
							<thead>
								<tr>
									<th scope="col" className={thClass}>
										Player
									</th>
									<th scope="col" className={thClass}>
										Status
									</th>
									<th scope="col" className={thClass}>
										Updated
									</th>
									<th scope="col" className={thClass}>
										<span className="sr-only">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{shown.map((row) => {
									const gone = row.personStatus === "deactivated";
									const away = row.personStatus === "suspended";
									return (
										<tr
											key={row.userId}
											className="border-raised border-t hover:bg-raised-hover [&>td]:px-4 [&>td]:py-3"
										>
											<td
												className={`font-semibold ${gone ? "text-subtle" : "text-ink"}`}
											>
												{row.name}
												{gone ? (
													<span className="ml-2 font-normal text-[13px] text-subtle">
														Deactivated
													</span>
												) : away ? (
													<span className="ml-2 font-normal text-[13px] text-warn">
														Taking a break
													</span>
												) : null}
											</td>
											<td>
												<span
													className={pill(
														row.status === "paid"
															? "ok"
															: row.status === "unpaid"
																? "warn"
																: "neutral",
													)}
												>
													{row.status === "paid"
														? "Paid"
														: row.status === "unpaid"
															? `Owes ${dollars(open.amount)}`
															: "Excused"}
												</span>
											</td>
											<td className="whitespace-nowrap text-[14px] text-subtle">
												{when(row.markedAt)}
											</td>
											<td className="text-right">
												<div className="flex flex-wrap justify-end gap-2">
													{row.status === "unpaid" ? (
														<>
															<Button
																variant="accent"
																size="sm"
																aria-label={`Mark ${row.name} paid`}
																disabled={mark.isPending}
																onClick={() =>
																	mark.mutate({
																		userId: row.userId,
																		status: "paid",
																	})
																}
															>
																Mark paid
															</Button>
															<Button
																variant="ghost"
																size="sm"
																aria-label={`Excuse ${row.name}`}
																disabled={mark.isPending}
																onClick={() =>
																	mark.mutate({
																		userId: row.userId,
																		status: "excused",
																	})
																}
															>
																Excuse
															</Button>
														</>
													) : (
														<Button
															variant="ghost"
															size="sm"
															aria-label={`Mark ${row.name} unpaid`}
															disabled={mark.isPending}
															onClick={() =>
																mark.mutate({
																	userId: row.userId,
																	status: "unpaid",
																})
															}
														>
															Mark unpaid
														</Button>
													)}
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
						{shown.length === 0 ? (
							<p className="m-0 border-raised border-t px-4 py-4 text-subtle">
								Nobody here.
							</p>
						) : null}
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<Button
							variant={confirmKey === "close" ? "destructive" : "outline"}
							size="sm"
							disabled={close.isPending}
							onClick={() => {
								if (confirmKey === "close") close.mutate({});
								else setConfirmKey("close");
							}}
						>
							{confirmKey === "close"
								? open.tally.unpaid > 0
									? `Close anyway (${open.tally.unpaid} unpaid)`
									: "Yes, close it"
								: "Close this request"}
						</Button>
						{confirmKey === "close" ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setConfirmKey(null)}
							>
								Cancel
							</Button>
						) : null}
						<span className="max-w-[56ch] text-[14px] text-subtle">
							Closing stops reminders and removes the payment notice from
							everyone's account page. The totals stay here.
						</span>
					</div>
				</section>
			) : null}

			<div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
				<div className="flex flex-col gap-8">
					{!data ? null : open ? (
						<ReminderForm
							key={open.id}
							initial={data.defaults.reminderBody}
							count={open.unpaidReachable}
							away={open.unpaidAway}
							lastRemindedAt={open.lastRemindedAt}
							busy={busy}
							canSend={preview?.key === "reminder"}
							armed={confirmKey === "reminder"}
							onPreview={(body) => previewReminder.mutate({ body })}
							onSendToMe={(body) => sendReminder.mutate({ body, toSelf: true })}
							onArm={() => setConfirmKey("reminder")}
							onSend={(body) => sendReminder.mutate({ body, toSelf: false })}
						/>
					) : (
						<CallForm
							key={current.dataUpdatedAt}
							initial={{
								subject: data.defaults.subject,
								body: data.defaults.body,
								amount: data.prefill?.amount ?? null,
								instructions: data.prefill?.instructions ?? "",
							}}
							count={data.activeCount}
							busy={busy}
							canSend={preview?.key === "call"}
							armed={confirmKey === "call"}
							onPreview={(draft) => previewCall.mutate(draft)}
							onSendToMe={(draft) =>
								sendCall.mutate({ ...draft, toSelf: true })
							}
							onArm={() => setConfirmKey("call")}
							onSend={(draft) => sendCall.mutate({ ...draft, toSelf: false })}
						/>
					)}
				</div>

				<div>
					{preview ? (
						<PreviewPanel preview={preview} onClose={() => setPreview(null)} />
					) : (
						<Panel
							variant="outline"
							className="flex min-h-40 items-center justify-center text-center text-subtle"
						>
							Preview an email to see it here.
						</Panel>
					)}
				</div>
			</div>

			<section className="flex flex-col gap-3.5">
				<SectionKicker className="m-0">Past requests</SectionKicker>
				{(history.data ?? []).length === 0 ? (
					<p className="m-0 text-subtle">No past requests yet.</p>
				) : (
					<div className="overflow-x-auto rounded-card bg-surface">
						<table className="w-full min-w-[640px] border-collapse text-[15px]">
							<thead>
								<tr>
									<th scope="col" className={thClass}>
										Request
									</th>
									<th scope="col" className={thClass}>
										Open
									</th>
									<th scope="col" className={thClass}>
										Per person
									</th>
									<th scope="col" className={thClass}>
										Result
									</th>
								</tr>
							</thead>
							<tbody>
								{(history.data ?? []).map((row) => (
									<tr
										key={row.id}
										className="border-raised border-t hover:bg-raised-hover [&>td]:px-4 [&>td]:py-3"
									>
										<td className="font-semibold text-ink">{row.subject}</td>
										<td className="text-[14px] text-subtle">
											{when(row.openedAt)} – {when(row.closedAt)}
										</td>
										<td className="tnum">{dollars(row.amount)}</td>
										<td className="tnum text-ink-soft">{row.tallyLine}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}
