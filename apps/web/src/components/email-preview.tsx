import { Button } from "@pickup-vball/ui/components/button";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Shared by the email admin page and the gym money page: both preview and
 * send email the same way, and a preview that differs between pages would be
 * a preview of nothing.
 */

export type Preview = { subject: string; html: string; text: string };
export type ListOutcome = {
	attempted: number;
	sent: number;
	failed: { emails: string[]; error: string }[];
};

export function reportSend(result: ListOutcome) {
	const failed = result.attempted - result.sent;
	if (failed === 0) {
		toast.success(`Sent to ${result.sent}.`);
	} else {
		toast.warning(
			`Sent to ${result.sent}, ${failed} failed. See recent sends.`,
		);
	}
}

export function PreviewPanel({
	preview,
	onClose,
}: {
	preview: Preview & { recipientCount: number };
	onClose: () => void;
}) {
	const [showText, setShowText] = useState(false);
	return (
		<Panel className="flex flex-col gap-3.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="kicker">
					Preview · goes to{" "}
					<span className="tnum text-amber">{preview.recipientCount}</span>
				</span>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="xs"
						onClick={() => setShowText((v) => !v)}
					>
						{showText ? "Show HTML" : "Show plain text"}
					</Button>
					<Button variant="outline" size="xs" onClick={onClose}>
						Close
					</Button>
				</div>
			</div>
			<p className="m-0 text-[15px]">
				<span className="text-subtle">Subject:</span>{" "}
				<span className="font-semibold text-ink">{preview.subject}</span>
			</p>
			{showText ? (
				<pre className="m-0 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-field border-[1.5px] border-line-soft bg-deep p-4 font-mono text-ink-soft text-xs leading-5">
					{preview.text}
				</pre>
			) : (
				// The email is light on purpose (mail clients repaint dark
				// backgrounds unpredictably), so the frame keeps a white ground
				// and shows it the way an inbox will.
				<iframe
					title="Email preview"
					sandbox=""
					srcDoc={preview.html}
					className="h-[480px] w-full rounded-field border-[1.5px] border-line-soft bg-white"
				/>
			)}
		</Panel>
	);
}
