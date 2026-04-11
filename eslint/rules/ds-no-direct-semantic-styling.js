import { ESLintUtils } from "@typescript-eslint/utils";
import {
  extractClassTokens,
  getClassAttributeEntries,
  isFrontendFile,
} from "./utils/design-system.js";

const DIRECT_SEMANTIC_PATTERNS = [
  /^(text|bg|border)-(red|green|blue|yellow|orange|purple|pink|gray|slate|zinc|stone)(-[0-9]{2,3})?$/,
  /^(text|bg|border)-(black|white)$/,
];

function isDirectSemanticToken(token) {
  return DIRECT_SEMANTIC_PATTERNS.some((pattern) => pattern.test(token));
}

export default ESLintUtils.RuleCreator(() => "")({
  name: "ds-no-direct-semantic-styling",
  meta: {
    type: "problem",
    docs: {
      description:
        "Blocks direct semantic styling utilities and requires design-system tokens",
    },
    schema: [],
    messages: {
      forbidden:
        "Class token '{{token}}' bypasses design-system semantics. Replace it with approved tokens (for example text-foreground, bg-card, border-border).",
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
            if (isDirectSemanticToken(token)) {
              context.report({
                node: attribute,
                messageId: "forbidden",
                data: { token },
              });
            }
          }
        }
      },
    };
  },
});
