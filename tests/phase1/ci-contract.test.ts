import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import * as custom from "../../eslint/index.js";
import { designSystemPolicy } from "../../eslint/phase1/policy.js";
import { validatePolicy } from "../../eslint/phase1/validate-policy.js";

async function lintPhase1(code: string, filePath: string) {
  const eslint = new ESLint({
    ignore: false,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx,js,jsx}"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            ecmaFeatures: { jsx: true },
            sourceType: "module",
          },
        },
        plugins: {
          custom,
        },
        rules: {
          "custom/ds-no-inline-style-prop": "error",
          "custom/ds-no-unapproved-class-tokens": "error",
          "custom/ds-no-raw-html-elements": "error",
        },
      },
    ],
  });

  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

describe("Phase 1 CI contract", () => {
  it("fails frontend violations", async () => {
    const messages = await lintPhase1(
      "export const Example = () => <div style={{ color: 'red' }}>bad</div>;",
      "src/views/pages/example.tsx",
    );

    expect(messages.some((message) => message.ruleId === "custom/ds-no-inline-style-prop")).toBe(true);
  });

  it("does not apply frontend-only rules to backend-only files", async () => {
    const messages = await lintPhase1(
      "export const value = '<div style=\"color:red\">ok</div>';",
      "src/server/example.ts",
    );

    expect(messages).toHaveLength(0);
  });

  it("fails immediately on malformed policy configuration", () => {
    const malformed = {
      ...designSystemPolicy,
      approvedRawElements: new Set([...designSystemPolicy.approvedRawElements, "div"]),
      forbiddenRawElements: new Set([...designSystemPolicy.forbiddenRawElements, "div"]),
    };

    expect(() => validatePolicy(malformed)).toThrow(
      "Phase 1 policy validation failed",
    );
  });
});
