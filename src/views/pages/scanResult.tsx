import { z } from "zod";
import type { FC } from "hono/jsx";
import {
	checkClassificationById,
	classificationFallback,
	severityRankByFinding,
	severityScoreByLevel
} from "./scanResult.config.js";
import { Layout } from "../layout.js";

const findingSeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);
const checkStatusSchema = z.enum(["pass", "fail"]);
const scanStatusSchema = z.enum(["pending", "success", "failed"]);
const derivedSeverityLevelSchema = z.enum(["Critical", "High", "Medium", "Low", "None"]);

export const scanResultFindingSchema = z.object({
	findingId: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	severity: findingSeveritySchema.nullable(),
	filePath: z.string().nullable(),
	snippet: z.string().nullable(),
	detectedAt: z.string().nullable()
});

export const scanResultCheckSchema = z.object({
	checkId: z.string(),
	checkName: z.string(),
	status: checkStatusSchema,
	findings: z.array(scanResultFindingSchema),
	classification: z.string().nullable(),
	sourceTimestamp: z.string().nullable()
});

export const scanResultPagePropsSchema = z.object({
	scanId: z.string(),
	targetUrl: z.string(),
	status: scanStatusSchema,
	startedAtIso: z.string(),
	finishedAtIso: z.string().nullable(),
	durationMs: z.number().int().nonnegative(),
	checks: z.array(scanResultCheckSchema)
});

export type ScanResultPageProps = z.infer<typeof scanResultPagePropsSchema>;
type ScanResultCheck = z.infer<typeof scanResultCheckSchema>;
type DerivedSeverityLevel = z.infer<typeof derivedSeverityLevelSchema>;

type DerivedCheckFields = {
	issueCount: number;
	statusLabel: "Issue Detected" | "No Issues Found";
	severityLevel: DerivedSeverityLevel;
	severityScore: number;
	classificationResolved: string;
};

type DerivedCheckViewModel = ScanResultCheck &
	DerivedCheckFields & {
		findingsResolved: z.infer<typeof scanResultFindingSchema>[];
	};

const resolvedSeverityRankByLevel = {
	Critical: 4,
	High: 3,
	Medium: 2,
	Low: 1,
	None: 0
} as const satisfies Record<DerivedSeverityLevel, number>;

const formatTimestampUtc = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((isoValue) => {
		const parsedDate = new Date(isoValue);

		if (Number.isNaN(parsedDate.getTime())) {
			return isoValue;
		}

		const year = String(parsedDate.getUTCFullYear()).padStart(4, "0");
		const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
		const day = String(parsedDate.getUTCDate()).padStart(2, "0");
		const hour = String(parsedDate.getUTCHours()).padStart(2, "0");
		const minute = String(parsedDate.getUTCMinutes()).padStart(2, "0");
		const second = String(parsedDate.getUTCSeconds()).padStart(2, "0");

		return `${year}-${month}-${day} ${hour}:${minute}:${second} UTC`;
	});

export const formatDurationMs = z
	.function()
	.args(z.number().int().nonnegative())
	.returns(z.string())
	.implement((durationMs) => {
		if (durationMs < 1000) {
			return "<1s";
		}

		return `${Math.floor(durationMs / 1000)}s`;
	});

const formatIssueCountLabel = z
	.function()
	.args(z.number().int().nonnegative())
	.returns(z.string())
	.implement((issueCount) => {
		if (issueCount === 1) {
			return "1 Issue Found";
		}

		return `${issueCount} Issues Found`;
	});

const resolveCheckClassification = z
	.function()
	.args(z.string(), z.string().nullable())
	.returns(z.string().min(1))
	.implement((checkId, classification) => {
		if (classification && classification.trim().length > 0) {
			return classification;
		}

		return checkClassificationById[checkId as keyof typeof checkClassificationById] ?? classificationFallback;
	});

