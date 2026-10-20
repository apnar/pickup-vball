import { muted, urlLink } from "../render";
import type { Rendered } from "../telnyx";
import { baseFacts, nameList, peopleAre, type RsvpFacts, render } from "./rsvp";

export type RsvpConfirmedInput = RsvpFacts & { permitUrl: string | null };

/** Stage 03. The confirming yes landed. Fires once, never un-fires. */
export function rsvpConfirmedEmail(input: RsvpConfirmedInput): Rendered {
	const facts = baseFacts(input);
	if (input.maybeNames.length > 0) {
		facts.push({ label: "Maybe", value: nameList(input.maybeNames) });
	}
	return render({
		subject: `Volleyball is on: ${input.dateLabel}, ${input.timeLabel}.`,
		title: `Volleyball is on: ${input.dateLabel}`,
		kicker: "Confirmed",
		heading: "The night is on.",
		lead: `${peopleAre(input.inCount)} in, so the night is confirmed. If you said maybe, please switch to in or out before ${input.decideAt}.`,
		facts,
		notes: input.notes,
		bodyExtra: input.permitUrl
			? muted(
					`If gym staff ask to see the permit, it is here: ${urlLink(input.permitUrl)}`,
				)
			: "",
		// No Maybe button: everyone reading this already said in or maybe, and
		// the button a maybe needs is the one that resolves it.
		answers: ["in", "out"],
		tail: "Bring water and court shoes. See you there.",
		facts_: input,
		textExtra: input.permitUrl ? ["", `Permit: ${input.permitUrl}`] : [],
	});
}
