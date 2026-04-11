import { ESLintUtils } from "@typescript-eslint/utils";
import { getPolicy, isFrontendFile } from "./utils/design-system.js";

function includesDesignSystemRule(value, rulePrefix) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .some((entry) => entry.startsWith(rulePrefix));
}

export default ESLintUtils.RuleCreator(() => "")({
  name: "ds-enforce-suppression-format",
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce explicit, local, justified suppression directives for design-system rules",
    },
    schema: [],
    messages: {
      forbiddenDirective:
        "Directive '{{directive}}' is forbidden for design-system enforcement. Use eslint-disable-next-line for a single rule with a justification.",
      badFormat:
        "Suppression must match format: eslint-disable-next-line custom/ds-<rule> -- ds-exception: TEAM-123 | justification",
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isFrontendFile(context)) {
      return {};
    }

    const policy = getPolicy();
    const sourceCode = context.sourceCode;

    function checkComment(comment) {
      const text = comment.value.trim();

      for (const forbidden of policy.suppressionRules.disallowedDirectives) {
        if (text.startsWith(forbidden)) {
          const shouldReport =
            forbidden === "@ts-ignore" ||
            includesDesignSystemRule(text, policy.suppressionRules.allowedRulePrefix);

          if (shouldReport) {
            context.report({
              loc: comment.loc,
              messageId: "forbiddenDirective",
              data: { directive: forbidden },
            });
          }
          return;
        }
      }

      if (!text.startsWith(policy.suppressionRules.allowedDirective)) {
        return;
      }

      if (!includesDesignSystemRule(text, policy.suppressionRules.allowedRulePrefix)) {
        return;
      }

      if (!policy.suppressionRules.justificationPattern.test(text)) {
        context.report({
          loc: comment.loc,
          messageId: "badFormat",
        });
      }
    }

    return {
      Program() {
        const comments = sourceCode.getAllComments();
        comments.forEach(checkComment);
      },
    };
  },
});
