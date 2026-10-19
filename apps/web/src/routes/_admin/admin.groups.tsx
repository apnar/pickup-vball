import {
	CAPACITY_PICKS,
	DEFAULT_CAPACITY,
	FORMAT_LABEL,
	MAX_CAPACITY,
	NIGHT_TYPE_LABEL,
} from "@pickup-vball/api/run";
import {
	GAME_FORMATS,
	type GameFormat,
	NIGHT_TYPES,
	type NightType,
} from "@pickup-vball/db/schema/group";
import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/groups")({
	component: GroupsPage,
});

const chipClass =
	"min-h-12 rounded-field border-[1.5px] border-line bg-transparent px-4 font-semibold text-[16px] text-ink hover:bg-raised-hover aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-ground";

type Draft = {
	name: string;
	format: GameFormat;
	nightType: NightType;
	capacity: string;
};

const EMPTY: Draft = {
	name: "",
	format: "6v6",
	nightType: "coed",
	capacity: String(DEFAULT_CAPACITY),
};

const FORM_ID = "group-form";

/**
 * The kinds of night the group runs, and who each is for. A night is booked
 * in one, starts from its format, type and spots, and only its members see
 * it -- so this page is also where an advanced night is kept advanced.
 */
function GroupsPage() {
	const queryClient = useQueryClient();
	const groups = useQuery(orpc.groups.list.queryOptions());
	const people = useQuery(orpc.people.list.queryOptions());
	const [draft, setDraft] = useState<Draft>(EMPTY);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [membersOf, setMembersOf] = useState<string | null>(null);
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const onError = (error: Error) => toast.error(error.message);
	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.groups.key() });
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
	};
	const reset = () => {
		setDraft(EMPTY);
		setEditingId(null);
	};

	const create = useMutation(
		orpc.groups.create.mutationOptions({
			onSuccess: () => {
				toast.success("Group added.");
				reset();
				refresh();
			},
			onError,
		}),
	);
	const update = useMutation(
		orpc.groups.update.mutationOptions({
			onSuccess: () => {
				toast.success("Group saved.");
				reset();
				refresh();
			},
			onError,
		}),
	);
	const remove = useMutation(
		orpc.groups.remove.mutationOptions({
			onSuccess: () => {
				toast.success("Group deleted.");
				setConfirmId(null);
				refresh();
			},
			onError: (error: Error) => {
				setConfirmId(null);
				onError(error);
			},
		}),
	);
	const saveMembers = useMutation(
		orpc.groups.setMembers.mutationOptions({
			onSuccess: () => {
				toast.success("Members saved.");
				setMembersOf(null);
				refresh();
			},
			onError,
		}),
	);

	const list = groups.data ?? [];
	const roster = (people.data ?? [])
		.filter((p) => p.effectiveStatus !== "deactivated")
		.sort((a, b) => a.name.localeCompare(b.name));
	const nameOf = new Map(roster.map((p) => [p.id, p.name]));

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const fields = {
			name: draft.name,
			format: draft.format,
			nightType: draft.nightType,
			capacity: Number(draft.capacity),
		};
		if (editingId) update.mutate({ id: editingId, ...fields });
		else create.mutate(fields);
	};

	const openMembers = (id: string, memberIds: string[]) => {
		setMembersOf(membersOf === id ? null : id);
		setPicked(new Set(memberIds));
	};

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<PageTitle
					title="Groups"
					sub="Each night is booked in a group. Only the people in a group see its nights and get its emails. Admins see them all."
				/>
				<a
					href={`#${FORM_ID}`}
					className="inline-flex min-h-12 items-center rounded-btn border-[1.5px] border-amber bg-amber px-5 font-bold font-heading text-[19px] text-on-amber uppercase tracking-[0.05em] no-underline hover:bg-amber-hover hover:text-on-amber"
					onClick={reset}
				>
					+ New group
				</a>
			</div>

			{list.length === 0 && !groups.isPending ? (
				<p className="m-0 text-subtle">No groups yet. Add the first below.</p>
			) : (
				<ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4 p-0">
					{list.map((g) => (
						<li key={g.id}>
							<Panel
								className={`flex h-full flex-col gap-3.5 ${editingId === g.id ? "ring-[1.5px] ring-amber" : ""}`}
							>
								<div className="flex flex-col gap-2">
									<h2 className="m-0 font-bold font-heading text-[24px] uppercase leading-tight tracking-[0.02em]">
										{g.name}
									</h2>
									<div className="flex flex-wrap gap-2">
										<span className="chip">{FORMAT_LABEL[g.format]}</span>
										<span
											className={
												g.nightType === "revco" ? "chip-revco" : "chip"
											}
										>
											{NIGHT_TYPE_LABEL[g.nightType]}
										</span>
										<span className="chip">{g.capacity} spots</span>
									</div>
								</div>
								<p className="m-0 text-[14px] text-subtle">
									{g.memberIds.length === 0
										? "Nobody in it yet."
										: `${g.memberIds.length} ${g.memberIds.length === 1 ? "member" : "members"}: ${g.memberIds
												.map((id) => nameOf.get(id))
												.filter(Boolean)
												.join(", ")}`}
								</p>
								<div className="mt-auto flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										aria-expanded={membersOf === g.id}
										onClick={() => openMembers(g.id, g.memberIds)}
									>
										{membersOf === g.id ? "Close" : "Members"}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setEditingId(g.id);
											setDraft({
												name: g.name,
												format: g.format,
												nightType: g.nightType,
												capacity: String(g.capacity),
											});
											document
												.getElementById(FORM_ID)
												?.scrollIntoView({ block: "start" });
										}}
									>
										Edit
									</Button>
									<Button
										variant={confirmId === g.id ? "destructive" : "outline"}
										size="sm"
										disabled={remove.isPending}
										onClick={() =>
											confirmId === g.id
												? remove.mutate({ id: g.id })
												: setConfirmId(g.id)
										}
									>
										{confirmId === g.id ? "Yes, delete" : "Delete"}
									</Button>
								</div>

								{membersOf === g.id ? (
									<form
										className="flex flex-col gap-3 border-raised border-t pt-3.5"
										onSubmit={(e) => {
											e.preventDefault();
											saveMembers.mutate({ id: g.id, userIds: [...picked] });
										}}
									>
										<fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
											<legend className="mb-2 p-0 font-semibold text-[14px] text-subtle">
												Who sees {g.name} nights
											</legend>
											{roster.map((p) => (
												<label
													key={p.id}
													className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field px-2 hover:bg-raised-hover"
												>
													<input
														type="checkbox"
														className="size-5 accent-amber"
														checked={picked.has(p.id)}
														onChange={(e) => {
															const next = new Set(picked);
															if (e.target.checked) next.add(p.id);
															else next.delete(p.id);
															setPicked(next);
														}}
													/>
													<span>{p.name}</span>
													{p.role === "admin" ? (
														<span className="text-[13px] text-subtle">
															Admin, sees every night
														</span>
													) : null}
												</label>
											))}
										</fieldset>
										<div className="flex flex-wrap gap-2">
											<Button
												type="submit"
												size="sm"
												disabled={saveMembers.isPending}
											>
												Save members ({picked.size})
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() =>
													setPicked(new Set(roster.map((p) => p.id)))
												}
											>
												Everyone
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setPicked(new Set())}
											>
												Nobody
											</Button>
										</div>
									</form>
								) : null}
							</Panel>
						</li>
					))}
				</ul>
			)}

			<Panel id={FORM_ID} className="scroll-mt-6">
				<SectionKicker>{editingId ? "Edit group" : "New group"}</SectionKicker>
				<form className="flex flex-col gap-4" onSubmit={submit}>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="group-name">Name</Label>
						<Input
							id="group-name"
							required
							maxLength={60}
							placeholder="Sunday Night Volleyball"
							value={draft.name}
							onChange={(e) => setDraft({ ...draft, name: e.target.value })}
						/>
					</div>
					<p className="m-0 text-[14px] text-subtle">
						Defaults for nights booked in this group. Each night can still be
						changed when it is booked, and changing these doesn’t touch nights
						already on the schedule.
					</p>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3.5">
						<fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
							<legend className="mb-1.5 p-0 font-semibold text-[14px] text-subtle leading-none">
								Format
							</legend>
							<div className="flex flex-wrap gap-2">
								{GAME_FORMATS.map((f) => (
									<button
										key={f}
										type="button"
										aria-pressed={draft.format === f}
										className={chipClass}
										onClick={() => setDraft({ ...draft, format: f })}
									>
										{FORMAT_LABEL[f]}
									</button>
								))}
							</div>
						</fieldset>
						<fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
							<legend className="mb-1.5 p-0 font-semibold text-[14px] text-subtle leading-none">
								Type
							</legend>
							<div className="flex flex-wrap gap-2">
								{NIGHT_TYPES.map((t) => (
									<button
										key={t}
										type="button"
										aria-pressed={draft.nightType === t}
										className={chipClass}
										onClick={() => setDraft({ ...draft, nightType: t })}
									>
										{t === "revco" ? "RevCo" : NIGHT_TYPE_LABEL[t]}
									</button>
								))}
							</div>
						</fieldset>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="group-capacity">Spots</Label>
						<div className="flex flex-wrap gap-2">
							<Input
								id="group-capacity"
								type="number"
								inputMode="numeric"
								required
								min={2}
								max={MAX_CAPACITY}
								className="w-24"
								value={draft.capacity}
								onChange={(e) =>
									setDraft({ ...draft, capacity: e.target.value })
								}
							/>
							{CAPACITY_PICKS.map((n) => (
								<button
									key={n}
									type="button"
									aria-pressed={draft.capacity === String(n)}
									className={chipClass}
									onClick={() => setDraft({ ...draft, capacity: String(n) })}
								>
									{n}
								</button>
							))}
						</div>
					</div>
					<div className="flex flex-wrap gap-2.5">
						<Button
							type="submit"
							disabled={create.isPending || update.isPending}
						>
							{editingId ? "Save group" : "Add group"}
						</Button>
						{editingId ? (
							<Button type="button" variant="outline" onClick={reset}>
								Cancel
							</Button>
						) : null}
					</div>
				</form>
			</Panel>
		</div>
	);
}
