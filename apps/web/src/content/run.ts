/**
 * Copy and standing data for the site. Edit here; the pages read from it.
 */

export const SITE_NAME = "Viroj’s Pickup";

/** Where the group plays, for the footer and the signed-out home page. */
export const SITE_AREA = "Montgomery County, MD";

/** Prefilled start time (24-hour) when an admin books a night. */
export const DEFAULT_START_TIME = "19:30";

/** Prefilled end time (24-hour) when an admin books a night. */
export const DEFAULT_END_TIME = "22:00";

/** How a player pays. Shown on the home page and the account page. */
export const PAYMENT = {
	handle: "@Viroj7",
	perNight: 5,
	line: "Venmo Viroj at @Viroj7, or pay cash at the gym. $5 a night.",
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
		val: "6 v 6",
		rem: "4 v 4 when numbers are short.",
	},
	{
		prop: "Cost",
		val: `$${PAYMENT.perNight} a night`,
		rem: "Venmo Viroj at @Viroj7, or cash at the gym.",
	},
] as const;

/**
 * House rules, in the order they matter. Numbered where they are rendered,
 * not here, so a rule can be added anywhere without renumbering the rest.
 */
export const rules = [
	{
		title: "Play safe",
		body: "Stay on your side of the net and call out any ball that rolls onto a court. Stop the rally when someone could get hurt and replay the point.",
	},
	{
		title: "Call your own violations",
		body: "Nets, lifts, doubles and lines are on the honor system. If a call is close and the teams disagree, replay the point.",
	},
	{
		title: "Rally scoring to 25",
		body: "Win by two. When a night is running long the last game can go to 15.",
	},
	{
		title: "Everyone rotates in",
		body: "Players waiting on the side come in after each game, so everybody gets about the same time on the court.",
	},
	{
		title: "Reverse coed nights",
		body: "The net goes to women’s height (7′ 4⅛″), and men can’t attack or block in front of the 3 m line.",
	},
	{
		title: "Leave the gym as we found it",
		body: "We are guests of the school. Help put up the nets at the start and take them down at the end, and take your trash with you.",
	},
] as const;
