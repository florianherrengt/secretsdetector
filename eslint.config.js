import js from "@eslint/js";
import tseslint from "typescript-eslint";
import * as custom from "./eslint/index.js";

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
    },
  },

  {
    ignores: ["dist/", "node_modules/", "eslint/"],
  },
];
