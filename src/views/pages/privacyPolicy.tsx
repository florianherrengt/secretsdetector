import { z } from "zod";
import type { FC } from "hono/jsx";

export const privacyPolicyPagePropsSchema = z.object({
	contactEmail: z.string().min(1),
});

export type PrivacyPolicyPageProps = z.infer<typeof privacyPolicyPagePropsSchema>;

export const PrivacyPolicyPage: FC<PrivacyPolicyPageProps> = z
	.function()
	.args(privacyPolicyPagePropsSchema)
	.returns(z.custom<ReturnType<FC<PrivacyPolicyPageProps>>>())
	.implement(({ contactEmail }) => {
		return (
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>Privacy Policy | Secrets Watch</title>
					<link rel="stylesheet" href="/assets/app.css" />
					<script src="/assets/set-locale-cookies.js"></script>
				</head>
				<body class="mx-auto max-w-4xl bg-background p-8 font-sans text-foreground">
					<header class="mb-6 flex items-center justify-between border-b border-border pb-2">
						<strong>Secrets Watch</strong>
						<a href="/" class="text-sm text-muted-foreground transition-colors hover:bg-muted rounded-md px-3 py-1.5">
							← Back to home
						</a>
					</header>
					<div class="space-y-6">
						<h1 class="text-2xl font-semibold text-foreground">Privacy Policy</h1>
						<p class="text-sm text-muted-foreground">Effective date: April 16, 2026</p>
						<hr class="border-border" />
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">1. Introduction</h2>
							<p class="text-base text-foreground">
								Secrets Watch ("we", "us", or "our") operates the Secrets Watch web application. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our Service.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">2. Information We Collect</h2>
							<p class="text-base text-foreground">We collect the following categories of personal information:</p>
							<p class="text-base text-foreground"><strong>Account Information:</strong></p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Email address (used for account registration and magic link authentication)</li>
							</ul>
							<p class="text-base text-foreground"><strong>Usage Data:</strong></p>
							<ul class="list-disc pl-6 space-y-1">
								<li>URLs and domains you submit for scanning</li>
								<li>Scan results and security findings</li>
								<li>Session data for authentication</li>
							</ul>
							<p class="text-base text-foreground"><strong>Technical Data:</strong></p>
							<ul class="list-disc pl-6 space-y-1">
								<li>IP address (used for rate limiting and abuse prevention)</li>
								<li>Browser user agent and cookies (session management only)</li>
							</ul>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">3. How We Use Your Information</h2>
							<p class="text-base text-foreground">We use collected information for the following purposes:</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>To provide and operate the Service</li>
								<li>To authenticate your account via magic link emails</li>
								<li>To process and report scan results</li>
								<li>To send email notifications about scan results and account activity</li>
								<li>To prevent abuse and enforce rate limits</li>
								<li>To maintain the security and integrity of the Service</li>
							</ul>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">4. Legal Basis for Processing</h2>
							<p class="text-base text-foreground">Under GDPR, we process your personal data on the following legal bases:</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Contract performance: Processing necessary to provide the Service you requested</li>
								<li>Legitimate interests: Rate limiting and security measures to protect the Service</li>
								<li>Consent: Where you have provided explicit consent for specific processing activities</li>
							</ul>
							<p class="text-base text-foreground">
								Under CCPA, we collect and use personal information for the business purposes described above.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">5. Data Storage and Security</h2>
							<p class="text-base text-foreground">
								All data is stored on self-hosted infrastructure. We do not use third-party cloud providers, external analytics services, or third-party data processors.
							</p>
							<p class="text-base text-foreground"><strong>Storage systems:</strong></p>
							<ul class="list-disc pl-6 space-y-1">
								<li>PostgreSQL database for structured data (accounts, domains, scans, findings)</li>
								<li>Redis for session management, job queues, and rate limiting</li>
							</ul>
							<p class="text-base text-foreground"><strong>Security measures:</strong></p>
							<ul class="list-disc pl-6 space-y-1">
								<li>All data in transit is encrypted via TLS</li>
								<li>Passwords are never stored — we use magic link (token-based) authentication</li>
								<li>Access to infrastructure is restricted and authenticated</li>
								<li>Session tokens are hashed before storage</li>
							</ul>
							<p class="text-base text-foreground">
								Despite these measures, no system is completely secure. We cannot guarantee absolute security of your data.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">6. Data Retention</h2>
							<p class="text-base text-foreground">
								We retain your personal data for as long as your account is active or as needed to provide the Service. Specifically:
							</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Account data: Retained until account deletion</li>
								<li>Scan results and findings: Retained until account deletion or manual removal</li>
								<li>Session data: Expires after the session timeout period</li>
								<li>Login tokens: Deleted after use or expiration</li>
								<li>Rate limiting data: Automatically purged after the rate limit window expires</li>
							</ul>
							<p class="text-base text-foreground">
								Upon account deletion, we will remove your personal data from our systems within 30 days.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">7. Third-Party Sharing</h2>
							<p class="text-base text-foreground">We do NOT share your personal information with any third parties. We do NOT:</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Sell your personal data</li>
								<li>Share your data with advertisers</li>
								<li>Use third-party analytics or tracking services</li>
								<li>Transfer your data to external data processors</li>
							</ul>
							<p class="text-base text-foreground">
								All infrastructure is self-hosted and under our direct control.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">8. Cookies</h2>
							<p class="text-base text-foreground">
								The Service uses only essential cookies for session management. We do not use tracking cookies, analytics cookies, or advertising cookies. The session cookie is necessary for the Service to function and does not require consent under GDPR.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">9. Your Rights</h2>
							<p class="text-base text-foreground"><strong>GDPR Rights (EU/EEA users):</strong></p>
							<p class="text-base text-foreground">You have the right to:</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Access your personal data</li>
								<li>Correct inaccurate personal data</li>
								<li>Request deletion of your personal data</li>
								<li>Object to processing of your personal data</li>
								<li>Request data portability</li>
								<li>Withdraw consent at any time</li>
								<li>Lodge a complaint with a supervisory authority</li>
							</ul>
							<p class="text-base text-foreground"><strong>CCPA Rights (California residents):</strong></p>
							<p class="text-base text-foreground">You have the right to:</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Know what personal information we collect</li>
								<li>Request deletion of your personal information</li>
								<li>Opt out of the sale of personal information (we do not sell your data)</li>
								<li>Not be discriminated against for exercising your rights</li>
							</ul>
							<p class="text-base text-foreground">
								To exercise any of these rights, contact us at: {contactEmail}
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">10. Data Breach Notification</h2>
							<p class="text-base text-foreground">
								In the event of a data breach that is likely to result in a risk to your rights and freedoms, we will notify affected users within 72 hours via email to the address associated with your account.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">11. Children's Privacy</h2>
							<p class="text-base text-foreground">
								The Service is not intended for children under 16 years of age. We do not knowingly collect personal information from children under 16. If we discover that we have collected data from a child under 16, we will delete it promptly.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">12. International Users</h2>
							<p class="text-base text-foreground">
								The Service is operated from our self-hosted infrastructure. If you access the Service from outside our jurisdiction, please be aware that your data will be processed on our servers. By using the Service, you consent to this transfer.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">13. Changes to This Policy</h2>
							<p class="text-base text-foreground">
								We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. We will make reasonable efforts to notify users of material changes via email or a notice within the Service.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">14. Contact Us</h2>
							<p class="text-base text-foreground">
								If you have questions about this Privacy Policy or wish to exercise your data rights, contact us at: {contactEmail}
							</p>
						</div>
					</div>
				</body>
			</html>
		);
	});
