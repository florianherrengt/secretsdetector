# UI_EXECUTION_CONTRACT.md

## 0. Purpose

This document defines **deterministic, enforceable rules** for how UI must be built.

- This is **not guidance**.
- This is **not design inspiration**.
- This is a **contract** the agent must follow.

The agent:

- does **not design**
- does **not improvise**
- does **not introduce new patterns**

The agent:

- **composes UI using predefined rules**
- **follows constraints exactly**
- **rejects ambiguity**

---

## 1. Core Principles

### 1.1 Deterministic Composition

- UI must be assembled from known patterns
- No creative interpretation
- No “guessing what looks good”

---

### 1.2 Constraint Over Freedom

- If a rule exists → it MUST be followed
- If a rule is missing → use the simplest standard SaaS pattern

---

### 1.3 Consistency First

- Identical problems → identical UI solutions
- No variation without explicit instruction

---

## 2. Design References (Translated to Rules)

The following references are **already translated into constraints**:

### Stripe

- Generous spacing between sections (≥ 32px)
- Clear typography hierarchy
- Minimal borders
- Readable tables

### Linear

- Compact, dense lists and tables
- Strong alignment and grid discipline
- Minimal color usage

### Vercel

- Minimal UI
- No visual noise
- Neutral-first color palette

---

## 3. Layout System

### 3.1 Page Structure (Mandatory)

Every page MUST follow:

```

Page
├── Header
│ ├── Title (left)
│ └── Primary Action (right)
│
├── Content
│ ├── Section
│ │ ├── Section Title
│ │ └── Section Content
│
└── Footer / Secondary Actions (optional)

```

---

### 3.2 Section Rules

- Sections MUST be visually grouped
- Spacing between sections ≥ 32px
- Each section MUST have:
  - title
  - optional description
  - content

---

### 3.3 Alignment

- Use strict vertical alignment
- Use consistent left edges
- Avoid arbitrary positioning

---

## 4. Spacing System

### 4.1 Scale

Use ONLY this spacing scale:

```

4px, 8px, 12px, 16px, 24px, 32px, 48px

```

---

### 4.2 Rules

- Component internal spacing: 8–16px
- Between components: 16–24px
- Between sections: ≥ 32px

---

### 4.3 Prohibitions

- No random spacing values
- No inconsistent spacing within same component type

---

## 5. Typography

### 5.1 Hierarchy

- Page Title: 24–32px
- Section Title: 16–18px
- Body: 14px
- Supporting text: muted, smaller or equal to body

---

### 5.2 Rules

- Titles must be visually dominant
- Avoid excessive font sizes
- Do not mix too many font weights

---

## 6. Color System

### 6.1 Rules

- Neutral-first palette (gray scale)
- Maximum ONE accent color
- Use color for:
  - primary action
  - status (success, error, warning)

---

### 6.2 Prohibitions

- No decorative colors
- No gradients unless explicitly required
- No multiple competing accent colors

---

## 7. Component System

### 7.1 Library Constraint

- MUST use shadcn/ui components
- No custom components unless explicitly required

---

### 7.2 Composition Rule

- Compose from existing primitives
- Do not recreate existing patterns

---

## 8. Inline vs Block Rules (Critical)

### 8.1 Inline Content

Short content MUST remain inline.

Correct:

```

> Text here
> [icon] Label

```

Incorrect:

```

>

Text here

```

---

### 8.2 Prefix Rule

- Prefix elements (icons, `>`, labels) MUST stay inline
- NEVER place prefix on its own line

---

### 8.3 Layout Rule

- Use horizontal layout (flex row) for:
  - icon + text
  - label + value
  - prefix + content

---

### 8.4 Block Usage

Use multiline ONLY for:

- paragraphs
- lists
- complex content

---

## 9. Interaction States (Mandatory)

Every data-driven component MUST support:

### 9.1 Loading

- Use skeletons
- NEVER use spinners alone

---

### 9.2 Empty State

- Explain why empty
- Provide clear next action

---

### 9.3 Error State

- Explain what happened
- Provide retry or recovery action

---

## 10. Visual Hierarchy Rules

- One primary action per screen
- Primary action MUST be visually dominant
- Avoid equal visual weight across elements

---

## 11. Data Display Rules

### 11.1 Tables / Lists

- Must be readable
- Adequate row spacing
- Avoid dense unreadable layouts

---

### 11.2 Content Handling

- Handle long text (truncate or wrap properly)
- Handle edge cases (empty, overflow)

---

## 12. Anti-Patterns (STRICTLY FORBIDDEN)

The following MUST NOT appear:

- Multiple competing primary actions
- समान spacing everywhere (flat UI)
- Excessive borders
- Decorative UI elements
- Random colors
- Misaligned elements
- Prefix elements on separate lines
- Arbitrary layout decisions

---

## 13. UI Smell Detection

The agent MUST detect and fix:

- Elements with equal visual weight (no hierarchy)
- Broken alignment
- Inconsistent spacing
- Detached icons/prefixes
- Overly dense or overly sparse layouts

---

## 14. Execution Process (Mandatory)

The agent MUST follow:

### Step 1 — Describe UX

- What is the goal of the screen?
- What is the primary action?

---

### Step 2 — Define Layout

- Identify sections
- Define hierarchy

---

### Step 3 — Implement UI

- Using constraints above

---

### Step 4 — Critique

Validate against:

- hierarchy
- spacing
- CTA clarity
- cognitive load
- inline vs block correctness

---

### Step 5 — Refine

- Fix all violations
- Remove all UI smells

---

## 15. Final Validation Checklist

Before completion, ALL must be true:

- Clear primary action exists
- Visual hierarchy is obvious
- Spacing is consistent
- No inline/block violations
- All states (loading/empty/error) handled
- No anti-patterns present

---

## 16. Non-Negotiable Rule

If any rule is violated:

> The UI is considered incorrect and MUST be fixed before completion.
