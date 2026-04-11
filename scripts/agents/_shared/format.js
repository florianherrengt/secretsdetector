import { truncateErrors } from "./truncate.js";

export function buildResult(tool, status, summary, metrics = {}, errors = []) {
  return {
    status,
    tool,
    summary,
    metrics,
    errors: truncateErrors(errors),
  };
}

export function buildError(message, file, line) {
  const err = { message };
  if (file) err.file = file;
  if (line !== undefined) err.line = line;
  return err;
}
