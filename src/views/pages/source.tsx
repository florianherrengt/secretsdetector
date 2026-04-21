import { z } from 'zod';
import type { FC } from 'hono/jsx';
import {
	sourcePipelineResultSchema,
	sourcePreviewResultSchema,
} from '../../pipeline/sources/index.js';
import { ScanCard } from '../components/ScanCard.js';
import { Section } from '../components/Section.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Layout } from '../layout.js';

export const sourceListItemSchema = z.object({
	key: z.string(),
	label: z.string(),
	description: z.string(),
});

export type SourceListItem = z.infer<typeof sourceListItemSchema>;

export const toSourceListItem = z
	.function()
	.args(z.object({ key: z.string(), label: z.string(), description: z.string() }))
	.returns(sourceListItemSchema)
	.implement((s) => sourceListItemSchema.parse(s));

export const sourceInputPagePropsSchema = z.object({
	sources: z.array(sourceListItemSchema),
	selectedSourceKey: z.string().optional(),
	errorMessage: z.string().optional(),
});

export type SourceInputPageProps = z.infer<typeof sourceInputPagePropsSchema>;

export const SourceInputPage: FC<SourceInputPageProps> = z
	.function()
	.args(sourceInputPagePropsSchema)
	.returns(z.custom<ReturnType<FC<SourceInputPageProps>>>())
	.implement(({ sources, selectedSourceKey, errorMessage }) => {
		return (
			<Layout title="Domain Sourcing">
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">Domain Sourcing</h1>
					<Section
						title="Sources"
						description="Select a source, preview domains, and run the full pipeline."
					>
						{errorMessage ? (
							<p class="rounded-md border border-error/25 bg-error/10 px-3 py-2 text-sm text-error">
								{errorMessage}
							</p>
						) : null}
						<div class="space-y-3">
							{sources.map((s) => {
								const isSelected = selectedSourceKey === s.key;

								return (
									<ScanCard
										key={s.key}
										title={s.label}
										description={s.description}
										head={
											isSelected ? <StatusBadge status="running" label="selected" /> : undefined
										}
									>
										{isSelected ? (
											<form method="get" action="/source/preview" class="space-y-3">
												<input type="hidden" name="source" value={s.key} />
												{s.key === 'crtsh' ? (
													<>
														<label
															for={`${s.key}-tld`}
															class="block text-sm font-medium text-foreground"
														>
															TLD suffix (e.g. io)
														</label>
														<input
															id={`${s.key}-tld`}
															name="tld"
															type="text"
															required
															placeholder="io"
															class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
														/>
													</>
												) : null}
												{s.key === 'producthunt' ? (
													<>
														<label
															for={`${s.key}-maxPages`}
															class="block text-sm font-medium text-foreground"
														>
															Max pages to fetch (1-20)
														</label>
														<input
															id={`${s.key}-maxPages`}
															name="maxPages"
															type="number"
															min="1"
															max="20"
															defaultValue="10"
															class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
														/>
													</>
												) : null}
												<button
													type="submit"
													class="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
												>
													Preview domains
												</button>
											</form>
										) : (
											<form method="get" action="/source">
												<input type="hidden" name="source" value={s.key} />
												<button
													type="submit"
													class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
												>
													Select
												</button>
											</form>
										)}

										{isSelected ? (
											<>
												<form method="post" action="/source" class="space-y-2">
													<input type="hidden" name="source" value={s.key} />
													{s.key === 'crtsh' ? (
														<input
															id={`${s.key}-tld-pipeline`}
															name="tld"
															type="text"
															required
															placeholder="io"
															class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
														/>
													) : null}
													{s.key === 'producthunt' ? (
														<input
															id={`${s.key}-maxPages-pipeline`}
															name="maxPages"
															type="number"
															min="1"
															max="20"
															defaultValue="10"
															class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
														/>
													) : null}
													<button
														type="submit"
														class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
													>
														Run pipeline
													</button>
												</form>
												<p class="text-sm">
													<a
														href={`/debug/sources/${s.key}`}
														class="underline text-muted-foreground"
													>
														Debug {s.label}
													</a>
												</p>
											</>
										) : null}
									</ScanCard>
								);
							})}
						</div>
					</Section>
				</div>
			</Layout>
		);
	});

export const sourcePreviewPagePropsSchema = z.object({
	source: sourceListItemSchema,
	result: sourcePreviewResultSchema,
});

export type SourcePreviewPageProps = z.infer<typeof sourcePreviewPagePropsSchema>;

