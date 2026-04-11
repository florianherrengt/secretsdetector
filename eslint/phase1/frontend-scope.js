import path from "node:path";

const FRONTEND_INCLUDE_RULES = [
  {
    name: "views-tsx",
    prefix: "src/views/",
    extensions: [".tsx", ".jsx"],
  },
];

const BACKEND_EXCLUDE_RULES = [
  { name: "server", prefix: "src/server/" },
  { name: "api", prefix: "src/api/" },
  { name: "pipeline", prefix: "src/pipeline/" },
  { name: "schemas", prefix: "src/schemas/" },
  { name: "lib", prefix: "src/lib/" },
  { name: "scripts", prefix: "scripts/" },
  { name: "db", prefix: "db/" },
  { name: "drizzle", prefix: "drizzle/" },
  { name: "infra", prefix: "infra/" },
  { name: "tests", prefix: "tests/" },
  { name: "dist", prefix: "dist/" },
];

function normalizePath(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  const cwd = process.cwd().split(path.sep).join("/");

  if (normalized.startsWith(`${cwd}/`)) {
    return normalized.slice(cwd.length + 1);
  }

  return normalized;
}

function hasAllowedExtension(filePath, extensions) {
  return extensions.some((extension) => filePath.endsWith(extension));
}

export function classifyFileScope(filePath) {
  const normalized = normalizePath(filePath);

  const backendMatch = BACKEND_EXCLUDE_RULES.find((rule) =>
    normalized.startsWith(rule.prefix),
  );

  if (backendMatch) {
    return {
      filePath: normalized,
      classification: "backend",
      matchedRule: backendMatch.name,
    };
  }

  const frontendMatch = FRONTEND_INCLUDE_RULES.find(
    (rule) =>
      normalized.startsWith(rule.prefix) &&
      hasAllowedExtension(normalized, rule.extensions),
  );

  if (frontendMatch) {
    return {
      filePath: normalized,
      classification: "frontend",
      matchedRule: frontendMatch.name,
    };
  }

  return {
    filePath: normalized,
    classification: "out_of_scope",
    matchedRule: "default-out-of-scope",
  };
}

export const frontendScopeContract = {
  includeRules: FRONTEND_INCLUDE_RULES,
  backendExcludes: BACKEND_EXCLUDE_RULES,
};
