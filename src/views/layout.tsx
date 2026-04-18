import { z } from "zod";
import type { FC, PropsWithChildren } from "hono/jsx";
import { AuthNavActions } from "./components/AuthNavActions.js";

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
					<link rel="stylesheet" href="/assets/app.css" />
					<script src="/assets/set-locale-cookies.js"></script>
				</head>
				<body class="mx-auto max-w-4xl bg-background p-8 font-sans text-foreground">
					<nav class="mb-6 flex items-center justify-between border-b border-border pb-2">
						<strong>Secret Detector</strong>
						<AuthNavActions mode={navMode} />
					</nav>
					{children}
				</body>
			</html>
		);
	});