export const SourcePreviewPage: FC<SourcePreviewPageProps> = z
	.function()
	.args(sourcePreviewPagePropsSchema)
	.returns(z.custom<ReturnType<FC<SourcePreviewPageProps>>>())
	.implement(({ source, result }) => {
		return (
			<Layout title={`${source.label} Preview`}>
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">{source.label} Preview</h1>
					<Section title="Source Output">
						<ScanCard>
							{result.fetchError ? (
								<div class="rounded-md border border-error/25 bg-error/10 p-3 text-sm text-error">
									<strong>Fetch error:</strong> {result.fetchError}
								</div>
							) : (
								<div class="space-y-1 text-sm text-muted-foreground">
									<p>Fetched entries: {result.fetchedEntries}</p>
									<p>Unique domains: {result.domains.length}</p>
								</div>
							)}

							{result.domains.length > 0 ? (
								<ul class="space-y-1 text-sm font-mono">
									{result.domains.map((domain) => {
										const qualifyUrl = `/qualify?domain=${encodeURIComponent(domain)}`;
										return (
											<li
												key={domain}
												class="flex items-center justify-between rounded border border-muted px-2 py-1"
											>
												<span class="truncate text-foreground">{domain}</span>
												<a
													href={qualifyUrl}
													class="ml-2 shrink-0 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
												>
													qualify
												</a>
											</li>
										);
									})}
								</ul>
							) : (
								<p class="text-sm text-muted-foreground">No issues found</p>
							)}
						</ScanCard>
					</Section>
					<p class="text-sm">
						<a href="/source" class="underline">
							Back to sourcing
						</a>
					</p>
				</div>
			</Layout>
		);
	});

export const sourceResultPagePropsSchema = z.object({
	source: sourceListItemSchema,
	result: sourcePipelineResultSchema,
});

export type SourceResultPageProps = z.infer<typeof sourceResultPagePropsSchema>;

export const SourceResultPage: FC<SourceResultPageProps> = z
	.function()
	.args(sourceResultPagePropsSchema)
	.returns(z.custom<ReturnType<FC<SourceResultPageProps>>>())
	.implement(({ source, result }) => {
		const qualified = result.qualificationResults.filter((r) => r.isQualified);
		const rejected = result.qualificationResults.filter((r) => !r.isQualified);

		return (
			<Layout title={`${source.label} Pipeline Result`}>
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">{source.label} Pipeline Result</h1>
					<Section title="Pipeline Summary">
						<ScanCard>
							{result.fetchError ? (
								<div class="rounded-md border border-error/25 bg-error/10 p-3 text-sm text-error">
									<strong>Fetch error:</strong> {result.fetchError}
								</div>
							) : null}
							<div class="space-y-2 text-sm text-muted-foreground">
								<p>
									<span class="font-medium text-foreground">Fetch:</span> {result.fetchedEntries}{' '}
									entries
								</p>
								<p>
									<span class="font-medium text-foreground">Raw domains:</span> {result.rawDomains}
								</p>
								<p>
									<span class="font-medium text-foreground">Normalized:</span>{' '}
									{result.normalizedDomains}
								</p>
								<p>
									<span class="font-medium text-foreground">Already known:</span>{' '}
									{result.alreadyKnown}
								</p>
								<p>
									<span class="font-medium text-foreground">New domains:</span> {result.newDomains}
								</p>
								<p>
									<span class="font-medium text-foreground">Qualified:</span> {qualified.length}
								</p>
								<p>
									<span class="font-medium text-foreground">Rejected:</span> {rejected.length}
								</p>
								<p>
									<span class="font-medium text-foreground">Enqueued:</span> {result.enqueued}
								</p>
							</div>
						</ScanCard>
					</Section>

					<Section title="Qualification Results">
						<ScanCard>
							{result.qualificationResults.length > 0 ? (
								<ul class="space-y-1 font-mono text-xs">
									{result.qualificationResults.map((qr) => {
										const primaryReason = qr.reasons[0] ?? '';
										const shortReason = qr.isQualified
											? 'qualified'
											: primaryReason.replace('Failed: ', '').toLowerCase();
										return (
											<li key={qr.domain} class={qr.isQualified ? 'text-success' : 'text-error'}>
												{qr.domain} → {shortReason}
											</li>
										);
									})}
								</ul>
							) : (
								<p class="text-sm text-muted-foreground">No domains to qualify.</p>
							)}
						</ScanCard>
					</Section>

					{result.enqueueErrors.length > 0 ? (
						<Section title="Queue Errors">
							<ScanCard
								class="border-error/30 bg-error/5"
								head={
									<StatusBadge status="failed" label={`${result.enqueueErrors.length} errors`} />
								}
							>
								<ul class="list-disc space-y-1 pl-6 font-mono text-xs text-error">
									{result.enqueueErrors.map((e) => {
										return (
											<li key={e.domain}>
												{e.domain} - {e.error}
											</li>
										);
									})}
								</ul>
							</ScanCard>
						</Section>
					) : null}

					<p class="text-sm">
						<a href="/source" class="underline">
							Run again
						</a>
					</p>
				</div>
			</Layout>
		);
	});
