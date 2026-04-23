import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEmailProvider } from '../email/index.js';
import { db } from '../db/client.js';
import { mockEmails } from '../db/schema.js';
import { MockEmailProvider } from './MockEmailProvider.js';
import { SMTPEmailProvider } from './SMTPEmailProvider.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalSmtpHost = process.env.SMTP_HOST;
const originalSmtpUser = process.env.SMTP_USER;
const originalSmtpPass = process.env.SMTP_PASS;

describe('getEmailProvider', () => {
	beforeEach(async () => {
		await db.delete(mockEmails);
		delete process.env.SMTP_HOST;
		delete process.env.SMTP_USER;
		delete process.env.SMTP_PASS;
		process.env.NODE_ENV = 'development';
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;

		if (originalSmtpHost) {
			process.env.SMTP_HOST = originalSmtpHost;
		} else {
			delete process.env.SMTP_HOST;
		}

		if (originalSmtpUser) {
			process.env.SMTP_USER = originalSmtpUser;
		} else {
			delete process.env.SMTP_USER;
		}

		if (originalSmtpPass) {
			process.env.SMTP_PASS = originalSmtpPass;
		} else {
			delete process.env.SMTP_PASS;
		}
	});

	it('returns MockEmailProvider when SMTP creds are not set', async () => {
		const provider = getEmailProvider();

		expect(provider).toBeInstanceOf(MockEmailProvider);

		await provider.send({
			to: 'test@example.com',
			subject: 'Test',
			html: '<p>Test</p>',
		});

		const emails = await db.select().from(mockEmails);
		const matchingEmails = emails.filter(
			(email) =>
				email.to === 'test@example.com' && email.subject === 'Test' && email.html === '<p>Test</p>',
		);
		expect(matchingEmails.length).toBeGreaterThan(0);
	});

	it('returns SMTPEmailProvider when SMTP creds are set', () => {
		process.env.SMTP_HOST = 'smtp.example.com';
		process.env.SMTP_USER = 'user';
		process.env.SMTP_PASS = 'pass';

		const provider = getEmailProvider();

		expect(provider).toBeInstanceOf(SMTPEmailProvider);
	});

	it('throws in production when SMTP creds are missing', () => {
		process.env.NODE_ENV = 'production';
		delete process.env.SMTP_HOST;
		delete process.env.SMTP_USER;
		delete process.env.SMTP_PASS;

		expect(() => getEmailProvider()).toThrow(
			'SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) are required in production',
		);
	});
});
