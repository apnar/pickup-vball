import { TOPIC, TOPICS } from "@pickup-vball/api/notify";
import type {
	NotifyChannel,
	NotifyTopic,
} from "@pickup-vball/db/schema/notify";
import { Button } from "@pickup-vball/ui/components/button";
import { Checkbox } from "@pickup-vball/ui/components/checkbox";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { TEXTS } from "@/content/run";
import { type client, orpc } from "@/utils/orpc";

const pill = "rounded-full px-2.5 py-0.5 font-semibold text-[13px]";

const CHANNEL_LABEL: Record<NotifyChannel, string> = {
	off: "Off",
	email: "Email",
	text: "Text",
	both: "Both",
};

const notifyOptions = orpc.account.notify.queryOptions();

type NotifyState = Awaited<ReturnType<typeof client.account.notify>>;

function useNotify() {
	const queryClient = useQueryClient();
	const query = useQuery(notifyOptions);
	// Every mutation here answers with the whole state, so the page takes it
	// as is rather than asking again.
	const settle = (state: NotifyState) =>
		queryClient.setQueryData(notifyOptions.queryKey, state);
	return { query, settle };
}

/**
 * The mobile number texts go to. A number only counts once its owner has
 * typed back the code we texted it, and ticking the consent box is part of
 * asking for that code: it is the opt-in a carrier wants to see.
 */
export function PhonePanel() {
	const { query, settle } = useNotify();
	const state = query.data;
	const [editing, setEditing] = useState(false);
	const [phone, setPhone] = useState("");
	const [consent, setConsent] = useState(false);
	const [code, setCode] = useState("");
	const onError = (error: Error) => toast.error(error.message);

	const start = useMutation(
		orpc.account.startPhone.mutationOptions({
			onSuccess: (result) => {
				query.refetch();
				setCode("");
				toast.success(
					result.dryRun
						? `Texts aren’t switched on here, so the code for ${result.phone} is in the server log.`
						: `Code sent to ${result.phone}.`,
				);
			},
			onError,
		}),
	);
	const confirm = useMutation(
		orpc.account.confirmPhone.mutationOptions({
			onSuccess: (next) => {
				settle(next);
				setEditing(false);
				setPhone("");
				setConsent(false);
				setCode("");
				toast.success("Number confirmed. Pick what comes by text below.");
			},
			onError,
		}),
	);
	const remove = useMutation(
		orpc.account.removePhone.mutationOptions({
			onSuccess: (next) => {
				settle(next);
				toast.success("Number removed. Everything comes by email again.");
			},
			onError,
		}),
	);

	if (query.isPending || !state) {
		return (
			<Panel>
				<p className="m-0 text-ink-soft">Loading…</p>
			</Panel>
		);
	}

	const awaitingCode = !!state.pendingPhone && !confirm.isSuccess;
	const showForm = !state.phone || editing;

	return (
		<Panel className="flex flex-col gap-4">
			{state.phone && !editing ? (
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span className="tnum text-[17px]">{state.phone}</span>
						{state.smsOptedOut ? (
							<span className={`${pill} bg-warn-bg text-warn`}>
								Texts stopped
							</span>
						) : (
							<span className={`${pill} bg-ok-bg text-ok`}>Verified</span>
						)}
					</div>
					{state.smsOptedOut ? (
						<p className="m-0 text-ink-soft">
							You replied STOP, so nothing comes by text and anything set to
							text comes by email.{" "}
							{state.textFrom
								? `Text START to ${state.textFrom} to have texts back.`
								: "Text START to our number to have texts back."}
						</p>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditing(true)}
						>
							Change number
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={remove.isPending}
							onClick={() => remove.mutate({})}
						>
							Remove number
						</Button>
					</div>
				</div>
			) : null}

			{showForm && !awaitingCode ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start.mutate({ phone, consent: true });
					}}
				>
					<p className="m-0 text-ink-soft">
						Add a mobile number to get some or all of your messages by text. US
						numbers only.
					</p>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="phone">Mobile number</Label>
						<Input
							id="phone"
							type="tel"
							inputMode="tel"
							autoComplete="tel-national"
							placeholder="(301) 555-0123"
							required
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
						/>
					</div>
					<div className="flex items-start gap-3">
						<Checkbox
							id="sms-consent"
							className="mt-0.5"
							checked={consent}
							onCheckedChange={(next) => setConsent(next === true)}
						/>
						<Label
							htmlFor="sms-consent"
							className="font-normal text-[15px] text-ink-soft leading-snug"
						>
							{TEXTS.consent}
						</Label>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button type="submit" disabled={!consent || start.isPending}>
							Text me a code
						</Button>
						{editing ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => setEditing(false)}
							>
								Cancel
							</Button>
						) : null}
					</div>
				</form>
			) : null}

			{awaitingCode ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						confirm.mutate({ code });
					}}
				>
					<p className="m-0 text-ink-soft">
						We texted a 6-digit code to {state.pendingPhone}. It works for 10
						minutes.
					</p>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="phone-code">Code</Label>
						<Input
							id="phone-code"
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="\d{6}"
							maxLength={6}
							required
							className="tnum max-w-[12ch] text-[20px] tracking-[0.2em]"
							value={code}
							onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							type="submit"
							disabled={code.length !== 6 || confirm.isPending}
						>
							Confirm
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={start.isPending || !phone}
							onClick={() => start.mutate({ phone, consent: true })}
						>
							Send a new code
						</Button>
					</div>
				</form>
			) : null}
		</Panel>
	);
}

