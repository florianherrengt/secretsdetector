// .opencode/plugins/improvement-loop.ts
import type Plugin from "@opencode-ai/plugin";

type Proposal = {
  title: string;
  summary: string;
  impact: number;
  confidence: number;
  risk: number;
  testability: number;
  category: "correctness" | "maintainability" | "performance" | "security" | "other";
};

type VerificationState = "pass" | "fail" | "not_run";

type IterationRecord = {
  iteration: number;
  selectedProposal: Proposal;
  selectedScore: number;
  outcome: {
    status: "success" | "failed";
    verification: {
      lint: VerificationState;
      tsc: VerificationState;
      tests: VerificationState;
    };
    changedFiles: string[];
    summary: string;
  };
};

type LoopState = {
  id: string;
  cwd: string;
  maxIterations: number;
  scoreThreshold: number;
  noValueStreakLimit: number;
  lowScoreStreak: number;
  iterationCount: number;
  history: IterationRecord[];
  status: "running" | "stopped";
  stopReason: string;
};

const VALID_CATEGORIES = new Set([
  "correctness",
  "maintainability",
  "performance",
  "security",
  "other",
]);

const VALID_RESULT_STATUS = new Set(["success", "failed"]);
const VALID_VERIFICATION = new Set(["pass", "fail", "not_run"]);

type SafeOutput = string | number | boolean | null | Record<string, unknown> | unknown[];

