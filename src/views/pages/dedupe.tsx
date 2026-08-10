import { z } from 'zod';
import type { FC } from 'hono/jsx';
import { ScanCard } from '../components/ScanCard.js';
import { Section } from '../components/Section.js';
import { Layout } from '../layout.js';

export const dedupeInputPagePropsSchema = z.object({
	defaultDomain: z.string().optional(),
	errorMessage: z.string().optional(),
});

export type DedupeInputPageProps = z.infer<typeof dedupeInputPagePropsSchema>;

export const DedupeInputPage: FC<DedupeInputPageProps> = z
	.function()
	.args(dedupeInputPagePropsSchema)
	.returns(z.custom<ReturnType<FC<DedupeInputPageProps>>>())
	.implement(({ defaultDomain, errorMessage }) => {
		return (
			<Layout title="Scan Debug">
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">Scan Debug</h1>
					<Section title="Run Debug" description="Run a scan and open the current result page.">
						<ScanCard>
							{errorMessage ? (
								<p class="rounded-md border border-error/25 bg-error/10 px-3 py-2 text-sm text-error">
									{errorMessage}
								</p>
							) : null}
							<form action="/dedupe" method="post" class="space-y-3">
								<label for="domain" class="block text-sm font-medium text-foreground">
									Domain target
								</label>
								<input
									id="domain"
									name="domain"
									type="text"
									required
									value={defaultDomain ?? ''}
									placeholder="localhost:3000/sandbox/demo"
									class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
								/>
								<button
									type="submit"
									class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								>
									Run scan debug
								</button>
							</form>
						</ScanCard>
					</Section>
				</div>
			</Layout>
		);
	});
