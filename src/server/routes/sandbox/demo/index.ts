import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";

const sandboxDemoRoutes = new Hono();

const moduleDir = dirname(fileURLToPath(import.meta.url));
const siteDir = join(moduleDir, "site");
const indexHtml = readFileSync(join(siteDir, "index.html"), "utf8");
const mainJs = readFileSync(join(siteDir, "assets", "main.js"), "utf8");
const mainJsMap = readFileSync(join(siteDir, "assets", "main.js.map"), "utf8");
const largeBundlePrefix = "/*" + "x".repeat(120_000) + "*/";
const largeBundleJs = `${largeBundlePrefix};var Jo={token:"token",selectedOrganisationId:"selectedOrganisationId"},l={renewToken:"renew-token-value"},u="org_123";localStorage.setItem(Jo.token,l.renewToken),localStorage.setItem(Jo.selectedOrganisationId,u);`;
const largeIndexHtml = indexHtml.replace(
	'/sandbox/demo/assets/main.js',
	'/sandbox/demo/assets/main.large.js'
);

sandboxDemoRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			return c.html(indexHtml);
		})
);

sandboxDemoRoutes.get(
	"/large",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			return c.html(largeIndexHtml);
		})
);

sandboxDemoRoutes.get(
	"/assets/main.js",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			return c.body(mainJs, 200, {
				"content-type": "application/javascript; charset=utf-8",
				"cache-control": "no-store"
			});
		})
);

sandboxDemoRoutes.get(
	"/assets/main.large.js",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			return c.body(largeBundleJs, 200, {
				"content-type": "application/javascript; charset=utf-8",
				"cache-control": "no-store"
			});
		})
);

sandboxDemoRoutes.get(
	"/assets/main.js.map",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			return c.body(mainJsMap, 200, {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			});
		})
);

export default sandboxDemoRoutes;
