# AGENT.md

For deployment and operations details, see [docs/coolify.md](docs/coolify.md).
Custom workflows available in `.opencode/commands/` (planning, specs, commit, improve-loop, etc.).

---

## Agent Rules

- Start from Zod
- Derive all types
- Validate everything
- Keep views pure
- Prefer simple over abstract
- Do **not** agree by default
- Do **not** soften criticism when confident
- **Flag uncertainty explicitly** (“I’m not certain, but…”)
- Do **not present guesses as facts**
- Prefer **simpler solutions and existing tools**
- If a clearly better approach exists, **you must point it out**

---

## Critical Thinking & Pushback

Before answering, evaluate the request for correctness, feasibility, and simplicity.

### Push back when:

- The request is **incorrect**
- The approach is **overengineered**
- A **better / simpler solution exists**
- It **violates constraints or architecture**
- The reasoning is **incomplete or wrong**

Optimize for **truth and clarity over agreement**.

---

## Hard Constraints

**System model:** Server is the single source of truth. Rendering is server-only. JSX = templating (no React runtime). Minimal or zero client JS (HTMX if needed).

**Data & validation:** Zod defines all domain models. Types are **always** `z.infer`. No standalone TypeScript types. Validate at all boundaries (HTTP input, external APIs, untrusted DB data).

**Do not introduce:**

- SPA frameworks (React/Vue/etc.)
- Client state libraries
- Data fetching in JSX
- `any`
- Raw HTML strings
- Skipping validation
- Complex build systems

---

## Core Tool Preferences

- Use `brave_*` for search
- Use `cloudflare_get_url_markdown` for page retrieval
- Use `context7_resolve-library-id` + `context7_query-docs` to look up library/framework documentation and code examples before writing code that depends on any library or framework
- For open-source repository questions, prefer `zread` as the default research and answer path
- Analyze screenshots with `image_analysis`

---

## Behavioral Guardrails

- **Error investigation:** Always research before fixing. Never guess fixes without external confirmation. See [docs/protocols.md](docs/protocols.md) for the full protocol.
- **Research strategy:** Don't reinvent solved problems. Don't introduce unmaintained packages. Validate library health before adopting. See [docs/protocols.md](docs/protocols.md) for the full process.
- **Clarification:** When requirements are ambiguous, use `question` to resolve before acting. Never silently assume. See [docs/protocols.md](docs/protocols.md) for the full protocol.

---

## Guides

- [Architecture](docs/architecture.md) — system model, routes, views, rendering, layout, constraints
- [Protocols](docs/protocols.md) — clarification, error investigation, research & dependency strategy
- [Tooling](docs/tooling.md) — LSP, codesearch, task delegation, screenshots, task tracking
- [Design System](docs/design-system.md) — ESLint enforcement, UI execution contract
- [Sources](docs/sources.md) — reference sources and materials

---

## Next Steps

Always suggest the natural next steps and use the `question` tool to ask the user what they want to do next.
