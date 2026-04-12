import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";

const sandboxWebsiteRoutes = new Hono();

const testScenarioSchema = z.enum([
	"pem-key",
	"jwt",
	"credential-url",
	"no-leak",
	"multiple",
	"generic-token-valid",
	"generic-token-invalid",
	"public-key",
	"analytics-context",
	"weak-context",
	"env-var-key",
	"env-var-key-clean"
]);

type TestScenario = z.infer<typeof testScenarioSchema>;

const scenarioCopy: Record<TestScenario, { title: string; issue: string; findHint: string }> = {
	"pem-key": {
		title: "PEM key in frontend bundle",
		issue: "A private key is hard-coded into JavaScript.",
		findHint: "Open DevTools, inspect Network, and look at /assets/main.js."
	},
	jwt: {
		title: "JWT token shipped to client",
		issue: "A JWT-like token is exposed in client-side code.",
		findHint: "Check script responses in Network and search for three dot-separated segments."
	},
	"credential-url": {
		title: "Credential in URL",
		issue: "A URL containing username and password appears in JavaScript.",
		findHint: "Inspect /assets/main.js and search for @ in URL auth format user:pass@host."
	},
	"no-leak": {
		title: "Clean baseline",
		issue: "No sensitive value is present.",
		findHint: "Use this as a control case to confirm no findings are returned."
	},
	multiple: {
		title: "Multiple scripts, first one leaks",
		issue: "Three scripts are loaded; the first one contains the secret.",
		findHint: "In Network, verify load order and inspect /assets/first.js before others."
	},
	"generic-token-valid": {
		title: "Generic token with strong context",
		issue: "A high-entropy token is assigned to an API key variable.",
		findHint: "Inspect /assets/main.js and find a long random string near apiKey."
	},
	"generic-token-invalid": {
		title: "Short ID should be ignored",
		issue: "A short ID value exists but should not be flagged as a secret.",
		findHint: "Inspect /assets/main.js and confirm only a short abc123 value appears."
	},
	"public-key": {
		title: "Publishable key allowlisted",
		issue: "A known public key format is present and should be suppressed.",
		findHint: "Inspect /assets/main.js for a pk_live_ prefixed value."
	},
	"analytics-context": {
		title: "Analytics identifier context",
		issue: "An analytics measurement identifier appears and should not alert.",
		findHint: "Inspect /assets/main.js for measurementId and a G- prefixed value."
	},
	"weak-context": {
		title: "Weak context should be ignored",
		issue: "A long random-looking string appears without secret-related context.",
		findHint: "Inspect /assets/main.js and check that only a generic value variable is used."
	},
	"env-var-key": {
		title: "Environment variable key with assigned secret",
		issue: "A known sensitive environment variable key name is assigned a string literal value in client-side JavaScript.",
		findHint: "Inspect /assets/main.js and look for AWS_SECRET_ACCESS_KEY assigned a value."
	},
	"env-var-key-clean": {
		title: "Non-sensitive env var keys (should not flag)",
		issue: "Only generic keys like NODE_ENV and PORT appear — these are not in the sensitive keys list.",
		findHint: "Inspect /assets/main.js and confirm no findings."
	}
};

const scenarioAssets: Record<TestScenario, Record<string, string>> = {
	"pem-key": {
		"main.js": [
			"const fixture = `",
			"-----BEGIN PRIVATE KEY-----",
			"abc123supersecretfixturekey",
			"-----END PRIVATE KEY-----",
			"`;"
		].join("\n")
	},
	jwt: {
		"main.js":
			'const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50Ijoic2VjcmV0LWRldGVjdG9yIiwiZXhwIjo0MTAyNDQ0ODAwfQ.5Vf2Idz6bVXwAxf6w7wJiv-LQvVv9dQ9Qz2nUtsL0hE";'
	},
	"credential-url": {
		"main.js": 'const url = "https://admin:password@internal.api.com";'
	},
	"no-leak": {
		"main.js": 'console.log("hello world");'
	},
	multiple: {
		"first.js": [
			"const localConfig = {",
			'  endpoint: "https://root:toor@internal.example.local",',
			'  env: "test"',
			"};"
		].join("\n"),
		"second.js": 'console.log("second script without leaks");',
		"third.js": 'console.log("third script without leaks");'
	},
	"generic-token-valid": {
		"main.js": 'const apiKey = "V9wQ1zN7mB4cK2rT8yP0sD6fH3jL5xA9";'
	},
	"generic-token-invalid": {
		"main.js": 'const id = "abc123";'
	},
	"public-key": {
		"main.js": 'const key = "pk_live_123456";'
	},
	"analytics-context": {
		"main.js": 'const measurementId = "G-123456";'
	},
	"weak-context": {
		"main.js": 'const value = "V9wQ1zN7mB4cK2rT8yP0sD6fH3jL5xA9";'
	},
	"env-var-key": {
		"main.js": 'const AWS_SECRET_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";'
	},
	"env-var-key-clean": {
		"main.js": 'const NODE_ENV = "production"; const PORT = "3000";'
	}
};

const legacyAssetMap = {
	"pem-key.js": { scenario: "pem-key", asset: "main.js" },
	"jwt.js": { scenario: "jwt", asset: "main.js" },
	"credential-url.js": { scenario: "credential-url", asset: "main.js" },
	"no-leak.js": { scenario: "no-leak", asset: "main.js" },
	"multiple-first.js": { scenario: "multiple", asset: "first.js" },
	"multiple-second.js": { scenario: "multiple", asset: "second.js" },
	"multiple-third.js": { scenario: "multiple", asset: "third.js" }
} as const;

