import { EMAIL_STAGES } from "@pickup-vball/api/cycle";
import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { Textarea } from "@pickup-vball/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
	type Preview,
	PreviewPanel,
	reportSend,
} from "@/components/email-preview";
import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/email")({
	component: AdminEmailPage,
});

const pill = (tone: "ok" | "warn" | "danger" | "neutral") =>
	`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold text-[13px] ${
		tone === "ok"
			? "bg-ok-bg text-ok"
			: tone === "warn"
				? "bg-warn-bg text-warn"
				: tone === "danger"
					? "bg-danger-bg text-danger"
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

function AdminEmailPage() {
	const queryClient = useQueryClient();
	const status = useQuery(orpc.mail.status.queryOptions());
	const games = useQuery(orpc.games.list.queryOptions());
	const recent = useQuery(orpc.mail.recent.queryOptions());

	const [preview, setPreview] = useState<
		(Preview & { recipientCount: number; key: string }) | null
	>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [textVersion, setTextVersion] = useState("");
	const [audience, setAudience] = useState<"active" | "everyone">("active");

	const onError = (error: Error) => toast.error(error.message);
	const refreshAll = () => {
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
		queryClient.invalidateQueries({ queryKey: orpc.mail.key() });
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
		setConfirmKey(null);
	};

	const previewStage = useMutation(
		orpc.mail.previewStage.mutationOptions({
			onSuccess: (data, input) =>
				setPreview({ ...data, key: `${input.stage}:${input.gameId}` }),
			onError,
		}),
	);
	const previewMessage = useMutation(
		orpc.mail.previewMessage.mutationOptions({
			onSuccess: (data) => setPreview({ ...data, key: "message" }),
			onError,
		}),
	);
	const sendStage = useMutation(
		orpc.mail.sendStage.mutationOptions({
			onSuccess: (result) => {
				reportSend(result);
				refreshAll();
			},
			onError,
		}),
	);
	const cancel = useMutation(
		orpc.mail.cancel.mutationOptions({
			onSuccess: (result) => {
				reportSend(result);
				refreshAll();
			},
			onError,
		}),
	);
	const sendMessage = useMutation(
		orpc.mail.sendMessage.mutationOptions({
			onSuccess: (result, input) => {
				if (input.toSelf) {
					toast.success(
						result.texted
							? "Sent to you by email and text."
							: "Sent to you. Check your inbox.",
					);
				} else {
					reportSend(result);
					setSubject("");
					setBody("");
					setTextVersion("");
					setPreview(null);
				}
				refreshAll();
			},
			onError,
		}),
	);
	const upcoming = games.data?.upcoming ?? [];
	const activeCount = status.data?.counts.active ?? 0;
	const everyoneCount = status.data?.counts.everyone ?? 0;
	/** Every cycle email is active-only. Only a message offers the choice. */
	const recipientCount = activeCount;
	const messageCount = audience === "everyone" ? everyoneCount : activeCount;
	const sending =
		sendStage.isPending || cancel.isPending || sendMessage.isPending;

	const confirmButton = (
		key: string,
		label: string,
		onConfirm: () => void,
		disabled = false,
	) => (
		<Button
			variant={confirmKey === key ? "default" : "outline"}
			size="xs"
			disabled={disabled || sending}
			onClick={() => {
				if (confirmKey === key) {
					onConfirm();
				} else {
					setConfirmKey(key);
				}
			}}
		>
			{confirmKey === key ? `Yes, send to ${recipientCount}` : label}
		</Button>
	);

	return (
		<div className="flex flex-col gap-8">
			<PageTitle
				title="Email"
				sub="Message the group, send an RSVP email early, and see what has gone out."
			/>

			{status.data?.dryRun ? (
				<p className="m-0 rounded-card bg-warn-bg p-4 text-warn">
					TELNYX_API_KEY isn't set here, so emails and texts are printed to the
					server log instead of being sent. Everything else works normally.
				</p>
			) : null}
			{status.data && status.data.outbox.queued > 0 ? (
				<p className="m-0 text-subtle">
					<span className="tnum">{status.data.outbox.queued}</span>{" "}
					{status.data.outbox.queued === 1 ? "text is" : "texts are"} waiting to
					go
					{status.data.outbox.due < status.data.outbox.queued
						? ", some held for the morning (no texts 9 PM to 8 AM)"
						: ", a few dozen a minute"}
					.
				</p>
			) : null}

			<div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
				<div className="flex flex-col gap-8">
					<section className="flex flex-col gap-3.5">
						<div className="flex flex-col gap-1.5">
							<SectionKicker className="m-0">RSVP emails</SectionKicker>
							<p className="m-0 max-w-[60ch] text-subtle">
								{recipientCount} active{" "}
								{recipientCount === 1 ? "player" : "players"}. These go out
								automatically on the schedule described under{" "}
								<Link to="/admin/cycle">RSVP emails</Link>. Use the buttons here
								to send one early.
							</p>
						</div>
						{upcoming.length === 0 ? (
							<p className="m-0 text-ink-soft">
								No nights booked. Once you book one, its RSVP emails start the
								day before.
							</p>
						) : (
							<ul className="m-0 flex list-none flex-col gap-4 p-0">
								{upcoming.map((g) => (
									<li key={g.id}>
										<Panel className="flex flex-col gap-3.5">
											<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
												<span className="font-extrabold font-heading text-[26px] uppercase leading-none">
													{g.dateLabel}
												</span>
												{g.status === "canceled" ? (
													<span className={pill("danger")}>Called off</span>
												) : null}
												<span className="basis-full text-[14px] text-subtle">
													{g.timeLabel} · {g.gym.name} ·{" "}
													<span className="tnum">{g.inCount}</span> in
												</span>
											</div>
											{/* A night called off has nothing left to ask or cancel. */}
											{g.status === "canceled" ? null : (
												<>
													<ul className="m-0 flex list-none flex-col gap-2 border-raised border-t p-0 pt-3.5">
														{EMAIL_STAGES.map((stage) => {
															const key = `${stage.key}:${g.id}`;
															const doneAt = g[stage.column] as
																| string
																| Date
																| null;
															return (
																<li
																	key={stage.key}
																	className="flex flex-wrap items-center gap-2"
																>
																	<span
																		className={`${pill(doneAt ? "ok" : "neutral")} mr-auto`}
																	>
																		{stage.num} {stage.title}
																		{doneAt ? ` · ${when(doneAt)}` : ""}
																	</span>
																	<Button
																		variant="ghost"
																		size="xs"
																		onClick={() =>
																			previewStage.mutate({
																				gameId: g.id,
																				stage: stage.key,
																			})
																		}
																	>
																		Preview
																	</Button>
																	{confirmButton(
																		key,
																		"Send now",
																		() =>
																			sendStage.mutate({
																				gameId: g.id,
																				stage: stage.key,
																			}),
																		preview?.key !== key,
																	)}
																</li>
															);
														})}
													</ul>
													{/*
													 * Never for the count -- whoever is in plays -- but
													 * for a shut gym or a snowstorm. There is no undo,
													 * so the button asks twice like every send here.
													 */}
													<div className="flex flex-wrap items-center gap-2 border-raised border-t pt-3.5">
														<span className="mr-auto text-[14px] text-subtle">
															Gym closed or weather? Cancelling tells everyone
															in the group.
														</span>
														{confirmButton(
															`cancel:${g.id}`,
															"Cancel the night",
															() => cancel.mutate({ gameId: g.id }),
															false,
														)}
													</div>
												</>
											)}
										</Panel>
									</li>
								))}
							</ul>
						)}
					</section>

					<Panel className="flex flex-col gap-3.5">
						<SectionKicker className="m-0">Message the group</SectionKicker>
						<form
							className="flex flex-col gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								previewMessage.mutate({
									subject,
									body,
									audience,
									text: textVersion,
								});
							}}
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="subject">Subject</Label>
								<Input
									id="subject"
									required
									maxLength={120}
									placeholder="Gym closed next week"
									value={subject}
									onChange={(e) => setSubject(e.target.value)}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="body">Message</Label>
								<Textarea
									id="body"
									required
									maxLength={5000}
									rows={6}
									className="min-h-32"
									placeholder="The gym is closed for maintenance next week. See you the week after."
									value={body}
									onChange={(e) => setBody(e.target.value)}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="text-version">Text version</Label>
								<Textarea
									id="text-version"
									maxLength={300}
									rows={2}
									placeholder={
										subject || "Gym closed next week. Back the week after."
									}
									value={textVersion}
									onChange={(e) => {
										setTextVersion(e.target.value);
										setPreview(null);
									}}
								/>
								<p className="m-0 text-[14px] text-subtle">
									For people who get group updates by text. Blank sends the
									subject. {textVersion.length}/300
								</p>
							</div>
							<fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
								<legend className="kicker mb-1.5 p-0">Who gets it</legend>
								<div className="flex flex-wrap gap-x-6">
									<label className="flex min-h-11 cursor-pointer items-center gap-2 text-ink">
										<input
											type="radio"
											name="audience"
											className="size-5 accent-amber"
											checked={audience === "active"}
											onChange={() => {
												setAudience("active");
												setPreview(null);
											}}
										/>
										Active ({activeCount})
									</label>
									<label className="flex min-h-11 cursor-pointer items-center gap-2 text-ink">
										<input
											type="radio"
											name="audience"
											className="size-5 accent-amber"
											checked={audience === "everyone"}
											onChange={() => {
												setAudience("everyone");
												setPreview(null);
											}}
										/>
										Everyone ({everyoneCount})
									</label>
								</div>
								<p className="m-0 text-[14px] text-subtle">
									{audience === "everyone"
										? "Also reaches people taking a break. Use it for news they'd want anyway."
										: "Everyone in the group except people taking a break."}
								</p>
							</fieldset>
							<div className="flex flex-wrap gap-2">
								<Button type="submit" variant="outline" size="sm">
									Preview
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={!subject || !body || sending}
									onClick={() =>
										sendMessage.mutate({
											subject,
											body,
											audience,
											text: textVersion,
											toSelf: true,
										})
									}
								>
									Send to me first
								</Button>
								<Button
									type="button"
									variant={confirmKey === "message" ? "default" : "outline"}
									size="sm"
									disabled={preview?.key !== "message" || sending}
									onClick={() => {
										if (confirmKey === "message") {
											sendMessage.mutate({
												subject,
												body,
												audience,
												text: textVersion,
												toSelf: false,
											});
										} else {
											setConfirmKey("message");
										}
									}}
								>
									{confirmKey === "message"
										? `Yes, send to ${messageCount}`
										: `Send (${messageCount})`}
								</Button>
							</div>
						</form>
					</Panel>
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
				<SectionKicker className="m-0">Recent sends</SectionKicker>
				{(recent.data ?? []).length === 0 ? (
					<p className="m-0 text-subtle">Nothing sent yet.</p>
				) : (
					<ul className="m-0 list-none overflow-hidden rounded-card bg-surface p-0">
						{(recent.data ?? []).map((row) => (
							<li
								key={row.id}
								className="flex flex-col gap-1 border-raised border-t px-4 py-3 first:border-t-0"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-x-3">
									<span className="font-semibold text-ink">{row.subject}</span>
									<span className="whitespace-nowrap text-[14px] text-subtle">
										{when(row.createdAt)}
									</span>
								</div>
								<div className="flex flex-wrap items-center gap-2 text-[14px] text-subtle">
									<span>
										<span className="capitalize">
											{row.kind.replaceAll("_", " ")}
										</span>{" "}
										· <span className="tnum">{row.recipientCount}</span> emailed
										{row.textCount > 0 ? (
											<>
												{" "}
												· <span className="tnum">{row.textCount}</span> texted
											</>
										) : null}
									</span>
									{row.audience === "everyone" ? (
										<span className={pill("neutral")}>Everyone</span>
									) : null}
									{row.failedCount > 0 ? (
										<span className={pill("warn")}>
											{row.failedCount} failed
										</span>
									) : null}
								</div>
								{row.errors.length > 0 ? (
									<details className="text-[14px] text-ink-soft">
										<summary className="cursor-pointer py-2.5 text-amber">
											What failed
										</summary>
										{row.errors.map((e) => (
											<p
												key={e.error + e.emails.join(",")}
												className="wrap-anywhere m-0 mt-1"
											>
												{e.emails.join(", ")}: {e.error}
											</p>
										))}
									</details>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