/** One topic's Off / Email / Text / Both, as native radios. */
function ChannelPicker({
	topic,
	value,
	canText,
	disabled,
	onPick,
}: {
	topic: NotifyTopic;
	value: NotifyChannel;
	canText: boolean;
	disabled: boolean;
	onPick: (channel: NotifyChannel) => void;
}) {
	const info = TOPIC[topic];
	const options: NotifyChannel[] = info.required
		? ["email", "text", "both"]
		: ["off", "email", "text", "both"];
	return (
		<fieldset
			disabled={disabled}
			className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
		>
			<legend className="contents">
				<span className="flex flex-col gap-0.5">
					<span className="font-semibold text-[16px] text-ink">
						{info.label}
					</span>
					<span className="text-[14px] text-subtle">{info.sub}</span>
				</span>
			</legend>
			<div
				className={`grid gap-1.5 ${options.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}
			>
				{options.map((channel) => {
					const needsPhone = channel === "text" || channel === "both";
					const off = needsPhone && !canText;
					return (
						<label
							key={channel}
							className={`flex min-h-11 items-center justify-center rounded-chip border-[1.5px] border-line px-1 text-center font-semibold text-[14px] text-subtle has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-ground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber has-[:focus-visible]:outline-offset-2 ${off ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-raised-hover"}`}
						>
							<input
								type="radio"
								className="sr-only"
								name={`notify-${topic}`}
								value={channel}
								checked={value === channel}
								disabled={off}
								onChange={() => onPick(channel)}
							/>
							{CHANNEL_LABEL[channel]}
						</label>
					);
				})}
			</div>
		</fieldset>
	);
}

/** What comes to you, and how. Each choice saves the moment it is made. */
export function NotifyPanel() {
	const { query, settle } = useNotify();
	const state = query.data;
	const save = useMutation(
		orpc.account.setNotify.mutationOptions({
			onSuccess: settle,
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	const retry = useMutation(
		orpc.account.retryEmail.mutationOptions({
			onSuccess: (next) => {
				settle(next);
				toast.success(
					"Email is back on. If it bounces again, texts take over.",
				);
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	if (query.isPending || !state) {
		return (
			<Panel>
				<p className="m-0 text-ink-soft">Loading…</p>
			</Panel>
		);
	}

	const canText = !!state.phone && !state.smsOptedOut;
	const chosen = new Map(state.topics.map((t) => [t.topic, t.channel]));

	return (
		<Panel className="flex flex-col gap-5">
			{state.emailBlocked ? (
				<div className="flex flex-col gap-2 rounded-card bg-warn-bg p-4 text-warn">
					<p className="m-0">
						Email to {state.email} stopped:{" "}
						{state.emailBlockedReason ?? "it bounced"}{" "}
						{canText
							? "Everything comes by text until it works again."
							: "Add a mobile number above so we can still reach you."}
					</p>
					<div>
						<Button
							variant="outline"
							size="sm"
							disabled={retry.isPending}
							onClick={() => retry.mutate({})}
						>
							Try email again
						</Button>
					</div>
				</div>
			) : null}
			{canText ? null : (
				<p className="m-0 text-[14px] text-subtle">
					{state.smsOptedOut
						? "Texts are stopped, so anything set to text comes by email."
						: "Add a mobile number above to get any of these by text."}
				</p>
			)}
			{TOPICS.map((t) => (
				<ChannelPicker
					key={t.topic}
					topic={t.topic}
					value={chosen.get(t.topic) ?? t.default}
					canText={canText}
					disabled={save.isPending}
					onPick={(channel) => save.mutate({ topic: t.topic, channel })}
				/>
			))}
			<p className="m-0 text-[14px] text-subtle">
				The ones without Off are about a night you said yes to, so one of them
				always reaches you. Sign-in links you ask for always come by email.
			</p>
		</Panel>
	);
}
