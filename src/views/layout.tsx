import { z } from "zod";
import type { FC, PropsWithChildren } from "hono/jsx";

type LayoutProps = PropsWithChildren<{ title: string }>;

export const Layout: FC<LayoutProps> = z
	.function()
	.args(z.custom<LayoutProps>())
	.returns(z.custom<ReturnType<FC<LayoutProps>>>())
	.implement(({ title, children }) => {
		return (
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>{title} | Secret Detector</title>
					<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
				</head>
				<body class="mx-auto max-w-4xl p-8 font-sans text-gray-900">
					<nav class="mb-6 border-b border-gray-200 pb-2">
						<strong>Secret Detector</strong>
					</nav>
					{children}
				</body>
			</html>
		);
	});
