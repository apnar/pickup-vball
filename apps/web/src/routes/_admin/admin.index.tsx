import {
	CAPACITY_PICKS,
	DEFAULT_CAPACITY,
	FORMAT_LABEL,
	MAX_CAPACITY,
	todayInRunTimezone,
} from "@pickup-vball/api/run";
import { GAME_FORMATS, type GameFormat } from "@pickup-vball/db/schema/game";
import { Button, buttonVariants } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { DEFAULT_END_TIME, DEFAULT_START_TIME } from "@/content/run";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/")({
	component: AdminGamesPage,
});

const selectClass =
	"min-h-12 w-full min-w-0 rounded-field border-[1.5px] border-line bg-deep px-3 font-sans text-[17px] text-ink outline-none hover:border-subtle focus-visible:border-amber";

const fieldClass = "flex flex-col gap-1.5";
const hintClass = "m-0 text-[14px] text-subtle leading-5";

const chipClass =
	"min-h-12 rounded-field border-[1.5px] border-line bg-transparent px-4 font-semibold text-[16px] text-ink hover:bg-raised-hover aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-ground";

/** The form's anchor, so "+ New night" and "Edit" can both bring it into view. */
const FORM_ID = "book-night";

type FormState = {
	date: string;
	startTime: string;
	endTime: string;
	/** Empty means "whichever gym we used last"; see `gymId` below. */
	gymId: string;
	notes: string;
	permitId: string;
	format: GameFormat;
	/** As typed; a number once it is sent. */
	capacity: string;
};

const emptyForm: FormState = {
	date: "",
	startTime: DEFAULT_START_TIME,
	endTime: DEFAULT_END_TIME,
	gymId: "",
	notes: "",
	permitId: "",
	format: "6v6",
	capacity: String(DEFAULT_CAPACITY),
};

