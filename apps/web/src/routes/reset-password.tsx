import { Button, buttonVariants } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { Panel } from "@pickup-vball/ui/components/panel";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import PageTitle from "@/components/page-title";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);

	const dead = !token || Boolean(error);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!token) return;
		if (password.length < 8) {
			toast.error("Use at least 8 characters.");
			return;
		}
		if (password !== confirm) {
			toast.error("The two passwords don’t match.");
			return;
		}
		setBusy(true);
		const result = await authClient.resetPassword({
			newPassword: password,
			token,
		});
		setBusy(false);
		if (result.error) {
			toast.error(
				result.error.message || "That link didn’t work. Ask for a new one.",
			);
			return;
		}
		toast.success("Password changed. Sign in with your new password.");
		navigate({ to: "/login" });
	};

	return (
		<section className="mx-auto w-full max-w-md pt-8 pb-12 md:pt-10">
			<PageTitle
				title={dead ? "Link expired" : "Choose a new password"}
				sub={
					dead
						? "Reset links work once and expire after an hour."
						: "At least 8 characters."
				}
			/>
			{dead ? (
				<Link
					to="/forgot-password"
					className={buttonVariants({ className: "mt-6 w-full no-underline" })}
				>
					Send me a new link
				</Link>
			) : (
				<Panel className="mt-6">
					<form onSubmit={submit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="password">New password</Label>
							<Input
								id="password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="confirm">Confirm new password</Label>
							<Input
								id="confirm"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
							/>
						</div>
						<Button type="submit" className="w-full" disabled={busy}>
							{busy ? "Saving..." : "Change password"}
						</Button>
					</form>
				</Panel>
			)}
		</section>
	);
}