const legacyAssetSchema = z.enum([
	"pem-key.js",
	"jwt.js",
	"credential-url.js",
	"no-leak.js",
	"multiple-first.js",
	"multiple-second.js",
	"multiple-third.js"
]);

const exampleParamsSchema = z.object({ scenario: testScenarioSchema });
const exampleAssetParamsSchema = z.object({
	scenario: testScenarioSchema,
	asset: z.string().min(1)
});

const normalizeHost = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((rawHost) => {
		const trimmed = rawHost.trim();

		if (trimmed.length === 0) {
			return "";
		}

		const withoutScheme = trimmed.replace(/^https?:\/\//i, "");
		const withoutTrailingSlash = withoutScheme.replace(/\/+$/g, "");

		return withoutTrailingSlash;
	});

const resolveRequestHost = z
	.function()
	.args(z.custom<Context>())
	.returns(z.string().min(1))
	.implement((c) => {
		const forwardedHostHeader = c.req.header("x-forwarded-host") ?? "";
		const forwardedHost = forwardedHostHeader
			.split(",")
			.map((segment) => normalizeHost(segment))
			.find((segment) => segment.length > 0);

		if (forwardedHost) {
			return forwardedHost;
		}

		const hostHeader = normalizeHost(c.req.header("host") ?? "");

		if (hostHeader.length > 0) {
			return hostHeader;
		}

		const envDomain = normalizeHost(process.env.DOMAIN ?? "");

		if (envDomain.length > 0) {
			return envDomain;
		}

		return "localhost:3000";
	});

const renderExamplePage = z
	.function()
	.args(testScenarioSchema)
	.returns(z.string().min(1))
	.implement((scenario) => {
		const copy = scenarioCopy[scenario];
		const assets = Object.keys(scenarioAssets[scenario]);
		const scriptTags = assets
			.map((assetName) => {
				return `<script src="/sandbox/website/examples/${scenario}/assets/${assetName}"></script>`;
			})
			.join("\n");

		return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Example ${scenario}</title>
  ${scriptTags}
</head>
<body>
  <main>
    <h1>${copy.title}</h1>
    <p><strong>What is wrong:</strong> ${copy.issue}</p>
    <p><strong>How to find it:</strong> ${copy.findHint}</p>
    <p>This page is intentionally vulnerable for demo use only.</p>
  </main>
</body>
</html>`;
	});

sandboxWebsiteRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const host = resolveRequestHost(c);
			const scenarios = testScenarioSchema.options;
			const rows = scenarios
				.map((scenario) => {
					const copy = scenarioCopy[scenario];
					const scanTarget = `${host}/sandbox/website/examples/${scenario}/`;
					return `<li>
  <h2>${copy.title}</h2>
  <p>${copy.issue}</p>
  <p>
    <a href="/sandbox/website/examples/${scenario}/">Open site example</a>
  </p>
  <form action="/scan" method="post">
    <input type="hidden" name="domain" value="${scanTarget}" />
    <button type="submit">Scan with tool</button>
  </form>
</li>`;
				})
				.join("\n");

			return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sandbox Website Examples</title>
</head>
<body>
  <main>
    <h1>Sandbox Website Examples</h1>
    <p>Each demo uses its own folder and isolated assets so you can inspect requests individually.</p>
    <ul>
      ${rows}
    </ul>
  </main>
</body>
</html>`);
		})
);

sandboxWebsiteRoutes.get(
	"/examples/:scenario",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const parsed = exampleParamsSchema.safeParse(c.req.param());

			if (!parsed.success) {
				return c.text("Not found", 404);
			}

			return c.redirect(`/sandbox/website/examples/${parsed.data.scenario}/`, 302);
		})
);

sandboxWebsiteRoutes.get(
	"/examples/:scenario/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const parsed = exampleParamsSchema.safeParse(c.req.param());

			if (!parsed.success) {
				return c.text("Not found", 404);
			}

			return c.html(renderExamplePage(parsed.data.scenario));
		})
);

sandboxWebsiteRoutes.get(
	"/examples/:scenario/index.html",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const parsed = exampleParamsSchema.safeParse(c.req.param());

			if (!parsed.success) {
				return c.text("Not found", 404);
			}

			return c.html(renderExamplePage(parsed.data.scenario));
		})
);

sandboxWebsiteRoutes.get(
	"/examples/:scenario/assets/:asset",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const parsed = exampleAssetParamsSchema.safeParse(c.req.param());

			if (!parsed.success) {
				return c.text("Not found", 404);
			}

			const content = scenarioAssets[parsed.data.scenario][parsed.data.asset];

			if (!content) {
				return c.text("Not found", 404);
			}

			return c.body(content, 200, {
				"content-type": "application/javascript; charset=utf-8",
				"cache-control": "no-store"
			});
		})
);

sandboxWebsiteRoutes.get(
	"/assets/:asset",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const legacyAssetResult = legacyAssetSchema.safeParse(c.req.param("asset"));

			if (!legacyAssetResult.success) {
				return c.text("Not found", 404);
			}

			const mapped = legacyAssetMap[legacyAssetResult.data];
			const content = scenarioAssets[mapped.scenario][mapped.asset];

			return c.body(content, 200, {
				"content-type": "application/javascript; charset=utf-8",
				"cache-control": "no-store"
			});
		})
);

sandboxWebsiteRoutes.get(
	"/:scenario",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const scenarioResult = testScenarioSchema.safeParse(c.req.param("scenario"));

			if (!scenarioResult.success) {
				return c.text("Not found", 404);
			}

			return c.redirect(`/sandbox/website/examples/${scenarioResult.data}/`, 302);
		})
);

export default sandboxWebsiteRoutes;
