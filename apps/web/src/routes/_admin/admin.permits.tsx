import { Button, buttonVariants } from "@pickup-vball/ui/components/button";
import { Checkbox } from "@pickup-vball/ui/components/checkbox";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/permits")({
	component: AdminPermitsPage,
});

type Gym = { id: string; name: string };

const fieldClass = "flex flex-col gap-1.5";
const hintClass = "m-0 text-[14px] text-subtle leading-5";
const legendClass = "mb-1.5 p-0 font-semibold text-[14px] text-subtle";

/**
 * Which gyms one permit rents. Checkboxes rather than a
 * `<select multiple>`: the county puts two gyms on one permit often enough
 * that ticking them has to be obvious, and nobody discovers ctrl-click.
 */
function GymChecklist({
	gyms,
	checked,
	onToggle,
	idPrefix,
	legend,
}: {
	gyms: Gym[];
	checked: Set<string>;
	onToggle: (id: string, next: boolean) => void;
	idPrefix: string;
	legend: string;
}) {
	return (
		<fieldset className="m-0 min-w-0 border-0 p-0">
			<legend className={legendClass}>{legend}</legend>
			<div className="flex flex-col rounded-field border-[1.5px] border-line bg-deep px-3 py-1">
				{gyms.map((g) => (
					<div key={g.id} className="flex min-h-11 items-center gap-3">
						<Checkbox
							id={`${idPrefix}-${g.id}`}
							checked={checked.has(g.id)}
							onCheckedChange={(next) => onToggle(g.id, next === true)}
						/>
						<Label
							htmlFor={`${idPrefix}-${g.id}`}
							className="font-normal text-[15px] text-ink leading-snug"
						>
							{g.name}
						</Label>
					</div>
				))}
			</div>
		</fieldset>
	);
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminPermitsPage() {
	const queryClient = useQueryClient();
	const permits = useQuery(orpc.permits.list.queryOptions());
	const gyms = useQuery(orpc.gyms.list.queryOptions());
	const [label, setLabel] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [gymIds, setGymIds] = useState<Set<string>>(new Set());
	const [confirmId, setConfirmId] = useState<string | null>(null);
	/** Which permit's coverage is open for editing, and what is ticked in it. */
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingGymIds, setEditingGymIds] = useState<Set<string>>(new Set());
	const fileInput = useRef<HTMLInputElement>(null);

	const toggleIn =
		(setter: (update: (prev: Set<string>) => Set<string>) => void) =>
		(id: string, next: boolean) =>
			setter((prev) => {
				const copy = new Set(prev);
				if (next) {
					copy.add(id);
				} else {
					copy.delete(id);
				}
				return copy;
			});

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.permits.key() });
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
		queryClient.invalidateQueries({ queryKey: orpc.rsvp.key() });
		// The Gyms page lists which permits cover each gym.
		queryClient.invalidateQueries({ queryKey: orpc.gyms.key() });
	};
	const onError = (error: Error) => toast.error(error.message);

	const upload = useMutation(
		orpc.permits.upload.mutationOptions({
			onSuccess: () => {
				toast.success("Permit added.");
				setLabel("");
				setFile(null);
				setGymIds(new Set());
				if (fileInput.current) fileInput.current.value = "";
				refresh();
			},
			onError,
		}),
	);
	const setGyms = useMutation(
		orpc.permits.setGyms.mutationOptions({
			onSuccess: () => {
				toast.success("Gyms updated.");
				setEditingId(null);
				refresh();
			},
			onError,
		}),
	);
	const remove = useMutation(
		orpc.permits.remove.mutationOptions({
			onSuccess: () => {
				toast.success("Permit deleted.");
				setConfirmId(null);
				refresh();
			},
			onError,
		}),
	);

	const gymList = gyms.data ?? [];
	/** Only once we have actually asked: an empty list mid-flight is not news. */
	const noGyms = !gyms.isPending && gymList.length === 0;

	return (
		<section>
			<PageTitle
				title="Permits"
				sub="Gym rental permits, kept as PDFs. Attach one to a night when you book it."
			/>

			<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<Panel className="h-fit">
					<SectionKicker>Add a permit</SectionKicker>
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							if (!file) {
								toast.error("Choose a PDF first.");
								return;
							}
							upload.mutate({ label, file, gymIds: [...gymIds] });
						}}
					>
						<div className={fieldClass}>
							<Label htmlFor="label">Label</Label>
							<Input
								id="label"
								required
								maxLength={80}
								placeholder="Shady Grove, Sep 14 - 28"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
							/>
						</div>
						<div className={fieldClass}>
							<Label htmlFor="file">PDF</Label>
							<Input
								id="file"
								ref={fileInput}
								type="file"
								accept="application/pdf,.pdf"
								required
								className="py-2.5 text-[15px] file:mr-3 file:border-0 file:bg-transparent file:font-semibold file:text-amber"
								onChange={(e) => setFile(e.target.files?.[0] ?? null)}
							/>
							<p className={hintClass}>
								PDF only, up to 10 MB. Anyone with the link can open it.
							</p>
						</div>
						{noGyms ? (
							<div className={fieldClass}>
								<span className="font-semibold text-[14px] text-subtle">
									Gyms covered
								</span>
								<p className="m-0 text-ink-soft">
									No gyms yet. <Link to="/admin/gyms">Add one</Link>, then you
									can choose which gyms this permit covers.
								</p>
							</div>
						) : (
							<div className={fieldClass}>
								<GymChecklist
									gyms={gymList}
									checked={gymIds}
									onToggle={toggleIn(setGymIds)}
									idPrefix="new"
									legend="Gyms covered"
								/>
								<p className={hintClass}>
									Tick every gym listed on the permit. Some permits cover more
									than one.
								</p>
							</div>
						)}
						<div>
							<Button type="submit" disabled={upload.isPending}>
								{upload.isPending ? "Uploading…" : "Add permit"}
							</Button>
						</div>
					</form>
				</Panel>

				<div>
					<SectionKicker>On file</SectionKicker>
					{(permits.data ?? []).length === 0 ? (
						<p className="m-0 text-subtle">No permits yet.</p>
					) : (
						<ul className="m-0 flex list-none flex-col gap-4 p-0">
							{(permits.data ?? []).map((p) => (
								<li key={p.id}>
									<Panel className="flex flex-col gap-3.5">
										<div className="flex flex-wrap items-start gap-x-6 gap-y-3">
											<div className="flex min-w-0 flex-1 flex-col gap-1 text-[14px] text-subtle">
												<h3 className="m-0 text-[24px] text-ink leading-tight tracking-[0.02em]">
													{p.label}
												</h3>
												<span className="tnum">
													{p.fileName} · {formatSize(p.size)}
												</span>
												<span>
													{p.gyms.length === 0
														? "No gyms ticked."
														: `Covers: ${p.gyms.map((g) => g.name).join(", ")}`}
												</span>
												<span>
													{p.games.length === 0
														? "Not attached to a night yet."
														: `Nights: ${p.games.map((g) => g.dateLabel).join(", ")}`}
												</span>
											</div>
											<div className="flex flex-wrap gap-2">
												<a
													href={`/api/permits/${p.id}/file`}
													target="_blank"
													rel="noreferrer"
													className={buttonVariants({
														variant: "outline",
														size: "sm",
													})}
												>
													View
												</a>
												{gymList.length > 0 ? (
													<Button
														variant="outline"
														size="sm"
														aria-expanded={editingId === p.id}
														onClick={() => {
															if (editingId === p.id) {
																setEditingId(null);
																return;
															}
															setEditingId(p.id);
															setEditingGymIds(
																new Set(p.gyms.map((g) => g.id)),
															);
														}}
													>
														{editingId === p.id ? "Close" : "Gyms"}
													</Button>
												) : null}
												<Button
													variant={
														confirmId === p.id ? "destructive" : "outline"
													}
													size="sm"
													disabled={remove.isPending}
													onClick={() => {
														if (confirmId === p.id) {
															remove.mutate({ id: p.id });
														} else {
															setConfirmId(p.id);
														}
													}}
												>
													{confirmId === p.id ? "Yes, delete" : "Delete"}
												</Button>
											</div>
										</div>
										{editingId === p.id ? (
											<div className="border-line-soft border-t pt-4">
												<GymChecklist
													gyms={gymList}
													checked={editingGymIds}
													onToggle={toggleIn(setEditingGymIds)}
													idPrefix={`edit-${p.id}`}
													legend="Gyms this permit covers"
												/>
												<div className="mt-3 flex flex-wrap gap-2.5">
													<Button
														size="sm"
														disabled={setGyms.isPending}
														onClick={() =>
															setGyms.mutate({
																id: p.id,
																gymIds: [...editingGymIds],
															})
														}
													>
														Save
													</Button>
													<Button
														size="sm"
														variant="outline"
														onClick={() => setEditingId(null)}
													>
														Cancel
													</Button>
												</div>
											</div>
										) : null}
									</Panel>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</section>
	);
}
