import { z } from "zod";
import type { FC } from "hono/jsx";
import { sourcePipelineResultSchema, sourcePreviewResultSchema } from "../../pipeline/sources/index.js";
import { Layout } from "../layout.js";

export const sourceListItemSchema = z.object({
	key: z.string(),
	label: z.string(),
	description: z.string()
});

export type SourceListItem = z.infer<typeof sourceListItemSchema>;

export const sourceInputPagePropsSchema = z.object({
	sources: z.array(sourceListItemSchema),
	selectedSourceKey: z.string().optional(),
	errorMessage: z.string().optional()
});

export type SourceInputPageProps = z.infer<typeof sourceInputPagePropsSchema>;

export const SourceInputPage: FC<SourceInputPageProps> = z
	.function()
	.args(sourceInputPagePropsSchema)
	.returns(z.custom<ReturnType<FC<SourceInputPageProps>>>())
	.implement(({ sources, selectedSourceKey, errorMessage }) => {
		return (
			<Layout title="Domain Sourcing">
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">Domain Sourcing</h1>
					<p class="mt-2 text-sm text-gray-600">
						Select a source, preview domains, and run the full pipeline.
					</p>

					{errorMessage ? (
						<p class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
							{errorMessage}
						</p>
					) : null}

					{sources.map((s) => {
						const isSelected = selectedSourceKey === s.key;

						return (
							<div key={s.key} class="mt-5 rounded-lg border border-gray-200 p-4">
								<h2 class="text-lg font-medium">{s.label}</h2>
								<p class="mt-1 text-sm text-gray-500">{s.description}</p>

								{isSelected ? (
									<form method="get" action="/source/preview" class="mt-3 space-y-3">
										<input type="hidden" name="source" value={s.key} />
										<label for={`${s.key}-tld`} class="block text-sm font-medium text-gray-700">
											TLD suffix (e.g. io)
										</label>
										<input
											id={`${s.key}-tld`}
											name="tld"
											type="text"
											required
											placeholder="io"
											class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
										/>
										<div class="flex gap-2">
											<button
												type="submit"
												class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
											>
												Preview domains
											</button>
										</div>
									</form>
								) : (
									<form method="get" action="/source" class="mt-3">
										<input type="hidden" name="source" value={s.key} />
										<button
											type="submit"
											class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
										>
											Select
										</button>
									</form>
								)}

								{isSelected ? (
									<form method="post" action="/source" class="mt-2">
										<input type="hidden" name="source" value={s.key} />
										<input
											id={`${s.key}-tld-pipeline`}
											name="tld"
											type="text"
											required
											placeholder="io"
											class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
										/>
										<button
											type="submit"
											class="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
										>
											Run pipeline
										</button>
									</form>
								) : null}
							</div>
						);
					})}
				</section>
			</Layout>
		);
	});

export const sourcePreviewPagePropsSchema = z.object({
	source: sourceListItemSchema,
	result: sourcePreviewResultSchema
});

export type SourcePreviewPageProps = z.infer<typeof sourcePreviewPagePropsSchema>;

export const SourcePreviewPage: FC<SourcePreviewPageProps> = z
	.function()
	.args(sourcePreviewPagePropsSchema)
	.returns(z.custom<ReturnType<FC<SourcePreviewPageProps>>>())
	.implement(({ source, result }) => {
		return (
			<Layout title={`${source.label} Preview`}>
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">{source.label} Preview</h1>

					{result.fetchError ? (
						<div class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
							<strong>Fetch error:</strong> {result.fetchError}
						</div>
					) : (
						<div class="mt-4 text-sm text-gray-700">
							<p>Fetched entries: {result.fetchedEntries}</p>
							<p>Unique domains: {result.domains.length}</p>
						</div>
					)}

					{result.domains.length > 0 ? (
						<ul class="mt-4 space-y-1 text-sm font-mono">
							{result.domains.map((domain) => {
								const qualifyUrl = `/qualify?domain=${encodeURIComponent(domain)}`;
								return (
									<li key={domain} class="flex items-center justify-between rounded border border-gray-100 px-2 py-1">
										<span class="truncate">{domain}</span>
										<a
											href={qualifyUrl}
											class="ml-2 shrink-0 rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white"
										>
											qualify
										</a>
									</li>
								);
							})}
						</ul>
					) : null}

					<p class="mt-6 text-sm">
						<a href="/source" class="underline">
							Back to sourcing
						</a>
					</p>
				</section>
			</Layout>
		);
	});

export const sourceResultPagePropsSchema = z.object({
	source: sourceListItemSchema,
	result: sourcePipelineResultSchema
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
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">{source.label} — Pipeline Result</h1>

					{result.fetchError ? (
						<div class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
							<strong>Fetch error:</strong> {result.fetchError}
						</div>
					) : null}

					<div class="mt-5 space-y-3 text-sm">
						<h2 class="font-semibold">1. Fetch</h2>
						<p>Fetched entries: {result.fetchedEntries}</p>

						<h2 class="mt-4 font-semibold">2. Raw Domains</h2>
						<p>Raw domains extracted: {result.rawDomains}</p>

						<h2 class="mt-4 font-semibold">3. Normalized</h2>
						<p>Unique base domains: {result.normalizedDomains}</p>

						<h2 class="mt-4 font-semibold">4. Deduplication</h2>
						<p>Already known: {result.alreadyKnown}</p>
						<p>New domains: {result.newDomains}</p>

						<h2 class="mt-4 font-semibold">5. Qualification</h2>
						<p>Qualified: {qualified.length}</p>
						<p>Rejected: {rejected.length}</p>

						{result.qualificationResults.length > 0 ? (
							<ul class="mt-2 list-disc space-y-1 pl-6 font-mono text-xs">
								{result.qualificationResults.map((qr) => {
									return (
										<li key={qr.domain}>
											<span class={qr.isQualified ? "text-green-700" : "text-red-700"}>
												{qr.isQualified ? "qualified" : "rejected"}
											</span>
											{!qr.isQualified ? (
												<span class="text-gray-500"> ({qr.reasons[0]})</span>
											) : null}
										</li>
									);
								})}
							</ul>
						) : (
							<p class="text-gray-500">No domains to qualify.</p>
						)}

						<h2 class="mt-4 font-semibold">6. Queue</h2>
						<p>Enqueued: {result.enqueued}</p>

						{result.enqueueErrors.length > 0 ? (
							<div class="mt-2 space-y-1">
								<p class="text-red-700 font-medium">
									Enqueue errors: {result.enqueueErrors.length}
								</p>
								<ul class="list-disc space-y-1 pl-6 font-mono text-xs text-red-600">
									{result.enqueueErrors.map((e) => {
										return (
											<li key={e.domain}>
												{e.domain} — {e.error}
											</li>
										);
									})}
								</ul>
							</div>
						) : null}
					</div>

					<p class="mt-6 text-sm">
						<a href="/source" class="underline">
							Run again
						</a>
					</p>
				</section>
			</Layout>
		);
	});
