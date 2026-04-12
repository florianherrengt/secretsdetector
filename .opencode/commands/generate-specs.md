Produce a **complete, production-grade agent specification** that defines exactly what must be built and how it should behave.

This is what the user has provided as a base specs:

```text
$ARGUMENTS
```

### Role & Expectations

- You are a **system architect**, not an implementer.
- The agent is a **deterministic executor**: it follows instructions precisely but does not infer intent or make design decisions.
- Therefore, **everything must be explicit, unambiguous, and exhaustive**.

### Objective

Deliver a specification that enables an agent to implement the system **without needing to think, interpret, or fill gaps**.

### Required Depth

- Describe **what to build**, **why it exists**, and **how it should behave**
- Break down the system into:
  - Components
  - Responsibilities
  - Data flow
  - Interfaces and boundaries
  - Execution steps

- Define **clear contracts** between parts of the system

### Constraints

- **Do NOT write implementation code**
- You may include **small illustrative snippets or pseudo-structures only when necessary for clarity**, but never full implementations
- Avoid ambiguity, assumptions, or high-level handwaving

### Research & External Validation

- When the specification depends on **facts that may be outdated, incomplete, version-specific, vendor-specific, or ecosystem-specific**, you **must perform web research before writing the spec**
- Use web research especially for:
  - third-party APIs
  - SDKs and libraries
  - framework capabilities and limitations
  - package health and maintenance status
  - browser/platform support
  - infrastructure services and pricing-sensitive constraints
  - security recommendations
  - official documentation for tools being integrated

- Prefer sources in this order:
  1. **official documentation**
  2. **official repositories**
  3. **maintainer-authored references**
  4. reputable ecosystem sources only if primary sources are insufficient

- Do **not** guess about external systems when the answer can be verified
- If research reveals uncertainty, conflicting guidance, or multiple valid options, explicitly document:
  - what was verified
  - what remains uncertain
  - which option is recommended
  - why that option was chosen

- Any recommendation involving a dependency or external service must be justified using:
  - maintenance/activity
  - maturity/adoption
  - compatibility with the requested stack
  - operational risk

- If the user-provided base specs conflict with verified external constraints, the spec must call that out explicitly and propose the safest compliant design

### Required Sections

At minimum, include:

1. **System Overview**
2. **Goals & Non-Goals**
3. **Architecture Breakdown**
4. **Component Responsibilities**
5. **Data Models & Contracts**
6. **Execution Flow (step-by-step)**
7. **Error Handling & Edge Cases**
8. **Deterministic Rules the Agent Must Follow**
9. **Validation & Testing Requirements**
10. **Extensibility & Future-Proofing Considerations**

### Writing Style

- Be **precise, structured, and directive**
- Prefer **checklists, sequences, and rules** over prose
- Eliminate any room for interpretation

### Core Principle

If the agent could misunderstand something, the spec is incomplete.
