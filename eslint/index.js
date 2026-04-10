import noRawFunctions from "./rules/no-raw-functions.js";
import noMutableVariables from "./rules/no-mutable-variables.js";

export const rules = {
  "no-raw-functions": noRawFunctions,
  "no-mutable-variables": noMutableVariables,
};

export default {
  rules,
};
