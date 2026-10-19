"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@pickup-vball/ui/lib/utils";
import { CheckIcon } from "lucide-react";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				"peer relative flex size-5 shrink-0 items-center justify-center rounded-chip border-[1.5px] border-line bg-deep outline-none transition-colors after:absolute after:-inset-x-3 after:-inset-y-3 focus-visible:border-amber disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-checked:border-amber data-checked:bg-amber data-checked:text-on-amber",
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
			>
				<CheckIcon />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
