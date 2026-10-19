import { cn } from "@pickup-vball/ui/lib/utils";
import type * as React from "react";

/**
 * A card: rounded, on the surface color. `outline` is the hollow version the
 * mockups use for a secondary box (the credits panel, the reverse-coed rules)
 * so it reads as related to, but quieter than, the card beside it.
 */
function Panel({
	className,
	variant = "solid",
	...props
}: React.ComponentProps<"div"> & { variant?: "solid" | "outline" }) {
	return (
		<div
			data-slot="panel"
			className={cn(variant === "solid" ? "panel" : "panel-outline", className)}
			{...props}
		/>
	);
}

export { Panel };
