import { safeReturnPath } from "@pickup-vball/email/links";
import { Button } from "@pickup-vball/ui/components/button";
import { Input } from "@pickup-vball/ui/components/input";
import { Label } from "@pickup-vball/ui/components/label";
import { useForm } from "@tanstack/react-form";
import {
	Link,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

/**
 * Password sign-in. The secondary way in on the login page: most players
 * never set a password, but an admin has to.
 */
export default function SignInForm() {
	const navigate = useNavigate();
	const router = useRouter();
	const { redirect } = useSearch({ from: "/login" });

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{
					email: value.email,
					password: value.password,
				},
				{
					onSuccess: async () => {
						// The session hangs off the root route's context, so the
						// router has to fetch it again before we move.
						await router.invalidate();
						navigate({ to: safeReturnPath(redirect) });
						toast.success("You’re signed in.");
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Enter a valid email address."),
				password: z.string().min(8, "Passwords are at least 8 characters."),
			}),
		},
	});

	return (
		<div className="flex flex-col gap-4">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="flex flex-col gap-4"
			>
				<form.Field name="email">
					{(field) => (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={field.name}>Email</Label>
							<Input
								id={field.name}
								name={field.name}
								type="email"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{field.state.meta.errors.map((error) => (
								<p key={error?.message} className="m-0 text-[13px] text-danger">
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Field name="password">
					{(field) => (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={field.name}>Password</Label>
							<Input
								id={field.name}
								name={field.name}
								type="password"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{field.state.meta.errors.map((error) => (
								<p key={error?.message} className="m-0 text-[13px] text-danger">
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ canSubmit, isSubmitting }) => (
						<Button
							type="submit"
							variant="outline"
							className="w-full"
							disabled={!canSubmit || isSubmitting}
						>
							{isSubmitting ? "Signing in..." : "Sign in"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<Link
				to="/forgot-password"
				className="flex min-h-11 items-center self-start text-[14px]"
			>
				Forgot your password?
			</Link>
		</div>
	);
}
