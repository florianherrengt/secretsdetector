import { describe, expect, it } from "vitest";
import { classifyFileScope } from "../../eslint/phase1/frontend-scope.js";

describe("Phase 1 frontend scope classifier", () => {
  it("classifies known frontend files deterministically", () => {
    const result = classifyFileScope("src/views/pages/home.tsx");

    expect(result).toEqual({
      filePath: "src/views/pages/home.tsx",
      classification: "frontend",
      matchedRule: "views-tsx",
    });
  });

  it("classifies known backend files deterministically", () => {
    const result = classifyFileScope("src/server/app.ts");

    expect(result).toEqual({
      filePath: "src/server/app.ts",
      classification: "backend",
      matchedRule: "server",
    });
  });

  it("classifies excluded utility paths as backend", () => {
    const result = classifyFileScope("scripts/install-hooks.mjs");

    expect(result).toEqual({
      filePath: "scripts/install-hooks.mjs",
      classification: "backend",
      matchedRule: "scripts",
    });
  });

  it("resolves ambiguous-looking paths by configured path rules only", () => {
    const result = classifyFileScope("src/views/helpers/formatter.ts");

    expect(result).toEqual({
      filePath: "src/views/helpers/formatter.ts",
      classification: "out_of_scope",
      matchedRule: "default-out-of-scope",
    });
  });

  it("classifies unsupported paths as out_of_scope", () => {
    const result = classifyFileScope("README.md");

    expect(result).toEqual({
      filePath: "README.md",
      classification: "out_of_scope",
      matchedRule: "default-out-of-scope",
    });
  });
});
