import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT = 120_000;

export async function run(cmd, args = [], options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const cwd = options.cwd ?? process.cwd();

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });

    return {
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      exitCode: 0,
    };
  } catch (err) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: typeof err.code === "number" ? err.code : 1,
      crashed: err.killed ?? false,
    };
  }
}
