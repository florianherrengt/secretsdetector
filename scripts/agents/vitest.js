import { run } from "./_shared/runner.js";
import { buildResult, buildError } from "./_shared/format.js";

function parseArgs(args) {
  const opts = { verbose: false, timeout: 120_000 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--verbose") {
      opts.verbose = true;
    } else if (args[i] === "--timeout" && args[i + 1]) {
      opts.timeout = Number(args[++i]);
    }
  }
  return opts;
}

function parseVitestJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const result = await run(
    "npx",
    ["vitest", "run", "--reporter=json", "--silent"],
    { timeout: opts.timeout }
  );

  if (result.crashed) {
    const out = buildResult("unit", "fail", "Execution failed", {}, [
      buildError("Process crashed or invalid output"),
    ]);
    process.stdout.write(JSON.stringify(out));
    return;
  }

  const data = parseVitestJson(result.stdout);

  if (!data) {
    const out = buildResult("unit", "fail", "Execution failed", {}, [
      buildError("Failed to parse Vitest output"),
    ]);
    process.stdout.write(JSON.stringify(out));
    return;
  }

  const passed = data.numPassedTests ?? 0;
  const failed = data.numFailedTests ?? 0;
  const status = failed > 0 ? "fail" : "pass";

  const summary =
    failed > 0
      ? `Unit tests: ${failed} failed / ${passed} passed`
      : `Unit tests: ${passed} passed`;

  const errors = [];
  if (data.testResults) {
    for (const suite of data.testResults) {
      if (!suite.assertionResults) continue;
      for (const assertion of suite.assertionResults) {
        if (assertion.status === "failed") {
          const msgs = assertion.failureMessages ?? [];
          errors.push(
            buildError(
              msgs[0] ?? assertion.fullName ?? "Test failed",
              suite.name
            )
          );
        }
      }
    }
  }

  const out = buildResult(
    "unit",
    status,
    summary,
    { passed, failed },
    errors
  );

  process.stdout.write(JSON.stringify(out));
}

main().catch(() => {
  process.stdout.write(
    JSON.stringify({
      status: "fail",
      tool: "unit",
      summary: "Execution failed",
      errors: [{ message: "Process crashed or invalid output" }],
    })
  );
});
