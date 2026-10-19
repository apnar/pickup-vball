import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@pickup-vball/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/*
 * Full-size buttons are condensed uppercase, the way the mockups draw every
 * primary action. The small sizes drop to ordinary Barlow, because a table
 * row full of shouting buttons stops reading as a table.
 */
const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-btn border-[1.5px] leading-tight no-underline outline-none transition-colors focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"border-amber bg-amber text-on-amber hover:border-amber-hover hover:bg-amber-hover hover:text-on-amber",
				outline:
					"border-line bg-transparent text-ink hover:bg-raised-hover hover:text-ink aria-expanded:bg-raised-hover",
				accent:
					"border-amber bg-transparent text-ink hover:bg-raised-hover hover:text-ink",
				secondary:
					"border-raised bg-raised text-ink hover:bg-line hover:text-ink",
				ghost:
					"border-transparent bg-transparent text-amber hover:bg-raised-hover hover:text-amber-hover aria-expanded:bg-raised-hover",
				destructive:
					"border-danger/50 bg-transparent text-danger hover:bg-danger-bg hover:text-danger",
				link: "h-auto min-h-0 border-transparent bg-transparent px-0 text-amber underline-offset-[3px] hover:text-amber-hover hover:underline",
			},
			size: {
				default:
					"min-h-12 px-5 py-2 font-bold font-heading text-[19px] uppercase tracking-[0.05em]",
				lg: "min-h-14 px-6 py-2.5 font-bold font-heading text-[21px] uppercase tracking-[0.05em]",
				sm: "min-h-11 rounded-field px-3.5 py-1.5 font-sans font-semibold text-[15px]",
				xs: "min-h-8 rounded-chip px-2.5 py-1 font-sans font-semibold text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
				icon: "size-11 p-0",
				"icon-xs":
					"size-8 rounded-chip p-0 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-sm": "size-10 rounded-field p-0",
				"icon-lg": "size-12 p-0",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
