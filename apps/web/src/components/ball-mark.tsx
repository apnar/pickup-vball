/** A volleyball's seams, drawn faintly in the corner of the balance card. */
export default function BallMark() {
	return (
		<svg
			aria-hidden="true"
			width="220"
			height="220"
			viewBox="0 0 220 220"
			fill="none"
			stroke="currentColor"
			strokeWidth={3}
			className="pointer-events-none absolute -top-[50px] -right-[60px] text-raised"
		>
			<circle cx="110" cy="110" r="100" />
			<path
				strokeLinecap="round"
				d="M110 110C150 80 160 40 140 15M110 110C116 159.6 145.6 188.3 177.3 183.5M110 110C64 90.4 24.4 101.7 12.7 131.5M132 122C172 92 182 52 165 26M88.6 123.1C94.6 172.7 124.2 201.4 155.2 199.6M109.4 85C63.4 65.3 23.8 76.7 9.8 104.4"
			/>
		</svg>
	);
}
