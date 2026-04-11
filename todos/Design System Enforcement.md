## 1. System Overview

Build a **static enforcement layer** that prevents frontend code from diverging from the approved design system.

This phase exists to remove stylistic freedom from the coding agent and from human contributors wherever possible. The system must reject invalid frontend code **before runtime** by using linting, static analysis, and configuration-level restrictions.

The output of this phase is a production-grade enforcement subsystem that:

- detects frontend files
- statically validates their UI structure and styling
- blocks disallowed patterns
- fails locally and in CI when violations are present
- applies only to frontend code, not backend code

This phase does **not** render UI, run browser tests, or perform screenshot comparison. It is purely static enforcement.

---

## 2. Goals & Non-Goals

### Goals

The system must:

- enforce use of the approved design system
- prevent ad hoc styling decisions
- prevent introduction of raw HTML structure where design-system components are required
- prevent arbitrary Tailwind utility usage outside approved constraints
- prevent inline styling
- apply rules only to frontend-relevant files
- produce deterministic, machine-readable failures
- be strict enough that an agent cannot “mostly comply”

### Non-Goals

This phase must not:

- implement visual regression testing
- compare screenshots
- validate runtime rendering behavior
- infer whether a visual change “looks good”
- redesign components
- create a design system from scratch
- decide which styles are acceptable at runtime
- rely on human judgment during normal validation

---

## 3. Architecture Breakdown

This phase must be split into the following static-enforcement subsystems.

### 3.1 Frontend Scope Classifier

A path-based classifier that determines whether a file is subject to frontend design-system enforcement.

### 3.2 Design System Policy Definition

A single source of truth that defines what is allowed and what is forbidden in frontend UI code.

### 3.3 Static Linting Engine

A linting pipeline that applies both standard lint rules and custom project-specific rules.

### 3.4 Custom AST Rule Set

Custom static-analysis rules that inspect JSX and related code structures to enforce design-system usage.

### 3.5 CI Enforcement Layer

A build gate that blocks merges and automated agent completion when any rule violation exists.

### 3.6 Exception Control Mechanism

A tightly constrained process for rare, explicit rule bypasses.

---

## 4. Component Responsibilities

## 4.1 Frontend Scope Classifier

### Purpose

Determine which files must be checked by Phase 1 rules.

### Responsibilities

- classify files as `frontend`, `backend`, or `out_of_scope`
- ensure frontend rules are never applied to backend-only files
- ensure all user-facing UI files are covered
- provide deterministic inclusion behavior based on explicit file path rules only

### Required behavior

The classifier must use path-based and file-type-based rules only. It must not inspect semantic intent.

### Required path contract

The spec must define an explicit list of frontend-covered locations. Example structure:

- `src/components/**`
- `src/ui/**`
- `src/routes/**` when route files render JSX/UI
- `src/pages/**`
- `src/app/**` when it contains UI-rendering code
- any other explicitly designated frontend path

The spec must also define explicit exclusions. Example:

- `src/server/**`
- `src/api/**`
- `scripts/**`
- `db/**`
- `infra/**`
- test helpers that do not render UI

### Hard rule

No file may be considered frontend by inference. Coverage must be declared by path rules.

---

## 4.2 Design System Policy Definition

### Purpose

Define the allowed UI primitives and styling vocabulary.

### Responsibilities

- enumerate approved components
- enumerate approved styling tokens
- define banned patterns
- provide a stable contract consumed by lint rules
- act as the single reference point for enforcement

### Required contents

The policy definition must explicitly contain:

- approved component names
- approved raw HTML exceptions, if any
- approved class/token categories
- banned HTML tags
- banned styling constructs
- exception process rules

### Hard rule

If a component, token, or pattern is not explicitly allowed, it must be treated as forbidden.

---

## 4.3 Static Linting Engine

### Purpose

Run all static checks in a deterministic and blocking way.

### Responsibilities

- execute project linting rules
- include custom design-system rules
- return non-zero exit status on any violation
- produce stable error messages
- run both locally and in CI

### Required behavior

- all violations must be treated as errors
- warnings are not allowed for this phase
- output must identify:
  - file path
  - rule name
  - violating construct
  - required corrective direction

