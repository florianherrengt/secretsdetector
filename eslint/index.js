import noRawFunctions from "./rules/no-raw-functions.js";
import noMutableVariables from "./rules/no-mutable-variables.js";
import dsNoRawHtmlElements from "./rules/ds-no-raw-html-elements.js";
import dsNoInlineStyleProp from "./rules/ds-no-inline-style-prop.js";
import dsNoArbitraryTailwindValues from "./rules/ds-no-arbitrary-tailwind-values.js";
import dsNoUnapprovedClassTokens from "./rules/ds-no-unapproved-class-tokens.js";
import dsNoUnsafeClassnameConstruction from "./rules/ds-no-unsafe-classname-construction.js";
import dsEnforceSuppressionFormat from "./rules/ds-enforce-suppression-format.js";
import dsNoDirectSemanticStyling from "./rules/ds-no-direct-semantic-styling.js";

export const rules = {
  "no-raw-functions": noRawFunctions,
  "no-mutable-variables": noMutableVariables,
  "ds-no-raw-html-elements": dsNoRawHtmlElements,
  "ds-no-inline-style-prop": dsNoInlineStyleProp,
  "ds-no-arbitrary-tailwind-values": dsNoArbitraryTailwindValues,
  "ds-no-unapproved-class-tokens": dsNoUnapprovedClassTokens,
  "ds-no-direct-semantic-styling": dsNoDirectSemanticStyling,
  "ds-no-unsafe-classname-construction": dsNoUnsafeClassnameConstruction,
  "ds-enforce-suppression-format": dsEnforceSuppressionFormat,
};

export default {
  rules,
};