const deriveCheckSeverityLevel = z
	.function()
	.args(scanResultCheckSchema)
	.returns(derivedSeverityLevelSchema)
	.implement((check) => {
		if (check.status === "pass") {
			return "None";
		}

		const maxRank = check.findings.reduce((currentMax, finding) => {
			const rankKey = finding.severity ?? "null";
			const rank = severityRankByFinding[rankKey];
			return rank > currentMax ? rank : currentMax;
		}, -1);

		if (maxRank < 0) {
			return "Medium";
		}

		if (maxRank >= 4) {
			return "Critical";
		}

		if (maxRank === 3) {
			return "High";
		}

		if (maxRank === 2) {
			return "Medium";
		}

		if (maxRank === 1) {
			return "Low";
		}

		return "Low";
	});

const buildFallbackFinding = z
	.function()
	.args(scanResultCheckSchema)
	.returns(scanResultFindingSchema)
	.implement((check) => {
		return {
			findingId: `${check.checkId}-details-unavailable`,
			title: "Details unavailable",
			description: "Details unavailable",
			severity: null,
			filePath: null,
			snippet: null,
			detectedAt: check.sourceTimestamp
		};
	});

export const deriveCheckFields = z
	.function()
	.args(scanResultCheckSchema)
	.returns(
		z.object({
			issueCount: z.number().int().nonnegative(),
			statusLabel: z.enum(["Issue Detected", "No Issues Found"]),
			severityLevel: derivedSeverityLevelSchema,
			severityScore: z.number().int().min(0).max(100),
			classificationResolved: z.string().min(1),
			findingsResolved: z.array(scanResultFindingSchema)
		})
	)
	.implement((check) => {
		const issueCount = check.findings.length;
		const statusLabel = check.status === "fail" ? "Issue Detected" : "No Issues Found";
		const severityLevel = deriveCheckSeverityLevel(check);
		const severityScore = severityScoreByLevel[severityLevel];
		const classificationResolved = resolveCheckClassification(check.checkId, check.classification);
		const findingsResolved =
			check.status === "fail" && check.findings.length === 0 ? [buildFallbackFinding(check)] : check.findings;

		return {
			issueCount,
			statusLabel,
			severityLevel,
			severityScore,
			classificationResolved,
			findingsResolved
		};
	});

export const sortChecks = z
	.function()
	.args(z.array(scanResultCheckSchema))
	.returns(z.array(scanResultCheckSchema))
	.implement((checks) => {
		return [...checks].sort((left, right) => {
			const leftStatusRank = left.status === "fail" ? 0 : 1;
			const rightStatusRank = right.status === "fail" ? 0 : 1;

			if (leftStatusRank !== rightStatusRank) {
				return leftStatusRank - rightStatusRank;
			}

			const leftSeverityRank = resolvedSeverityRankByLevel[deriveCheckSeverityLevel(left)];
			const rightSeverityRank = resolvedSeverityRankByLevel[deriveCheckSeverityLevel(right)];

			if (leftSeverityRank !== rightSeverityRank) {
				return rightSeverityRank - leftSeverityRank;
			}

			if (left.findings.length !== right.findings.length) {
				return right.findings.length - left.findings.length;
			}

			const leftName = left.checkName.toLowerCase();
			const rightName = right.checkName.toLowerCase();

			if (leftName !== rightName) {
				return leftName.localeCompare(rightName);
			}

			return left.checkId.localeCompare(right.checkId);
		});
	});

const deriveGlobalFields = z
	.function()
	.args(z.array(z.custom<DerivedCheckViewModel>()))
	.returns(
		z.object({
			totalChecks: z.number().int().nonnegative(),
			failedChecks: z.number().int().nonnegative(),
			passedChecks: z.number().int().nonnegative(),
			totalIssues: z.number().int().nonnegative(),
			globalSeverityLevel: derivedSeverityLevelSchema,
			globalSeverityScore: z.number().int().min(0).max(100)
		})
	)
	.implement((checks) => {
		const totalChecks = checks.length;
		const failedChecks = checks.filter((check) => check.status === "fail").length;
		const passedChecks = checks.filter((check) => check.status === "pass").length;
		const totalIssues = checks.reduce((sum, check) => sum + check.issueCount, 0);
		const maxSeverityRank = checks.reduce((currentMax, check) => {
			const rank = resolvedSeverityRankByLevel[check.severityLevel];
			return rank > currentMax ? rank : currentMax;
		}, 0);

		const globalSeverityLevel =
			maxSeverityRank >= 4
				? "Critical"
				: maxSeverityRank === 3
					? "High"
					: maxSeverityRank === 2
						? "Medium"
						: maxSeverityRank === 1
							? "Low"
							: "None";
		const globalSeverityScore = severityScoreByLevel[globalSeverityLevel];

		return {
			totalChecks,
			failedChecks,
			passedChecks,
			totalIssues,
			globalSeverityLevel,
			globalSeverityScore
		};
	});

