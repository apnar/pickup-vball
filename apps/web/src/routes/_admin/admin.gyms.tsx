import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { Textarea } from "@pickup-vball/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/gyms")({
	component: AdminGymsPage,
});

type FormState = { name: string; address: string; notes: string };

const emptyForm: FormState = { name: "", address: "", notes: "" };

const fieldClass = "flex flex-col gap-1.5";
const hintClass = "m-0 text-[14px] text-subtle leading-5";

function when(value: Date | string | null | undefined): string {
	if (!value) return "Never";
	// The gym's timezone, so the server and the browser print the same day.
	return new Date(value).toLocaleDateString("en-US", {
		timeZone: "America/New_York",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * The gyms, and everything about them that used to be retyped into every
 * booking or lost in a text thread: the address, and which door is open.
 */
function AdminGymsPage() {
	const queryClient = useQueryClient();
	const gyms = useQuery(orpc.gyms.list.queryOptions());
	const [form, setForm] = useState<FormState>(emptyForm);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const onError = (error: Error) => toast.error(error.message);
	const refresh = () => {
		// Nights and permits both name gyms, so their caches go stale too.
		queryClient.invalidateQueries({ queryKey: orpc.gyms.key() });
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
		queryClient.invalidateQueries({ queryKey: orpc.permits.key() });
		queryClient.invalidateQueries({ queryKey: orpc.rsvp.key() });
	};
	const reset = () => {
		setForm(emptyForm);
		setEditingId(null);
	};

	const create = useMutation(
		orpc.gyms.create.mutationOptions({
			onSuccess: () => {
				toast.success("Gym added.");
				reset();
				refresh();
			},
			onError,
		}),
	);
	const update = useMutation(
		orpc.gyms.update.mutationOptions({
			onSuccess: () => {
				toast.success("Gym updated.");
				reset();
				refresh();
			},
			onError,
		}),
	);
	const remove = useMutation(
		orpc.gyms.remove.mutationOptions({
			onSuccess: () => {
				toast.success("Gym removed.");
				setConfirmId(null);
				refresh();
			},
			onError,
		}),
	);

	const set = (key: keyof FormState) => (value: string) =>
		setForm((f) => ({ ...f, [key]: value }));

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const payload = {
			name: form.name,
			address: form.address,
			notes: form.notes || null,
		};
		if (editingId) {
			update.mutate({ id: editingId, ...payload });
		} else {
			create.mutate(payload);
		}
	};

	const rows = gyms.data ?? [];
	const busy = create.isPending || update.isPending;

	return (
		<section>
			<PageTitle
				title="Gyms"
				sub="Where the group plays. The address and notes go out with every night booked there."
			/>

			<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<Panel className="h-fit">
					<SectionKicker>{editingId ? "Edit gym" : "Add a gym"}</SectionKicker>
					<form onSubmit={submit} className="flex flex-col gap-4">
						<div className={fieldClass}>
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								required
								maxLength={80}
								placeholder="Shady Grove Middle School"
								value={form.name}
								onChange={(e) => set("name")(e.target.value)}
							/>
						</div>
						<div className={fieldClass}>
							<Label htmlFor="address">Address</Label>
							<Input
								id="address"
								required
								maxLength={200}
								placeholder="8100 Midcounty Hwy, Gaithersburg, MD 20879"
								value={form.address}
								onChange={(e) => set("address")(e.target.value)}
							/>
							<p className={hintClass}>
								The full street address. It goes in every email about a night
								here.
							</p>
						</div>
						<div className={fieldClass}>
							<Label htmlFor="notes">Notes (optional)</Label>
							<Textarea
								id="notes"
								maxLength={500}
								placeholder="Park by the side door. The main entrance is locked after 7."
								value={form.notes}
								onChange={(e) => set("notes")(e.target.value)}
							/>
							<p className={hintClass}>
								Parking, which door to use, who to ask for. Shown with every
								night here.
							</p>
						</div>
						<div className="flex flex-wrap gap-2.5">
							<Button type="submit" disabled={busy}>
								{editingId ? "Save changes" : "Add gym"}
							</Button>
							{editingId ? (
								<Button type="button" variant="outline" onClick={reset}>
									Cancel
								</Button>
							) : null}
						</div>
					</form>
				</Panel>

				<div>
					<SectionKicker>All gyms</SectionKicker>
					{rows.length === 0 ? (
						<p className="m-0 text-subtle">
							No gyms yet. Add one here, then you can book nights there.
						</p>
					) : (
						<ul className="m-0 flex list-none flex-col gap-4 p-0">
							{rows.map((g) => (
								<li key={g.id}>
									<Panel
										className={`flex flex-col gap-3.5 ${editingId === g.id ? "ring-[1.5px] ring-amber" : ""}`}
									>
										<div className="flex flex-wrap items-start gap-x-6 gap-y-3">
											<div className="flex min-w-0 flex-1 flex-col gap-1">
												<h3 className="m-0 text-[24px] leading-tight tracking-[0.02em]">
													{g.name}
												</h3>
												{g.address ? (
													<span className="text-[15px] text-subtle">
														{g.address}
													</span>
												) : (
													<span className="w-fit rounded-full bg-warn-bg px-2.5 py-0.5 font-semibold text-[13px] text-warn">
														No address on file
													</span>
												)}
												{g.notes ? (
													<p className="m-0 mt-1 max-w-[52ch] text-[15px] text-ink-soft">
														{g.notes}
													</p>
												) : null}
											</div>
											<div className="flex flex-wrap gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														setEditingId(g.id);
														setForm({
															name: g.name,
															address: g.address,
															notes: g.notes ?? "",
														});
													}}
												>
													Edit
												</Button>
												<Button
													variant={
														confirmId === g.id ? "destructive" : "outline"
													}
													size="sm"
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
											</div>
										</div>
										<div className="flex flex-wrap gap-x-6 gap-y-1 border-line-soft border-t pt-3 text-[14px] text-subtle">
											<span className="tnum">
												{g.gameCount} {g.gameCount === 1 ? "night" : "nights"}
											</span>
											<span>Last booked: {when(g.lastBookedAt)}</span>
											<span>
												{g.permits.length === 0
													? "No permit covers it"
													: `Permits: ${g.permits.map((p) => p.label).join(", ")}`}
											</span>
										</div>
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
