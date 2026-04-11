import { ESLintUtils } from "@typescript-eslint/utils";
import {
  extractClassTokens,
  getClassAttributeEntries,
  getPolicy,
  isFrontendFile,
} from "./utils/design-system.js";

function matchesAny(patterns, token) {
  return patterns.some((pattern) => pattern.test(token));
}

function isApprovedToken(policy, token) {
  if (policy.approvedClassTokens.has(token)) {
    return true;
  }

  return matchesAny(policy.approvedClassPatterns, token);
}

export default ESLintUtils.RuleCreator(() => "")({
  name: "ds-no-unapproved-class-tokens",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow class tokens outside approved design-system patterns",
    },
    schema: [],
    messages: {
      forbidden:
        "Class token '{{token}}' is explicitly forbidden. Use approved design-system tokens.",
      unapproved:
        "Class token '{{token}}' is not approved by policy. Use approved design-system tokens only.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isFrontendFile(context)) {
      return {};
    }

    const policy = getPolicy();

    return {
      JSXOpeningElement(node) {
        const classAttributes = getClassAttributeEntries(node);

        for (const attribute of classAttributes) {
          const extracted = extractClassTokens(attribute);

          if (!extracted.static) {
            continue;
          }

          for (const token of extracted.tokens) {
            if (matchesAny(policy.forbiddenClassPatterns, token)) {
              context.report({
                node: attribute,
                messageId: "forbidden",
                data: { token },
              });
              continue;
            }

            if (!isApprovedToken(policy, token)) {
              context.report({
                node: attribute,
                messageId: "unapproved",
                data: { token },
              });
            }
          }
        }
      },
    };
  },
});
