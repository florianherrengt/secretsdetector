import { z } from "zod";
import type { FC } from "hono/jsx";
import { Layout } from "../layout.js";

const demoExamples = [
	{ slug: "pem-key", title: "PEM key in frontend bundle" },
	{ slug: "jwt", title: "JWT token shipped to client" },
	{ slug: "credential-url", title: "Credential in URL" },
	{ slug: "no-leak", title: "Clean baseline" },
	{ slug: "multiple", title: "Multiple scripts, first one leaks" }
] as const;

export const HomePage: FC<Record<string, never>> = z
	.function()
	.args()
	.returns(z.custom<ReturnType<FC<Record<string, never>>>>())
	.implement(() => {
		return (
			<Layout title="Home">
				<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h1 class="text-2xl font-semibold tracking-tight">Secret Detector</h1>
					<p class="mt-2 text-sm text-gray-600">
						Submit a domain target to run a synchronous scan and persist findings.
					</p>

					<form action="/scan" method="post" class="mt-5 space-y-3">
						<label for="domain" class="block text-sm font-medium text-gray-700">
							Domain target
						</label>
						<input
							id="domain"
							name="domain"
							type="text"
							required
							placeholder="localhost:3000/sandbox/website/examples/pem-key/"
							class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						/>
						<button
							type="submit"
							class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
						>
							Run scan
						</button>
					</form>

					<div class="mt-8 border-t border-gray-200 pt-6">
						<h2 class="text-lg font-semibold tracking-tight">Demo examples</h2>
						<p class="mt-2 text-sm text-gray-600">
							Open a sandbox website directly, or run it through the scan tool.
						</p>
						<ul class="mt-4 space-y-3">
							{demoExamples.map((example) => {
								const examplePath = `/sandbox/website/examples/${example.slug}/`;

								return (
									<li class="rounded-md border border-gray-200 p-3" key={example.slug}>
										<p class="text-sm font-medium text-gray-900">{example.title}</p>
										<div class="mt-2 flex gap-3">
											<a href={examplePath} class="text-sm text-gray-900 underline">
												Open site
											</a>
											<form action="/scan" method="post">
												<input
													type="hidden"
													name="domain"
													value=""
													data-scan-target={example.slug}
												/>
												<button type="submit" class="text-sm text-gray-900 underline">
													Scan with tool
												</button>
											</form>
										</div>
									</li>
								);
							})}
						</ul>
					</div>
				</section>
				<script>{`
const host = window.location.host;
const inputs = document.querySelectorAll('[data-scan-target]');
for (const input of inputs) {
  const scenario = input.getAttribute('data-scan-target');
  if (!scenario) continue;
  input.value = host + '/sandbox/website/examples/' + scenario + '/';
}
				`}</script>
			</Layout>
		);
	});