---

## 4.4 Custom AST Rule Set

### Purpose

Enforce design-system rules beyond what generic lint plugins can enforce.

### Responsibilities

- inspect JSX element usage
- inspect `className` content
- inspect `style` props
- inspect imports where required
- reject forbidden frontend structures

### Rule categories

This phase must include, at minimum, these rule families:

1. no raw HTML elements
2. no inline style prop
3. no arbitrary Tailwind values
4. no non-approved design tokens
5. no direct semantic styling outside approved system primitives
6. no unapproved escape hatches

---

## 4.5 CI Enforcement Layer

### Purpose

Guarantee violations cannot be merged or accepted by the agent workflow.

### Responsibilities

- run the Phase 1 lint suite in CI
- fail the pipeline on any violation
- block frontend change completion unless Phase 1 passes

### Hard rule

There must be no “soft fail” mode in CI for this phase.

---

## 4.6 Exception Control Mechanism

### Purpose

Allow rare, visible, auditable bypasses.

### Responsibilities

- define the only accepted suppression mechanism
- prevent silent bypasses
- make exceptions easy to detect in code review and automation

### Required behavior

- every suppression must be explicit and local
- broad file-level disablement must be forbidden unless explicitly approved in the spec
- each suppression must require a justification comment in a fixed format
- suppression comments must themselves be linted for format compliance if practical

---

## 5. Data Models & Contracts

This phase requires formal policy contracts, not runtime business data models.

## 5.1 Frontend Scope Contract

The classifier must expose a deterministic contract equivalent to:

```text
FileScope
- filePath: string
- classification: "frontend" | "backend" | "out_of_scope"
- matchedRule: string
```

### Required contract behavior

- exactly one classification result per file
- no ambiguous classification
- no fallback to “probably frontend”

---

## 5.2 Design System Policy Contract

The policy definition must expose, at minimum, the following conceptual structure:

```text
DesignSystemPolicy
- approvedComponents: set of component names
- approvedRawElements: set of HTML tag names
- forbiddenRawElements: set of HTML tag names
- approvedClassPatterns: set of allowed utility/token patterns
- forbiddenClassPatterns: set of banned utility/token patterns
- approvedStyleProps: usually empty
- forbiddenProps: set of prop names
- suppressionRules: object defining allowed bypass format
```

### Hard rules

- `approvedRawElements` must be minimal
- `approvedStyleProps` should be empty unless a rare exception is explicitly justified
- conflicts must resolve in favor of rejection

---

## 5.3 Rule Result Contract

Each rule failure must produce a deterministic result equivalent to:

```text
RuleViolation
- filePath: string
- ruleName: string
- location: line/column if available
- message: string
- severity: "error"
- suggestedAction: string
```

### Required behavior

- every violation must include `ruleName`
- every violation must include an actionable correction direction
- messages must avoid vague language such as “consider changing”

---

## 6. Execution Flow (Step-by-Step)

## 6.1 Policy Initialization

1. Load the frontend scope rules.
2. Load the design-system policy definition.
3. Load the lint configuration that includes Phase 1 rules.
4. Validate that the policy definition itself is internally consistent.
   - no duplicate conflicting entries
   - no approved-and-forbidden overlap
   - no empty required sets if the project expects enforcement

If policy validation fails, lint execution must stop with configuration failure.

---

## 6.2 File Selection

1. Gather candidate project files.
2. For each file, run the Frontend Scope Classifier.
3. Apply Phase 1 rules only to files classified as `frontend`.
4. Skip backend and out-of-scope files for these rules.

---

## 6.3 Static Rule Evaluation

For each frontend file:

1. Parse the file into an AST.
2. Inspect all JSX elements.
3. Inspect all JSX props.
4. Inspect all `className` values that can be statically analyzed.
5. Inspect all local suppression directives.
6. Emit violations for every forbidden construct.

---

## 6.4 Aggregation and Failure Decision

1. Collect all rule violations.
2. Sort output deterministically.
   - by file path
   - then by line
   - then by rule name

