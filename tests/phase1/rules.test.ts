import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import * as custom from "../../eslint/index.js";

async function lintSnippet({
  code,
  filePath,
  rules,
}: {
  code: string;
  filePath: string;
  rules: Record<string, "error">;
}) {
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
        rules,
      },
    ],
  });

  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

describe("Phase 1 custom rule behavior", () => {
  it("enforces no raw HTML elements", async () => {
    const compliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <ScanCard />;",
      rules: { "custom/ds-no-raw-html-elements": "error" },
    });
    expect(compliant).toHaveLength(0);

    const nonCompliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <marquee class=\"text-sm\">x</marquee>;",
      rules: { "custom/ds-no-raw-html-elements": "error" },
    });
    expect(nonCompliant[0]?.ruleId).toBe("custom/ds-no-raw-html-elements");

    const edge = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class=\"text-sm\">ok</div>;",
      rules: { "custom/ds-no-raw-html-elements": "error" },
    });
    expect(edge).toHaveLength(0);
  });

  it("enforces no inline style prop", async () => {
    const compliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class=\"text-sm\">ok</div>;",
      rules: { "custom/ds-no-inline-style-prop": "error" },
    });
    expect(compliant).toHaveLength(0);

    const nonCompliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div style={{ color: 'red' }}>bad</div>;",
      rules: { "custom/ds-no-inline-style-prop": "error" },
    });
    expect(nonCompliant[0]?.ruleId).toBe("custom/ds-no-inline-style-prop");

    const edge = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;",
      rules: { "custom/ds-no-inline-style-prop": "error" },
    });
    expect(edge).toHaveLength(0);
  });

  it("enforces no arbitrary Tailwind values", async () => {
    const compliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class=\"text-sm bg-card\">ok</div>;",
      rules: { "custom/ds-no-arbitrary-tailwind-values": "error" },
    });
    expect(compliant).toHaveLength(0);

    const nonCompliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class=\"w-[13px]\">bad</div>;",
      rules: { "custom/ds-no-arbitrary-tailwind-values": "error" },
    });
    expect(nonCompliant[0]?.ruleId).toBe(
      "custom/ds-no-arbitrary-tailwind-values",
    );

    const edge = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class=\"hover:bg-primary/90\">ok</div>;",
      rules: { "custom/ds-no-arbitrary-tailwind-values": "error" },
    });
    expect(edge).toHaveLength(0);
  });

  it("enforces approved class tokens", async () => {
    const compliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class=\"text-sm text-foreground\">ok</div>;",
      rules: { "custom/ds-no-unapproved-class-tokens": "error" },
    });
    expect(compliant).toHaveLength(0);

    const nonCompliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class=\"text-neon\">bad</div>;",
      rules: { "custom/ds-no-unapproved-class-tokens": "error" },
    });
    expect(nonCompliant[0]?.ruleId).toBe("custom/ds-no-unapproved-class-tokens");

    const edge = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class={flag ? 'text-sm' : 'text-xs'} />;",
      rules: { "custom/ds-no-unapproved-class-tokens": "error" },
    });
    expect(edge).toHaveLength(0);
  });

  it("enforces suppression formatting", async () => {
    const compliant = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "// eslint-disable-next-line custom/ds-no-inline-style-prop -- ds-exception: UX-123 | Required by vendor API\nexport const Example = () => <div style={{ color: 'red' }} />;",
      rules: {
        "custom/ds-enforce-suppression-format": "error",
        "custom/ds-no-inline-style-prop": "error",
      },
    });
    expect(compliant).toHaveLength(0);

    const malformed = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "// @ts-ignore\nexport const Example = () => <div class=\"text-sm\">ok</div>;",
      rules: {
        "custom/ds-enforce-suppression-format": "error",
      },
    });
    expect(malformed[0]?.ruleId).toBe("custom/ds-enforce-suppression-format");
  });
});

describe("Phase 1 failure messages", () => {
  it("returns deterministic actionable errors", async () => {
    const [message] = await lintSnippet({
      filePath: "src/views/pages/example.tsx",
      code: "export const Example = () => <div class=\"text-red-500\">bad</div>;",
      rules: { "custom/ds-no-direct-semantic-styling": "error" },
    });

    expect(message.ruleId).toBe("custom/ds-no-direct-semantic-styling");
    expect(message.severity).toBe(2);
    expect(message.message).toContain("Replace");
  });
});
