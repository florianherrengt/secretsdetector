import { describe, expect, it } from "vitest";
import { createImprovementLoopEngine } from "../.opencode/plugins/improvement-loop.js";

function assertSerializableLeaves(value: unknown): void {
  if (value === null) {
    return;
  }

  const valueType = typeof value;

  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      assertSerializableLeaves(entry);
    }
    return;
  }

  if (valueType === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      expect(key).toBeTypeOf("string");
      expect(entry).not.toBeUndefined();
      assertSerializableLeaves(entry);
    }
    return;
  }

  throw new Error(`Non-serializable leaf type: ${valueType}`);
}

describe("improvement-loop integration serialization harness", () => {
  it("returns parseable, serialization-safe JSON from every handler", () => {
    const engine = createImprovementLoopEngine();

    const startText = engine.start(
      { maxIterations: "5", scoreThreshold: "0.6", noValueStreakLimit: "2" },
      "/tmp/project",
    );
    const start = JSON.parse(startText) as Record<string, unknown>;
    assertSerializableLeaves(start);

    const loopId = start.loopId;
    expect(typeof loopId).toBe("string");

    const evaluateText = engine.evaluate({
      loopId,
      proposals: [
        {
          title: "Fix parser",
          summary: "Handle malformed LLM payloads",
          impact: "0.8",
          confidence: "0.9",
          risk: "0.1",
          testability: "0.9",
          category: "correctness",
        },
      ],
    });
    const evaluate = JSON.parse(evaluateText);
    assertSerializableLeaves(evaluate);

    const recordText = engine.record({
      loopId,
      selectedProposal: {
        title: "Fix parser",
        summary: "Handle malformed LLM payloads",
        impact: 0.8,
        confidence: 0.9,
        risk: 0.1,
        testability: 0.9,
        category: "correctness",
      },
      selectedScore: 0.8,
      status: "success",
      summary: "Applied checks",
      changedFiles: ["a.ts", 123],
      verification: { lint: "pass", tsc: "pass", tests: "pass" },
    });
    const record = JSON.parse(recordText);
    assertSerializableLeaves(record);

    const statusText = engine.status({ loopId });
    const status = JSON.parse(statusText);
    assertSerializableLeaves(status);

    const stopText = engine.stop({ loopId, reason: { msg: "done" } });
    const stop = JSON.parse(stopText);
    assertSerializableLeaves(stop);
  });

  it("returns fallback error JSON for malformed payloads", () => {
    const engine = createImprovementLoopEngine();
    const outputText = engine.evaluate({ loopId: ["bad"], proposals: "bad" });
    const output = JSON.parse(outputText) as Record<string, unknown>;

    expect(output.decision).toBe("error");
    expect(typeof output.message).toBe("string");
    assertSerializableLeaves(output);
  });
});
