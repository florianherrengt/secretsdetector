import { z } from 'zod';
import type { FC } from 'hono/jsx';
import { Section } from '../components/Section.js';
import { ScanCard } from '../components/ScanCard.js';
import { Layout } from '../layout.js';

export const settingsPagePropsSchema = z.object({
	email: z.string().min(1),
	message: z.string().min(1).optional(),
	billingPortalActionUrl: z.string().min(1),
	canManageBilling: z.boolean(),
	deleteAccountUrl: z.string().min(1),
});

export type SettingsPageProps = z.infer<typeof settingsPagePropsSchema>;

export const SettingsPage: FC<SettingsPageProps> = z
	.function()
	.args(settingsPagePropsSchema)
	.returns(z.custom<ReturnType<FC<SettingsPageProps>>>())
	.implement(({ email, message, billingPortalActionUrl, canManageBilling, deleteAccountUrl }) => {
		return (
			<Layout title="Settings" topNavMode="app">
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">Settings</h1>
					{message ? (
						<div
							data-testid="flash-message"
							class="rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground"
						>
							{message}
						</div>
					) : null}
					<Section title="Navigation">
						<ScanCard>
							<a
								href="/domains"
								class="inline-flex rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
							>
								Go to domains
							</a>
						</ScanCard>
					</Section>
					<Section title="Account">
						<ScanCard>
							<div class="space-y-4">
								<div>
									<p class="text-sm font-medium text-muted-foreground">Email</p>
									<p class="text-sm text-foreground">{email}</p>
								</div>
								<form action="/auth/logout" method="post">
									<button
										type="submit"
										class="rounded-md bg-error px-4 py-2 text-sm font-medium text-error-foreground transition-colors hover:bg-error/90"
									>
										Sign out
									</button>
								</form>
							</div>
						</ScanCard>
					</Section>
					<Section title="Billing" data-testid="billing-section">
						<ScanCard>
							<div class="space-y-3">
								<p data-testid="billing-description" class="text-sm text-foreground">
									Open Stripe Customer Portal to manage your plan, invoices, and payment methods.
								</p>
								<p class="text-xs text-muted-foreground">
									Portal links are short-lived. Click Manage billing when you're ready to use it.
								</p>
								<form data-testid="billing-form" action={billingPortalActionUrl} method="post">
									<button
										type="submit"
										data-testid="manage-billing-button"
										disabled={!canManageBilling}
										class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
									>
										Manage billing
									</button>
								</form>
								{canManageBilling ? null : (
									<p
										data-testid="billing-unavailable-message"
										class="text-xs text-muted-foreground"
									>
										Billing portal is unavailable until Stripe is configured.
									</p>
								)}
							</div>
						</ScanCard>
					</Section>
					<Section title="Danger Zone">
						<ScanCard>
							<p class="text-sm text-foreground">
								Permanently delete your account and all associated data. This action cannot be
								undone.
							</p>
							<div class="mt-4">
								<a
									href={deleteAccountUrl}
									class="rounded-md bg-error px-4 py-2 text-sm font-medium text-error-foreground transition-colors hover:bg-error/90"
								>
									Delete account
								</a>
							</div>
						</ScanCard>
					</Section>
				</div>
			</Layout>
		);
	});
