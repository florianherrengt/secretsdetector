import { z } from "zod";
import type { FC } from "hono/jsx";
import { ScanCard } from "../components/ScanCard.js";
import { Section } from "../components/Section.js";
import { Layout } from "../layout.js";

export const confirmPagePropsSchema = z.object({
	title: z.string().min(1),
	message: z.string().min(1),
	confirmAction: z.string().min(1),
	cancelHref: z.string().min(1),
	confirmLabel: z.string().min(1).default("Confirm"),
	cancelLabel: z.string().min(1).default("Cancel")
});

export type ConfirmPageProps = z.infer<typeof confirmPagePropsSchema>;

export const ConfirmPage: FC<ConfirmPageProps> = z
	.function()
	.args(confirmPagePropsSchema)
	.returns(z.custom<ReturnType<FC<ConfirmPageProps>>>())
	.implement((props) => {
		return (
			<Layout title={props.title} topNavMode="app">
				<div class="space-y-6">
					<h1 class="text-xl font-semibold text-foreground">{props.title}</h1>
					<Section title="Please Confirm">
						<ScanCard>
							<p class="text-sm text-foreground">{props.message}</p>
							<div class="mt-4 flex items-center gap-3">
								<form action={props.confirmAction} method="post">
									<button
										type="submit"
										class="rounded-md bg-error px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-error/90"
									>
										{props.confirmLabel}
									</button>
								</form>
								<a
									href={props.cancelHref}
									class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
								>
									{props.cancelLabel}
								</a>
							</div>
						</ScanCard>
					</Section>
				</div>
			</Layout>
		);
	});
