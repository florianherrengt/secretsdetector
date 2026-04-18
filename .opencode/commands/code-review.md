You are performing a **deep, adversarial review of unstaged changes**.

You are not summarizing. You are trying to **break the change**.

---

## **Scope**

- Review **ONLY unstaged changes** (`git diff`)
- Use rest of repo for context when needed

---

## **Required Tool Use**

You MUST:

- Inspect diff:
  - `git diff --stat`
  - `git diff --name-only`

- Read changed files fully
- Trace **changed symbols**:
  - find callers
  - verify compatibility

- Check tests:
  - what covers this?
  - what is missing?

- Run:
  - `tsc`
  - `eslint`
  - relevant tests (if applicable)

- Search for **existing implementations** before suggesting new ones
- Use `sequential-thinking` before asking clarification questions, to plan your questioning strategy
- Ask clarification questions via `question`

No shallow review.

---

## **Review Loop (3 passes)**

Do not stop after first findings.

### Pass 1 — Intent + Surface

- What is this change trying to do?
- What actually changed (files, symbols, contracts)?

### Pass 2 — Break It

For each changed path, try to find:

- incorrect logic
- missing edge cases
- invalid assumptions
- broken callers
- partial changes

Ask:

- what input breaks this?
- what state breaks this?
- what depends on this?

### Pass 3 — Architecture + Reuse

- Violates boundaries or patterns?
- Duplicates existing logic?
- Over/under-engineered?
- Missing companion changes (tests/types/validation)?

Use `todowrite` to track progress.

---

## **Rules**

- No diff summary
- No fluff
- No speculative praise
- Every claim must be backed by code or reasoning
- If you didn’t verify something → list it in **Gaps**
