import { z } from "zod";
import type { FC } from "hono/jsx";
import { sourceDebugResultSchema } from "../../pipeline/sources/index.js";
import { ScanCard } from "../components/ScanCard.js";
import { Section } from "../components/Section.js";
import { Layout } from "../layout.js";

export const sourceListItemSchema = z.object({
	key: z.string(),
	label: z.string(),
	description: z.string()
});

export type SourceListItem = z.infer<typeof sourceListItemSchema>;

export const sourceDebugPagePropsSchema = z.object({
	source: sourceListItemSchema,
	result: sourceDebugResultSchema.nullable(),
	input: z.object({
		tld: z.string().optional(),
		maxPages: z.number().int().optional()
	})
});

export type SourceDebugPageProps = z.infer<typeof sourceDebugPagePropsSchema>;

export const SourceDebugPage: FC<SourceDebugPageProps> = z
	.function()
	.args(sourceDebugPagePropsSchema)
	.returns(z.custom<ReturnType<FC<SourceDebugPageProps>>>())
	.implement(({ source, result, input }) => {
		return (
			<Layout title={`${source.label} Debug`}>
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">{source.label} Debug</h1>
					<Section title="Debug Input" description={source.description}>
						<ScanCard>
							<form method="post" action={`/debug/sources/${source.key}`} class="space-y-3">
						<input type="hidden" name="source" value={source.key} />
						{source.key === "crtsh" ? (
							<>
								<label for={`${source.key}-tld`} class="block text-sm font-medium text-foreground">
									TLD suffix (e.g. io)
								</label>
								<input
									id={`${source.key}-tld`}
									name="tld"
									type="text"
									required
									placeholder="io"
									value={input.tld ?? ""}
									class="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
								/>
							</>
						) : null}
						{source.key === "producthunt" ? (
							<>
								<label for={`${source.key}-maxPages`} class="block text-sm font-medium text-foreground">
									Max pages to fetch (1-20)
								</label>
								<input
									id={`${source.key}-maxPages`}
									name="maxPages"
									type="number"
									min="1"
									max="20"
									value={input.maxPages ?? 10}
									class="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
								/>
							</>
						) : null}
						<button
							type="submit"
							class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						>
							Run debug
						</button>
							</form>
						</ScanCard>
					</Section>

					{result ? (
						<>
							{result.fetchError ? (
								<div class="rounded-md border border-error/25 bg-error/10 p-3 text-sm text-error">
									<strong>Fetch error:</strong> {result.fetchError}
								</div>
							) : (
								<div class="space-y-4">
									<ScanCard title="Metadata">
										<div class="mt-3 grid grid-cols-2 gap-4 text-sm">
											<div>
												<span class="text-muted-foreground">Fetched entries:</span>
												<span class="ml-2 font-mono">{result.fetchedEntries}</span>
											</div>
											<div>
												<span class="text-muted-foreground">Raw domains:</span>
												<span class="ml-2 font-mono">{result.rawDomains}</span>
											</div>
											<div>
												<span class="text-muted-foreground">Normalized domains:</span>
												<span class="ml-2 font-mono">{result.normalizedDomains}</span>
											</div>
											<div>
												<span class="text-muted-foreground">Skipped domains:</span>
												<span class="ml-2 font-mono">{result.skippedDomains}</span>
											</div>
											<div>
												<span class="text-muted-foreground">Fetch time:</span>
												<span class="ml-2 font-mono">{result.metadata.timing.fetchMs}ms</span>
											</div>
											<div>
												<span class="text-muted-foreground">Normalize time:</span>
												<span class="ml-2 font-mono">{result.metadata.timing.normalizeMs}ms</span>
											</div>
											<div>
												<span class="text-muted-foreground">Total time:</span>
												<span class="ml-2 font-mono">{result.metadata.timing.totalMs}ms</span>
											</div>
										</div>
									</ScanCard>

									{result.metadata.skips.length > 0 ? (
										<ScanCard title={`Skipped Domains (${result.metadata.skips.length})`} class="border-warning/30 bg-warning/10">
											<ul class="mt-2 space-y-1 font-mono text-xs">
												{result.metadata.skips.map((skip, index) => (
													<li key={`${skip.domain}-${index}`} class="text-warning">
														{skip.domain} — {skip.reason}
													</li>
												))}
											</ul>
										</ScanCard>
									) : null}

									<ScanCard title={`Domains (${result.domains.length})`}>
										{result.domains.length > 0 ? (
											<ul class="mt-3 space-y-1 text-sm font-mono">
												{result.domains.map((domain) => {
													const qualifyUrl = `/qualify?domain=${encodeURIComponent(domain)}&source=${source.key}`;
													return (
														<li key={domain} class="flex items-center justify-between rounded border border-muted px-2 py-1">
															<span class="truncate">{domain}</span>
															<a
																href={qualifyUrl}
																class="ml-2 shrink-0 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
															>
																Qualify
															</a>
														</li>
													);
												})}
											</ul>
										) : (
											<p class="mt-3 text-sm text-muted-foreground">No domains found.</p>
										)}
									</ScanCard>

									<details class="rounded-md border border-border bg-card">
										<summary class="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
											Transformation Trace ({result.transformations.length} entries)
										</summary>
										<div class="border-t border-muted p-4">
											<table class="w-full text-sm font-mono">
												<thead>
													<tr class="text-left text-muted-foreground">
														<th class="pb-2">Input</th>
														<th class="pb-2">Output</th>
														<th class="pb-2">Status</th>
														<th class="pb-2">Reason</th>
													</tr>
												</thead>
												<tbody>
													{result.transformations.slice(0, 50).map((t, i) => (
														<tr key={i} class="border-t border-muted">
															<td class="py-1 pr-4">{t.input}</td>
															<td class="py-1 pr-4">{t.output ?? "null"}</td>
															<td class="py-1 pr-4">
																<span class={
																	t.status === "ok" ? "text-success" :
																	t.status === "failed" ? "text-error" :
																	"text-warning"
																}>
																	{t.status}
																</span>
															</td>
															<td class="py-1 text-muted-foreground">{t.reason ?? "-"}</td>
														</tr>
													))}
												</tbody>
											</table>
											{result.transformations.length > 50 ? (
												<p class="mt-3 text-xs text-muted-foreground">
													Showing first 50 of {result.transformations.length} transformations.
												</p>
											) : null}
										</div>
									</details>

									{result.metadata.sampleRaw && result.metadata.sampleRaw.length > 0 ? (
										<details class="rounded-md border border-border bg-card">
											<summary class="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
												Sample Raw Data ({result.metadata.sampleRaw.length} items)
											</summary>
											<div class="border-t border-muted p-4">
												<pre class="overflow-x-auto text-xs font-mono text-muted-foreground">
													{JSON.stringify(result.metadata.sampleRaw, null, 2)}
												</pre>
											</div>
										</details>
									) : null}
								</div>
							)}
						</>
					) : (
						<p class="text-sm text-muted-foreground">
							Run the debug to see domain list and transformation details.
						</p>
					)}

					<p class="text-sm">
						<a href="/source" class="underline">
							Back to sourcing
						</a>
					</p>
				</div>
			</Layout>
		);
	});
