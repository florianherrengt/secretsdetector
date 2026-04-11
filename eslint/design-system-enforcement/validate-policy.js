function findOverlap(left, right) {
  return [...left].filter((entry) => right.has(entry));
}

export function validatePolicy(policy) {
  const errors = [];

  const rawOverlap = findOverlap(
    policy.approvedRawElements,
    policy.forbiddenRawElements,
  );

  if (rawOverlap.length > 0) {
    errors.push(
      `approvedRawElements and forbiddenRawElements overlap: ${rawOverlap.join(", ")}`,
    );
  }

  if (!(policy.approvedComponents instanceof Set)) {
    errors.push("approvedComponents must be a Set");
  }

  if (!(policy.forbiddenProps instanceof Set)) {
    errors.push("forbiddenProps must be a Set");
  }

  if (policy.approvedClassPatterns.length === 0) {
    errors.push("approvedClassPatterns must not be empty");
  }

  if (!(policy.approvedClassTokens instanceof Set)) {
    errors.push("approvedClassTokens must be a Set");
  }

  if (!policy.suppressionRules?.justificationPattern) {
    errors.push("suppressionRules.justificationPattern must be configured");
  }

  if (errors.length > 0) {
    throw new Error(
      `Design system policy validation failed:\n- ${errors.join("\n- ")}`,
    );
  }
}
