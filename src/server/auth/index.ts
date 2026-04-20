import { z } from 'zod';
import { db } from '../db/client.js';
import { users, loginTokens, sessions, userDomains, domains } from '../db/schema.js';
import { eq, and, gt, isNull, inArray, ne } from 'drizzle-orm';
import { generateToken, hashToken } from './crypto.js';
import { getEmailProvider } from '../email/index.js';

const TOKEN_EXPIRY_MINUTES = 15;
const SESSION_EXPIRY_DAYS = 30;

export const requestMagicLink = z
	.function()
	.args(z.string())
	.returns(z.promise(z.void()))
	.implement(async (email) => {
		const normalizedEmail = email.toLowerCase().trim();
		const [existingUser] = await db.select().from(users).where(eq(users.email, normalizedEmail));

		if (!existingUser) {
			await db.insert(users).values({
				id: crypto.randomUUID(),
				email: normalizedEmail,
				createdAt: new Date(),
			});
		}

		const rawToken = generateToken();
		const tokenHash = await hashToken(rawToken);
		const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

		await db.insert(loginTokens).values({
			id: crypto.randomUUID(),
			email: normalizedEmail,
			tokenHash,
			expiresAt,
			createdAt: new Date(),
		});

		const domain = process.env.DOMAIN || 'localhost:3000';
		const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
		const loginUrl = `${protocol}://${domain}/auth/verify?token=${rawToken}`;

		const emailProvider = getEmailProvider();

		if (existingUser?.isVerified) {
			await emailProvider.send({
				to: normalizedEmail,
				subject: 'Your login link',
				html: `
        <h1>Login to Secret Detector</h1>
        <p>Click the link below to log in:</p>
        <p><a href="${loginUrl}">Login</a></p>
        <p>This link will expire in ${TOKEN_EXPIRY_MINUTES} minutes.</p>
      `,
			});
		} else {
			await emailProvider.send({
				to: normalizedEmail,
				subject: 'Welcome to Secret Detector',
				html: `
        <h1>Welcome to Secret Detector</h1>
        <p>Click the link below to get started:</p>
        <p><a href="${loginUrl}">Get started</a></p>
        <p>This link will expire in ${TOKEN_EXPIRY_MINUTES} minutes.</p>
        <p>By signing up, you agree to our <a href="${protocol}://${domain}/terms">Terms of Service</a> and <a href="${protocol}://${domain}/privacy">Privacy Policy</a>.</p>
      `,
			});
		}
	});

export const verifyMagicLink = z
	.function()
	.args(z.string())
	.returns(
		z.promise(
			z.object({
				sessionId: z.string(),
				userId: z.string(),
			}),
		),
	)
	.implement(async (rawToken) => {
		const tokenHash = await hashToken(rawToken);
		const now = new Date();

		const [token] = await db
			.update(loginTokens)
			.set({ usedAt: now })
			.where(
				and(
					eq(loginTokens.tokenHash, tokenHash),
					gt(loginTokens.expiresAt, now),
					isNull(loginTokens.usedAt),
				),
			)
			.returning();

		if (!token) {
			throw new Error('Invalid or expired token');
		}

		const [existingUser] = await db.select().from(users).where(eq(users.email, token.email));

		if (!existingUser) {
			throw new Error('User not found');
		}

		if (!existingUser.isVerified) {
			await db.update(users).set({ isVerified: true }).where(eq(users.id, existingUser.id));
		}

		const [user] = await db.select().from(users).where(eq(users.email, token.email));

		if (!user) {
			throw new Error('Failed to create user');
		}

		const sessionId = crypto.randomUUID();
		const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

		await db.insert(sessions).values({
			id: sessionId,
			userId: user.id,
			expiresAt: sessionExpiresAt,
			createdAt: now,
		});

		return { sessionId, userId: user.id };
	});

export const getSession = z
	.function()
	.args(z.string())
	.returns(
		z.promise(
			z.nullable(
				z.object({
					userId: z.string(),
					email: z.string(),
					stripeCustomerId: z.string().nullable(),
				}),
			),
		),
	)
	.implement(async (sessionId) => {
		const [session] = await db
			.select()
			.from(sessions)
			.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));

		if (!session) {
			return null;
		}

		const [user] = await db
			.select()
			.from(users)
			.where(and(eq(users.id, session.userId), eq(users.isVerified, true)));

		if (!user) {
			return null;
		}

		return {
			userId: user.id,
			email: user.email,
			stripeCustomerId: user.stripeCustomerId,
		};
	});

export const deleteAccount = z
	.function()
	.args(z.string())
	.returns(z.promise(z.void()))
	.implement(async (userId) => {
		await db.transaction(async (tx) => {
			const userDomainRows = await tx
				.select({ domain: userDomains.domain })
				.from(userDomains)
				.where(eq(userDomains.userId, userId));
			const hostnames = userDomainRows.map((r) => r.domain);

			// userDomains rows are cascade-deleted with the user, but the domains table has no FK to users.
			// We must manually clean up domains that no other user references to avoid orphans.
			if (hostnames.length > 0) {
				const domainRows = await tx
					.select({ id: domains.id, hostname: domains.hostname })
					.from(domains)
					.where(inArray(domains.hostname, hostnames));

				const hostnamesWithOtherUsers = await tx
					.select({ domain: userDomains.domain })
					.from(userDomains)
					.where(and(inArray(userDomains.domain, hostnames), ne(userDomains.userId, userId)));
				const preservedHostnames = new Set(hostnamesWithOtherUsers.map((r) => r.domain));

				for (const dr of domainRows) {
					if (!preservedHostnames.has(dr.hostname)) {
						await tx.delete(domains).where(eq(domains.id, dr.id));
					}
				}
			}

			await tx.delete(users).where(eq(users.id, userId));
		});
	});

export const logout = z
	.function()
	.args(z.string())
	.returns(z.promise(z.void()))
	.implement(async (sessionId) => {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
	});
