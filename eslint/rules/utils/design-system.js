import path from "node:path";
import { classifyFileScope } from "../../phase1/frontend-scope.js";
import { designSystemPolicy } from "../../phase1/policy.js";

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function toWorkspaceRelative(filePath) {
  const normalized = normalizePath(filePath);
  const cwd = normalizePath(process.cwd());

  if (normalized.startsWith(`${cwd}/`)) {
    return normalized.slice(cwd.length + 1);
  }

  return normalized;
}

function collectTokensFromStaticString(value) {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function extractTokensFromExpression(expression) {
  if (!expression) {
    return { static: false, tokens: [], reason: "missing expression" };
  }

  if (expression.type === "Literal" && typeof expression.value === "string") {
    return { static: true, tokens: collectTokensFromStaticString(expression.value) };
  }

  if (expression.type === "TemplateLiteral") {
    if (expression.expressions.length > 0) {
      return {
        static: false,
        tokens: [],
        reason: "template literal contains expressions",
      };
    }

    const value = expression.quasis.map((quasi) => quasi.value.cooked ?? "").join("");
    return { static: true, tokens: collectTokensFromStaticString(value) };
  }

  if (expression.type === "ConditionalExpression") {
    const left = extractTokensFromExpression(expression.consequent);
    const right = extractTokensFromExpression(expression.alternate);

    if (!left.static || !right.static) {
      return {
        static: false,
        tokens: [],
        reason: "conditional branch is not statically analyzable",
      };
    }

    return { static: true, tokens: [...left.tokens, ...right.tokens] };
  }

  if (
    expression.type === "Literal" &&
    (expression.value === null || expression.value === undefined)
  ) {
    return { static: true, tokens: [] };
  }

  if (expression.type === "Identifier" && expression.name === "undefined") {
    return { static: true, tokens: [] };
  }

  return {
    static: false,
    tokens: [],
    reason: `unsupported expression type: ${expression.type}`,
  };
}

export function getScopeFromContext(context) {
  return classifyFileScope(context.filename);
}

export function isFrontendFile(context) {
  return getScopeFromContext(context).classification === "frontend";
}

export function getPolicy() {
  return designSystemPolicy;
}

export function getNormalizedFilename(context) {
  return toWorkspaceRelative(context.filename);
}

export function getClassAttributeEntries(node) {
  if (!node.attributes) {
    return [];
  }

  return node.attributes.filter((attribute) => {
    if (attribute.type !== "JSXAttribute") {
      return false;
    }

    if (attribute.name.type !== "JSXIdentifier") {
      return false;
    }

    return attribute.name.name === "class" || attribute.name.name === "className";
  });
}

export function extractClassTokens(attribute) {
  if (!attribute.value) {
    return { static: false, tokens: [], reason: "class attribute has no value" };
  }

  if (attribute.value.type === "Literal") {
    if (typeof attribute.value.value !== "string") {
      return {
        static: false,
        tokens: [],
        reason: "class attribute literal is not a string",
      };
    }

    return {
      static: true,
      tokens: collectTokensFromStaticString(attribute.value.value),
    };
  }

  if (attribute.value.type === "JSXExpressionContainer") {
    return extractTokensFromExpression(attribute.value.expression);
  }

  return {
    static: false,
    tokens: [],
    reason: `unsupported class attribute value type: ${attribute.value.type}`,
  };
}
