import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const hooksDir = resolve(process.cwd(), ".githooks");

if (!existsSync(hooksDir)) {
	process.exit(0);
}

try {
	execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
} catch {
	process.exit(0);
}
