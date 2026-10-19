import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import PageTitle from "@/components/page-title";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState(false);
	const [sent, setSent] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		const result = await authClient.requestPasswordReset({
			email,
			redirectTo: "/reset-password",
		});
		setBusy(false);
		if (result.error) {
			toast.error(result.error.message || "Something went wrong. Try again.");
			return;
		}
		setSent(true);
	};

	return (
		<section className="mx-auto w-full max-w-md pt-8 pb-12 md:pt-10">
			<PageTitle
				title="Reset your password"
				sub="We’ll email you a link to choose a new one."
			/>
			<Panel className="mt-6 flex flex-col gap-4">
				{sent ? (
					<p role="status" className="m-0 text-ink-soft">
						If that address has an account, a reset link is on its way. The link
						works for one hour. If it doesn’t arrive, check your spam folder.
					</p>
				) : (
					<form onSubmit={submit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								required
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<Button type="submit" className="w-full" disabled={busy}>
							{busy ? "Sending..." : "Send me a reset link"}
						</Button>
					</form>
				)}
			</Panel>
			<Link to="/login" className="mt-4 flex min-h-11 items-center text-[14px]">
				Back to sign in
			</Link>
		</section>
	);
}
