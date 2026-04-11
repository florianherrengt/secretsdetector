import { describe, expect, it } from "vitest";
import { designSystemPolicy } from "../../eslint/design-system-enforcement/policy.js";
import { validatePolicy } from "../../eslint/design-system-enforcement/validate-policy.js";

function clonePolicy() {
  return {
    ...designSystemPolicy,
    approvedComponents: new Set(designSystemPolicy.approvedComponents),
    approvedRawElements: new Set(designSystemPolicy.approvedRawElements),
    forbiddenRawElements: new Set(designSystemPolicy.forbiddenRawElements),
    forbiddenProps: new Set(designSystemPolicy.forbiddenProps),
    approvedClassPatterns: [...designSystemPolicy.approvedClassPatterns],
    forbiddenClassPatterns: [...designSystemPolicy.forbiddenClassPatterns],
    suppressionRules: {
      ...designSystemPolicy.suppressionRules,
    },
  };
}

describe("Design system policy validation", () => {
  it("accepts the configured policy", () => {
    expect(() => validatePolicy(clonePolicy())).not.toThrow();
  });

  it("rejects approved/forbidden overlaps", () => {
    const policy = clonePolicy();
    policy.approvedRawElements.add("div");
    policy.forbiddenRawElements.add("div");

    expect(() => validatePolicy(policy)).toThrow(
      "approvedRawElements and forbiddenRawElements overlap",
    );
  });

  it("rejects missing approved class patterns", () => {
    const policy = clonePolicy();
    policy.approvedClassPatterns = [];

    expect(() => validatePolicy(policy)).toThrow(
      "approvedClassPatterns must not be empty",
    );
  });
});
