import { z } from "zod";
import type { FC } from "hono/jsx";
import { Layout } from "../layout.js";

export const scanResultItemSchema = z.object({
	file: z.string(),
	snippet: z.string()
});

export const scanResultPagePropsSchema = z.object({
	domain: z.string(),
	status: z.enum(["pending", "success", "failed"]),
	startedAtIso: z.string(),
	finishedAtIso: z.string().nullable(),
	findings: z.array(scanResultItemSchema)
});

export type ScanResultPageProps = z.infer<typeof scanResultPagePropsSchema>;

export const ScanResultPage: FC<ScanResultPageProps> = z
	.function()
	.args(scanResultPagePropsSchema)
	.returns(z.custom<ReturnType<FC<ScanResultPageProps>>>())
	.implement((props) => {
		return (
			<Layout title="Scan Result">
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">Scan Result</h1>
					<div class="mt-3 space-y-1 text-sm text-gray-700">
						<p>
							<strong>Domain:</strong> {props.domain}
						</p>
						<p>
							<strong>Status:</strong> {props.status}
						</p>
						<p>
							<strong>Started:</strong> {props.startedAtIso}
						</p>
						<p>
							<strong>Finished:</strong> {props.finishedAtIso ?? "-"}
						</p>
					</div>

					<h2 class="mt-5 text-lg font-semibold">Findings</h2>
					{props.findings.length === 0 ? (
						<p class="mt-2 text-sm text-gray-600">No findings</p>
					) : (
						<ul class="mt-2 space-y-3 text-sm">
							{props.findings.map((finding) => {
								return (
									<li class="rounded-md border border-gray-200 p-3" key={`${finding.file}-${finding.snippet}`}>
										<p>
											<strong>File:</strong> {finding.file}
										</p>
										<p class="mt-1 break-words">
											<strong>Snippet:</strong> {finding.snippet}
										</p>
									</li>
								);
							})}
						</ul>
					)}
				</section>
			</Layout>
		);
	});
