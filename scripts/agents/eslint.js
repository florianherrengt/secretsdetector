import { run } from "./_shared/runner.js";
import { buildResult, buildError } from "./_shared/format.js";

function parseArgs(args) {
  const opts = { files: null, verbose: false, timeout: 120_000 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--files" && args[i + 1]) {
      opts.files = args[++i].split(",").map((f) => f.trim());
    } else if (args[i] === "--verbose") {
      opts.verbose = true;
    } else if (args[i] === "--timeout" && args[i + 1]) {
      opts.timeout = Number(args[++i]);
    }
  }
  return opts;
}

function parseEslintJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const targets = opts.files ?? ["."];
  const eslintArgs = [...targets, "--format", "json"];

  const result = await run("npx", ["eslint", ...eslintArgs], {
    timeout: opts.timeout,
  });

  if (result.crashed) {
    const out = buildResult("eslint", "fail", "Execution failed", {}, [
      buildError("Process crashed or invalid output"),
    ]);
    process.stdout.write(JSON.stringify(out));
    return;
  }

  const data = parseEslintJson(result.stdout);

  if (!data) {
    const out = buildResult(
      "eslint",
      "fail",
      "Execution failed",
      {},
      [buildError("Failed to parse ESLint output")]
    );
    process.stdout.write(JSON.stringify(out));
    return;
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const errors = [];

  for (const fileResult of data) {
    totalErrors += fileResult.errorCount;
    totalWarnings += fileResult.warningCount;

    for (const msg of fileResult.messages) {
      if (msg.severity === 2 || opts.verbose) {
        errors.push(
          buildError(
            msg.message,
            fileResult.filePath,
            msg.line
          )
        );
      }
    }
  }

  const status = totalErrors > 0 ? "fail" : "pass";
  const summary =
    totalErrors > 0
      ? `ESLint: ${totalErrors} error${totalErrors !== 1 ? "s" : ""}`
      : "ESLint: 0 errors";

  const out = buildResult(
    "eslint",
    status,
    summary,
    {
      errors: totalErrors,
      warnings: opts.verbose ? totalWarnings : undefined,
    },
    errors
  );

  process.stdout.write(JSON.stringify(out));
}

main().catch(() => {
  process.stdout.write(
    JSON.stringify({
      status: "fail",
      tool: "eslint",
      summary: "Execution failed",
      errors: [{ message: "Process crashed or invalid output" }],
    })
  );
});