function AdminGamesPage() {
	const queryClient = useQueryClient();
	const games = useQuery(orpc.games.list.queryOptions());
	const gyms = useQuery(orpc.gyms.list.queryOptions());
	const permits = useQuery(orpc.permits.list.queryOptions());
	const [form, setForm] = useState<FormState>(emptyForm);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
		queryClient.invalidateQueries({ queryKey: orpc.rsvp.key() });
		// Booking moves "last booked", which is what the Gym dropdown
		// defaults to next time.
		queryClient.invalidateQueries({ queryKey: orpc.gyms.key() });
	};
	const onError = (error: Error) => toast.error(error.message);

	const create = useMutation(
		orpc.games.create.mutationOptions({
			onSuccess: () => {
				toast.success("Night booked.");
				setForm(emptyForm);
				refresh();
			},
			onError,
		}),
	);
	const update = useMutation(
		orpc.games.update.mutationOptions({
			onSuccess: () => {
				toast.success("Night updated.");
				setForm(emptyForm);
				setEditingId(null);
				refresh();
			},
			onError,
		}),
	);
	const remove = useMutation(
		orpc.games.remove.mutationOptions({
			onSuccess: () => {
				toast.success("Night removed.");
				setConfirmId(null);
				refresh();
			},
			onError,
		}),
	);

	const set =
		(
			key:
				| "date"
				| "startTime"
				| "endTime"
				| "gymId"
				| "notes"
				| "permitId"
				| "capacity",
		) =>
		(value: string) =>
			setForm((f) => ({ ...f, [key]: value }));

	const gymList = gyms.data ?? [];
	/** Only once we have actually asked: an empty list mid-flight is not news. */
	const noGyms = !gyms.isPending && gymList.length === 0;
	/**
	 * The gym we booked most recently, which is nearly always the next one
	 * too. Derived rather than written into the form state on load: it then
	 * follows the data by itself, so booking somewhere new makes that gym the
	 * default for the night after it, with no effect to keep in step.
	 */
	const lastUsedGymId =
		gymList
			.filter((g) => g.lastBookedAt)
			.sort(
				(a, b) =>
					new Date(b.lastBookedAt ?? 0).getTime() -
					new Date(a.lastBookedAt ?? 0).getTime(),
			)[0]?.id ??
		gymList[0]?.id ??
		"";
	const gymId = form.gymId || lastUsedGymId;
	const coversThisGym = (p: { gyms: { id: string }[] }) =>
		p.gyms.some((g) => g.id === gymId);
	const permitList = permits.data ?? [];
	const covering = permitList.filter(coversThisGym);
	const elsewhere = permitList.filter((p) => !coversThisGym(p));

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!gymId) {
			toast.error("Add a gym first.");
			return;
		}
		const payload = {
			date: form.date,
			startTime: form.startTime,
			endTime: form.endTime || null,
			gymId,
			notes: form.notes || null,
			permitId: form.permitId || null,
			format: form.format,
			capacity: Number(form.capacity),
		};
		if (editingId) {
			update.mutate({ id: editingId, ...payload });
		} else {
			create.mutate(payload);
		}
	};

	const today = todayInRunTimezone();
	const upcoming = games.data?.upcoming ?? [];
	const past = games.data?.past ?? [];
	type Night = (typeof upcoming)[number];
	const busy = create.isPending || update.isPending || gymList.length === 0;

	/*
	 * The form sits below the list of nights, so an Edit tapped on a card
	 * further up would otherwise fill in a form the admin cannot see.
	 */
	const showForm = () =>
		document.getElementById(FORM_ID)?.scrollIntoView({ block: "start" });

	const startEdit = (g: Night) => {
		setEditingId(g.id);
		setForm({
			date: g.date,
			startTime: g.startTime,
			endTime: g.endTime ?? "",
			gymId: g.gym.id,
			notes: g.notes ?? "",
			permitId: g.permit?.id ?? "",
			format: g.format,
			capacity: String(g.capacity),
		});
		showForm();
	};

	const deleteButton = (g: Night, size: "sm" | "xs") => (
		<Button
			variant={confirmId === g.id ? "destructive" : "outline"}
			size={size}
			disabled={remove.isPending}
			onClick={() => {
				if (confirmId === g.id) {
					remove.mutate({ id: g.id });
				} else {
					setConfirmId(g.id);
				}
			}}
		>
			{confirmId === g.id ? "Yes, delete" : "Delete"}
		</Button>
	);

	/**
	 * From the night itself on, a night can be checked in; once closed, the
	 * same link shows who was charged. A night that was called off has
	 * nobody to check in.
	 */
	const checkInLink = (g: Night, size: "sm" | "xs") =>
		g.status === "canceled" || g.date > today ? null : (
			<Link
				to="/admin/checkin/$gameId"
				params={{ gameId: g.id }}
				className={buttonVariants({
					variant: g.closedAt ? "outline" : "default",
					size,
				})}
			>
				{g.closedAt ? "Closed · who played" : "Check in"}
			</Link>
		);

	return (
		<section>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<PageTitle
					title="Nights"
					sub="Book a night at one of the gyms and see how many people are in."
				/>
				<a
					href={`#${FORM_ID}`}
					className={buttonVariants()}
					onClick={() => {
						// "New" means new: leave any half-finished edit behind.
						if (editingId) {
							setEditingId(null);
							setForm(emptyForm);
						}
					}}
				>
					+ New night
				</a>
			</div>

			<div className="mt-8">
				<SectionKicker>Upcoming</SectionKicker>
				{upcoming.length === 0 ? (
					<p className="m-0 text-subtle">
						{past.length === 0
							? "No nights booked yet."
							: "No upcoming nights. Book the next one below."}
					</p>
				) : (
					<ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4 p-0">
						{upcoming.map((g) => {
							const filled = Math.min(g.inCount, g.capacity);
							const left = g.capacity - filled;
							return (
								<li key={g.id}>
									<Panel
										className={`flex h-full flex-col gap-3.5 ${editingId === g.id ? "ring-[1.5px] ring-amber" : ""}`}
									>
										<div className="flex flex-col gap-1">
											<span className="display text-[28px]">{g.dateLabel}</span>
											<span className="tnum text-[15px] text-ink-soft">
												{g.timeLabel}
											</span>
											<span className="text-[14px] text-subtle">
												{g.gym.name}
											</span>
										</div>
										<div className="flex flex-col gap-2">
											<div className="flex items-baseline justify-between gap-3 text-[14px]">
												<span>
													<strong className="tnum font-extrabold font-heading text-[24px] text-amber">
														{g.inCount}
													</strong>{" "}
													in
												</span>
												<span className="tnum text-subtle">
													{left === 0
														? g.waitCount > 0
															? `Full · ${g.waitCount} waiting`
															: "Full"
														: `${left} spots left`}
												</span>
											</div>
											<div className="meter">
												<span
													style={{ width: `${(filled / g.capacity) * 100}%` }}
												/>
											</div>
										</div>
										<div className="flex flex-wrap gap-2">
											<span className="rounded-full bg-raised px-2.5 py-0.5 font-semibold text-[13px] text-ink">
												{g.formatLabel} · {g.capacity} spots
											</span>
											{g.permit ? (
												<span className="rounded-full bg-raised px-2.5 py-0.5 font-semibold text-[13px] text-ink-soft">
													Permit: {g.permit.label}
												</span>
											) : (
												<span className="rounded-full bg-warn-bg px-2.5 py-0.5 font-semibold text-[13px] text-warn">
													No permit yet
												</span>
											)}
										</div>
										{g.notes ? (
											<p className="m-0 text-[14px] text-ink-soft">{g.notes}</p>
										) : null}
										<div className="mt-auto flex flex-wrap gap-2">
											{checkInLink(g, "sm")}
											<Button
												variant="outline"
												size="sm"
												onClick={() => startEdit(g)}
											>
												Edit
											</Button>
											{g.closedAt ? null : deleteButton(g, "sm")}
										</div>
									</Panel>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<Panel id={FORM_ID} className="mt-8 scroll-mt-6">
				<SectionKicker>
					{editingId ? "Edit night" : "Book a night"}
				</SectionKicker>
				<form onSubmit={submit} className="flex flex-col gap-4">
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3.5">
						<div className={fieldClass}>
							<Label htmlFor="date">Date</Label>
							<Input
								id="date"
								type="date"
								required
								value={form.date}
								onChange={(e) => set("date")(e.target.value)}
							/>
						</div>
						<div className={fieldClass}>
							<Label htmlFor="startTime">Start</Label>
							<Input
								id="startTime"
								type="time"
								required
								value={form.startTime}
								onChange={(e) => set("startTime")(e.target.value)}
							/>
						</div>
						<div className={fieldClass}>
							<Label htmlFor="endTime">End (optional)</Label>
							<Input
								id="endTime"
								type="time"
								value={form.endTime}
								onChange={(e) => set("endTime")(e.target.value)}
							/>
						</div>
					</div>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3.5">
						<div className={fieldClass}>
							<Label htmlFor="gymId">Gym</Label>
							{noGyms ? (
								<p className="m-0 text-ink-soft">
									No gyms yet.{" "}
									<Link to="/admin/gyms">Add one on the Gyms page</Link> and it
									will show up here.
								</p>
							) : (
								<>
									<select
										id="gymId"
										className={selectClass}
										required
										value={gymId}
										onChange={(e) => set("gymId")(e.target.value)}
									>
										{gymList.map((g) => (
											<option key={g.id} value={g.id}>
												{g.name}
											</option>
										))}
									</select>
									{!editingId && gymId === lastUsedGymId ? (
										<p className={hintClass}>
											The gym you booked most recently. Change it if this night
											is somewhere else.
										</p>
									) : null}
								</>
							)}
						</div>
						<div className={fieldClass}>
							<Label htmlFor="permitId">Permit</Label>
							<select
								id="permitId"
								className={selectClass}
								value={form.permitId}
								onChange={(e) => set("permitId")(e.target.value)}
							>
								<option value="">No permit yet</option>
								{/* Every permit stays pickable -- coverage is what the paper
								    says, and the paper is occasionally wrong -- but the ones
								    that rent this gym are the ones you want. */}
								{covering.length > 0 && elsewhere.length > 0 ? (
									<>
										<optgroup label="Covers this gym">
											{covering.map((p) => (
												<option key={p.id} value={p.id}>
													{p.label} · {p.fileName}
												</option>
											))}
										</optgroup>
										<optgroup label="Other permits">
											{elsewhere.map((p) => (
												<option key={p.id} value={p.id}>
													{p.label} · {p.fileName}
												</option>
											))}
										</optgroup>
									</>
								) : (
									permitList.map((p) => (
										<option key={p.id} value={p.id}>
											{p.label} · {p.fileName}
										</option>
									))
								)}
							</select>
						</div>
					</div>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3.5">
						<fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
							<legend className="mb-1.5 p-0 font-semibold text-[14px] text-subtle leading-none">
								Format
							</legend>
							<div className="flex flex-wrap gap-2">
								{GAME_FORMATS.map((f) => (
									<button
										key={f}
										type="button"
										aria-pressed={form.format === f}
										className={chipClass}
										onClick={() => setForm((s) => ({ ...s, format: f }))}
									>
										{FORMAT_LABEL[f]}
									</button>
								))}
							</div>
						</fieldset>
						<div className={fieldClass}>
							<Label htmlFor="capacity">Spots</Label>
							<div className="flex flex-wrap gap-2">
								<Input
									id="capacity"
									type="number"
									inputMode="numeric"
									required
									min={2}
									max={MAX_CAPACITY}
									className="w-24"
									value={form.capacity}
									onChange={(e) => set("capacity")(e.target.value)}
								/>
								{CAPACITY_PICKS.map((n) => (
									<button
										key={n}
										type="button"
										aria-pressed={form.capacity === String(n)}
										className={chipClass}
										onClick={() => set("capacity")(String(n))}
									>
										{n}
									</button>
								))}
							</div>
						</div>
					</div>
					<div className={fieldClass}>
						<Label htmlFor="notes">Notes (optional)</Label>
						<Input
							id="notes"
							maxLength={300}
							placeholder="The side door is locked after 7:30."
							value={form.notes}
							onChange={(e) => set("notes")(e.target.value)}
						/>
					</div>
					<div className="flex flex-wrap gap-2.5">
						<Button type="submit" disabled={busy}>
							{editingId ? "Save changes" : "Book night"}
						</Button>
						{editingId ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setEditingId(null);
									setForm(emptyForm);
								}}
							>
								Cancel
							</Button>
						) : null}
					</div>
				</form>
			</Panel>

			{past.length > 0 ? (
				<div className="mt-8">
					<SectionKicker>Recent</SectionKicker>
					<div className="overflow-x-auto rounded-card bg-surface">
						<table className="w-full min-w-[640px] border-collapse text-[15px]">
							<thead>
								<tr>
									{["Date", "Time", "Gym", "In", "Permit", ""].map((h, i) => (
										<th
											key={h || `col-${i}`}
											scope="col"
											className="px-4 py-3.5 text-left font-semibold text-[13px] text-subtle uppercase tracking-[0.08em]"
										>
											{h || <span className="sr-only">Actions</span>}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{past.map((g) => (
									<tr
										key={g.id}
										className="border-raised border-t text-ink-soft hover:bg-raised-hover [&>td]:px-4 [&>td]:py-3"
									>
										<td className="whitespace-nowrap font-semibold text-ink">
											{g.dateLabel}
										</td>
										<td className="tnum whitespace-nowrap">{g.timeLabel}</td>
										<td>{g.gym.name}</td>
										<td className="tnum">
											{g.inCount} / {g.capacity}
										</td>
										<td className="text-[14px]">
											{g.permit ? g.permit.label : "None"}
										</td>
										<td className="whitespace-nowrap text-right">
											<div className="flex justify-end gap-2">
												{checkInLink(g, "xs")}
												<Button
													variant="outline"
													size="xs"
													onClick={() => startEdit(g)}
												>
													Edit
												</Button>
												{g.closedAt ? null : deleteButton(g, "xs")}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : null}
		</section>
	);
}
