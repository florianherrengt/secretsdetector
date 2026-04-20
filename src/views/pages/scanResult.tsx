import { z } from 'zod';
import type { FC } from 'hono/jsx';
import {
	checkClassificationById,
	classificationFallback,
	defaultSeverityLevelByCheckId,
	severityRankByFinding,
	severityScoreByLevel,
} from './scanResult.config.js';
import { EmptyStateCard } from '../components/EmptyStateCard.js';
import { PageHeader } from '../components/PageHeader.js';
import { ScanCard } from '../components/ScanCard.js';
import { Section } from '../components/Section.js';
import { SkeletonList } from '../components/SkeletonList.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Layout } from '../layout.js';

const findingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
const checkStatusSchema = z.enum(['pass', 'fail']);
const scanStatusSchema = z.enum(['pending', 'success', 'failed']);
const derivedSeverityLevelSchema = z.enum(['Critical', 'High', 'Medium', 'Low', 'None']);

export const scanResultFindingSchema = z.object({
	findingId: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	severity: findingSeveritySchema.nullable(),
	filePath: z.string().nullable(),
	snippet: z.string().nullable(),
	detectedAt: z.string().nullable(),
});

export const scanResultCheckSchema = z.object({
	checkId: z.string(),
	checkName: z.string(),
	status: checkStatusSchema,
	findings: z.array(scanResultFindingSchema),
	classification: z.string().nullable(),
	sourceTimestamp: z.string().nullable(),
});

export const scanResultPagePropsSchema = z.object({
	scanId: z.string(),
	targetUrl: z.string(),
	topNavMode: z.enum(['auth', 'app']),
	status: scanStatusSchema,
	startedAtIso: z.string(),
	finishedAtIso: z.string().nullable(),
	durationMs: z.number().int().nonnegative(),
	checks: z.array(scanResultCheckSchema),
	discoveredSubdomains: z.array(z.string()),
	subdomainAssetCoverage: z.array(
		z.object({
			subdomain: z.string(),
			scannedAssetPaths: z.array(z.string()),
		}),
	),
	discoveryStats: z.object({
		fromLinks: z.number().int().nonnegative(),
		fromSitemap: z.number().int().nonnegative(),
		totalConsidered: z.number().int().nonnegative(),
		totalAccepted: z.number().int().nonnegative(),
		truncated: z.boolean(),
	}),
});

export type ScanResultPageProps = z.infer<typeof scanResultPagePropsSchema>;
type ScanResultCheck = z.infer<typeof scanResultCheckSchema>;
type DerivedSeverityLevel = z.infer<typeof derivedSeverityLevelSchema>;

type DerivedCheckFields = {
	issueCount: number;
	statusLabel: 'Issue Detected' | 'No Issues Found';
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
	None: 0,
} as const satisfies Record<DerivedSeverityLevel, number>;

const TimestampTime: FC<{ datetime: string }> = z
	.function()
	.args(z.custom<{ datetime: string }>())
	.returns(z.custom<ReturnType<FC<{ datetime: string }>>>())
	.implement(({ datetime }) => {
		return <time datetime={datetime}>{datetime}</time>;
	});

export const formatDurationMs = z
	.function()
	.args(z.number().int().nonnegative())
	.returns(z.string())
	.implement((durationMs) => {
		if (durationMs < 1000) {
			return '<1s';
		}

		return `${Math.floor(durationMs / 1000)}s`;
	});