const toHref = z
	.function()
	.args(z.string())
	.returns(z.object({ href: z.string(), isValid: z.boolean() }))
	.implement((targetUrl) => {
		const value = targetUrl.trim();

		if (value.length === 0) {
			return {
				href: targetUrl,
				isValid: false
			};
		}

		const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

		try {
			const url = new URL(withProtocol);
			return {
				href: url.toString(),
				isValid: true
			};
		} catch {
			return {
				href: withProtocol,
				isValid: false
			};
		}
	});

export const ScanResultPage: FC<ScanResultPageProps> = z
	.function()
	.args(scanResultPagePropsSchema)
	.returns(z.custom<ReturnType<FC<ScanResultPageProps>>>())
	.implement((props) => {
		const sortedChecks = sortChecks(props.checks);
		const checksDerived = sortedChecks.map((check) => {
			return {
				...check,
				...deriveCheckFields(check)
			};
		});
		const failedChecks = checksDerived.filter((check) => check.status === "fail");
		const passedChecks = checksDerived.filter((check) => check.status === "pass");
		const global = deriveGlobalFields(checksDerived);
		const scanStatusLabel =
			props.status === "pending" ? "Scan In Progress" : global.totalIssues > 0 ? "Issue Detected" : "No Issues Found";
		const targetUrlHref = toHref(props.targetUrl);

		return (
			<Layout title="Scan Result" autoRefreshSeconds={props.status === "pending" ? 1 : undefined}>
				<div class="space-y-6">
					<nav aria-label="Breadcrumb" class="text-sm text-muted-foreground">
						<div class="flex items-center gap-2">
							<a class="underline" href="/">
								Home
							</a>
							<span>/</span>
							<a class="underline" href="/scan">
								Scans
							</a>
							<span>/</span>
							<a class="truncate underline" href={`/scan/${props.scanId}`}>
								{props.scanId}
							</a>
							<span>/</span>
							<span aria-current="page" class="text-foreground">
								Result
							</span>
						</div>
					</nav>

					<section
						class={
							global.globalSeverityLevel === "Critical"
								? "rounded-lg border border-error/30 bg-error/10 p-4 text-error"
								: global.globalSeverityLevel === "High"
									? "rounded-lg border border-error/25 bg-error/10 p-4 text-error"
									: global.globalSeverityLevel === "Medium"
										? "rounded-lg border border-warning/25 bg-warning/10 p-4 text-warning"
										: global.globalSeverityLevel === "Low"
											? "rounded-lg border border-warning/25 bg-warning/10 p-4 text-warning"
											: "rounded-lg border border-success/25 bg-success/10 p-4 text-success"
						}
						aria-live="polite"
					>
						<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<p class="text-sm font-semibold">{scanStatusLabel}</p>
							<p class="text-sm font-medium">
								{formatIssueCountLabel(global.totalIssues)} • Global Severity: {global.globalSeverityLevel} (
								{global.globalSeverityScore})
							</p>
						</div>
					</section>

					<section class="rounded-lg border border-primary/30 bg-card p-4">
						<div class="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
							<div>
								<p class="font-medium text-foreground">Target URL</p>
								{targetUrlHref.isValid ? (
									<a href={targetUrlHref.href} class="break-words underline" target="_blank" rel="noreferrer">
										{props.targetUrl}
									</a>
								) : (
									<span title="Invalid URL" class="break-words">
										{props.targetUrl}
									</span>
								)}
							</div>
							<div>
								<p class="font-medium text-foreground">Started</p>
								<p class="font-mono text-xs">{formatTimestampUtc(props.startedAtIso)}</p>
							</div>
							<div>
								<p class="font-medium text-foreground">Duration</p>
								<p class="font-mono text-xs">{formatDurationMs(props.durationMs)}</p>
							</div>
							<div>
								<p class="font-medium text-foreground">Checks</p>
								<p class="font-mono text-xs">{global.totalChecks}</p>
							</div>
							<div>
								<p class="font-medium text-foreground">No Issues Found</p>
								<p class="font-mono text-xs">{global.passedChecks}</p>
							</div>
							<div>
								<p class="font-medium text-foreground">Issue Detected</p>
								<p class="font-mono text-xs">{global.failedChecks}</p>
							</div>
						</div>
					</section>

					<div class="flex">
						<form action="/scan" method="post" class="inline-flex" id="rerun-form">
							<input type="hidden" name="domain" value={props.targetUrl} />
							<button
								type="submit"
								class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							>
								Re-run Scan
							</button>
						</form>
					</div>

					<section class="space-y-3">
						<header>
							<h2 class="text-lg font-semibold text-foreground">Issue Detected</h2>
							<p class="text-sm text-muted-foreground">{formatIssueCountLabel(failedChecks.reduce((sum, check) => sum + check.issueCount, 0))}</p>
						</header>
						{failedChecks.length === 0 ? (
							<p class="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
								No checks in this group.
							</p>
						) : (
							<div class="space-y-3">
								{failedChecks.map((check) => {
									const defaultOpen = check.issueCount <= 3;

									return (
										<details
											class="rounded-lg border border-error/25 bg-error/5 p-4"
											open={defaultOpen}
											key={check.checkId}
										>
											<summary class="cursor-pointer">
												<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
													<div>
														<p class="font-medium text-foreground">{check.checkName}</p>
														<p class="text-sm text-muted-foreground">
															{check.statusLabel} • {formatIssueCountLabel(check.issueCount)}
														</p>
													</div>
													<div class="text-right text-sm">
														<p class="font-medium text-foreground">
															Severity: {check.severityLevel} ({check.severityScore})
														</p>
														<p class="text-muted-foreground">Classification: {check.classificationResolved}</p>
													</div>
												</div>
											</summary>
											<div class="mt-3 space-y-3 border-t border-error/25 pt-3">
												{check.findingsResolved.map((finding, findingIndex) => {
													return (
														<article class="rounded-md border border-border bg-card p-3" key={finding.findingId}>
															<p class="text-sm font-medium text-foreground">Finding #{findingIndex + 1}</p>
															<p class="text-sm text-foreground">{finding.title}</p>
															{finding.filePath ? <p class="font-mono text-xs text-muted-foreground">{finding.filePath}</p> : null}
															{finding.snippet ? <p class="font-mono text-xs text-muted-foreground">{finding.snippet}</p> : null}
														</article>
													);
												})}
											</div>
										</details>
									);
								})}
							</div>
						)}
					</section>

					<section class="space-y-3">
						<header>
							<h2 class="text-lg font-semibold text-foreground">No Issues Found</h2>
							<p class="text-sm text-muted-foreground">{passedChecks.length} checks</p>
						</header>
						{passedChecks.length === 0 ? (
							<p class="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
								No checks in this group.
							</p>
						) : (
							<div class="space-y-3">
								{passedChecks.map((check) => {
									return (
										<details class="rounded-lg border border-border bg-muted p-4" key={check.checkId}>
											<summary class="cursor-pointer">
												<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
													<div>
														<p class="font-medium text-foreground">{check.checkName}</p>
														<p class="text-sm text-muted-foreground">{check.statusLabel}</p>
													</div>
													<div class="text-right text-sm">
														<p class="font-medium text-foreground">
															Severity: {check.severityLevel} ({check.severityScore})
														</p>
														<p class="text-muted-foreground">Classification: {check.classificationResolved}</p>
													</div>
												</div>
											</summary>
											<div class="mt-3 border-t border-muted pt-3">
												<p class="text-sm text-muted-foreground">No findings for this check.</p>
											</div>
										</details>
									);
								})}
							</div>
						)}
					</section>
				</div>
			</Layout>
		);
	});
