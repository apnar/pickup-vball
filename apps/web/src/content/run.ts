/**
 * Copy and standing data for the site. Edit here; the pages read from it.
 */

import { CREDIT_PRICE } from "@pickup-vball/api/run";

export const SITE_NAME = "Viroj’s Pickup";

/** Where the group plays, for the footer and the signed-out home page. */
export const SITE_AREA = "Montgomery County, MD";

/** Prefilled start time (24-hour) when an admin books a night. */
export const DEFAULT_START_TIME = "19:30";

/** Prefilled end time (24-hour) when an admin books a night. */
export const DEFAULT_END_TIME = "22:00";

/** How a player pays. Shown on the credits page and the home page. */
export const PAYMENT = {
	handle: "@Viroj7",
	/** One credit is one night; the price is the API's, so the two agree. */
	perNight: CREDIT_PRICE,
} as const;

/** The standing facts about a night, shown to players on the home page. */
export const conditions = [
	{
		prop: "Nights",
		val: "Most weeknights",
		rem: "A night is on the schedule once the gym is booked.",
	},
	{
		prop: "Time",
		val: "7:30 – 10:00 PM",
		rem: "Each night lists its own start time.",
	},
	{
		prop: "Gyms",
		val: "Magruder · Wheaton · College Gardens",
		rem: "Montgomery County school gyms. The address is on every night.",
	},
	{
		prop: "Format",
		val: "6 v 6 · 4 v 4",
		rem: "Each night is booked as one or the other. The schedule says which.",
	},
	{
		prop: "Cost",
		val: `$${PAYMENT.perNight} a night`,
		rem: "One credit per night you play, charged at check-in. Buy credits by Venmo to @Viroj7 or cash.",
	},
] as const;

/**
 * House rules, in the order they matter. Viroj's own five, then the reverse
 * coed rule the spec asks every revco night to show. Numbered where they are
 * rendered, not here, so a rule can be added anywhere without renumbering.
 * The 1 PM in the second one is the RSVP cycle's verdict (packages/api/src/
 * cycle.ts); change both or neither.
 */
export const rules = [
	{
		title: "Work your station",
		body: "When your team isn’t playing, it works another team’s match: one ref, one score keeper and two line judges. The ref makes the calls, so players don’t call their own. When it’s your turn, go to your station. It isn’t the time to practice on the side, catch up with friends or be on your phone. The teams working your games are counting on you to work theirs.",
	},
	{
		title: "Confirm by 1 PM",
		body: "Answer the email the evening before, or on the day of the night by 1 PM. At 1 PM the night is decided and teams are made from whoever is in, so a spot you haven’t confirmed may go to someone else. If your plans change, change your answer.",
	},
	{
		title: "No call, no show",
		body: "If you said you’re in and can’t make it, switch to out as soon as you know. A spot held by someone who doesn’t come keeps someone else from playing, and teams are balanced before the night, so one missing player throws them off.",
	},
	{
		title: "Team requests",
		body: "A parent who wants to play with their kids, or a new player who’d be more comfortable with a friend: just ask, and we’ll make it happen. Other requests to be on the same team we’ll try for, but can’t promise. They can throw off the balance, and playing with different people is how everyone meets each other and gets better.",
	},
	{
		title: "Attitude",
		body: "Leave the attitude at the door, and don’t be hard on people who aren’t at your level. This is a place to have fun, try new skills and grow. Anyone disrespectful to others gets a warning first. If it keeps happening, they’ll be asked to leave for the night, and after that, to leave the group.",
	},
	{
		title: "Reverse coed nights",
		body: "The net goes to women’s height (7 ft 4⅛ in), and men can’t attack or block in front of the 3 m line.",
	},
] as const;

/**
 * The text-message program, as a carrier reviewing our number reads it:
 * the opt-in box on /dashboard says `consent` word for word, and /sms and
 * /privacy are the public pages the registration links to. Change them
 * together, and tell the campaign registration if the substance changes.
 */
export const TEXTS = {
	consent: `Text me about nights I play from ${SITE_NAME}: the call, reminders, whether a night is on, and anything I turn on below. Frequency varies, usually a few texts a week. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`,
	program: [
		`${SITE_NAME} is an invite-only pickup volleyball group in ${SITE_AREA}. Members can choose to get some or all of the group's messages by text instead of, or as well as, email.`,
		"What we text: the evening-before call for a night, reminders to answer while a night is short, whether a night is on or called off, a spot opening up for you off the waitlist, a game-day reminder, credit receipts and low-credit alerts, and group updates from the organisers. Each member chooses which of these come by text.",
		"How you opt in: signed in to the site, a member enters their mobile number on their account page, ticks a box agreeing to texts, and types back the 6-digit code we text to that number. Nobody is texted without doing this, and admins cannot add a number for anyone.",
		"Frequency varies with the schedule, usually a few texts a week. Message and data rates may apply.",
		"Reply STOP at any time to stop all texts, and START to have them back. Reply HELP for help. Replying IN, OUT or MAYBE answers for the night we last texted you about.",
		"Mobile numbers are used only to send these texts. We never sell or share them, or use them for marketing.",
	],
	help: "Questions about the texts? Ask an organiser at the gym, or reply HELP.",
} as const;

/** The privacy policy, in full. Short because the site keeps little. */
export const PRIVACY = [
	{
		heading: "What we keep",
		body: `${SITE_NAME} keeps what it needs to run the nights: your name, your email address, your mobile number if you add one, your answers for each night, your check-ins, and your credit balance and payments.`,
	},
	{
		heading: "How we use it",
		body: "To tell you about nights, to keep the headcount and the waitlist, and to keep the credits straight. Email and texts go out through our messaging provider, Telnyx, which handles them only to deliver them.",
	},
	{
		heading: "Mobile numbers",
		body: "Your number is used only to send the texts you chose and to read your replies. We never sell or share mobile numbers or opt-in data with anyone, and never use them for marketing. Reply STOP to stop texts, or remove your number from your account page.",
	},
	{
		heading: "Who sees what",
		body: "Other members see your name on a night's list. The organisers see your contact details, answers and credits. Nobody else does.",
	},
	{
		heading: "Leaving",
		body: "Ask an organiser and they will take you off the group. Removing your number or replying STOP stops texts at once.",
	},
] as const;