const formatIssueCountLabel = z
	.function()
	.args(z.number().int().nonnegative())
	.returns(z.string())
	.implement((issueCount) => {
		if (issueCount === 1) {
			return '1 Issue Found';
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

		return (
			checkClassificationById[checkId as keyof typeof checkClassificationById] ??
			classificationFallback
		);
	});

const deriveCheckSeverityLevel = z
	.function()
	.args(scanResultCheckSchema)
	.returns(derivedSeverityLevelSchema)
	.implement((check) => {
		if (check.status === 'pass') {
			return 'None';
		}

		const findingsWithExplicitSeverity = check.findings.filter(
			(finding) => finding.severity !== null,
		);

		if (findingsWithExplicitSeverity.length === 0) {
			return (
				defaultSeverityLevelByCheckId[
					check.checkId as keyof typeof defaultSeverityLevelByCheckId
				] ?? 'Medium'
			);
		}

		const maxRank = findingsWithExplicitSeverity.reduce((currentMax, finding) => {
			const rankKey = finding.severity ?? 'null';
			const rank = severityRankByFinding[rankKey];
			return rank > currentMax ? rank : currentMax;
		}, -1);

		if (maxRank < 0) {
			return 'Medium';
		}

		if (maxRank >= 4) {
			return 'Critical';
		}

		if (maxRank === 3) {
			return 'High';
		}

		if (maxRank === 2) {
			return 'Medium';
		}

		if (maxRank === 1) {
			return 'Low';
		}

		return 'Low';
	});

const buildFallbackFinding = z
	.function()
	.args(scanResultCheckSchema)
	.returns(scanResultFindingSchema)
	.implement((check) => {
		return {
			findingId: `${check.checkId}-details-unavailable`,
			title: 'Details unavailable',
			description: 'Details unavailable',
			severity: null,
			filePath: null,
			snippet: null,
			detectedAt: check.sourceTimestamp,
		};
	});

export const deriveCheckFields = z
	.function()
	.args(scanResultCheckSchema)
	.returns(
		z.object({
			issueCount: z.number().int().nonnegative(),
			statusLabel: z.enum(['Issue Detected', 'No Issues Found']),
			severityLevel: derivedSeverityLevelSchema,
			severityScore: z.number().int().min(0).max(100),
			classificationResolved: z.string().min(1),
			findingsResolved: z.array(scanResultFindingSchema),
		}),
	)
	.implement((check) => {
		const issueCount = check.findings.length;
		const statusLabel = check.status === 'fail' ? 'Issue Detected' : 'No Issues Found';
		const severityLevel = deriveCheckSeverityLevel(check);
		const severityScore = severityScoreByLevel[severityLevel];
		const classificationResolved = resolveCheckClassification(check.checkId, check.classification);
		const findingsResolved =
			check.status === 'fail' && check.findings.length === 0
				? [buildFallbackFinding(check)]
				: check.findings;

		return {
			issueCount,
			statusLabel,
			severityLevel,
			severityScore,
			classificationResolved,
			findingsResolved,
		};
	});

export const sortChecks = z
	.function()
	.args(z.array(scanResultCheckSchema))
	.returns(z.array(scanResultCheckSchema))
	.implement((checks) => {
		return [...checks].sort((left, right) => {
			const leftStatusRank = left.status === 'fail' ? 0 : 1;
			const rightStatusRank = right.status === 'fail' ? 0 : 1;

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
			globalSeverityScore: z.number().int().min(0).max(100),
		}),
	)
	.implement((checks) => {
		const totalChecks = checks.length;
		const failedChecks = checks.filter((check) => check.status === 'fail').length;
		const passedChecks = checks.filter((check) => check.status === 'pass').length;
		const totalIssues = checks.reduce((sum, check) => sum + check.issueCount, 0);
		const maxSeverityRank = checks.reduce((currentMax, check) => {
			const rank = resolvedSeverityRankByLevel[check.severityLevel];
			return rank > currentMax ? rank : currentMax;
		}, 0);

		const globalSeverityLevel =
			maxSeverityRank >= 4
				? 'Critical'
				: maxSeverityRank === 3
					? 'High'
					: maxSeverityRank === 2
						? 'Medium'
						: maxSeverityRank === 1
							? 'Low'
							: 'None';
		const globalSeverityScore = severityScoreByLevel[globalSeverityLevel];

		return {
			totalChecks,
			failedChecks,
			passedChecks,
			totalIssues,
			globalSeverityLevel,
			globalSeverityScore,
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
				isValid: false,
			};
		}

		const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

		try {
			const url = new URL(withProtocol);
			return {
				href: url.toString(),
				isValid: true,
			};
		} catch {
			return {
				href: withProtocol,
				isValid: false,
			};
		}
	});

export const ScanResultPage: FC<ScanResultPageProps> = z
	.function()
	.args(scanResultPagePropsSchema)
	.returns(z.custom<ReturnType<FC<ScanResultPageProps>>>())
	.implement((props) => {
		const targetUrlHref = toHref(props.targetUrl);
		const rerunAction = (
			<form action="/scan" method="post" class="inline-flex" id="rerun-form">
				<input type="hidden" name="domain" value={props.targetUrl} />
				<button
					type="submit"
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					Re-run Scan
				</button>
			</form>
		);

		if (props.status === 'pending') {
			return (
				<Layout title="Scan Result" autoRefreshSeconds={1} topNavMode={props.topNavMode}>
					<div class="space-y-8">
						<PageHeader
							title="Scan Result"
							description={`Scan ${props.scanId} for ${props.targetUrl}`}
							action={rerunAction}
						/>

						<Section title="Scan Status" description="Current execution state for this scan.">
							<ScanCard>
								<div class="flex items-center justify-between gap-3">
									<div class="space-y-1">
										<p class="text-sm font-medium text-foreground">Scan in progress</p>
										<p class="text-sm text-muted-foreground">Waiting for scan results.</p>
									</div>
									<StatusBadge status="pending" label="Running" />
								</div>
							</ScanCard>
						</Section>

						<Section title="Scan Overview" description="Target and runtime metadata.">
							<ScanCard>
								<div class="grid gap-4 text-sm md:grid-cols-2">
									<div class="space-y-1">
										<p class="font-medium text-foreground">Target URL</p>
										{targetUrlHref.isValid ? (
											<a
												href={targetUrlHref.href}
												class="break-words underline"
												target="_blank"
												rel="noreferrer"
											>
												{props.targetUrl}
											</a>
										) : (
											<span title="Invalid URL" class="break-words text-foreground">
												{props.targetUrl}
											</span>
										)}
									</div>
									<div class="space-y-1">
										<p class="font-medium text-foreground">Started</p>
										<p class="font-mono text-xs text-muted-foreground">
											<TimestampTime datetime={props.startedAtIso} />
										</p>
									</div>
								</div>
							</ScanCard>
						</Section>

						<Section title="Findings" description="Loading check and finding data.">
							<SkeletonList rows={3} />
						</Section>
					</div>
				</Layout>
			);
		}

		if (props.status === 'failed') {
			return (
				<Layout title="Scan Result" topNavMode={props.topNavMode}>
					<div class="space-y-8">
						<PageHeader
							title="Scan Result"
							description={`Scan ${props.scanId} for ${props.targetUrl}`}
							action={rerunAction}
						/>

						<Section title="Scan Status" description="Execution outcome for this scan.">
							<ScanCard>
								<div class="flex items-center justify-between gap-3">
									<div class="space-y-1">
										<p class="text-sm font-medium text-foreground">
											Scan failed before results were saved.
										</p>
										<p class="text-sm text-muted-foreground">Run the scan again to recover.</p>
									</div>
									<StatusBadge status="failed" label="Failed" />
								</div>
							</ScanCard>
						</Section>

						<Section title="Scan Overview" description="Target and runtime metadata.">
							<ScanCard>
								<div class="grid gap-4 text-sm md:grid-cols-2">
									<div class="space-y-1">
										<p class="font-medium text-foreground">Target URL</p>
										{targetUrlHref.isValid ? (
											<a
												href={targetUrlHref.href}
												class="break-words underline"
												target="_blank"
												rel="noreferrer"
											>
												{props.targetUrl}
											</a>
										) : (
											<span title="Invalid URL" class="break-words text-foreground">
												{props.targetUrl}
											</span>
										)}
									</div>
									<div class="space-y-1">
										<p class="font-medium text-foreground">Started</p>
										<p class="font-mono text-xs text-muted-foreground">
											<TimestampTime datetime={props.startedAtIso} />
										</p>
									</div>
								</div>
							</ScanCard>
						</Section>

						<Section title="Findings" description="Checks did not complete for this run.">
							<EmptyStateCard
								title="No findings available"
								description="The scan failed before check evaluation completed."
								actionHint="Use Re-run Scan to retry."
							/>
						</Section>
					</div>
				</Layout>
			);
		}

		const sortedChecks = sortChecks(props.checks);
		const checksDerived = sortedChecks.map((check) => {
			return {
				...check,
				...deriveCheckFields(check),
			};
		});
		const failedChecks = checksDerived.filter((check) => check.status === 'fail');
		const passedChecks = checksDerived.filter((check) => check.status === 'pass');
		const global = deriveGlobalFields(checksDerived);
		const globalBadgeVariant =
			global.globalSeverityLevel === 'Critical' || global.globalSeverityLevel === 'High'
				? 'error'
				: global.globalSeverityLevel === 'Medium' || global.globalSeverityLevel === 'Low'
					? 'warning'
					: 'success';

		return (
			<Layout title="Scan Result" topNavMode={props.topNavMode}>
				<div class="space-y-8">
					<PageHeader
						title="Scan Result"
						description={`Scan ${props.scanId} for ${props.targetUrl}`}
						action={rerunAction}
					/>

					<Section title="Scan Status" description="Overall finding severity across all checks.">
						<ScanCard>
							<div class="flex items-center justify-between gap-3">
								<div class="space-y-1">
									<p class="text-sm font-medium text-foreground">
										{global.totalIssues > 0 ? 'Issues detected' : 'No issues found'}
									</p>
									<p class="text-sm text-muted-foreground">
										{formatIssueCountLabel(global.totalIssues)} • Global severity{' '}
										{global.globalSeverityLevel} ({global.globalSeverityScore})
									</p>
								</div>
								<StatusBadge
									variant={globalBadgeVariant}
									label={global.totalIssues > 0 ? 'Issue Detected' : 'No Issues Found'}
								/>
							</div>
						</ScanCard>
					</Section>

					<Section title="Scan Overview" description="Target and runtime metadata.">
						<ScanCard>
							<div class="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
								<div class="space-y-1">
									<p class="font-medium text-foreground">Target URL</p>
									{targetUrlHref.isValid ? (
										<a
											href={targetUrlHref.href}
											class="break-words underline"
											target="_blank"
											rel="noreferrer"
										>
											{props.targetUrl}
										</a>
									) : (
										<span title="Invalid URL" class="break-words text-foreground">
											{props.targetUrl}
										</span>
									)}
								</div>
								<div class="space-y-1">
									<p class="font-medium text-foreground">Started</p>
									<p class="font-mono text-xs text-muted-foreground">
										<TimestampTime datetime={props.startedAtIso} />
									</p>
								</div>
								<div class="space-y-1">
									<p class="font-medium text-foreground">Duration</p>
									<p class="font-mono text-xs text-muted-foreground">
										{formatDurationMs(props.durationMs)}
									</p>
								</div>
								<div class="space-y-1">
									<p class="font-medium text-foreground">Checks</p>
									<p class="font-mono text-xs text-muted-foreground">{global.totalChecks}</p>
								</div>
								<div class="space-y-1">
									<p class="font-medium text-foreground">Passed</p>
									<p class="font-mono text-xs text-muted-foreground">{global.passedChecks}</p>
								</div>
								<div class="space-y-1">
									<p class="font-medium text-foreground">Failed</p>
									<p class="font-mono text-xs text-muted-foreground">{global.failedChecks}</p>
								</div>
								<div class="space-y-1">
									<p class="font-medium text-foreground">Subdomains Scanned</p>
									<p class="font-mono text-xs text-muted-foreground">
										{props.discoveredSubdomains.length}
									</p>
								</div>
								<div class="space-y-1">
									<p class="font-medium text-foreground">Discovery</p>
									<p class="font-mono text-xs text-muted-foreground">
										{props.discoveryStats.fromLinks} links, {props.discoveryStats.fromSitemap}{' '}
										sitemap
										{props.discoveryStats.truncated ? ' (truncated)' : ''}
									</p>
								</div>
							</div>
							<div class="mt-4 space-y-2">
								<div class="space-y-1">
									<p class="text-sm font-medium text-foreground">Subdomains Scanned</p>
									<p class="text-xs text-muted-foreground">
										Discovered Subdomains included in this scan run.
									</p>
								</div>
								{props.discoveredSubdomains.length > 0 ? (
									<ul class="space-y-2">
										{props.subdomainAssetCoverage.map((entry) => (
											<li
												key={entry.subdomain}
												class="rounded-md border border-border bg-muted p-2"
											>
												<p class="font-mono text-xs text-foreground break-words">
													{entry.subdomain}
												</p>
												{entry.scannedAssetPaths.length > 0 ? (
													<ul class="mt-2 space-y-1">
														{entry.scannedAssetPaths.map((assetPath) => (
															<li
																key={`${entry.subdomain}:${assetPath}`}
																class="font-mono text-xs text-muted-foreground break-words"
															>
																{assetPath}
															</li>
														))}
													</ul>
												) : (
													<p class="mt-1 text-xs text-muted-foreground">
														No assets scanned on this subdomain
													</p>
												)}
											</li>
										))}
									</ul>
								) : (
									<div class="space-y-1">
										<p class="text-sm text-muted-foreground">No subdomains discovered</p>
										<p class="text-xs text-muted-foreground">
											Use Re-run Scan after deploying pages that expose subdomain links or sitemap
											entries.
										</p>
									</div>
								)}
							</div>
						</ScanCard>
					</Section>

					<Section
						title="Findings"
						description={
							failedChecks.length === 0
								? 'No failed checks were reported in this scan.'
								: formatIssueCountLabel(
										failedChecks.reduce((sum, check) => sum + check.issueCount, 0),
									)
						}
					>
						{failedChecks.length === 0 ? (
							<EmptyStateCard
								title="No findings detected"
								description="All checks passed for this run."
								actionHint="Use Re-run Scan to scan again after new deployments."
							/>
						) : (
							<div class="space-y-4">
								{failedChecks.map((check) => {
									return (
										<ScanCard
											key={check.checkId}
											title={check.checkName}
											description={`${check.classificationResolved} • ${formatIssueCountLabel(check.issueCount)}`}
											head={
												<StatusBadge
													variant={
														check.severityLevel === 'Critical' || check.severityLevel === 'High'
															? 'error'
															: check.severityLevel === 'Medium' || check.severityLevel === 'Low'
																? 'warning'
																: 'success'
													}
													label={`Severity ${check.severityLevel}`}
												/>
											}
										>
											<div class="space-y-3">
												{check.findingsResolved.map((finding, findingIndex) => {
													return (
														<article
															class="rounded-md border border-border bg-muted p-3"
															key={finding.findingId}
														>
															<div class="space-y-2">
																<div class="flex items-center justify-between gap-3">
																	<p class="text-sm font-medium text-foreground">
																		Finding #{findingIndex + 1}
																	</p>
																	{finding.detectedAt ? (
																		<p class="font-mono text-xs text-muted-foreground">
																			<TimestampTime datetime={finding.detectedAt} />
																		</p>
																	) : null}
																</div>
																<p class="text-sm text-foreground">{finding.title}</p>
																{finding.description ? (
																	<p class="text-sm text-muted-foreground">{finding.description}</p>
																) : null}
																{finding.filePath ? (
																	<p class="text-sm text-muted-foreground">
																		<span class="font-medium text-foreground">File:</span>{' '}
																		<span class="font-mono text-xs">{finding.filePath}</span>
																	</p>
																) : null}
																{finding.snippet ? (
																	<pre class="overflow-x-auto rounded-md border border-border bg-card p-3">
																		<span class="font-mono text-xs text-foreground">
																			{finding.snippet}
																		</span>
																	</pre>
																) : null}
															</div>
														</article>
													);
												})}
											</div>
										</ScanCard>
									);
								})}
							</div>
						)}
					</Section>

					<Section title="Passed Checks" description="Checks that reported no findings.">
						{passedChecks.length === 0 ? (
							<EmptyStateCard
								title="No passed checks"
								description="All checks in this run reported findings."
								actionHint="Review findings above and re-run after remediation."
							/>
						) : (
							<ScanCard>
								<ul class="divide-y divide-muted">
									{passedChecks.map((check) => {
										return (
											<li
												class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
												key={check.checkId}
											>
												<div class="space-y-1">
													<p class="text-sm font-medium text-foreground">{check.checkName}</p>
													<p class="text-sm text-muted-foreground">
														{check.classificationResolved}
													</p>
												</div>
												<StatusBadge status="passed" label="No Issues" />
											</li>
										);
									})}
								</ul>
							</ScanCard>
						)}
					</Section>
				</div>
			</Layout>
		);
	});
