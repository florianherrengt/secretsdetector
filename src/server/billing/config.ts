import { z } from 'zod';

export const isStripeConfigured = z
	.function()
	.args()
	.returns(z.boolean())
	.implement(() => {
		return (
			(process.env.STRIPE_SECRET_KEY ?? '').trim().length > 0 ||
			(process.env.STRIPE_BILLING_MOCK_URL ?? '').trim().length > 0
		);
	});
