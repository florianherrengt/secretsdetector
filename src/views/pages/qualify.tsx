import { z } from "zod";
import type { FC } from "hono/jsx";
import { Layout } from "../layout.js";

export const qualifyInputPagePropsSchema = z.object({
	defaultDomain: z.string().optional(),
	errorMessage: z.string().optional()
});

export type QualifyInputPageProps = z.infer<typeof qualifyInputPagePropsSchema>;

export const qualifyResultPagePropsSchema = z.object({
	domain: z.string().min(1),
	isQualified: z.boolean(),
	reasons: z.array(z.string().min(1)).min(1)
});

export type QualifyResultPageProps = z.infer<typeof qualifyResultPagePropsSchema>;

export const QualifyInputPage: FC<QualifyInputPageProps> = z
	.function()
	.args(qualifyInputPagePropsSchema)
	.returns(z.custom<ReturnType<FC<QualifyInputPageProps>>>())
	.implement(({ defaultDomain, errorMessage }) => {
		return (
			<Layout title="Qualification Debug">
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">Qualification Debug</h1>
					<p class="mt-2 text-sm text-gray-600">
						Run pipeline qualification on a domain and inspect the reason output.
					</p>

					{errorMessage ? (
						<p class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
							{errorMessage}
						</p>
					) : null}

					<form action="/qualify" method="get" class="mt-5 space-y-3">
						<label for="domain" class="block text-sm font-medium text-gray-700">
							Domain target
						</label>
						<input
							id="domain"
							name="domain"
							type="text"
							required
							value={defaultDomain ?? ""}
							placeholder="example.com"
							class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						/>
						<button
							type="submit"
							class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
						>
							Run qualification
						</button>
					</form>
				</section>
			</Layout>
		);
	});

export const QualifyResultPage: FC<QualifyResultPageProps> = z
	.function()
	.args(qualifyResultPagePropsSchema)
	.returns(z.custom<ReturnType<FC<QualifyResultPageProps>>>())
	.implement(({ domain, isQualified, reasons }) => {
		return (
			<Layout title="Qualification Result">
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">Qualification Result</h1>
					<div class="mt-3 space-y-1 text-sm text-gray-700">
						<p>
							<strong>Domain:</strong> {domain}
						</p>
						<p>
							<strong>Result:</strong> {isQualified ? "QUALIFIED" : "NOT QUALIFIED"}
						</p>
					</div>

					<h2 class="mt-5 text-lg font-semibold">Reasons</h2>
					<ul class="mt-2 list-disc space-y-1 pl-6 text-sm text-gray-700">
						{reasons.map((reason) => {
							return <li key={reason}>{reason}</li>;
						})}
					</ul>

					<p class="mt-5 text-sm">
						<a href="/qualify" class="underline">
							Run another check
						</a>
					</p>
				</section>
			</Layout>
		);
	});
