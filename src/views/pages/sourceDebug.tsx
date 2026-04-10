import { z } from "zod";
import type { FC } from "hono/jsx";
import { sourceDebugResultSchema } from "../../pipeline/sources/index.js";
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
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">{source.label} Debug</h1>
					<p class="mt-2 text-sm text-gray-600">
						{source.description}
					</p>

					<form method="get" action={`/debug/sources/${source.key}`} class="mt-6 space-y-3">
						<input type="hidden" name="source" value={source.key} />
						{source.key === "crtsh" ? (
							<>
								<label for={`${source.key}-tld`} class="block text-sm font-medium text-gray-700">
									TLD suffix (e.g. io)
								</label>
								<input
									id={`${source.key}-tld`}
									name="tld"
									type="text"
									required
									placeholder="io"
									value={input.tld ?? ""}
									class="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
								/>
							</>
						) : null}
						{source.key === "producthunt" ? (
							<>
								<label for={`${source.key}-maxPages`} class="block text-sm font-medium text-gray-700">
									Max pages to fetch (1-20)
								</label>
								<input
									id={`${source.key}-maxPages`}
									name="maxPages"
									type="number"
									min="1"
									max="20"
									value={input.maxPages ?? 10}
									class="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
								/>
							</>
						) : null}
						<button
							type="submit"
							class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
						>
							Run debug
						</button>
					</form>

					{result ? (
						<>
							{result.fetchError ? (
								<div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
									<strong>Fetch error:</strong> {result.fetchError}
								</div>
							) : (
								<div class="mt-6 space-y-4">
									<div class="rounded-md border border-gray-200 bg-gray-50 p-4">
										<h2 class="text-sm font-semibold text-gray-900">Metadata</h2>
										<div class="mt-3 grid grid-cols-2 gap-4 text-sm">
											<div>
												<span class="text-gray-600">Fetched entries:</span>
												<span class="ml-2 font-mono">{result.fetchedEntries}</span>
											</div>
											<div>
												<span class="text-gray-600">Raw domains:</span>
												<span class="ml-2 font-mono">{result.rawDomains}</span>
											</div>
											<div>
												<span class="text-gray-600">Normalized domains:</span>
												<span class="ml-2 font-mono">{result.normalizedDomains}</span>
											</div>
											<div>
												<span class="text-gray-600">Skipped domains:</span>
												<span class="ml-2 font-mono">{result.skippedDomains}</span>
											</div>
											<div>
												<span class="text-gray-600">Fetch time:</span>
												<span class="ml-2 font-mono">{result.metadata.timing.fetchMs}ms</span>
											</div>
											<div>
												<span class="text-gray-600">Normalize time:</span>
												<span class="ml-2 font-mono">{result.metadata.timing.normalizeMs}ms</span>
											</div>
											<div>
												<span class="text-gray-600">Total time:</span>
												<span class="ml-2 font-mono">{result.metadata.timing.totalMs}ms</span>
											</div>
										</div>
									</div>

									{result.metadata.skips.length > 0 ? (
										<div class="rounded-md border border-yellow-200 bg-yellow-50 p-4">
											<h2 class="text-sm font-semibold text-gray-900">Skipped Domains ({result.metadata.skips.length})</h2>
											<ul class="mt-2 space-y-1 font-mono text-xs">
												{result.metadata.skips.map((skip, index) => (
													<li key={`${skip.domain}-${index}`} class="text-yellow-800">
														{skip.domain} — {skip.reason}
													</li>
												))}
											</ul>
										</div>
									) : null}

									<div class="rounded-md border border-gray-200 p-4">
										<h2 class="text-sm font-semibold text-gray-900">Domains ({result.domains.length})</h2>
										{result.domains.length > 0 ? (
											<ul class="mt-3 space-y-1 text-sm font-mono">
												{result.domains.map((domain) => {
													const qualifyUrl = `/qualify?domain=${encodeURIComponent(domain)}&source=${source.key}`;
													return (
														<li key={domain} class="flex items-center justify-between rounded border border-gray-100 px-2 py-1">
															<span class="truncate">{domain}</span>
															<a
																href={qualifyUrl}
																class="ml-2 shrink-0 rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white"
															>
																Qualify
															</a>
														</li>
													);
												})}
											</ul>
										) : (
											<p class="mt-3 text-sm text-gray-500">No domains found.</p>
										)}
									</div>

									<details class="rounded-md border border-gray-200">
										<summary class="cursor-pointer px-4 py-3 text-sm font-medium text-gray-900">
											Transformation Trace ({result.transformations.length} entries)
										</summary>
										<div class="border-t border-gray-200 p-4">
											<table class="w-full text-sm font-mono">
												<thead>
													<tr class="text-left text-gray-600">
														<th class="pb-2">Input</th>
														<th class="pb-2">Output</th>
														<th class="pb-2">Status</th>
														<th class="pb-2">Reason</th>
													</tr>
												</thead>
												<tbody>
													{result.transformations.slice(0, 50).map((t, i) => (
														<tr key={i} class="border-t border-gray-100">
															<td class="py-1 pr-4">{t.input}</td>
															<td class="py-1 pr-4">{t.output ?? "null"}</td>
															<td class="py-1 pr-4">
																<span class={
																	t.status === "ok" ? "text-green-700" :
																	t.status === "failed" ? "text-red-700" :
																	"text-yellow-700"
																}>
																	{t.status}
																</span>
															</td>
															<td class="py-1 text-gray-600">{t.reason ?? "-"}</td>
														</tr>
													))}
												</tbody>
											</table>
											{result.transformations.length > 50 ? (
												<p class="mt-3 text-xs text-gray-500">
													Showing first 50 of {result.transformations.length} transformations.
												</p>
											) : null}
										</div>
									</details>

									{result.metadata.sampleRaw && result.metadata.sampleRaw.length > 0 ? (
										<details class="rounded-md border border-gray-200">
											<summary class="cursor-pointer px-4 py-3 text-sm font-medium text-gray-900">
												Sample Raw Data ({result.metadata.sampleRaw.length} items)
											</summary>
											<div class="border-t border-gray-200 p-4">
												<pre class="overflow-x-auto text-xs font-mono text-gray-700">
													{JSON.stringify(result.metadata.sampleRaw, null, 2)}
												</pre>
											</div>
										</details>
									) : null}
								</div>
							)}
						</>
					) : (
						<p class="mt-6 text-sm text-gray-500">
							Run the debug to see domain list and transformation details.
						</p>
					)}

					<p class="mt-6 text-sm">
						<a href="/source" class="underline">
							Back to sourcing
						</a>
					</p>
				</section>
			</Layout>
		);
	});
