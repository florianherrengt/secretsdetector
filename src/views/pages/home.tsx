import { z } from "zod";
import type { FC } from "hono/jsx";
import { Layout } from "../layout.js";

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
							placeholder="localhost:3000/sandbox/website/pem-key"
							class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						/>
						<button
							type="submit"
							class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
						>
							Run scan
						</button>
					</form>
				</section>
			</Layout>
		);
	});