function debugLog(label: string, payload: unknown): void {
  if (process.env.DEBUG_PLUGIN !== "true") {
    return;
  }

  try {
    // eslint-disable-next-line no-console
    console.log(`[improvement-loop] ${label}`, sanitizeOutput(payload));
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[improvement-loop] ${label}`, "[unserializable]");
  }
}

export function toSafeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable]";
    }
  }

  return String(value);
}

function toSafeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function sanitizeOutput(value: unknown, depth = 0, seen = new WeakSet<object>()): SafeOutput {
  if (depth > 4) {
    return toSafeString(value);
  }

  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
    return toSafeString(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeOutput(item, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);
    const output: Record<string, unknown> = {};
    const input = value as Record<string, unknown>;

    for (const [key, item] of Object.entries(input)) {
      if (item === undefined) {
        continue;
      }

      output[toSafeString(key)] = sanitizeOutput(item, depth + 1, seen);
    }

    return output;
  }

  return toSafeString(value);
}

function safeReturn(value: unknown): string {
  try {
    const sanitized = sanitizeOutput(value);
    return JSON.stringify(sanitized);
  } catch {
    return JSON.stringify({
      decision: "error",
      message: "Invalid tool state",
    });
  }
}

function withFallback(execute: () => unknown): string {
  try {
    return safeReturn(execute());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid tool state";
    return safeReturn({
      decision: "error",
      message: toSafeString(message),
    });
  }
}

function parseRequiredString(value: unknown, fieldName: string): string {
  const normalized = toSafeString(value).trim();

  if (normalized.length === 0) {
    throw new Error(`Invalid proposal shape: missing ${fieldName}`);
  }

  return normalized;
}

function parseLoopId(value: unknown): string {
  const loopId = parseRequiredString(value, "loopId");

  if (!loopId.startsWith("loop:")) {
    throw new Error("Invalid loopId");
  }

  return loopId;
}

function parseCategory(value: unknown): Proposal["category"] {
  const category = toSafeString(value).trim().toLowerCase();

  if (!VALID_CATEGORIES.has(category)) {
    throw new Error("Invalid proposal shape: category must be whitelisted");
  }

  return category as Proposal["category"];
}

export function normalizeProposal(input: unknown): Proposal {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid proposal shape");
  }

  const raw = input as Record<string, unknown>;
  const title = parseRequiredString(raw.title, "title");
  const summary = parseRequiredString(raw.summary, "summary");

  if (typeof raw.title !== "string") {
    throw new Error("Non-string title detected");
  }

  return {
    title,
    summary,
    impact: clamp01(toSafeNumber(raw.impact, 0)),
    confidence: clamp01(toSafeNumber(raw.confidence, 0)),
    risk: clamp01(toSafeNumber(raw.risk, 0)),
    testability: clamp01(toSafeNumber(raw.testability, 0)),
    category: parseCategory(raw.category),
  };
}

function normalizeVerificationState(value: unknown, field: string): VerificationState {
  const state = toSafeString(value).trim().toLowerCase();

  if (!VALID_VERIFICATION.has(state)) {
    throw new Error(`Invalid verification shape: ${field}`);
  }

  return state as VerificationState;
}

function normalizeVerification(input: unknown): IterationRecord["outcome"]["verification"] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid verification shape");
  }

  const raw = input as Record<string, unknown>;

  return {
    lint: normalizeVerificationState(raw.lint, "lint"),
    tsc: normalizeVerificationState(raw.tsc, "tsc"),
    tests: normalizeVerificationState(raw.tests, "tests"),
  };
}

function normalizeChangedFiles(input: unknown): string[] {
  if (input === undefined || input === null) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw new Error("Invalid changedFiles shape");
  }

  return input.map((entry) => toSafeString(entry));
}

function isLowValueProposal(proposal: Proposal): boolean {
  const text = `${proposal.title} ${proposal.summary}`.toLowerCase();

  const lowValuePatterns = [
    "rename variable",
    "rename variables",
    "rename function",
    "rename functions",
    "reformat",
    "formatting",
    "cosmetic",
    "cleanup comments",
    "comment cleanup",
    "minor cleanup",
    "tiny optimization",
    "micro optimization",
    "speculative optimization",
    "style only",
    "stylistic",
  ];

  return lowValuePatterns.some((pattern) => text.includes(pattern));
}

function scoreProposal(proposal: Proposal): number {
  const categoryBonus =
    proposal.category === "correctness" || proposal.category === "security"
      ? 0.05
      : proposal.category === "performance" || proposal.category === "maintainability"
        ? 0.02
        : 0;

  const raw =
    proposal.impact * 0.4 +
    proposal.confidence * 0.3 +
    proposal.testability * 0.2 -
    proposal.risk * 0.15 +
    categoryBonus;

  return Math.max(0, Math.min(1, raw));
}

function proposalLooksRepeated(loop: LoopState, proposal: Proposal): boolean {
  const candidate = `${proposal.title} ${proposal.summary}`.trim().toLowerCase();

  return loop.history.some((record) => {
    const previous = `${record.selectedProposal.title} ${record.selectedProposal.summary}`
      .trim()
      .toLowerCase();

    return previous === candidate;
  });
}

function createLoopId(cwd: string): string {
  return `loop:${cwd}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function flattenScores(
  evaluated: Array<{
    proposal: Proposal;
    score: number;
    rejectedReasons: string[];
  }>,
): Array<{ title: string; score: number; rejectedReasons: string }> {
  return evaluated.map((entry) => ({
    title: toSafeString(entry.proposal.title),
    score: clamp01(toSafeNumber(entry.score, 0)),
    rejectedReasons: entry.rejectedReasons.join(","),
  }));
}

export function createImprovementLoopEngine() {
  const loopStore = new Map<string, LoopState>();

  return {
    start: (args: { maxIterations: unknown; scoreThreshold: unknown; noValueStreakLimit: unknown }, directory: unknown): string => {
      debugLog("start.rawArgs", args);

      return withFallback(() => {
        const maxIterations = Math.max(1, Math.min(20, Math.round(toSafeNumber(args.maxIterations, 5))));
        const scoreThreshold = clamp01(toSafeNumber(args.scoreThreshold, 0.6));
        const noValueStreakLimit = Math.max(
          1,
          Math.min(10, Math.round(toSafeNumber(args.noValueStreakLimit, 2))),
        );

        const loop: LoopState = {
          id: createLoopId(toSafeString(directory)),
          cwd: toSafeString(directory),
          maxIterations,
          scoreThreshold,
          noValueStreakLimit,
          lowScoreStreak: 0,
          iterationCount: 0,
          history: [],
          status: "running",
          stopReason: "",
        };

        loopStore.set(loop.id, loop);

        const response = {
          loopId: loop.id,
          status: loop.status,
          message:
            "Improvement loop started. Next, generate up to 3 substantial proposals and call evaluate_improvement_proposals.",
          maxIterations: loop.maxIterations,
          scoreThreshold: loop.scoreThreshold,
          noValueStreakLimit: loop.noValueStreakLimit,
        };

        debugLog("start.normalizedArgs", { maxIterations, scoreThreshold, noValueStreakLimit });
        debugLog("start.output", response);
        return response;
      });
    },

    evaluate: (args: { loopId: unknown; proposals: unknown }): string => {
      debugLog("evaluate.rawArgs", args);

      return withFallback(() => {
        const loopId = parseLoopId(args.loopId);

        if (!Array.isArray(args.proposals)) {
          throw new Error("Invalid proposal shape");
        }

        if (args.proposals.length < 1 || args.proposals.length > 3) {
          throw new Error("Invalid proposal shape");
        }

        const proposals = args.proposals.map((proposal) => normalizeProposal(proposal));
        const loop = loopStore.get(loopId);

        if (!loop) {
          throw new Error("Unknown loopId");
        }

        if (loop.status !== "running") {
          const response = {
            decision: "stop",
            reason: loop.stopReason || "Loop is already stopped",
            loopId: loop.id,
            loopStatus: loop.status,
            iterationCount: loop.iterationCount,
          };

          debugLog("evaluate.output", response);
          return response;
        }

        if (loop.iterationCount >= loop.maxIterations) {
          loop.status = "stopped";
          loop.stopReason = "Reached max iterations";

          const response = {
            decision: "stop",
            reason: loop.stopReason,
            loopId: loop.id,
            loopStatus: loop.status,
            iterationCount: loop.iterationCount,
          };

          debugLog("evaluate.output", response);
          return response;
        }

        const evaluated = proposals.map((proposal) => {
          const lowValue = isLowValueProposal(proposal);
          const repeated = proposalLooksRepeated(loop, proposal);
          const score = lowValue || repeated ? 0 : scoreProposal(proposal);

          return {
            proposal,
            score,
            rejectedReasons: [
              ...(lowValue ? ["low_value"] : []),
              ...(repeated ? ["repeated"] : []),
              ...(score < loop.scoreThreshold ? ["below_threshold"] : []),
            ],
          };
        });

        evaluated.sort((a, b) => b.score - a.score);
        const best = evaluated[0];

        if (!best || best.score < loop.scoreThreshold) {
          loop.lowScoreStreak += 1;

          if (loop.lowScoreStreak >= loop.noValueStreakLimit) {
            loop.status = "stopped";
            loop.stopReason = "No sufficiently valuable proposals remained for consecutive iterations";
          }

          const response = {
            decision: "stop",
            reason:
              loop.stopReason ||
              "No proposal met the threshold for value, confidence, and testability",
            scores: flattenScores(evaluated),
            loopId: loop.id,
            loopStatus: loop.status,
            iterationCount: loop.iterationCount,
            lowScoreStreak: loop.lowScoreStreak,
          };

          debugLog("evaluate.output", response);
          return response;
        }

        loop.lowScoreStreak = 0;

        const response = {
          decision: "continue",
          selectedTitle: best.proposal.title,
          selectedSummary: best.proposal.summary,
          selectedCategory: best.proposal.category,
          selectedScore: best.score,
          scores: flattenScores(evaluated),
          instructions:
            "Implement only the selected proposal. Keep it high-signal, then run verification before record_improvement_result.",
          loopId: loop.id,
          loopStatus: loop.status,
          iterationCount: loop.iterationCount,
          maxIterations: loop.maxIterations,
        };

        debugLog("evaluate.output", response);
        return response;
      });
    },

    record: (args: {
      loopId: unknown;
      selectedProposal: unknown;
      selectedScore: unknown;
      status: unknown;
      summary: unknown;
      changedFiles: unknown;
      verification: unknown;
    }): string => {
      debugLog("record.rawArgs", args);

      return withFallback(() => {
        const loopId = parseLoopId(args.loopId);
        const selectedProposal = normalizeProposal(args.selectedProposal);
        const selectedScore = clamp01(toSafeNumber(args.selectedScore, 0));
        const status = toSafeString(args.status).trim().toLowerCase();

        if (!VALID_RESULT_STATUS.has(status)) {
          throw new Error("Invalid result status");
        }

        const summary = parseRequiredString(args.summary, "summary");
        const verification = normalizeVerification(args.verification);
        const changedFiles = normalizeChangedFiles(args.changedFiles);
        const loop = loopStore.get(loopId);

        if (!loop) {
          throw new Error("Unknown loopId");
        }

        if (loop.status !== "running") {
          const response = {
            decision: "stop",
            reason: loop.stopReason || "Loop is already stopped",
          };
          debugLog("record.output", response);
          return response;
        }

        loop.iterationCount += 1;

        const record: IterationRecord = {
          iteration: loop.iterationCount,
          selectedProposal,
          selectedScore,
          outcome: {
            status: status as "success" | "failed",
            verification,
            changedFiles,
            summary,
          },
        };

        loop.history.push(record);

        const verificationFailed =
          verification.lint === "fail" || verification.tsc === "fail" || verification.tests === "fail";

        if (verificationFailed || status === "failed") {
          loop.lowScoreStreak += 1;
        }

        if (loop.iterationCount >= loop.maxIterations) {
          loop.status = "stopped";
          loop.stopReason = "Reached max iterations";
        } else if (loop.lowScoreStreak >= loop.noValueStreakLimit) {
          loop.status = "stopped";
          loop.stopReason = "Too many failed or low-value iterations";
        }

        const response = {
          decision: loop.status === "running" ? "continue" : "stop",
          reason:
            loop.status === "running"
              ? "You may propose the next batch of improvements"
              : loop.stopReason,
          nextStep:
            loop.status === "running"
              ? "Generate up to 3 new non-redundant proposals, then call evaluate_improvement_proposals."
              : "Stop the autonomous loop and summarize the useful changes made.",
          loopId: loop.id,
          loopStatus: loop.status,
          iterationCount: loop.iterationCount,
          maxIterations: loop.maxIterations,
          lowScoreStreak: loop.lowScoreStreak,
          stopReason: loop.stopReason,
          history: loop.history.map((item) => ({
            iteration: item.iteration,
            title: item.selectedProposal.title,
            score: item.selectedScore,
            status: item.outcome.status,
            lint: item.outcome.verification.lint,
            tsc: item.outcome.verification.tsc,
            tests: item.outcome.verification.tests,
          })),
        };

        debugLog("record.output", response);
        return response;
      });
    },

    status: (args: { loopId: unknown }): string => {
      debugLog("status.rawArgs", args);

      return withFallback(() => {
        const loopId = parseLoopId(args.loopId);
        const loop = loopStore.get(loopId);

        if (!loop) {
          throw new Error("Unknown loopId");
        }

        const response = {
          id: loop.id,
          cwd: loop.cwd,
          status: loop.status,
          iterationCount: loop.iterationCount,
          maxIterations: loop.maxIterations,
          scoreThreshold: loop.scoreThreshold,
          noValueStreakLimit: loop.noValueStreakLimit,
          lowScoreStreak: loop.lowScoreStreak,
          stopReason: loop.stopReason,
          history: loop.history.map((item) => ({
            iteration: item.iteration,
            title: item.selectedProposal.title,
            score: item.selectedScore,
            status: item.outcome.status,
            lint: item.outcome.verification.lint,
            tsc: item.outcome.verification.tsc,
            tests: item.outcome.verification.tests,
          })),
        };

        debugLog("status.output", response);
        return response;
      });
    },

    stop: (args: { loopId: unknown; reason: unknown }): string => {
      debugLog("stop.rawArgs", args);

      return withFallback(() => {
        const loopId = parseLoopId(args.loopId);
        const reason = toSafeString(args.reason || "Stopped explicitly");
        const loop = loopStore.get(loopId);

        if (!loop) {
          throw new Error("Unknown loopId");
        }

        loop.status = "stopped";
        loop.stopReason = reason;

        const response = {
          status: loop.status,
          stopReason: loop.stopReason,
        };

        debugLog("stop.output", response);
        return response;
      });
    },
  };
}

export default (async ({ client }) => {
  const { tool } = await import("@opencode-ai/plugin");

  await client.app.log({
    body: {
      service: "improvement-loop",
      level: "info",
      message: "Improvement loop plugin initialized",
    },
  });

  const engine = createImprovementLoopEngine();

  return {
    tool: {
      start_improvement_loop: tool({
        description:
          "Start a bounded code-improvement loop. Use this once at the beginning of an autonomous improvement session.",
        args: {
          maxIterations: tool.schema.number().describe("Maximum number of iterations allowed"),
          scoreThreshold: tool.schema.number().describe("Minimum proposal score required to continue"),
          noValueStreakLimit: tool.schema
            .number()
            .describe("Stop after this many consecutive low-value iterations"),
        },
        async execute(args, context) {
          return engine.start(args, context.directory);
        },
      }),

      evaluate_improvement_proposals: tool({
        description:
          "Evaluate up to 3 candidate improvements, select the best one, or stop the loop if no strong proposal remains.",
        args: {
          loopId: tool.schema.string().describe("The loop ID returned by start_improvement_loop"),
          proposals: tool.schema.array(tool.schema.object({})).describe("Up to 3 serious proposals for the next iteration"),
        },
        async execute(args) {
          return engine.evaluate(args);
        },
      }),

      record_improvement_result: tool({
        description:
          "Record the result of the implemented proposal and decide whether the loop should continue.",
        args: {
          loopId: tool.schema.string().describe("The loop ID returned by start_improvement_loop"),
          selectedProposal: tool.schema.object({}),
          selectedScore: tool.schema.number(),
          status: tool.schema.string(),
          summary: tool.schema.string().describe("What changed and whether the attempt was useful"),
          changedFiles: tool.schema.array(tool.schema.string()).describe("Files changed during this iteration"),
          verification: tool.schema.object({
            lint: tool.schema.string(),
            tsc: tool.schema.string(),
            tests: tool.schema.string(),
          }),
        },
        async execute(args) {
          return engine.record(args);
        },
      }),

      get_improvement_loop_status: tool({
        description: "Read the current status and history of an improvement loop.",
        args: {
          loopId: tool.schema.string().describe("The loop ID returned by start_improvement_loop"),
        },
        async execute(args) {
          return engine.status(args);
        },
      }),

      stop_improvement_loop: tool({
        description: "Stop a running improvement loop explicitly.",
        args: {
          loopId: tool.schema.string().describe("The loop ID returned by start_improvement_loop"),
          reason: tool.schema.string().describe("Reason for stopping the loop"),
        },
        async execute(args) {
          return engine.stop(args);
        },
      }),
    },
  };
}) satisfies Plugin;
