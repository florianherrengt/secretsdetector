# Design System Static Enforcement

This project enforces frontend design-system compliance statically via ESLint and project policy contracts.

## Frontend Scope Definition

The scope classifier is path-only and deterministic.

- Frontend paths:
  - `src/views/**/*.tsx`
  - `src/views/**/*.jsx`
- Backend/excluded paths:
  - `src/server/**`
  - `src/api/**`
  - `src/pipeline/**`
  - `src/schemas/**`
  - `src/lib/**`
  - `scripts/**`
  - `db/**`
  - `drizzle/**`
  - `infra/**`
  - `tests/**`
  - `dist/**`

Classifier contract:

```text
FileScope
- filePath: string
- classification: "frontend" | "backend" | "out_of_scope"
- matchedRule: string
```

Implementation: `eslint/design-system-enforcement/frontend-scope.js`

## Design-System Policy Definition

The policy is centralized and loaded from `eslint/design-system-enforcement/policy.js`.

Contract:

```text
DesignSystemPolicy
- approvedComponents: set of component names
- approvedRawElements: set of HTML tag names
- forbiddenRawElements: set of HTML tag names
- approvedClassPatterns: set of allowed utility/token patterns
- forbiddenClassPatterns: set of banned utility/token patterns
- approvedStyleProps: set/list (empty by default)
- forbiddenProps: set of prop names
- suppressionRules: fixed suppression format
```

Policy defaults are strict:

- inline styles forbidden
- arbitrary Tailwind values forbidden
- non-approved class tokens forbidden
- non-static class construction forbidden unless path-specific policy exceptions exist

## Lint Configuration

Design-system enforcement is applied through ESLint custom rules:

- `custom/ds-no-raw-html-elements`
- `custom/ds-no-inline-style-prop`
- `custom/ds-no-arbitrary-tailwind-values`
- `custom/ds-no-unapproved-class-tokens`
- `custom/ds-no-direct-semantic-styling`
- `custom/ds-no-unsafe-classname-construction`
- `custom/ds-enforce-suppression-format`

All are configured as `error` in `eslint.config.js`.

## Exception Policy

Only local next-line suppression is allowed for design-system rules:

```text
eslint-disable-next-line custom/ds-<rule> -- ds-exception: TEAM-123 | justification
```

Forbidden directives for design-system rules:

- `eslint-disable`
- `eslint-disable-line`
- `eslint-enable`
- `@ts-ignore`

Malformed suppression is itself an error.

## CI Integration

CI blocks merges on design-system violations via `.github/workflows/ci.yml`:

- `npm run lint`
- `npm run lint:design-system-enforcement`
- `npm test`

`lint:design-system-enforcement` is defined in `package.json` and emits machine-readable JSON output.

## Legacy Enforcement Mode

Mode: `strict` (configured in `eslint/design-system-enforcement/policy.js`).

All current and future frontend files in scope must pass design-system rules.
