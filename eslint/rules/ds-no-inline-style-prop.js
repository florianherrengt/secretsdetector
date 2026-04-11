import { ESLintUtils } from "@typescript-eslint/utils";
import { getPolicy, isFrontendFile } from "./utils/design-system.js";

export default ESLintUtils.RuleCreator(() => "")({
  name: "ds-no-inline-style-prop",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow inline style usage in frontend files",
    },
    schema: [],
    messages: {
      forbidden:
        "Inline style prop is forbidden. Move styling into approved design-system classes or component variants.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isFrontendFile(context)) {
      return {};
    }

    const policy = getPolicy();

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier") {
          return;
        }

        if (!policy.forbiddenProps.has(node.name.name)) {
          return;
        }

        if (policy.approvedStyleProps.includes(node.name.name)) {
          return;
        }

        if (node.name.name === "style") {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
});
