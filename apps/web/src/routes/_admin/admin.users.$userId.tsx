import { signed } from "@pickup-vball/api/credits";
import { Button, buttonVariants } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import SectionKicker from "@/components/section-kicker";
import { initials } from "@/components/user-menu";
import { balanceLine, balanceTone, entryWhen } from "@/lib/credits";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/users/$userId")({
	component: PlayerPage,
});

const thClass =
	"px-[18px] py-3.5 text-left font-semibold text-[13px] text-subtle uppercase tracking-[0.08em]";

const STATUS: Record<string, string> = {
	active: "Active",
	suspended: "On a break",
	deactivated: "Deactivated",
};

/**
 * Which groups somebody is in: the nights they can see. Saved as a set, so
 * unticking one is as much an answer as ticking another.
 */
function GroupsPanel({ userId, admin }: { userId: string; admin: boolean }) {
	const queryClient = useQueryClient();
	const groups = useQuery(orpc.groups.list.queryOptions());
	const current = (groups.data ?? [])
		.filter((g) => g.memberIds.includes(userId))
		.map((g) => g.id);
	const [picked, setPicked] = useState<Set<string> | null>(null);
	const chosen = picked ?? new Set(current);
	const save = useMutation(
		orpc.people.setGroups.mutationOptions({
			onSuccess: () => {
				toast.success("Groups saved.");
				setPicked(null);
				queryClient.invalidateQueries({ queryKey: orpc.groups.key() });
				queryClient.invalidateQueries({ queryKey: orpc.people.key() });
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	return (
		<Panel className="flex flex-col gap-3.5">
			<SectionKicker className="m-0">Groups</SectionKicker>
			<p className="m-0 text-[14px] text-subtle">
				{admin
					? "As an admin they see every night anyway. Groups decide which emails they get."
					: "They see, and get emails about, nights in these groups only."}
			</p>
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					save.mutate({ userId, groupIds: [...chosen] });
				}}
			>
				<fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
					<legend className="sr-only">Groups</legend>
					{(groups.data ?? []).map((g) => (
						<label
							key={g.id}
							className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field px-2 hover:bg-raised-hover"
						>
							<input
								type="checkbox"
								className="size-5 accent-amber"
								checked={chosen.has(g.id)}
								onChange={(e) => {
									const next = new Set(chosen);
									if (e.target.checked) next.add(g.id);
									else next.delete(g.id);
									setPicked(next);
								}}
							/>
							{g.name}
						</label>
					))}
				</fieldset>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					className="self-start"
					disabled={save.isPending || picked === null}
				>
					Save groups
				</Button>
			</form>
		</Panel>
	);
}

/** One player's credits: where they stand, how they got there, and the fixes. */
function PlayerPage() {
	const { userId } = Route.useParams();
	const queryClient = useQueryClient();
	const detail = useQuery(
		orpc.credits.person.queryOptions({ input: { userId } }),
	);
	const [delta, setDelta] = useState(-1);
	const [note, setNote] = useState("");
	const [refunding, setRefunding] = useState<string | null>(null);

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.credits.key() });
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
	};
	const onError = (error: Error) => toast.error(error.message);

	const adjust = useMutation(
		orpc.credits.adjust.mutationOptions({
			onSuccess: (result) => {
				toast.success(`Saved. The balance is now ${result.balance}.`);
				setNote("");
				setDelta(-1);
				refresh();
			},
			onError,
		}),
	);
	const refund = useMutation(
		orpc.credits.refund.mutationOptions({
			onSuccess: (result) => {
				toast.success(`Refunded. The balance is now ${result.balance}.`);
				setRefunding(null);
				refresh();
			},
			onError,
		}),
	);

	if (detail.isPending) return <p className="m-0 text-subtle">Loading…</p>;
	if (!detail.data) {
		return (
			<div className="flex flex-col items-start gap-4">
				<p className="m-0 text-ink-soft">
					{detail.error?.message ?? "That player could not be found."}
				</p>
				<Link to="/admin/users">Back to players</Link>
			</div>
		);
	}

	const { person, balance, entries } = detail.data;
	const first = person.name.split(/\s+/)[0] || person.name;
	const joined = new Date(person.createdAt).toLocaleDateString("en-US", {
		timeZone: "America/New_York",
		month: "long",
		year: "numeric",
	});

	return (
		<div className="flex flex-col gap-7">
			<div className="flex flex-col gap-3.5">
				<Link
					to="/admin/users"
					className="self-start font-semibold text-[14px]"
				>
					← Players
				</Link>
				<div className="flex flex-wrap items-center gap-[18px]">
					<span
						aria-hidden="true"
						className="display inline-flex size-[72px] shrink-0 items-center justify-center rounded-full bg-raised text-[30px]"
					>
						{initials(person.name)}
					</span>
					<div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
						<h1 className="display m-0 break-words text-[48px] leading-none">
							{person.name}
						</h1>
						<span className="wrap-anywhere text-[15px] text-subtle">
							{person.email} · joined {joined} · {STATUS[person.status]}
						</span>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
				<GroupsPanel userId={person.id} admin={person.role === "admin"} />
				<Panel className="flex flex-col gap-3.5">
					<SectionKicker className="m-0">Credits</SectionKicker>
					<div className="flex items-center gap-4">
						<span
							className={`display tnum text-[72px] leading-[0.9] ${balanceTone(balance)}`}
						>
							{balance}
						</span>
						<span className="text-[14px] text-subtle leading-snug">
							{balanceLine(balance, first)}
						</span>
					</div>
					<Link
						to="/admin/credits"
						search={{ userId: person.id }}
						className={buttonVariants({ className: "self-start" })}
					>
						Add credits for a payment
					</Link>
				</Panel>

				<Panel className="flex flex-col gap-3.5">
					<SectionKicker className="m-0">Correction</SectionKicker>
					<p className="m-0 text-[14px] text-subtle">
						For anything that isn’t a payment or a night played. It goes on the
						ledger with your reason; nothing is ever edited or deleted.
					</p>
					<form
						className="flex flex-col gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							adjust.mutate({ userId: person.id, delta, note });
						}}
					>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-label="One fewer"
								onClick={() => setDelta((d) => (d - 1 === 0 ? -1 : d - 1))}
							>
								−1
							</Button>
							<span
								className={`display tnum min-w-[3ch] text-center text-[32px] ${delta > 0 ? "text-amber" : "text-ink"}`}
								aria-live="polite"
							>
								{signed(delta)}
							</span>
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-label="One more"
								onClick={() => setDelta((d) => (d + 1 === 0 ? 1 : d + 1))}
							>
								+1
							</Button>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="adjust-note">Why</Label>
							<Input
								id="adjust-note"
								required
								maxLength={200}
								placeholder="Charged twice on Oct 13"
								value={note}
								onChange={(e) => setNote(e.target.value)}
							/>
						</div>
						<Button
							type="submit"
							variant="outline"
							size="sm"
							className="self-start"
							disabled={adjust.isPending || !note.trim()}
						>
							Save {signed(delta)}
						</Button>
					</form>
				</Panel>
			</div>

			<section aria-labelledby="hist-h" className="flex flex-col gap-3">
				<SectionKicker id="hist-h" className="m-0">
					Activity
				</SectionKicker>
				<div className="overflow-x-auto rounded-card bg-surface">
					<table className="w-full min-w-[620px] border-collapse text-[15px]">
						<thead>
							<tr>
								<th scope="col" className={thClass}>
									Date
								</th>
								<th scope="col" className={thClass}>
									What
								</th>
								<th scope="col" className={thClass}>
									By
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									Credits
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									Balance
								</th>
								<th scope="col" className={thClass}>
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((e) => (
								<tr
									key={e.id}
									className="border-raised border-t align-middle [&>td]:px-[18px] [&>td]:py-3"
								>
									<td className="whitespace-nowrap text-subtle">
										{entryWhen(e.createdAt)}
									</td>
									<td>{e.what}</td>
									<td className="text-subtle">{e.by}</td>
									<td
										className={`display tnum text-right text-[20px] ${e.delta > 0 ? "text-amber" : "text-subtle"}`}
									>
										{signed(e.delta)}
									</td>
									<td
										className={`tnum text-right ${e.balance > 0 ? "text-ink-soft" : "text-danger"}`}
									>
										{e.balance}
									</td>
									<td className="whitespace-nowrap text-right">
										{e.refundable ? (
											refunding === e.id ? (
												<span className="inline-flex gap-1">
													<Button
														variant="accent"
														size="xs"
														disabled={refund.isPending}
														onClick={() => refund.mutate({ entryId: e.id })}
													>
														Refund 1
													</Button>
													<Button
														variant="ghost"
														size="xs"
														onClick={() => setRefunding(null)}
													>
														Cancel
													</Button>
												</span>
											) : (
												<Button
													variant="ghost"
													size="xs"
													onClick={() => setRefunding(e.id)}
												>
													Refund…
												</Button>
											)
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{entries.length === 0 ? (
						<p className="m-0 border-raised border-t px-[18px] py-4 text-subtle">
							No credits yet.
						</p>
					) : null}
				</div>
			</section>
		</div>
	);
}
