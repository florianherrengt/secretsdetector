import { z } from 'zod';
import type { FC, PropsWithChildren } from 'hono/jsx';

type SectionProps = PropsWithChildren<{
	title: string;
	description?: string;
	action?: ReturnType<FC>;
	class?: string;
	'data-testid'?: string;
}>;

const sectionPropsSchema = z.custom<SectionProps>();

export const Section: FC<SectionProps> = z
	.function()
	.args(sectionPropsSchema)
	.returns(z.custom<ReturnType<FC<SectionProps>>>())
	.implement(
		({ title, description, action, class: classValue, 'data-testid': dataTestId, children }) => {
			const classes = ['space-y-3', classValue ?? ''].join(' ').trim();

			return (
				<section class={classes} data-testid={dataTestId}>
					<header class="flex items-start justify-between gap-3">
						<div class="space-y-1">
							<h2 class="text-lg font-semibold text-foreground">{title}</h2>
							{description ? <p class="text-sm text-muted-foreground">{description}</p> : null}
						</div>
						{action ? <div>{action}</div> : null}
					</header>
					{children}
				</section>
			);
		},
	);
