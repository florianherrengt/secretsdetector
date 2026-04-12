import { describe, it, expect } from "vitest";
import { findEnvVarKeyDetections } from "./detector.js";

describe("findEnvVarKeyDetections", () => {
	it("detects const assignment double-quoted", () => {
		const detections = findEnvVarKeyDetections('const AWS_SECRET_ACCESS_KEY = "AKIA123";');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("AKIA123");
	});

	it("detects let assignment single-quoted", () => {
		const detections = findEnvVarKeyDetections("let DB_PASSWORD = 'mypassword';");
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("mypassword");
	});

	it("detects var assignment", () => {
		const detections = findEnvVarKeyDetections('var JWT_SECRET = "supersecret";');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("supersecret");
	});

	it("detects bare assignment", () => {
		const detections = findEnvVarKeyDetections('AWS_SECRET_ACCESS_KEY = "AKIA123";');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("AKIA123");
	});

	it("detects object property with colon", () => {
		const detections = findEnvVarKeyDetections('{ AWS_SECRET_ACCESS_KEY: "AKIA123" }');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("AKIA123");
	});

	it("detects minified no spaces with =", () => {
		const detections = findEnvVarKeyDetections('AWS_SECRET_ACCESS_KEY="AKIA123"');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("AKIA123");
	});

	it("detects minified no spaces with :", () => {
		const detections = findEnvVarKeyDetections('{AWS_SECRET_ACCESS_KEY:"AKIA123"}');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("AKIA123");
	});

	it("detects case-insensitive key lowercase", () => {
		const detections = findEnvVarKeyDetections('const aws_secret_access_key = "AKIA123";');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("AKIA123");
	});

	it("detects case-insensitive key mixed case", () => {
		const detections = findEnvVarKeyDetections('const Aws_Secret_Access_Key = "AKIA123";');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("AKIA123");
	});

	it("ignores key name as string value", () => {
		const detections = findEnvVarKeyDetections('const x = "AWS_SECRET_ACCESS_KEY";');
		expect(detections).toHaveLength(0);
	});

	it("ignores process.env reference", () => {
		const detections = findEnvVarKeyDetections("process.env.AWS_SECRET_ACCESS_KEY");
		expect(detections).toHaveLength(0);
	});

	it("ignores function call assignment", () => {
		const detections = findEnvVarKeyDetections("const AWS_SECRET_ACCESS_KEY = getSecret();");
		expect(detections).toHaveLength(0);
	});

	it("ignores variable assignment", () => {
		const detections = findEnvVarKeyDetections("const AWS_SECRET_ACCESS_KEY = someVar;");
		expect(detections).toHaveLength(0);
	});

	it("ignores implausible value 'test'", () => {
		const detections = findEnvVarKeyDetections('const AWS_SECRET_ACCESS_KEY = "test";');
		expect(detections).toHaveLength(0);
	});

	it("ignores implausible value 'placeholder'", () => {
		const detections = findEnvVarKeyDetections('const AWS_SECRET_ACCESS_KEY = "placeholder";');
		expect(detections).toHaveLength(0);
	});

	it("ignores implausible value 'example'", () => {
		const detections = findEnvVarKeyDetections('const DB_PASSWORD = "example";');
		expect(detections).toHaveLength(0);
	});

	it("ignores implausible value case-insensitive", () => {
		const detections = findEnvVarKeyDetections('const DB_PASSWORD = "TEST";');
		expect(detections).toHaveLength(0);
	});

	it("ignores empty string value", () => {
		const detections = findEnvVarKeyDetections('const AWS_SECRET_ACCESS_KEY = "";');
		expect(detections).toHaveLength(0);
	});

	it("detects plain template literal", () => {
		const detections = findEnvVarKeyDetections("const AWS_SECRET_ACCESS_KEY = `AKIA123`;");
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe("AKIA123");
	});

	it("ignores template literal with interpolation", () => {
		const detections = findEnvVarKeyDetections("const AWS_SECRET_ACCESS_KEY = `${getEnv()}`;");
		expect(detections).toHaveLength(0);
	});

	it("ignores prefixed identifier", () => {
		const detections = findEnvVarKeyDetections('const MY_AWS_SECRET_ACCESS_KEY = "AKIA123";');
		expect(detections).toHaveLength(0);
	});

	it("ignores suffixed identifier", () => {
		const detections = findEnvVarKeyDetections('const AWS_SECRET_ACCESS_KEY_VALUE = "AKIA123";');
		expect(detections).toHaveLength(0);
	});

	it("detects multiple keys in one body", () => {
		const detections = findEnvVarKeyDetections(
			'const AWS_SECRET_ACCESS_KEY = "AKIA123"; const DB_PASSWORD = "pass";'
		);
		expect(detections).toHaveLength(2);
	});

	it("detects same key multiple times with different values", () => {
		const detections = findEnvVarKeyDetections(
			'const AWS_SECRET_ACCESS_KEY = "AKIA123"; AWS_SECRET_ACCESS_KEY = "AKIA456";'
		);
		expect(detections).toHaveLength(2);
	});

	it("returns empty for empty body", () => {
		const detections = findEnvVarKeyDetections("");
		expect(detections).toHaveLength(0);
	});

	it("returns empty when no matches", () => {
		const detections = findEnvVarKeyDetections('const x = "hello world";');
		expect(detections).toHaveLength(0);
	});

	it("detects DATABASE_URL", () => {
		const detections = findEnvVarKeyDetections('const DATABASE_URL = "postgres://user:pass@host/db";');
		expect(detections).toHaveLength(1);
	});

	it("detects REDIS_URL", () => {
		const detections = findEnvVarKeyDetections('const REDIS_URL = "redis://:password@host:6379";');
		expect(detections).toHaveLength(1);
	});

	it("detects GITHUB_TOKEN", () => {
		const detections = findEnvVarKeyDetections('const GITHUB_TOKEN = "ghp_ABC123";');
		expect(detections).toHaveLength(1);
	});

	it("ignores implausible value 'changeme'", () => {
		const detections = findEnvVarKeyDetections('const JWT_SECRET = "changeme";');
		expect(detections).toHaveLength(0);
	});

	it("ignores implausible value 'secret'", () => {
		const detections = findEnvVarKeyDetections('const SECRET_KEY = "secret";');
		expect(detections).toHaveLength(0);
	});

	it("detects value with escaped quotes", () => {
		const detections = findEnvVarKeyDetections('const DB_PASSWORD = "pass\\"word";');
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toBe('pass\\"word');
	});

	it("detects multiple properties in object", () => {
		const detections = findEnvVarKeyDetections(
			'const config = { AWS_SECRET_ACCESS_KEY: "AKIA123", DB_PASSWORD: "pass" };'
		);
		expect(detections).toHaveLength(2);
	});
});
