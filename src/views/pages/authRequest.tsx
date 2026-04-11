import { z } from "zod";
import type { FC } from "hono/jsx";
import { Layout } from "../layout.js";

export const authRequestPagePropsSchema = z.object({
	mode: z.enum(["sign-in", "sign-up"]),
	message: z.string().optional()
});

export type AuthRequestPageProps = z.infer<typeof authRequestPagePropsSchema>;

export const AuthRequestPage: FC<AuthRequestPageProps> = z
	.function()
	.args(authRequestPagePropsSchema)
	.returns(z.custom<ReturnType<FC<AuthRequestPageProps>>>())
	.implement(({ mode, message }) => {
		const title = mode === "sign-up" ? "Sign Up" : "Sign In";

		return (
			<Layout title={title}>
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
					<p class="mt-2 text-sm text-gray-600">Enter your email and we will send a secure magic link.</p>

					{message ? (
						<p class="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{message}</p>
					) : null}

					<form action="/auth/request-link" method="post" class="mt-5 space-y-3">
						<label for="email" class="block text-sm font-medium text-gray-700">
							Email
						</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							placeholder="you@example.com"
							class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						/>
						<input type="hidden" name="mode" value={mode} />
						<button type="submit" class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
							Send magic link
						</button>
					</form>
				</section>
			</Layout>
		);
	});
