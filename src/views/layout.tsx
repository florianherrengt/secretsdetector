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
					<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
					<style type={"text/tailwindcss" as "text/css"}>
						{`
@theme {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-card: hsl(var(--card));
  --color-border: hsl(var(--border));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-success: hsl(var(--success));
  --color-success-foreground: hsl(var(--success-foreground));
  --color-warning: hsl(var(--warning));
  --color-warning-foreground: hsl(var(--warning-foreground));
  --color-error: hsl(var(--error));
  --color-error-foreground: hsl(var(--error-foreground));
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}

@layer base {
  :root {
    --background: 210 20% 98%;
    --foreground: 220 24% 16%;
    --muted: 210 16% 94%;
    --muted-foreground: 215 13% 42%;
    --card: 0 0% 100%;
    --border: 215 16% 88%;
    --primary: 215 25% 27%;
    --primary-foreground: 0 0% 100%;
    --success: 145 38% 38%;
    --success-foreground: 140 42% 96%;
    --warning: 35 80% 45%;
    --warning-foreground: 37 96% 13%;
    --error: 0 58% 45%;
    --error-foreground: 0 70% 97%;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --background: 222 25% 11%;
      --foreground: 210 20% 94%;
      --muted: 223 18% 16%;
      --muted-foreground: 215 15% 67%;
      --card: 222 23% 14%;
      --border: 220 16% 23%;
      --primary: 210 26% 84%;
      --primary-foreground: 222 38% 12%;
      --success: 145 35% 62%;
      --success-foreground: 145 38% 12%;
      --warning: 39 87% 66%;
      --warning-foreground: 36 80% 13%;
      --error: 0 70% 68%;
      --error-foreground: 0 76% 13%;
    }
  }
}
						`}
					</style>
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
