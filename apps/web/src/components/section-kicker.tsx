/** A section heading: condensed, uppercase, the size the mockups give "Who's in". */
export default function SectionKicker({
	children,
	className = "mb-4",
	id,
}: {
	children: React.ReactNode;
	className?: string;
	id?: string;
}) {
	return (
		<h2
			id={id}
			className={`m-0 font-bold font-heading text-[22px] uppercase leading-tight tracking-[0.04em] md:text-[24px] ${className}`}
		>
			{children}
		</h2>
	);
}
