import { z } from 'zod';
import type { FC } from 'hono/jsx';
import { Section } from '../components/Section.js';
import { ScanCard } from '../components/ScanCard.js';
import { CsrfField } from '../components/CsrfField.js';
import { Layout } from '../layout.js';

const apiKeyEntrySchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	prefix: z.string(),
	createdAtIso: z.string(),
	lastUsedIso: z.string().nullable(),
});

export const settingsPagePropsSchema = z.object({
	email: z.string().min(1),
	message: z.string().min(1).optional(),
	billingPortalActionUrl: z.string().min(1),
	canManageBilling: z.boolean(),
	deleteAccountUrl: z.string().min(1),
	csrfToken: z.string().min(1),
	apiKeys: z.array(apiKeyEntrySchema).default([]),
	// Present exactly once after a key is created so the user can copy it.
	// Never persisted, never re-sent — closing the page loses it.
	newlyCreatedApiKey: z.string().optional(),
	createApiKeyActionUrl: z.string().min(1),
	revokeApiKeyActionUrlBase: z.string().min(1),
});

export type SettingsPageProps = z.infer<typeof settingsPagePropsSchema>;

const formatApiKeyLastUsed = z
	.function()
	.args(z.string().nullable())
	.returns(z.string())
	.implement((lastUsedIso) => {
		if (!lastUsedIso) {
			return 'Never';
		}

		return new Date(lastUsedIso).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	});

export const SettingsPage: FC<SettingsPageProps> = z
	.function()
	.args(settingsPagePropsSchema)
	.returns(z.custom<ReturnType<FC<SettingsPageProps>>>())
	.implement(
		({
			email,
			message,
			billingPortalActionUrl,
			canManageBilling,
			deleteAccountUrl,
			csrfToken,
			apiKeys,
			newlyCreatedApiKey,
			createApiKeyActionUrl,
			revokeApiKeyActionUrlBase,
		}) => {
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
										<CsrfField token={csrfToken} />
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
						<Section title="API Keys" data-testid="api-keys-section">
							<ScanCard>
								<div class="space-y-4">
									<p class="text-sm text-foreground">
										Generate a key to interact with the server programmatically. Treat it like a
										password — anyone with the key can act as your account.
									</p>
									<p class="text-xs text-muted-foreground">
										Use the key in the <span class="font-mono">Authorization: Bearer</span> header.
										Keys are shown once when created; store them somewhere safe.
									</p>

									{newlyCreatedApiKey ? (
										<div
											data-testid="new-api-key"
											class="space-y-2 rounded-md border border-border bg-muted p-3"
										>
											<p class="text-sm font-medium text-foreground">
												Copy your new API key now. You will not be able to see it again.
											</p>
											<span
												data-testid="new-api-key-value"
												class="block break-words rounded bg-background p-2 font-mono text-xs text-foreground"
											>
												{newlyCreatedApiKey}
											</span>
										</div>
									) : null}

									<form
										action={createApiKeyActionUrl}
										method="post"
										class="flex flex-col gap-2 sm:flex-row sm:items-start"
									>
										<CsrfField token={csrfToken} />
										<input
											type="text"
											name="name"
											placeholder="Key name (e.g. CI, local dev)"
											maxlength={80}
											required
											class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
										/>
										<button
											type="submit"
											data-testid="create-api-key-button"
											class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
										>
											Create key
										</button>
									</form>

									{apiKeys.length > 0 ? (
										<ul class="divide-y divide-muted rounded-md border border-border">
											{apiKeys.map((entry) => (
												<li
													data-testid="api-key-row"
													data-api-key-id={entry.id}
													class="flex items-center justify-between gap-3 p-3"
												>
													<div class="space-y-1">
														<p class="text-sm font-medium text-foreground">{entry.name}</p>
														<p class="text-xs text-muted-foreground">
															<span class="font-mono">{entry.prefix}…</span> · Created{' '}
															{new Date(entry.createdAtIso).toLocaleDateString('en-US', {
																year: 'numeric',
																month: 'short',
																day: 'numeric',
															})}{' '}
															· Last used {formatApiKeyLastUsed(entry.lastUsedIso)}
														</p>
													</div>
													<form
														action={`${revokeApiKeyActionUrlBase}/${entry.id}`}
														method="post"
														onsubmit="return confirm('Revoke this API key? Any client using it will lose access immediately.');"
													>
														<CsrfField token={csrfToken} />
														<button
															type="submit"
															data-testid="revoke-api-key-button"
															class="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
														>
															Revoke
														</button>
													</form>
												</li>
											))}
										</ul>
									) : (
										<p class="text-xs text-muted-foreground">No API keys yet.</p>
									)}
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
										<CsrfField token={csrfToken} />
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
		},
	);
