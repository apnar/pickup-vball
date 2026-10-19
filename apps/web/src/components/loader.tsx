import { Loader2 } from "lucide-react";

export default function Loader() {
	return (
		<div
			role="status"
			className="flex h-full items-center justify-center pt-8 text-amber"
		>
			<Loader2 aria-hidden="true" className="size-6 animate-spin" />
			<span className="sr-only">Loading</span>
		</div>
	);
}
