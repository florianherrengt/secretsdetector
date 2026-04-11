import { z } from "zod";
import type { FC, PropsWithChildren } from "hono/jsx";

type LayoutProps = PropsWithChildren<{
	title: string;
	autoRefreshSeconds?: number;
	topNavMode?: "auth" | "app";
}>;

export const Layout: FC<LayoutProps> = z
	.function()
	.args(z.custom<LayoutProps>())
	.returns(z.custom<ReturnType<FC<LayoutProps>>>())
	.implement(({ title, children, autoRefreshSeconds, topNavMode }) => {
		const navMode = topNavMode ?? "auth";

		return (
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					{typeof autoRefreshSeconds === "number" && autoRefreshSeconds > 0 ? (
						<meta http-equiv="refresh" content={String(autoRefreshSeconds)} />
					) : null}
					<title>{title} | Secret Detector</title>
					<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
				</head>
				<body class="mx-auto max-w-4xl p-8 font-sans text-gray-900">
					<nav class="mb-6 flex items-center justify-between border-b border-gray-200 pb-2">
						<strong>Secret Detector</strong>
						{navMode === "app" ? (
							<a
								href="/domains"
								class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
							>
								Go to app
							</a>
						) : (
							<div class="flex items-center gap-2">
								<a
									href="/auth/sign-in"
									class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
								>
									Sign in
								</a>
								<a
									href="/auth/sign-up"
									class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
								>
									Sign up
								</a>
							</div>
						)}
					</nav>
					{children}
				</body>
			</html>
		);
	});
