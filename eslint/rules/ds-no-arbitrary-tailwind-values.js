import { ESLintUtils } from "@typescript-eslint/utils";
import {
  extractClassTokens,
  getClassAttributeEntries,
  isFrontendFile,
} from "./utils/design-system.js";

export default ESLintUtils.RuleCreator(() => "")({
  name: "ds-no-arbitrary-tailwind-values",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Tailwind arbitrary values (square bracket syntax) in frontend files",
    },
    schema: [],
    messages: {
      arbitrary:
        "Class token '{{token}}' uses arbitrary Tailwind syntax. Use an approved design token instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isFrontendFile(context)) {
      return {};
    }

    return {
      JSXOpeningElement(node) {
        const classAttributes = getClassAttributeEntries(node);

        for (const attribute of classAttributes) {
          const extracted = extractClassTokens(attribute);

          if (!extracted.static) {
            continue;
          }

          for (const token of extracted.tokens) {
            if (token.includes("[") || token.includes("]")) {
              context.report({
                node: attribute,
                messageId: "arbitrary",
                data: { token },
              });
            }
          }
        }
      },
    };
  },
});