3. Print violations in stable order.
4. Exit with failure status if any violation exists.

---

## 6.5 CI Behavior

1. Run Phase 1 checks as part of the mandatory validation pipeline.
2. If the changed files include any frontend file, Phase 1 must run.
3. If Phase 1 fails, the pipeline fails.
4. No merge or agent completion may proceed.

---

## 7. Error Handling & Edge Cases

## 7.1 Unparseable Files

If a frontend file cannot be parsed:

- treat this as a blocking error
- do not skip the file
- report it as a parsing/configuration failure

Reason: skipping invalid syntax would create enforcement gaps.

---

## 7.2 Dynamic `className` Construction

If `className` is built dynamically and cannot be statically proven compliant:

- treat it as forbidden by default unless the exact construction pattern is explicitly allowed by policy

Examples of risky patterns that must be rejected unless explicitly allowed:

- arbitrary string concatenation
- template strings containing uncontrolled utility fragments
- conditional branches that inject unknown class strings

Allowed patterns, if any, must be explicitly defined in the policy.

### Hard rule

Unverifiable styling must fail.

---

## 7.3 Third-Party Wrapper Components

If a file imports or defines a component that renders raw HTML internally:

- Phase 1 only governs the usage boundary unless deeper inspection is explicitly included
- however, any locally defined UI wrapper intended for broad reuse must itself live in an approved UI path and be validated under the same rules

The project must not allow arbitrary new wrapper components to become escape hatches.

---

## 7.4 Accessibility-Driven Raw HTML Exceptions

If the system requires some raw HTML elements for semantic or accessibility reasons, those exceptions must be explicitly listed in `approvedRawElements`.

No accessibility exception may be inferred ad hoc.

---

## 7.5 Inline Styles Required by External Library APIs

If a third-party library requires a style prop:

- this is forbidden unless that exact usage pattern is explicitly whitelisted
- the whitelist must be narrow and path- or component-specific where possible

No general “library exception” is allowed.

---

## 7.6 Legacy Files

If legacy frontend files violate new rules:

- the spec must choose one of two modes explicitly:
  - strict mode: fail all existing violations immediately
  - staged mode: only fail new or modified violations in a defined scope

This choice must be explicit before implementation.

### Required recommendation

Use strict mode if feasible. If staged mode is used, its boundary must be deterministic and tool-enforced.

---

## 7.7 Suppression Abuse

If a suppression directive is malformed, too broad, missing justification, or placed incorrectly:

- treat it as an error
- do not honor it

---

## 8. Deterministic Rules the Agent Must Follow

These are non-negotiable implementation rules.

## 8.1 Scope Rules

- Only apply Phase 1 design-system enforcement to files classified as frontend.
- Never classify files by inferred purpose.
- Only use explicit configured path patterns.

## 8.2 Policy Rules

- Anything not explicitly allowed is forbidden.
- The policy definition is the single source of truth.
- No rule may silently permit unknown constructs.

## 8.3 Validation Rules

- Every violation is an error.
- No warnings.
- No autofix that changes design intent unless explicitly specified.
- No fallback behavior when analysis is uncertain.

## 8.4 Uncertainty Rules

When static analysis cannot prove compliance:

- fail the check

This applies especially to:

- dynamic class generation
- indirect style injection
- wrapper abstractions hiding forbidden patterns

## 8.5 Exception Rules

- Exceptions must be explicit, local, and justified.
- Broad disable comments are forbidden unless explicitly approved.
- Missing or malformed justifications invalidate the suppression.

## 8.6 Output Rules

- Rule output must be deterministic.
- Ordering must be stable.
- Error messages must be directive and specific.

---

## 9. Validation & Testing Requirements

This phase itself must be tested.

## 9.1 Policy Validation Tests

The system must include tests that verify the policy definition is internally valid.

Required checks:

- no overlap between approved and forbidden sets
- no duplicate conflicting entries
- every configured frontend rule references valid policy categories

---

## 9.2 Scope Classifier Tests

The classifier must be tested with representative file paths.

Required cases:

- known frontend file
- known backend file
- excluded utility file
- ambiguous-looking path that must resolve deterministically
- unsupported path that must resolve to `out_of_scope`

