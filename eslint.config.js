import js from "@eslint/js";
import tseslint from "typescript-eslint";
import * as custom from "./eslint/index.js";
import { designSystemPolicy } from "./eslint/design-system-enforcement/policy.js";
import { validatePolicy } from "./eslint/design-system-enforcement/validate-policy.js";

validatePolicy(designSystemPolicy);

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: {
      custom,
    },

    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],

      "custom/no-raw-functions": "error",
      "custom/no-mutable-variables": "error",
      "custom/ds-no-raw-html-elements": "error",
      "custom/ds-no-inline-style-prop": "error",
      "custom/ds-no-arbitrary-tailwind-values": "error",
      "custom/ds-no-unapproved-class-tokens": "error",
      "custom/ds-no-direct-semantic-styling": "error",
      "custom/ds-no-unsafe-classname-construction": "error",
      "custom/ds-enforce-suppression-format": "error",
    },
  },

  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "custom/no-raw-functions": "off",
    },
  },

  {
    ignores: ["dist/", "node_modules/", "eslint/"],
  },
];
