import { z } from "zod";
import type { FC } from "hono/jsx";
import { Divider } from "../components/Divider.js";
import { ScanCard } from "../components/ScanCard.js";
import { Section } from "../components/Section.js";
import { Layout } from "../layout.js";

const demoExamples = [
	{ slug: "pem-key", title: "PEM key in frontend bundle" },
	{ slug: "jwt", title: "JWT token shipped to client" },
	{ slug: "credential-url", title: "Credential in URL" },
	{ slug: "no-leak", title: "Clean baseline" },
	{ slug: "multiple", title: "Multiple scripts, first one leaks" }
] as const;

export const homePagePropsSchema = z.object({
	domain: z.string().min(1),
	isLoggedIn: z.boolean()
});

export type HomePageProps = z.infer<typeof homePagePropsSchema>;

export const HomePage: FC<HomePageProps> = z
	.function()
	.args(homePagePropsSchema)
	.returns(z.custom<ReturnType<FC<HomePageProps>>>())
	.implement(({ domain, isLoggedIn }) => {
		return (
			<Layout title="Home" topNavMode={isLoggedIn ? "app" : "auth"}>
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">Secret Detector</h1>
					<Section title="Run Scan" description="Submit a domain target to enqueue an async scan and persist findings.">
						<ScanCard>
							<p class="text-sm text-muted-foreground">
								Need end-to-end dedupe diagnostics? Use the <a href="/dedupe" class="underline">dedupe debug tool</a>.
							</p>
							<form action="/scan" method="post" class="space-y-3">
								<label for="domain" class="block text-sm font-medium text-foreground">
									Domain target
								</label>
								<input
									id="domain"
									name="domain"
									type="text"
									required
									placeholder={`${domain}/sandbox/website/examples/pem-key/`}
									class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
								/>
								<button
									type="submit"
									class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								>
									Run scan
								</button>
							</form>
						</ScanCard>
					</Section>

					<Divider />

					<Section title="Demo Examples" description="Open a sandbox website directly, or run it through the scan tool.">
						<ul class="space-y-3">
							{demoExamples.map((example) => {
								const examplePath = `/sandbox/website/examples/${example.slug}/`;

								return (
									<li class="rounded-md border border-border bg-card p-4" key={example.slug}>
										<p class="text-sm font-medium text-foreground">{example.title}</p>
										<div class="mt-2 flex gap-3">
											<a href={examplePath} class="text-sm text-foreground underline">
												Open site
											</a>
										<form action="/scan" method="post">
											<input
												type="hidden"
												name="domain"
												value={`${domain}/sandbox/website/examples/${example.slug}/`}
											/>
											<button type="submit" class="text-sm text-foreground underline">
												Scan with tool
											</button>
											</form>
										</div>
									</li>
								);
							})}
						</ul>
					</Section>
				</div>
			</Layout>
		);
	});
