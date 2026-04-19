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
			<a
				href="/auth/sign-in"
				class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				Get started
			</a>
		);
	});
