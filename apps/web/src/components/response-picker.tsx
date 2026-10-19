import type { RsvpAnswer } from "@/lib/rsvp";
import { ANSWERS } from "@/lib/rsvp";

/**
 * In, maybe, out.
 *
 * Native radios, visually hidden, styled through `has-[:checked]:`. Arrow-key
 * navigation, roving focus and "In, radio button, 1 of 3, selected" all come
 * free, and a `<fieldset disabled>` covers all three while a mutation is in
 * flight. `aria-pressed` buttons would be booleans, and cannot say "maybe".
 *
 * `pending` is for the confirm page, where a pick is not yet an answer: the
 * checked cell gets an amber outline instead of a solid fill, so the one
 * solid amber thing on that page is the button that actually records it. The
 * home page writes on pick, so there the solid cell *is* the record.
 */

const BIG: Record<RsvpAnswer, string> = {
	in: "I’m in",
	maybe: "Maybe",
	out: "I’m out",
};

const BIG_CHECKED: Record<RsvpAnswer, string> = {
	in: "In ✓",
	maybe: "Maybe ✓",
	out: "Out ✓",
};

const SMALL: Record<RsvpAnswer, string> = {
	in: "In",
	maybe: "Maybe",
	out: "Out",
};

/** Solid fills once recorded: amber for in, light for out, raised for maybe. */
const RECORDED: Record<RsvpAnswer, string> = {
	in: "has-[:checked]:border-amber has-[:checked]:bg-amber has-[:checked]:text-on-amber",
	maybe:
		"has-[:checked]:border-subtle has-[:checked]:bg-raised has-[:checked]:text-ink",
	out: "has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-ground",
};

/** Unpicked, "I'm in" carries the accent border: it is the answer we hope for. */
const IDLE: Record<RsvpAnswer, string> = {
	in: "border-amber",
	maybe: "border-line",
	out: "border-line",
};

export function ResponsePicker({
	name,
	value,
	onPick,
	disabled,
	size = "large",
	legend,
	pending = false,
	inLabel,
}: {
	/** Radio group name. Must be unique on the page. */
	name: string;
	value: RsvpAnswer | null;
	onPick: (answer: RsvpAnswer) => void;
	disabled?: boolean;
	size?: "large" | "small";
	legend: string;
	/** The pick is provisional; something else records it. */
	pending?: boolean;
	/** Says what In does or did instead: "Join waitlist", "Waitlist #3". */
	inLabel?: string;
}) {
	const large = size === "large";
	return (
		<fieldset
			disabled={disabled}
			className="m-0 min-w-0 border-0 p-0 disabled:opacity-60"
		>
			<legend className={large ? "kicker mb-2" : "sr-only"}>{legend}</legend>
			<div
				className={
					large ? "grid grid-cols-3 gap-2.5" : "grid grid-cols-3 gap-1.5"
				}
			>
				{ANSWERS.map((answer) => {
					const checkedClass = pending
						? "has-[:checked]:border-amber has-[:checked]:bg-raised-hover has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-amber)]"
						: RECORDED[answer];
					return (
						<label
							key={answer}
							className={
								large
									? `flex min-h-12 cursor-pointer items-center justify-center rounded-btn border-2 bg-transparent px-1 text-center font-bold font-heading text-[19px] text-ink uppercase tracking-[0.05em] hover:bg-raised-hover ${IDLE[answer]} ${checkedClass} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber has-[:focus-visible]:outline-offset-2`
									: `flex min-h-9 cursor-pointer items-center justify-center rounded-chip border-[1.5px] border-line px-1 text-center font-semibold text-[13px] text-subtle hover:bg-raised-hover has-[:checked]:text-ink ${checkedClass} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber has-[:focus-visible]:outline-offset-2`
							}
						>
							<input
								type="radio"
								className="sr-only"
								name={name}
								value={answer}
								checked={value === answer}
								onChange={() => onPick(answer)}
							/>
							{answer === "in" && inLabel
								? inLabel
								: large
									? value === answer && !pending
										? BIG_CHECKED[answer]
										: BIG[answer]
									: SMALL[answer]}
						</label>
					);
				})}
			</div>
		</fieldset>
	);
}
