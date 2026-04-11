const MAX_ERRORS = 3;
const MAX_MESSAGE_LENGTH = 200;

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const STACK_TRACE_RE = /\n\s+at\s+.*/s;

export function stripAnsi(str) {
  return str.replace(ANSI_RE, "");
}

export function truncateMessage(msg) {
  const clean = stripAnsi(msg).replace(STACK_TRACE_RE, "").trim();
  if (clean.length <= MAX_MESSAGE_LENGTH) return clean;
  return clean.slice(0, MAX_MESSAGE_LENGTH - 3) + "...";
}

export function truncatePath(filePath) {
  const parts = filePath.split("/");
  if (parts.length <= 3) return filePath;
  return ".../" + parts.slice(-3).join("/");
}

export function truncateErrors(errors) {
  return errors.slice(0, MAX_ERRORS).map((err) => ({
    ...err,
    message: truncateMessage(err.message),
    ...(err.file ? { file: truncatePath(err.file) } : {}),
  }));
}
