import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@pickup-vball/ui/lib/utils";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				"min-h-12 w-full min-w-0 rounded-btn border-[1.5px] border-line bg-deep px-4 py-2 font-sans text-[17px] text-ink caret-amber outline-none transition-colors placeholder:text-faint hover:border-subtle focus-visible:border-amber focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
