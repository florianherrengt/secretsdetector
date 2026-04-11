import { run } from "./_shared/runner.js";
import { buildResult, buildError } from "./_shared/format.js";

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

function parsePlaywrightJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const result = await run("npx", ["playwright", "test", "--reporter=json"], {
    timeout: opts.timeout,
  });

  if (result.crashed) {
    const out = buildResult("e2e", "fail", "Execution failed", {}, [
      buildError("Process crashed or invalid output"),
    ]);
    process.stdout.write(JSON.stringify(out));
    return;
  }

  const data = parsePlaywrightJson(result.stdout);

  if (!data) {
    const out = buildResult("e2e", "fail", "Execution failed", {}, [
      buildError("Failed to parse Playwright output"),
    ]);
    process.stdout.write(JSON.stringify(out));
    return;
  }

  const suites = data.suites ?? [];
  let passed = 0;
  let failed = 0;
  const errors = [];

  function walkSuites(list) {
    for (const suite of list) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          for (const test of spec.tests ?? []) {
            for (const result of test.results ?? []) {
              if (result.status === "passed") passed++;
              else if (result.status === "failed") {
                failed++;
                errors.push(
                  buildError(
                    result.error?.message ?? spec.title ?? "Test failed",
                    result.error?.location?.file
                  )
                );
              }
            }
          }
        }
      }
      if (suite.suites) walkSuites(suite.suites);
    }
  }

  walkSuites(suites);

  const status = failed > 0 ? "fail" : "pass";
  const summary =
    failed > 0
      ? `E2E: ${failed} failed / ${passed} passed`
      : `E2E: ${passed} passed`;

  const out = buildResult("e2e", status, summary, { passed, failed }, errors);

  process.stdout.write(JSON.stringify(out));
}

main().catch(() => {
  process.stdout.write(
    JSON.stringify({
      status: "fail",
      tool: "e2e",
      summary: "Execution failed",
      errors: [{ message: "Process crashed or invalid output" }],
    })
  );
});