---

## 9.3 Rule Behavior Tests

Each custom rule must have explicit fixture-based tests for:

- compliant example
- non-compliant example
- edge-case example
- malformed suppression example if applicable

Required rule coverage:

- no raw HTML elements
- no inline styles
- no arbitrary Tailwind values
- no non-approved class/token usage
- suppression formatting

---

## 9.4 Failure Message Tests

For each rule, verify:

- rule name appears in the output
- message is stable
- message instructs the required correction
- severity is error

---

## 9.5 CI Contract Tests

The pipeline behavior must be validated so that:

- a frontend violation fails CI
- a backend-only change does not incorrectly trigger frontend-specific failures
- a malformed config fails the validation run immediately

---

## 10. Extensibility & Future-Proofing Considerations

This phase must be built so later phases can extend it without breaking its core contract.

## 10.1 Future Rule Expansion

The rule engine must support adding future checks such as:

- banned layout primitives
- required component composition rules
- forbidden responsive utility patterns
- allowed import boundaries for UI components

These must be addable without redesigning the policy model.

---

## 10.2 Future Agent Integration

The scope classifier and policy definition must be usable by later agent workflow phases so frontend-specific instructions can be injected automatically when frontend files are touched.

This means:

- file classification output must be reusable outside lint execution
- policy definitions must be readable by automation systems if needed

---

## 10.3 Future Design System Evolution

The policy definition must be maintainable as the design system changes.

Requirements:

- approved components can be added or removed centrally
- allowed token sets can evolve without rewriting rule logic
- exceptions remain narrow and auditable

---

## 10.4 Future Monorepo Support

If the codebase expands into multiple apps/packages, the system must support:

- per-package frontend scopes
- shared global design-system policy
- package-level overrides only where explicitly allowed

Overrides must not weaken baseline guarantees unless deliberately configured.

---

## 11. Required Deliverables

The agent implementing this phase must produce all of the following.

### 11.1 Frontend Scope Definition

A concrete, explicit definition of which paths are frontend-covered and which are excluded.

### 11.2 Design System Policy Definition

A single centralized policy artifact containing all allowlists, denylists, and suppression rules.

### 11.3 Lint Configuration

A production-ready lint configuration that applies Phase 1 rules deterministically.

### 11.4 Custom Rule Set

Custom static-analysis rules covering the required rule families.

### 11.5 Exception Policy

A documented and enforced suppression format.

### 11.6 Test Suite

Tests covering classifier behavior, rule behavior, policy validity, and CI failure conditions.

### 11.7 CI Integration

A mandatory pipeline step that blocks merges on violations.

---

## 12. Acceptance Criteria

Phase 1 is complete only if all of the following are true.

- frontend files are deterministically identified
- backend files are excluded from frontend-specific enforcement
- raw HTML usage is blocked except for explicitly approved cases
- inline styles are blocked except for explicitly approved cases
- arbitrary Tailwind values are blocked
- non-approved styling tokens are blocked
- unverifiable styling patterns fail
- suppressions are explicit, local, and validated
- all violations fail locally and in CI
- all rule outputs are deterministic
- the system includes tests proving the above behavior

---

## 13. Implementation Decision Points That Must Be Resolved Explicitly Before Building

The implementing agent must not choose these on its own. The spec owner must define them explicitly before implementation starts.

### Required explicit decisions

- exact frontend-covered paths
- exact excluded paths
- exact approved raw HTML elements, if any
- exact approved component set
- exact allowed token/class patterns
- whether legacy code is enforced in strict mode or staged mode
- exact suppression format
- whether any path-specific exceptions exist

If any of these remain unspecified, the implementation is incomplete.

---

## 14. Default Policy Position Unless Overridden

Where project-specific values are not yet enumerated, the enforcing logic must assume the strictest safe default:

- no raw HTML elements allowed
- no inline styles allowed
- no arbitrary Tailwind values allowed
- no unknown class/token usage allowed
- no unverifiable dynamic styling allowed
- no broad suppressions allowed

This default exists to prevent silent gaps while policy details are being finalized.
