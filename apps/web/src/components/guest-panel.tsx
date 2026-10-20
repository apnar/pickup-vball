import type { Headcount } from "@pickup-vball/api/routers/rsvp";
import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { useState } from "react";

import { guestLine } from "@/lib/rsvp";

/**
 * Guests: who you are bringing, and whether there is room for them.
 *
 * The box is open whenever answers are; only the line above it changes, and
 * `guestLine` in lib/rsvp.ts says why. Nobody is stopped from putting a name
 * in early -- a guest you already invited is not something to argue with a
 * form about. Taking a guest back off is likewise never blocked: a guest has
 * no inbox and no buttons, so whoever added them is the only one who can say
 * they are not coming.
 */
export function GuestPanel({
	headcount,
	locked,
	isPending,
	add,
	removeGuest,
}: {
	headcount: Headcount;
	locked: boolean;
	isPending: boolean;
	add: (name: string) => Promise<unknown>;
	removeGuest: (rowId: string) => void;
}) {
	const { counts, capacity, rsvps } = headcount;
	const [draft, setDraft] = useState("");

	const line = guestLine(counts, capacity, locked);
	const mine = rsvps.filter((r) => r.guest && r.mine);

	return (
		<section
			aria-labelledby="guests-h"
			className="panel-outline flex flex-col gap-3"
		>
			<h3
				id="guests-h"
				className="m-0 font-bold font-heading text-[20px] tracking-[0.04em]"
			>
				Bringing a guest
			</h3>

			{mine.length > 0 ? (
				<ul className="m-0 flex list-none flex-col gap-2 p-0">
					{mine.map((r) => (
						<li
							key={r.id}
							className="flex items-center justify-between gap-3 rounded-field bg-surface-alt py-1 pr-1 pl-3"
						>
							<span className="font-medium">{r.name}</span>
							<Button
								size="sm"
								variant="ghost"
								disabled={isPending || locked}
								onClick={() => removeGuest(r.id)}
							>
								Remove
							</Button>
						</li>
					))}
				</ul>
			) : null}

			<p className="m-0 text-[14px] text-subtle">{line}</p>

			{locked ? null : (
				<>
					<form
						className="flex gap-2.5"
						onSubmit={async (e) => {
							e.preventDefault();
							if (!draft.trim()) return;
							try {
								await add(draft);
								setDraft("");
							} catch {
								// The toast already said so.
							}
						}}
					>
						<Input
							aria-label="Guest's name"
							placeholder="Guest's name"
							maxLength={40}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
						/>
						<Button type="submit" variant="outline" disabled={isPending}>
							Add
						</Button>
					</form>

					{headcount.guestSuggestions.length > 0 ? (
						<div className="flex flex-col gap-2">
							<span className="kicker">Brought before</span>
							<div className="flex flex-wrap gap-2">
								{headcount.guestSuggestions.map((name) => (
									<Button
										key={name}
										size="sm"
										variant="outline"
										disabled={isPending}
										onClick={() => add(name).catch(() => {})}
									>
										{name}
									</Button>
								))}
							</div>
						</div>
					) : null}

					<p className="m-0 text-[13px] text-subtle">
						Guests don’t get any emails from us, so if the night is called off,
						please let them know yourself.
					</p>
				</>
			)}
		</section>
	);
}
