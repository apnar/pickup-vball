import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import SignInForm from "@/components/sign-in-form";
import { SITE_NAME } from "@/content/run";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		redirect: z.string().optional(),
		error: z.string().optional(),
	}),
	component: RouteComponent,
});

/**
 * The way most people get in: they never set a password, and every link we
 * email them signs them in. Lost the email, and this sends another.
 */
function RequestLink() {
	const [email, setEmail] = useState("");
	const [asked, setAsked] = useState(false);

	const request = useMutation(
		orpc.people.requestLink.mutationOptions({
			onSuccess: () => setAsked(true),
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	if (asked) {
		return (
			<p role="status" className="panel-outline m-0 text-ink-soft">
				If that address is in the group, a sign-in link is on its way. Check
				your inbox.
			</p>
		);
	}

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				request.mutate({ email });
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="link-email">Email</Label>
				<Input
					id="link-email"
					type="email"
					required
					autoComplete="email"
					placeholder="you@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<Button
				type="submit"
				size="lg"
				className="w-full"
				disabled={request.isPending}
			>
				{request.isPending ? "Sending..." : "Email me a sign-in link"}
			</Button>
		</form>
	);
}

/** What `/api/auth/link` means when it sends somebody back here. */
const ERRORS: Record<string, string> = {
	link: "That sign-in link didn’t work. Enter your email below and we’ll send you a new one.",
	admin:
		"Admins sign in with a password rather than a link. Use the password form below.",
	revoked:
		"This account has been deactivated, so its sign-in links no longer work. If that’s unexpected, please get in touch with Viroj.",
};

/** The lines of a court seen from above, drawn behind the heading. */
function CourtLines() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 390 420"
			fill="none"
			stroke="currentColor"
			strokeWidth={3}
			className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-auto w-full max-w-[390px] text-raised-hover"
		>
			<rect x="40" y="-40" width="310" height="420" />
			<path d="M40 170h310M40 120h310" />
			<path d="M30 170h330" strokeWidth={6} className="text-raised" />
		</svg>
	);
}

function RouteComponent() {
	const { error } = Route.useSearch();
	const message = error ? ERRORS[error] : undefined;

	return (
		<section className="relative isolate mx-auto flex w-full max-w-md flex-col gap-8 pt-[200px] pb-12">
			<CourtLines />
			<div className="flex flex-col gap-3.5">
				<span className="display text-[20px] text-amber tracking-[0.08em]">
					{SITE_NAME}
				</span>
				<h1 className="display m-0 text-[56px] leading-[0.9] md:text-[64px]">
					Next game’s
					<br />
					on the board.
				</h1>
				<p className="m-0 text-[16px] text-subtle leading-[1.45]">
					Sign in to see this week’s nights and lock in your spot.
				</p>
			</div>

			{message ? (
				<p role="alert" className="m-0 rounded-card bg-warn-bg p-4 text-warn">
					{message}
				</p>
			) : null}

			<div className="flex flex-col gap-3">
				<RequestLink />
				<p className="m-0 text-center text-[14px] text-subtle">
					Invite only. New here? Ask Viroj to add you.
				</p>
			</div>

			{/* Open from the start when an admin was turned away from the link
			    door: a password is their only way in. */}
			<details
				open={error === "admin"}
				className="group rounded-card border-[1.5px] border-line"
			>
				<summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
					Sign in with a password
					<svg
						aria-hidden="true"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-subtle transition-transform group-open:rotate-180"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</summary>
				<div className="px-4 pt-1 pb-4">
					<SignInForm />
				</div>
			</details>
		</section>
	);
}
