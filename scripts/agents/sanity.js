import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const agentsDir = __dirname;

const TOOLS = ["eslint.js", "tsc.js", "vitest.js", "e2e.js"];
const LABELS = {
  "eslint.js": "ESLint",
  "tsc.js": "TypeScript",
  "vitest.js": "Unit tests",
  "e2e.js": "E2E",
};

function parseArgs(args) {
  const opts = { verbose: false, timeout: 300_000 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--verbose") {
      opts.verbose = true;
    } else if (args[i] === "--timeout" && args[i + 1]) {
      opts.timeout = Number(args[++i]);
    }
  }
  return opts;
}

async function runTool(script) {
  const scriptPath = resolve(agentsDir, script);
  try {
    const { stdout } = await execFileAsync("node", [scriptPath], {
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    return JSON.parse(stdout.trim());
  } catch {
    return {
      status: "fail",
      tool: script.replace(".js", ""),
      summary: "Execution failed",
      errors: [{ message: "Process crashed or invalid output" }],
    };
  }
}

function buildSummary(results) {
  const failed = Object.entries(results).filter(
    ([, r]) => r.status === "fail"
  );
  const passed = Object.entries(results).filter(
    ([, r]) => r.status === "pass"
  );

  if (failed.length === 0) {
    const lines = ["All checks passed:"];
    for (const [key, r] of passed) {
      lines.push(`- ${r.summary}`);
    }
    return lines.join("\n");
  }

  const lines = ["Checks failed:", ""];
  for (const [key, r] of failed) {
    lines.push(`${LABELS[key] ?? key}:`);
    for (const err of r.errors ?? []) {
      lines.push(`- ${err.message}`);
    }
    lines.push("");
  }
  for (const [key, r] of passed) {
    lines.push(`${LABELS[key] ?? key}: ${r.summary}`);
  }
  return lines.join("\n").trim();
}

async function main() {
  parseArgs(process.argv.slice(2));

  const results = {};
  for (const tool of TOOLS) {
    results[tool] = await runTool(tool);
  }

  const allPassed = Object.values(results).every(
    (r) => r.status === "pass"
  );
  const status = allPassed ? "pass" : "fail";
  const summary = buildSummary(results);

  const out = {
    status,
    summary,
    results: {
      eslint: results["eslint.js"],
      tsc: results["tsc.js"],
      unit: results["vitest.js"],
      e2e: results["e2e.js"],
    },
  };

  process.stdout.write(JSON.stringify(out));
}

main().catch(() => {
  process.stdout.write(
    JSON.stringify({
      status: "fail",
      summary: "Execution failed",
      results: {},
    })
  );
});
