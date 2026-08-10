import { z } from 'zod';
import type { FC } from 'hono/jsx';
import { EmptyStateCard } from '../components/EmptyStateCard.js';
import { PageHeader } from '../components/PageHeader.js';
import { ScanCard } from '../components/ScanCard.js';
import { Section } from '../components/Section.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Layout } from '../layout.js';
import { formatDurationMs } from './scanResult.js';

export const currentScanResultSchema = z.object({
	scanId: z.string().uuid(),
	status: z.enum(['pending', 'success', 'failed']),
	startedAtIso: z.string(),
	durationMs: z.number().int().nonnegative(),
	findingCount: z.number().int().nonnegative(),
});

export const domainDetailPagePropsSchema = z.object({
	hostname: z.string().min(1),
	currentScan: currentScanResultSchema.nullable(),
	deleteConfirmHref: z.string().min(1),
});

export type DomainDetailPageProps = z.infer<typeof domainDetailPagePropsSchema>;

const renderScanStatus = z
	.function()
	.args(z.enum(['pending', 'success', 'failed']), z.number().int().nonnegative())
	.returns(z.custom<ReturnType<FC>>())
	.implement((status, findingCount) => {
		if (status === 'pending') {
			return <StatusBadge status="pending" label="Running" />;
		}

		if (status === 'failed') {
			return <StatusBadge status="failed" />;
		}

		if (findingCount === 0) {
			return <StatusBadge status="passed" />;
		}

		const label = findingCount === 1 ? '1 issue' : `${findingCount} issues`;
		return <StatusBadge variant="error" label={label} />;
	});

export const DomainDetailPage: FC<DomainDetailPageProps> = z
	.function()
	.args(domainDetailPagePropsSchema)
	.returns(z.custom<ReturnType<FC<DomainDetailPageProps>>>())
	.implement((props) => {
		const headerActions = (
			<div class="flex items-center gap-3">
				<form action="/scan" method="post" class="inline-flex">
					<input type="hidden" name="domain" value={props.hostname} />
					<button
						type="submit"
						class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						Scan now
					</button>
				</form>
				<a href={props.deleteConfirmHref} class="text-sm text-error underline">
					Delete
				</a>
			</div>
		);

		return (
			<Layout title={props.hostname} topNavMode="app">
				<div class="space-y-8">
					<PageHeader title={props.hostname} action={headerActions} />

					<Section title="Scan Result" description="Current security scan result for this domain.">
						{props.currentScan === null ? (
							<EmptyStateCard
								title="No scan yet"
								description="This domain has not been scanned."
								actionHint="Use Scan now to run the first check."
							/>
						) : (
							<ScanCard>
								<a
									href={`/scan/${props.currentScan.scanId}`}
									class="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3 transition-colors hover:bg-muted/50"
								>
									<div class="flex items-center gap-3">
										<time
											class="font-mono text-xs text-muted-foreground"
											datetime={props.currentScan.startedAtIso}
										>
											{props.currentScan.startedAtIso}
										</time>
										{renderScanStatus(props.currentScan.status, props.currentScan.findingCount)}
									</div>
									<span class="font-mono text-xs text-muted-foreground">
										{formatDurationMs(props.currentScan.durationMs)}
									</span>
								</a>
							</ScanCard>
						)}
					</Section>
				</div>
			</Layout>
		);
	});
