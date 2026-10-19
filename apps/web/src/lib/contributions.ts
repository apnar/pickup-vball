/** Whole dollars with a comma where a four-figure rental earns one. */
export function dollars(n: number): string {
	return `$${Math.round(n)
		.toFixed(0)
		.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export type MyContribution = {
	amount: number;
	instructions: string;
	status: "unpaid" | "paid" | "excused";
};
