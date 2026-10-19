import { cn } from "@pickup-vball/ui/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"field-sizing-content flex min-h-24 w-full resize-none rounded-btn border-[1.5px] border-line bg-deep px-4 py-3 font-sans text-[16px] text-ink caret-amber outline-none transition-colors placeholder:text-faint hover:border-subtle focus-visible:border-amber disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
