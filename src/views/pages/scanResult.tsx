import { z } from "zod";
import type { FC } from "hono/jsx";
import { Layout } from "../layout.js";

export const scanResultItemSchema = z.object({
	file: z.string(),
	snippet: z.string()
});

export const scanResultCheckSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	status: z.enum(["passed", "failed"]),
	findings: z.array(scanResultItemSchema)
});

export const scanResultPagePropsSchema = z.object({
	domain: z.string(),
	status: z.enum(["pending", "success", "failed"]),
	startedAtIso: z.string(),
	finishedAtIso: z.string().nullable(),
	checks: z.array(scanResultCheckSchema)
});

export type ScanResultPageProps = z.infer<typeof scanResultPagePropsSchema>;

export const ScanResultPage: FC<ScanResultPageProps> = z
	.function()
	.args(scanResultPagePropsSchema)
	.returns(z.custom<ReturnType<FC<ScanResultPageProps>>>())
	.implement((props) => {
		const isPending = props.status === "pending";
		const isFailed = props.status === "failed";
		const isSuccess = props.status === "success";

		return (
			<Layout title="Scan Result" autoRefreshSeconds={isPending ? 1 : undefined}>
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

					{isPending ? (
						<p class="mt-5 text-sm text-gray-700">Scanning in progress...</p>
					) : null}

					{isFailed ? <p class="mt-5 text-sm text-red-700">Scan failed</p> : null}

					{isSuccess ? (
						<>
							<h2 class="mt-5 text-lg font-semibold">Checks</h2>
							<ul class="mt-2 space-y-3 text-sm">
								{props.checks.map((check) => {
									return (
										<li class="rounded-md border border-gray-200 p-3" key={check.id}>
											<p>
												<strong>Check:</strong> {check.name}
											</p>
											<p class="mt-1 text-gray-700">
												<strong>Status:</strong> {check.status}
											</p>
											<p class="mt-1 text-gray-700">
												<strong>Findings:</strong> {check.findings.length}
											</p>
										</li>
									);
								})}
							</ul>

							<h2 class="mt-6 text-lg font-semibold">Findings by Check</h2>
							<div class="mt-2 space-y-4 text-sm">
								{props.checks.map((check) => {
									return (
										<section class="rounded-md border border-gray-200 p-3" key={`${check.id}-group`}>
											<h3 class="font-semibold">{check.name}</h3>
											{check.findings.length === 0 ? (
												<p class="mt-1 text-gray-600">No issues found</p>
											) : (
												<ul class="mt-2 space-y-3">
													{check.findings.map((finding) => {
														return (
															<li
																class="rounded-md border border-gray-200 p-3"
																key={`${check.id}-${finding.file}-${finding.snippet}`}
															>
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
									);
								})}
							</div>
						</>
					) : null}
				</section>
			</Layout>
		);
	});
