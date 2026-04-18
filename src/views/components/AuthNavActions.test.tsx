import { describe, expect, it } from "vitest";
import { render } from "../../lib/response.js";
import { AuthNavActions } from "./AuthNavActions.js";

describe("AuthNavActions contracts", () => {
	it("renders get started when mode is auth", () => {
		const html = render(AuthNavActions, { mode: "auth" }) as string;

		expect(html).toContain("Get started");
		expect(html).toContain("href=\"/auth/sign-in\"");
		expect(html).not.toContain("href=\"/auth/sign-up\"");
		expect(html).not.toContain("Sign in");
		expect(html).not.toContain("Sign up");
		expect(html).not.toContain("Settings");
		expect(html).not.toContain("href=\"/settings\"");
	});

	it("renders settings when mode is app", () => {
		const html = render(AuthNavActions, { mode: "app" }) as string;

		expect(html).toContain("Settings");
		expect(html).toContain("href=\"/settings\"");
		expect(html).not.toContain("Get started");
		expect(html).not.toContain("href=\"/auth/sign-in\"");
		expect(html).not.toContain("href=\"/auth/sign-up\"");
	});
});
