import { z } from "zod";
import type { FC } from "hono/jsx";

export const termsOfServicePagePropsSchema = z.object({
	contactEmail: z.string().min(1),
});

export type TermsOfServicePageProps = z.infer<typeof termsOfServicePagePropsSchema>;

export const TermsOfServicePage: FC<TermsOfServicePageProps> = z
	.function()
	.args(termsOfServicePagePropsSchema)
	.returns(z.custom<ReturnType<FC<TermsOfServicePageProps>>>())
	.implement(({ contactEmail }) => {
		return (
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>Terms of Service | Secrets Watch</title>
					<link rel="stylesheet" href="/assets/app.css" />
				</head>
				<body class="mx-auto max-w-4xl bg-background p-8 font-sans text-foreground">
					<header class="mb-6 flex items-center justify-between border-b border-border pb-2">
						<strong>Secrets Watch</strong>
						<a href="/" class="text-sm text-muted-foreground transition-colors hover:bg-muted rounded-md px-3 py-1.5">
							← Back to home
						</a>
					</header>
					<div class="space-y-6">
						<h1 class="text-2xl font-semibold text-foreground">Terms of Service</h1>
						<p class="text-sm text-muted-foreground">Effective date: April 16, 2026</p>
						<hr class="border-border" />
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
							<p class="text-base text-foreground">
								By accessing or using Secrets Watch ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to all of these terms, do not use the Service.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">2. Description of Service</h2>
							<p class="text-base text-foreground">
								Secrets Watch is a web-based security scanning tool that analyzes publicly accessible websites for exposed secrets, credentials, and security vulnerabilities. The Service performs point-in-time scans of URLs you submit and reports findings.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">3. Eligibility</h2>
							<p class="text-base text-foreground">
								You must be at least 16 years of age to use this Service. By using the Service, you represent that you are at least 16 years old and have the legal capacity to enter into these terms.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">4. Account Registration</h2>
							<p class="text-base text-foreground">
								The Service requires an account to access certain features. You must provide a valid email address. You are responsible for maintaining the security of your account and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">5. Acceptable Use</h2>
							<p class="text-base text-foreground">You agree to use the Service only for lawful purposes. You must NOT:</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Scan websites or URLs that you do not own or have explicit authorization to scan</li>
								<li>Use the Service to exploit, attack, or harm any system or network</li>
								<li>Attempt to reverse engineer, decompile, or disassemble the Service</li>
								<li>Use the Service to violate any applicable law or regulation</li>
								<li>Interfere with or disrupt the Service or servers connected to the Service</li>
								<li>Use automated means to access the Service beyond its intended functionality</li>
							</ul>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">6. User-Submitted Content</h2>
							<p class="text-base text-foreground">
								You are solely responsible for the URLs and domains you submit for scanning. You represent that you have the legal right and authorization to scan any URL you submit. We are not responsible for any misuse of the scanning functionality.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">7. Scan Results Disclaimer</h2>
							<p class="text-base text-foreground">
								Scan results are provided for informational purposes only. The Service performs point-in-time analysis and does NOT guarantee:
							</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>That all security vulnerabilities or exposed secrets will be detected</li>
								<li>That the results are complete, accurate, or up to date</li>
								<li>That the absence of findings means a website is secure</li>
							</ul>
							<p class="text-base text-foreground">
								You should not rely solely on the Service for security assessments. Results should be verified through independent security audits.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">8. Intellectual Property</h2>
							<p class="text-base text-foreground">
								The Service and its original content, features, and functionality are owned by Secrets Watch and are protected by copyright, trademark, and other intellectual property laws. Your use of the Service does not transfer any ownership rights.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">9. Limitation of Liability</h2>
							<p class="text-base text-foreground">TO THE MAXIMUM EXTENT PERMITTED BY LAW:</p>
							<p class="text-base text-foreground">
								The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
							</p>
							<p class="text-base text-foreground">
								IN NO EVENT SHALL SECRETS WATCH BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
							</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Your access to or use of or inability to access or use the Service</li>
								<li>Any conduct or content of any third party</li>
								<li>Any content obtained from the Service</li>
								<li>Unauthorized access, use, or alteration of your transmissions or content</li>
							</ul>
							<p class="text-base text-foreground">
								OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID TO USE THE SERVICE DURING THE TWELVE (12) MONTHS PRIOR TO THE EVENT GIVING RISE TO THE LIABILITY, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">10. Indemnification</h2>
							<p class="text-base text-foreground">
								You agree to defend, indemnify, and hold harmless Secrets Watch from and against any and all claims, damages, obligations, losses, liabilities, costs, or debt arising from:
							</p>
							<ul class="list-disc pl-6 space-y-1">
								<li>Your use of the Service</li>
								<li>Your violation of these Terms</li>
								<li>Your violation of any applicable law or regulation</li>
								<li>Your scanning of websites without proper authorization</li>
								<li>Any content or URLs you submit to the Service</li>
							</ul>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">11. Termination</h2>
							<p class="text-base text-foreground">
								We reserve the right to suspend or terminate your access to the Service at any time, with or without cause, and with or without notice. Upon termination, your right to use the Service will immediately cease. Provisions of these Terms that by their nature should survive termination shall survive.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">12. Binding Arbitration and Class Action Waiver</h2>
							<p class="text-base text-foreground">
								Any dispute arising out of or relating to these Terms or the Service shall be resolved through binding arbitration in accordance with applicable arbitration rules. You agree to arbitrate all disputes with us on an individual basis only — not as a class action, collective action, or representative action. You waive any right to participate in a class action lawsuit or class-wide arbitration against us. You agree that you may bring claims against us only in your individual capacity and not as a plaintiff or class member in any purported class or representative proceeding.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">13. Changes to Terms</h2>
							<p class="text-base text-foreground">
								We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Your continued use of the Service after any changes constitutes acceptance of the updated Terms. We will make reasonable efforts to notify users of material changes.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">14. Governing Law</h2>
							<p class="text-base text-foreground">
								These Terms shall be governed by and construed in accordance with the laws of your jurisdiction, without regard to conflict of law principles. If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full force and effect.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">15. Severability</h2>
							<p class="text-base text-foreground">
								If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.
							</p>
						</div>
						<div class="space-y-3">
							<h2 class="text-xl font-semibold text-foreground">16. Contact</h2>
							<p class="text-base text-foreground">
								For questions about these Terms of Service, contact us at: {contactEmail}
							</p>
						</div>
					</div>
				</body>
			</html>
		);
	});
