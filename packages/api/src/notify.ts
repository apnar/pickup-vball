/**
 * What each kind of message is called on the settings page, what a player
 * gets until they choose, which ones cannot be switched off, and the rules
 * that turn a choice into the channels a message actually goes by.
 *
 * Pure by design, like cycle.ts: the web app bundles this to draw the
 * settings page, so nothing here may import drizzle or the Worker env.
 */

import type { EmailKind } from "@pickup-vball/db/schema/email";
import type {
	NotifyChannel,
	NotifyTopic,
} from "@pickup-vball/db/schema/notify";

import { addDays, runInstant, todayInRunTimezone } from "./run";

export type TopicInfo = {
	topic: NotifyTopic;
	label: string;
	sub: string;
	default: NotifyChannel;
	/**
	 * About a night they said yes to. Off is not offered: somebody who
	 * misses that a night was cancelled drives to a locked gym.
	 */
	required: boolean;
};

/** In the order the settings page lists them. */
export const TOPICS: readonly TopicInfo[] = [
	{
		topic: "call",
		label: "Night calls",
		sub: "The evening before: are you in?",
		default: "email",
		required: false,
	},
	{
		topic: "nudge",
		label: "Reminders to answer",
		sub: "The morning of, and a last call, while a night is short",
		default: "email",
		required: false,
	},
	{
		topic: "confirmed",
		label: "Night confirmed",
		sub: "When enough are in that it's on",
		default: "email",
		required: true,
	},
	{
		topic: "final",
		label: "On or off",
		sub: "The 1 PM verdict, including a cancellation",
		default: "email",
		required: true,
	},
	{
		topic: "waitlist_in",
		label: "Off the waitlist",
		sub: "When a spot opens and it's yours",
		default: "email",
		required: true,
	},
	{
		topic: "reminder",
		label: "Game-day reminder",
		sub: "A few hours before a night you're in",
		default: "email",
		required: false,
	},
	{
		topic: "spot_open",
		label: "A spot opened",
		sub: "On a full night, when nobody is waiting",
		default: "off",
		required: false,
	},
	{
		topic: "low_credit",
		label: "Low credit",
		sub: "When you're down to your last credit",
		default: "email",
		required: false,
	},
	{
		topic: "credits_added",
		label: "Credit receipts",
		sub: "When an admin adds credits you paid for",
		default: "email",
		required: false,
	},
	{
		topic: "message",
		label: "Group updates",
		sub: "Anything an admin sends the group",
		default: "email",
		required: false,
	},
];

export const TOPIC: Record<NotifyTopic, TopicInfo> = Object.fromEntries(
	TOPICS.map((t) => [t.topic, t]),
) as Record<NotifyTopic, TopicInfo>;

/** Which choice a send of each kind reads. */
export const KIND_TOPIC: Record<EmailKind, NotifyTopic> = {
	rsvp_call: "call",
	rsvp_nudge: "nudge",
	rsvp_last_call: "nudge",
	rsvp_confirmed: "confirmed",
	rsvp_final: "final",
	waitlist_in: "waitlist_in",
	reminder: "reminder",
	spot_open: "spot_open",
	low_credit: "low_credit",
	credits_added: "credits_added",
	message: "message",
	announcement: "message",
};

/** What a choice is worth for this topic: Off on a required one is not. */
export function choiceFor(
	topic: NotifyTopic,
	chosen: NotifyChannel | undefined,
): NotifyChannel {
	const info = TOPIC[topic];
	if (!chosen) return info.default;
	if (chosen === "off" && info.required) return info.default;
	return chosen;
}

export type Reach = {
	/** Their address has not bounced or reported us. */
	canEmail: boolean;
	/** A verified number that has not texted STOP. */
	canText: boolean;
};

/**
 * The channels a message goes by. A choice the person cannot currently be
 * reached on falls back to the other channel rather than to nothing:
 * somebody who chose text and then removed their number still hears about
 * the night, by email, which is how it worked before they chose.
 */
export function channelsFor(
	choice: NotifyChannel,
	reach: Reach,
): { email: boolean; text: boolean } {
	if (choice === "off") return { email: false, text: false };
	let email = choice === "email" || choice === "both";
	let text = choice === "text" || choice === "both";
	if (text && !reach.canText) {
		text = false;
		email = reach.canEmail;
	}
	if (email && !reach.canEmail) {
		email = false;
		text = reach.canText;
	}
	return { email, text };
}

/** No list texts between these hours (ET). */
export const QUIET_FROM = "21:00";
export const QUIET_UNTIL = "08:00";

/**
 * When a list text may go: now, unless it is the middle of the night, when
 * it waits for the morning. A text somebody is waiting on (a code, the reply
 * to their own IN) does not come through here.
 */
export function textSendAfter(now: Date): Date {
	const today = todayInRunTimezone(now);
	const morning = runInstant(today, QUIET_UNTIL);
	if (now.getTime() < morning.getTime()) return morning;
	const evening = runInstant(today, QUIET_FROM);
	if (now.getTime() < evening.getTime()) return now;
	return runInstant(addDays(today, 1), QUIET_UNTIL);
}
