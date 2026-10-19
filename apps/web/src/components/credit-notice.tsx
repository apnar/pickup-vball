import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { balanceLine, creditCount } from "@/lib/credits";
import { orpc } from "@/utils/orpc";

/**
 * Your balance at the top of the week. A quiet pill while there are credits
 * to spend; at zero or below, the flag the spec asks for, said once, with
 * the way to fix it. It never stops anybody answering.
 */
export default function CreditNotice() {
	const mine = useQuery(orpc.credits.mine.queryOptions());
	if (!mine.data) return null;
	const { balance } = mine.data;
	if (balance > 0) {
		return (
			<Link
				to="/credits"
				className="self-start rounded-full bg-raised-hover px-3.5 py-1.5 font-semibold text-[15px] text-ink no-underline hover:bg-raised hover:text-ink"
			>
				<span className="display tnum text-[18px] text-amber">{balance}</span>{" "}
				{balance === 1 ? "credit" : "credits"} left
			</Link>
		);
	}
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-danger-tile p-4">
			<p className="m-0 max-w-[60ch] text-ink-soft">
				<span className="font-semibold text-danger">
					{creditCount(balance)}.
				</span>{" "}
				{balanceLine(balance, "you")}
			</p>
			<Link
				to="/credits"
				className="inline-flex min-h-11 items-center rounded-field border-[1.5px] border-line px-3.5 font-semibold text-[15px] text-ink no-underline hover:bg-raised-hover hover:text-ink"
			>
				How to pay
			</Link>
		</div>
	);
}
