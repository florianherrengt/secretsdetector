import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";

const sandboxWebsiteRoutes = new Hono();

const testScenarioSchema = z.enum(["pem-key", "jwt", "credential-url", "no-leak", "multiple"]);
const testAssetSchema = z.enum([
	"pem-key.js",
	"jwt.js",
	"credential-url.js",
	"no-leak.js",
	"multiple-first.js",
	"multiple-second.js",
	"multiple-third.js"
]);

type TestScenario = z.infer<typeof testScenarioSchema>;
type TestAsset = z.infer<typeof testAssetSchema>;

const testScenarioScripts: Record<TestScenario, string[]> = {
	"pem-key": ["/sandbox/website/assets/pem-key.js"],
	jwt: ["/sandbox/website/assets/jwt.js"],
	"credential-url": ["/sandbox/website/assets/credential-url.js"],
	"no-leak": ["/sandbox/website/assets/no-leak.js"],
	multiple: [
		"/sandbox/website/assets/multiple-first.js",
		"/sandbox/website/assets/multiple-second.js",
		"/sandbox/website/assets/multiple-third.js"
	]
};

const testAssetContent: Record<TestAsset, string> = {
	"pem-key.js": [
		"const fixture = `",
		"-----BEGIN PRIVATE KEY-----",
		"abc123supersecretfixturekey",
		"-----END PRIVATE KEY-----",
		"`;"
	].join("\n"),
	"jwt.js":
		'const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50Ijoic2VjcmV0LWRldGVjdG9yIiwiZXhwIjo0MTAyNDQ0ODAwfQ.5Vf2Idz6bVXwAxf6w7wJiv-LQvVv9dQ9Qz2nUtsL0hE";',
	"credential-url.js": 'const url = "https://admin:password@internal.api.com";',
	"no-leak.js": 'console.log("hello world");',
	"multiple-first.js": [
		"const localConfig = {",
		'  endpoint: "https://root:toor@internal.example.local",',
		'  env: "test"',
		"};"
	].join("\n"),
	"multiple-second.js": 'console.log("second script without leaks");',
	"multiple-third.js": 'console.log("third script without leaks");'
};

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

			const scenario = scenarioResult.data;
			const scripts = testScenarioScripts[scenario];
			const scriptTags = scripts.map((scriptPath) => `<script src="${scriptPath}"></script>`).join("\n");

			return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fixture ${scenario}</title>
  ${scriptTags}
</head>
<body>
  <main>
    <h1>Fixture ${scenario}</h1>
    <p>Deterministic local scan fixture.</p>
  </main>
</body>
</html>`);
		})
);

sandboxWebsiteRoutes.get(
	"/assets/:asset",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const assetResult = testAssetSchema.safeParse(c.req.param("asset"));

			if (!assetResult.success) {
				return c.text("Not found", 404);
			}

			return c.body(testAssetContent[assetResult.data], 200, {
				"content-type": "application/javascript; charset=utf-8",
				"cache-control": "no-store"
			});
		})
);

export default sandboxWebsiteRoutes;
