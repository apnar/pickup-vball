import { Button } from "@pickup-vball/ui/components/button";
import { Panel } from "@pickup-vball/ui/components/panel";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The email admin page's preview and send report, kept apart from the page
 * so that anything else that ever sends by hand previews the same way -- a
 * preview that differs between pages would be a preview of nothing.
 */

export type Preview = {
	subject: string;
	html: string;
	text: string;
	/** The same message as a text, for whoever chose texts for it. */
	textMessage?: string;
};
export type ListOutcome = {
	attempted: number;
	sent: number;
	texted?: number;
	failed: { emails: string[]; error: string }[];
};

export function reportSend(result: ListOutcome) {
	const failed = result.attempted - result.sent;
	const texted = result.texted ? `, and texted ${result.texted}` : "";
	if (failed === 0) {
		toast.success(`Emailed ${result.sent}${texted}.`);
	} else {
		toast.warning(
			`Emailed ${result.sent}${texted}; ${failed} emails failed. See recent sends.`,
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
	const [view, setView] = useState<"html" | "text" | "sms">("html");
	const views: [typeof view, string][] = [
		["html", "HTML"],
		["text", "Plain text"],
		...(preview.textMessage
			? ([["sms", "Text message"]] as [typeof view, string][])
			: []),
	];
	return (
		<Panel className="flex flex-col gap-3.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="kicker">
					Preview · goes to{" "}
					<span className="tnum text-amber">{preview.recipientCount}</span>
				</span>
				<div className="flex flex-wrap gap-2">
					{views.map(([key, label]) => (
						<Button
							key={key}
							variant={view === key ? "default" : "outline"}
							size="xs"
							aria-pressed={view === key}
							onClick={() => setView(key)}
						>
							{label}
						</Button>
					))}
					<Button variant="outline" size="xs" onClick={onClose}>
						Close
					</Button>
				</div>
			</div>
			<p className="m-0 text-[15px]">
				<span className="text-subtle">Subject:</span>{" "}
				<span className="font-semibold text-ink">{preview.subject}</span>
			</p>
			{view === "sms" ? (
				<div className="flex flex-col gap-2">
					<p className="m-0 max-w-[36ch] whitespace-pre-wrap rounded-card bg-raised p-4 text-[15px] text-ink leading-snug">
						{preview.textMessage}
					</p>
					<p className="m-0 text-[13px] text-subtle">
						The link carries each reader's own sign-in key, filled in as the
						text leaves.
					</p>
				</div>
			) : view === "text" ? (
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
