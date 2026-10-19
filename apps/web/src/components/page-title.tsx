/**
 * The page's one big heading, with an optional line of plain copy under it.
 * `hero` is the size the mockups give "This week"; everything else is a step
 * down so a page full of admin tables does not open by shouting.
 */
export default function PageTitle({
	title,
	sub,
	size = "default",
}: {
	title: React.ReactNode;
	sub?: React.ReactNode;
	size?: "default" | "hero";
}) {
	const sizeClass =
		size === "hero"
			? "text-[52px] md:text-[64px]"
			: "text-[44px] md:text-[56px]";
	return (
		<div className="flex flex-col gap-1.5">
			<h1 className={`display m-0 ${sizeClass}`}>{title}</h1>
			{sub ? <p className="m-0 max-w-[60ch] text-subtle">{sub}</p> : null}
		</div>
	);
}
