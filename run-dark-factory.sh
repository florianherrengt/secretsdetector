#!/usr/bin/env bash
set -euo pipefail

ATTACH="http://100.120.186.55:4096"
WORKDIR=$(pwd)
AGENT="${AGENT:-openai-build}"
OPENCODE_ARGS=(--attach "$ATTACH" --dir "$WORKDIR" --agent "$AGENT")

extract_session_id() {
  local f="$1"
  local sid

  sid=$(jq -r 'select(.sessionId != null) | .sessionId' "$f" 2>/dev/null | head -1) || true
  if [[ -n "$sid" && "$sid" != "null" ]]; then echo "$sid"; return 0; fi

  sid=$(jq -r 'select(.sessionID != null) | .sessionID' "$f" 2>/dev/null | head -1) || true
  if [[ -n "$sid" && "$sid" != "null" ]]; then echo "$sid"; return 0; fi

  sid=$(jq -r 'select(.session != null and .session.id != null) | .session.id' "$f" 2>/dev/null | head -1) || true
  if [[ -n "$sid" && "$sid" != "null" ]]; then echo "$sid"; return 0; fi

  sid=$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$f" | head -1) || true
  if [[ -n "$sid" ]]; then echo "$sid"; return 0; fi

  sid=$(grep -oE 'ses_[A-Za-z0-9]+' "$f" | head -1) || true
  if [[ -n "$sid" ]]; then echo "$sid"; return 0; fi

  echo "ERROR: Could not extract session ID from output" >&2
  exit 1
}

# ─── Step 1: Implement from specs ─────────────────────────────────
echo "=== Step 1: Implement from specs ==="
mkdir -p ./wip
TMP=$(mktemp ./wip/opencode-pipeline.XXXXXX)
if ! opencode run "${OPENCODE_ARGS[@]}" --format json \
  --command execute-plan \
  -f ./wip/specs.md \
  -- \
  "Use ./wip/specs.md as the specification to execute." \
  > "$TMP" 2>&1; then
  echo "ERROR: Step 1 failed. Output:" >&2
  cat "$TMP" >&2
  rm -f "$TMP"
  exit 1
fi
SESSION=$(extract_session_id "$TMP")
rm -f "$TMP"
echo "Session: $SESSION"
echo

# ─── Step 2: Post-work check ──────────────────────────────────────
echo "=== Step 2: Post-work check ==="
opencode run "${OPENCODE_ARGS[@]}" \
  --session "$SESSION" \
  --command post-work-check \
  "Run the post-work check on the implementation."
echo

# ─── Step 3: Fix post-work findings ───────────────────────────────
echo "=== Step 3: Fix post-work findings ==="
opencode run "${OPENCODE_ARGS[@]}" \
  --session "$SESSION" \
  --command execute-plan \
  "Fix all issues found in the post-work check."
echo

# ─── Step 4: Adversarial code review ──────────────────────────────
echo "=== Step 4: Code review ==="
opencode run "${OPENCODE_ARGS[@]}" \
  --command code-review \
  "Review the unstaged changes. Write findings to ./wip/code-review.md."
echo

# ─── Step 5: Fix code-review findings ─────────────────────────────
echo "=== Step 5: Fix code-review findings ==="
opencode run "${OPENCODE_ARGS[@]}" \
  --command execute-plan \
  -f ./wip/code-review.md \
  -- \
  "Use ./wip/code-review.md as the specification. Fix all review findings."
echo

# ─── Step 6: Open PR ──────────────────────────────────────────────
echo "=== Step 6: Open PR ==="
opencode run "${OPENCODE_ARGS[@]}" \
  --command open-pr \
  "Open a PR for the changes."
echo

# ─── Step 7: Watch CI, fix if failed, loop until pass ────────────────
echo "=== Step 7: Watch CI ==="
opencode run "${OPENCODE_ARGS[@]}" \
  --command ci-fix-loop \
  "Run the CI fix loop."
echo

BRANCH=$(git branch --show-current)
PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number')
if [[ -n "$PR_NUMBER" ]]; then
  gh pr comment "$PR_NUMBER" --body "/opencode review this PR"
fi

echo "=== All steps complete ==="
