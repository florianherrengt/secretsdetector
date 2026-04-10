import { z } from "zod";
import { db } from "../db/client.js";
import { users, loginTokens, sessions } from "../db/schema.js";
import { eq, and, gt, isNull } from "drizzle-orm";
import { generateToken, hashToken } from "./crypto.js";
import { getEmailProvider } from "../email/index.js";

const TOKEN_EXPIRY_MINUTES = 15;
const SESSION_EXPIRY_DAYS = 30;

export const requestMagicLink = z
  .function()
  .args(z.string())
  .returns(z.promise(z.void()))
  .implement(async (email) => {
    const normalizedEmail = email.toLowerCase().trim();
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await db.insert(loginTokens).values({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      tokenHash,
      expiresAt,
      createdAt: new Date()
    });

    const domain = process.env.DOMAIN || "localhost:3000";
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const loginUrl = `${protocol}://${domain}/auth/verify?token=${rawToken}`;

    const emailProvider = getEmailProvider();
    await emailProvider.send({
      to: normalizedEmail,
      subject: "Your login link",
      html: `
        <h1>Login to Secret Detector</h1>
        <p>Click the link below to log in:</p>
        <p><a href="${loginUrl}">Login</a></p>
        <p>This link will expire in ${TOKEN_EXPIRY_MINUTES} minutes.</p>
      `
    });
  });

export const verifyMagicLink = z
  .function()
  .args(z.string())
  .returns(
    z.promise(
      z.object({
        sessionId: z.string(),
        userId: z.string()
      })
    )
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
          isNull(loginTokens.usedAt)
        )
      )
      .returning();

    if (!token) {
      throw new Error("Invalid or expired token");
    }

    const [existingUser] = await db.select().from(users).where(eq(users.email, token.email));

    if (!existingUser) {
      const newUserId = crypto.randomUUID();
      await db.insert(users).values({
        id: newUserId,
        email: token.email,
        createdAt: now
      });
    }

    const [user] = await db.select().from(users).where(eq(users.email, token.email));

    if (!user) {
      throw new Error("Failed to create user");
    }

    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt: sessionExpiresAt,
      createdAt: now
    });

    return { sessionId, userId: user.id };
  });

export const getSession = z
  .function()
  .args(z.string())
  .returns(z.promise(z.nullable(z.object({ userId: z.string(), email: z.string() }))))
  .implement(async (sessionId) => {
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          gt(sessions.expiresAt, new Date())
        )
      );

    if (!session) {
      return null;
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.userId));

    if (!user) {
      return null;
    }

    return { userId: user.id, email: user.email };
  });

export const logout = z
  .function()
  .args(z.string())
  .returns(z.promise(z.void()))
  .implement(async (sessionId) => {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  });
