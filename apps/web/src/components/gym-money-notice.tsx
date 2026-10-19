import { buttonVariants } from "@pickup-vball/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { dollars } from "@/lib/contributions";
import { orpc } from "@/utils/orpc";

/**
 * The standing fact about you with one button, the way the break notice on
 * the RSVP board works. Only while you still owe: paid, excused, or the ask
 * closed and it is gone. Nothing here writes -- an admin marks it paid.
 */
export default function GymMoneyNotice() {
	const mine = useQuery(orpc.contributions.mine.queryOptions());
	if (mine.data?.status !== "unpaid") return null;
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-warn-bg p-4 text-warn">
			<p className="m-0 max-w-[60ch]">
				<span className="font-semibold">
					You owe {dollars(mine.data.amount)} toward the gym.
				</span>{" "}
				{mine.data.instructions}
			</p>
			<Link
				to="/dashboard"
				className={buttonVariants({
					variant: "outline",
					size: "sm",
					className: "no-underline",
				})}
			>
				How to pay
			</Link>
		</div>
	);
}
