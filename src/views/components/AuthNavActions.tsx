import { z } from "zod";
import type { FC } from "hono/jsx";

export const authNavActionsPropsSchema = z.object({
	mode: z.enum(["auth", "app"])
});

export type AuthNavActionsProps = z.infer<typeof authNavActionsPropsSchema>;

export const AuthNavActions: FC<AuthNavActionsProps> = z
	.function()
	.args(authNavActionsPropsSchema)
	.returns(z.custom<ReturnType<FC<AuthNavActionsProps>>>())
	.implement(({ mode }) => {
		if (mode === "app") {
			return (
				<a
					href="/settings"
					class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					Settings
				</a>
			);
		}

		return (
			<div class="flex items-center gap-2">
				<a
					href="/auth/sign-in"
					class="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
				>
					Sign in
				</a>
				<a
					href="/auth/sign-up"
					class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					Sign up
				</a>
			</div>
		);
	});
