import { z } from "zod";
import type { FC } from "hono/jsx";
import { Divider } from "../components/Divider.js";
import { ScanCard } from "../components/ScanCard.js";
import { Section } from "../components/Section.js";
import { Layout } from "../layout.js";

export const domainListItemSchema = z.object({
	id: z.string().uuid(),
	domain: z.string(),
	lastCheckResult: z.enum(["pass", "issues", "none"]),
	deleteConfirmHref: z.string().min(1)
});

export const domainListPagePropsSchema = z.object({
	domains: z.array(domainListItemSchema)
});

export type DomainListPageProps = z.infer<typeof domainListPagePropsSchema>;

export const DomainListPage: FC<DomainListPageProps> = z
	.function()
	.args(domainListPagePropsSchema)
	.returns(z.custom<ReturnType<FC<DomainListPageProps>>>())
	.implement((props) => {
		const renderLastCheck = (result: "pass" | "issues" | "none") => {
			if (result === "pass") {
				return (
					<span class="inline-flex items-center gap-2 text-success" aria-label="Last check passed">
						<span aria-hidden="true">&#10003;</span>
						<span class="text-xs font-medium">Passed</span>
					</span>
				);
			}

			if (result === "issues") {
				return (
					<span class="inline-flex items-center gap-2 text-error" aria-label="Last check found issues">
						<span aria-hidden="true">&#10007;</span>
						<span class="text-xs font-medium">Issues found</span>
					</span>
				);
			}

			return <span class="text-xs text-muted-foreground">No checks yet</span>;
		};

		return (
			<Layout title="Your Domains" topNavMode="app">
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">Your Domains</h1>
					<Section title="Add Domain">
						<ScanCard>
							<form action="/domains" method="post" class="space-y-3">
								<label for="domain" class="block text-sm font-medium text-foreground">
									Domain
								</label>
								<input
									id="domain"
									name="domain"
									type="text"
									required
									placeholder="example.com"
									class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
								/>
								<button
									type="submit"
									class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								>
									Add Domain
								</button>
							</form>
						</ScanCard>
					</Section>

					<Divider />

					<Section title="Saved Domains">
						<ScanCard>
							{props.domains.length === 0 ? (
								<p class="text-sm text-muted-foreground">No domains added yet.</p>
							) : (
								<ul class="space-y-2">
									{props.domains.map((item) => {
										return (
											<li key={item.id} class="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
												<div class="flex items-center gap-3">
													<span class="text-sm font-medium text-foreground">{item.domain}</span>
													{renderLastCheck(item.lastCheckResult)}
												</div>
												<div class="flex items-center gap-4">
													<form action="/scan" method="post">
														<input type="hidden" name="domain" value={item.domain} />
														<button type="submit" class="text-sm text-foreground underline">
															Scan now
														</button>
													</form>
													<a href={item.deleteConfirmHref} class="text-sm text-error underline">
														Delete
													</a>
												</div>
											</li>
										);
									})}
								</ul>
							)}
						</ScanCard>
					</Section>
				</div>
			</Layout>
		);
	});
