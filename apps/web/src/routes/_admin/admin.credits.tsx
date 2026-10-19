import { MAX_CREDITS_AT_ONCE } from "@pickup-vball/api/credits";
import { todayInRunTimezone } from "@pickup-vball/api/run";
import type { PaymentMethod } from "@pickup-vball/db/schema/credit";
import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import PageTitle from "@/components/page-title";
import { initials } from "@/components/user-menu";
import { PAYMENT } from "@/content/run";
import { creditCount } from "@/lib/credits";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/credits")({
	validateSearch: z.object({
		userId: z.string().optional().catch(undefined),
	}),
	component: GiveCreditsPage,
});

const QUICK = [5, 10, 20, 30] as const;

const METHODS: { value: PaymentMethod; label: string }[] = [
	{ value: "venmo", label: "Venmo" },
	{ value: "cash", label: "Cash" },
	{ value: "other", label: "Other" },
];

const chip =
	"min-h-11 rounded-field border-[1.5px] px-4 font-semibold text-[16px] aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-ground border-line bg-transparent text-ink hover:bg-raised-hover aria-pressed:hover:bg-ink";

const stepper =
	"inline-flex size-16 shrink-0 items-center justify-center rounded-card border-[1.5px] border-line bg-transparent font-semibold text-[30px] text-ink hover:bg-raised-hover disabled:opacity-45";

function firstName(name: string): string {
	return name.split(/\s+/)[0] || name;
}

/**
 * The admin's phone at the gym: tonight's check-in one tap away, and money
 * received turned into credits. Mobile-first because that is where the
 * Venmo notification arrives.
 */
function GiveCreditsPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate({ from: Route.fullPath });
	const { userId } = Route.useSearch();
	const people = useQuery(orpc.people.list.queryOptions());
	const games = useQuery(orpc.games.list.queryOptions());
	const [query, setQuery] = useState("");
	const [amount, setAmount] = useState(10);
	const [method, setMethod] = useState<PaymentMethod>("venmo");
	const [note, setNote] = useState("");

	const today = todayInRunTimezone();
	const tonight = (games.data?.upcoming ?? []).filter(
		(g) => g.date === today && g.status !== "canceled",
	);

	const roster = (people.data ?? []).filter(
		(p) => p.effectiveStatus !== "deactivated",
	);
	const picked = roster.find((p) => p.id === userId) ?? null;
	const q = query.trim().toLowerCase();
	const matches = q
		? roster
				.filter(
					(p) =>
						p.name.toLowerCase().includes(q) ||
						p.email.toLowerCase().includes(q),
				)
				.slice(0, 8)
		: [];

	const pick = (id: string | undefined) => {
		setQuery("");
		navigate({ search: { userId: id }, replace: true });
	};

	const add = useMutation(
		orpc.credits.add.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					`Added. ${picked ? firstName(picked.name) : "They"} now ${result.balance === 1 ? "has 1 credit" : `has ${result.balance} credits`}.${result.emailed ? (result.dryRun ? " The receipt is in the server log." : " A receipt is on its way.") : " The receipt email didn't go out."}`,
				);
				setNote("");
				setAmount(10);
				pick(undefined);
				queryClient.invalidateQueries({ queryKey: orpc.people.key() });
				queryClient.invalidateQueries({ queryKey: orpc.credits.key() });
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	const valid = Number.isInteger(amount) && amount >= 1;

	return (
		<div className="flex max-w-[560px] flex-col gap-6">
			{tonight.map((g) => (
				<Link
					key={g.id}
					to="/admin/checkin/$gameId"
					params={{ gameId: g.id }}
					className="flex items-center justify-between gap-3 rounded-card bg-surface px-[18px] py-4 text-ink no-underline hover:bg-raised-hover hover:text-ink"
				>
					<span className="flex flex-col">
						<span className="kicker text-amber">Tonight {g.timeLabel}</span>
						<span className="font-semibold text-[17px]">
							{g.closedAt
								? "Closed · see who played"
								: `Open check-in · ${g.inCount} in`}
						</span>
					</span>
					<svg
						aria-hidden="true"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth={2.2}
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M9 5l7 7-7 7" />
					</svg>
				</Link>
			))}

			<PageTitle
				title="Give credits"
				sub={`For money received. $${PAYMENT.perNight} buys one credit, and one credit is one night.`}
			/>

			<form
				className="flex flex-col gap-6"
				onSubmit={(e) => {
					e.preventDefault();
					if (!picked || !valid) return;
					add.mutate({
						userId: picked.id,
						credits: amount,
						method,
						note: note.trim() || undefined,
					});
				}}
			>
				<div className="flex flex-col gap-2">
					<Label htmlFor="player">Player</Label>
					{picked ? (
						<div className="flex items-center gap-3 rounded-card border-[1.5px] border-amber bg-raised-hover px-3.5 py-3">
							<span
								aria-hidden="true"
								className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-raised font-bold"
							>
								{initials(picked.name)}
							</span>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="font-semibold">{picked.name}</span>
								<span
									className={`text-[14px] ${picked.balance > 0 ? "text-subtle" : "text-danger"}`}
								>
									{creditCount(picked.balance)}
								</span>
							</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => pick(undefined)}
							>
								Change
							</Button>
						</div>
					) : (
						<>
							<Input
								id="player"
								type="search"
								autoComplete="off"
								placeholder="Search by name or email"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
							{matches.length > 0 ? (
								<ul className="m-0 flex list-none flex-col gap-1 p-0">
									{matches.map((p) => (
										<li key={p.id}>
											<button
												type="button"
												onClick={() => pick(p.id)}
												className="flex min-h-12 w-full items-center justify-between gap-3 rounded-field bg-surface px-3.5 text-left text-ink hover:bg-raised-hover"
											>
												<span className="font-semibold">{p.name}</span>
												<span
													className={`tnum text-[14px] ${p.balance > 0 ? "text-subtle" : "text-danger"}`}
												>
													{creditCount(p.balance)}
												</span>
											</button>
										</li>
									))}
								</ul>
							) : q ? (
								<p className="m-0 text-[14px] text-subtle">
									Nobody in the group matches “{query.trim()}”.
								</p>
							) : null}
						</>
					)}
				</div>

				<div className="flex flex-col gap-3.5">
					<div className="flex items-center justify-between gap-3">
						<button
							type="button"
							className={stepper}
							aria-label="One less credit"
							disabled={amount <= 1}
							onClick={() => setAmount((a) => Math.max(1, a - 1))}
						>
							−
						</button>
						<div className="flex flex-col items-center">
							<span className="display tnum text-[88px] text-amber leading-[0.9]">
								{amount}
							</span>
							<span className="text-[14px] text-subtle">
								credits to add · ${amount * PAYMENT.perNight} received
							</span>
						</div>
						<button
							type="button"
							className={stepper}
							aria-label="One more credit"
							disabled={amount >= MAX_CREDITS_AT_ONCE}
							onClick={() =>
								setAmount((a) => Math.min(MAX_CREDITS_AT_ONCE, a + 1))
							}
						>
							+
						</button>
					</div>
					<div className="grid grid-cols-4 gap-2">
						{QUICK.map((n) => (
							<button
								key={n}
								type="button"
								aria-pressed={amount === n}
								className={chip}
								onClick={() => setAmount(n)}
							>
								{n}
							</button>
						))}
					</div>
				</div>

				<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
					<legend className="mb-2 p-0 font-semibold text-[14px] text-subtle">
						Paid with
					</legend>
					<div className="flex flex-wrap gap-2">
						{METHODS.map((m) => (
							<button
								key={m.value}
								type="button"
								aria-pressed={method === m.value}
								className={chip}
								onClick={() => setMethod(m.value)}
							>
								{m.label}
							</button>
						))}
					</div>
				</fieldset>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="note">Note (optional)</Label>
					<Input
						id="note"
						maxLength={200}
						placeholder={method === "other" ? "Zelle" : ""}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				</div>

				<div className="flex flex-col gap-2">
					<Button
						type="submit"
						size="lg"
						disabled={!picked || !valid || add.isPending}
					>
						{picked
							? `Add ${creditCount(amount)} to ${firstName(picked.name)}`
							: "Pick a player first"}
					</Button>
					{picked ? (
						<span className="text-center text-[13px] text-subtle">
							New balance: {picked.balance + amount} · {firstName(picked.name)}{" "}
							gets a confirmation email
						</span>
					) : null}
				</div>
			</form>

			<p className="m-0 text-[14px] text-subtle">
				Taking credits away, or putting a mistake right? Do it from the player’s
				page under <Link to="/admin/users">Players</Link>. Every change is in
				the <Link to="/admin/ledger">ledger</Link>.
			</p>
		</div>
	);
}
