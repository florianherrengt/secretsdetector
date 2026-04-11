import { describe, expect, it } from "vitest";
import {
  normalizeProposal,
  sanitizeOutput,
  toSafeString,
} from "../.opencode/plugins/improvement-loop.js";

describe("improvement-loop input normalization", () => {
  it("normalizes non-string values into safe strings", () => {
    expect(toSafeString("hello")).toBe("hello");
    expect(toSafeString(null)).toBe("");
    expect(toSafeString(undefined)).toBe("");
    expect(toSafeString(42)).toBe("42");
    expect(toSafeString(true)).toBe("true");
    expect(toSafeString({ a: 1 })).toBe('{"a":1}');
    expect(toSafeString([1, 2])).toBe("[1,2]");
  });

  it("normalizes proposal numbers and category", () => {
    const proposal = normalizeProposal({
      title: "Fix parser",
      summary: "Handle malformed args",
      impact: "0.9",
      confidence: 2,
      risk: -1,
      testability: "0.5",
      category: "SECURITY",
    });

    expect(proposal.impact).toBe(0.9);
    expect(proposal.confidence).toBe(1);
    expect(proposal.risk).toBe(0);
    expect(proposal.testability).toBe(0.5);
    expect(proposal.category).toBe("security");
  });

  it("throws explicit errors for malformed proposals", () => {
    expect(() => normalizeProposal({})).toThrow("Invalid proposal shape");
    expect(() =>
      normalizeProposal({
        title: { x: 1 },
        summary: "ok",
        impact: 0.1,
        confidence: 0.1,
        risk: 0.1,
        testability: 0.1,
        category: "other",
      }),
    ).toThrow("Non-string title detected");
  });
});

describe("improvement-loop output sanitization", () => {
  it("removes undefined and flattens unsupported values", () => {
    const fn = () => "x";
    const output = sanitizeOutput({
      ok: true,
      skip: undefined,
      nested: {
        arr: [1, undefined, fn],
      },
    }) as Record<string, unknown>;

    expect(output.ok).toBe(true);
    expect(output.skip).toBeUndefined();

    const nested = output.nested as Record<string, unknown>;
    const arr = nested.arr as unknown[];
    expect(arr[1]).toBeNull();
    expect(typeof arr[2]).toBe("string");
  });

  it("handles circular structures without throwing", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const result = sanitizeOutput(circular) as Record<string, unknown>;
    expect(result.self).toBe("[circular]");
  });
});
