import { z } from "zod";
import type { FC } from "hono/jsx";
import { ScanCard } from "../components/ScanCard.js";
import { Section } from "../components/Section.js";
import { Layout } from "../layout.js";

export const authRequestPagePropsSchema = z.object({
	message: z.string().optional()
});

export type AuthRequestPageProps = z.infer<typeof authRequestPagePropsSchema>;

export const AuthRequestPage: FC<AuthRequestPageProps> = z
	.function()
	.args(authRequestPagePropsSchema)
	.returns(z.custom<ReturnType<FC<AuthRequestPageProps>>>())
	.implement(({ message }) => {
		const title = "Get Started";

		return (
			<Layout title={title}>
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">{title}</h1>
					<Section title="Email Authentication" description="Enter your email and we will send a secure magic link.">
						<ScanCard>
							{message ? (
								<p class="rounded-md border border-muted bg-muted px-3 py-2 text-sm text-muted-foreground">{message}</p>
							) : null}
							<form action="/auth/request-link" method="post" class="space-y-3">
								<label for="email" class="block text-sm font-medium text-foreground">
									Email
								</label>
								<input
									id="email"
									name="email"
									type="email"
									required
									placeholder="you@example.com"
									class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
								/>
								<button
									type="submit"
									class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								>
									Send magic link
								</button>
							</form>
						</ScanCard>
					</Section>
				</div>
			</Layout>
		);
	});
