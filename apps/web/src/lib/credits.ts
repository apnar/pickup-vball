/** "1 credit", "6 credits", "-2 credits". */
export function creditCount(n: number): string {
	return `${n} ${Math.abs(n) === 1 ? "credit" : "credits"}`;
}

/**
 * The line under a balance. Below zero is said plainly and once: the
 * nights were played, and paying is how it gets back to zero. No guilt.
 */
export function balanceLine(balance: number, who: "you" | string): string {
	const you = who === "you";
	if (balance > 0) {
		return `${creditCount(balance)} · enough for ${balance === 1 ? "1 night" : `${balance} nights`}`;
	}
	if (balance === 0) {
		return you
			? "Out of credits. You can still RSVP; top up before your next night."
			: `Out of credits. ${who} can still RSVP, but should top up before the next night.`;
	}
	const owed = balance === -1 ? "1 night" : `${-balance} nights`;
	return you
		? `${owed} played on credit. Top up to cover ${balance === -1 ? "it" : "them"}.`
		: `${owed} played on credit, to be paid.`;
}

/** Amber when there is something to spend, the danger pink at zero or below. */
export function balanceTone(balance: number): string {
	return balance > 0 ? "text-amber" : "text-danger";
}

/** "Oct 18 · 8:41 PM" on the gym's clock. */
export function entryWhen(at: Date | string): string {
	const d = new Date(at);
	const day = d.toLocaleDateString("en-US", {
		timeZone: "America/New_York",
		month: "short",
		day: "numeric",
	});
	const time = d.toLocaleTimeString("en-US", {
		timeZone: "America/New_York",
		hour: "numeric",
		minute: "2-digit",
	});
	return `${day} · ${time}`;
}
