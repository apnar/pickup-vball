import { signed } from "@pickup-vball/api/credits";
import { Button, buttonVariants } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import PageTitle from "@/components/page-title";
import { entryWhen } from "@/lib/credits";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/ledger")({
	component: LedgerPage,
});

const FILTERS = [
	{ value: undefined, label: "All" },
	{ value: "added", label: "Added" },
	{ value: "used", label: "Used" },
] as const;

const thClass =
	"px-[18px] py-3.5 text-left font-semibold text-[13px] text-subtle uppercase tracking-[0.08em]";

const chip =
	"min-h-11 rounded-full border-[1.5px] border-line bg-transparent px-[18px] font-semibold text-[15px] text-ink hover:bg-raised-hover aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-ground";

/** Every credit in and out, with the balance each one left behind. */
function LedgerPage() {
	const [direction, setDirection] = useState<"added" | "used" | undefined>();
	const [query, setQuery] = useState("");
	const ledger = useQuery(
		orpc.credits.ledger.queryOptions({ input: { direction } }),
	);

	const exportCsv = useMutation(
		orpc.credits.exportCsv.mutationOptions({
			onSuccess: ({ csv }) => {
				const url = URL.createObjectURL(
					new Blob([csv], { type: "text/csv;charset=utf-8" }),
				);
				const a = document.createElement("a");
				a.href = url;
				a.download = `credits-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
				a.click();
				URL.revokeObjectURL(url);
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	const q = query.trim().toLowerCase();
	const rows = (ledger.data?.entries ?? []).filter(
		(r) => !q || r.playerName.toLowerCase().includes(q),
	);
	const data = ledger.data;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<PageTitle
					title="Credits ledger"
					sub="Every credit added by an admin or used at check-in."
				/>
				<div className="flex flex-wrap gap-2.5">
					<Button
						variant="outline"
						disabled={exportCsv.isPending}
						onClick={() => exportCsv.mutate({})}
					>
						Export CSV
					</Button>
					<Link to="/admin/credits" className={buttonVariants()}>
						+ Give credits
					</Link>
				</div>
			</div>

			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3.5">
				<div className="flex flex-col gap-1 rounded-card bg-surface p-[18px]">
					<span className="kicker">Added · {data?.month ?? ""}</span>
					<span className="display tnum text-[40px] text-amber leading-none">
						{data ? signed(data.added) : "–"}
					</span>
				</div>
				<div className="flex flex-col gap-1 rounded-card bg-surface p-[18px]">
					<span className="kicker">Used · {data?.month ?? ""}</span>
					<span className="display tnum text-[40px] leading-none">
						{data ? signed(-data.used) : "–"}
					</span>
				</div>
				<Link
					to="/admin/users"
					className="flex flex-col gap-1 rounded-card bg-danger-tile p-[18px] text-ink no-underline hover:text-ink"
				>
					<span className="kicker text-danger">At 0 or below</span>
					<span className="display tnum text-[40px] leading-none">
						{data
							? `${data.atOrBelowZero} ${data.atOrBelowZero === 1 ? "player" : "players"}`
							: "–"}
					</span>
				</Link>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
					<legend className="sr-only">Show</legend>
					{FILTERS.map((f) => (
						<button
							key={f.label}
							type="button"
							aria-pressed={direction === f.value}
							className={chip}
							onClick={() => setDirection(f.value)}
						>
							{f.label}
						</button>
					))}
				</fieldset>
				<div className="flex items-center gap-2 text-[14px] text-subtle">
					<label htmlFor="ledger-player">Player</label>
					<Input
						id="ledger-player"
						type="search"
						placeholder="Any player"
						className="w-[200px] max-w-[55vw]"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>
			</div>

			<div className="overflow-x-auto rounded-card bg-surface">
				<table className="w-full min-w-[720px] border-collapse text-[15px]">
					<thead>
						<tr>
							<th scope="col" className={thClass}>
								Date
							</th>
							<th scope="col" className={thClass}>
								Player
							</th>
							<th scope="col" className={thClass}>
								Reason
							</th>
							<th scope="col" className={thClass}>
								By
							</th>
							<th scope="col" className={`${thClass} text-right`}>
								Change
							</th>
							<th scope="col" className={`${thClass} text-right`}>
								Balance
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr
								key={r.id}
								className="border-raised border-t [&>td]:px-[18px] [&>td]:py-3"
							>
								<td className="whitespace-nowrap text-subtle">
									{entryWhen(r.createdAt)}
								</td>
								<td className="font-semibold">
									<Link
										to="/admin/users/$userId"
										params={{ userId: r.userId }}
										className="text-ink"
									>
										{r.playerName}
									</Link>
								</td>
								<td>{r.what}</td>
								<td className="text-subtle">{r.by}</td>
								<td
									className={`display tnum text-right text-[20px] ${r.delta > 0 ? "text-amber" : "text-subtle"}`}
								>
									{signed(r.delta)}
								</td>
								<td
									className={`tnum text-right ${r.balance > 0 ? "text-ink-soft" : "text-danger"}`}
								>
									{r.balance}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{rows.length === 0 ? (
					<p className="m-0 border-raised border-t px-[18px] py-4 text-subtle">
						{ledger.isPending
							? "Loading…"
							: q
								? "Nothing for that player."
								: "Nothing on the ledger yet. Credits show up here once you add some or close a night."}
					</p>
				) : null}
			</div>
		</div>
	);
}
