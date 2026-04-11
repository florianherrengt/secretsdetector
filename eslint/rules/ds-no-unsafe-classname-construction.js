import { ESLintUtils } from "@typescript-eslint/utils";
import {
  extractClassTokens,
  getClassAttributeEntries,
  getNormalizedFilename,
  getPolicy,
  isFrontendFile,
} from "./utils/design-system.js";

export default ESLintUtils.RuleCreator(() => "")({
  name: "ds-no-unsafe-classname-construction",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow dynamic className construction that cannot be statically proven compliant",
    },
    schema: [],
    messages: {
      unsafe:
        "Dynamic class expression is not allowed here. Use static class tokens or a policy-approved exception path.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isFrontendFile(context)) {
      return {};
    }

    const policy = getPolicy();
    const filePath = getNormalizedFilename(context);
    const allowedExpressionVariables =
      policy.dynamicClassAllowlist.byFile[filePath] ?? [];

    return {
      JSXOpeningElement(node) {
        const classAttributes = getClassAttributeEntries(node);

        for (const attribute of classAttributes) {
          const extracted = extractClassTokens(attribute);
          if (extracted.static) {
            continue;
          }

          if (
            attribute.value?.type === "JSXExpressionContainer" &&
            attribute.value.expression?.type === "Identifier" &&
            allowedExpressionVariables.includes(attribute.value.expression.name)
          ) {
            continue;
          }

          context.report({
            node: attribute,
            messageId: "unsafe",
          });
        }
      },
    };
  },
});
