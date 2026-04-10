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
						Server-side domain scanning and secret detection platform.
					</p>
				</section>
			</Layout>
		);
	});
