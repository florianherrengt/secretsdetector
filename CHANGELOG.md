# CHANGELOG

## v0.1.12 — Localized Scan Result Timestamps

Render `<time datetime>` elements with raw ISO values, reformatted client-side by `format-local-dates.js` using browser Intl APIs. Removed server-side `formatTimestampUtc` and orphaned `formatDate` utility.

---

## v0.1.11 — Global Vitest Redis Setup

Added `vitest.setup.ts` to wait for Redis readiness before any test runs, removing per-file workarounds.

---

## v0.1.10 — Docs Consolidation & Date Formatting

Moved project docs under `docs/`, condensed AGENT.md to an index, added `formatDate` helper with tests.

---

## v0.1.9 — E2E Test Assertion Fixes

Updated stale e2e locators and assertions to match current UI structure.

---

## v0.1.8 — E2E Tests on CI

Added Playwright E2E CI job with Chromium, DB migrations, artifact uploads, and rate-limit bypass.

---

## v0.1.7 — Unified SMTP Email

Replaced SES/Resend with a single `SMTPEmailProvider`, removed AWS SDK dependency, auto-fallback to mock in dev/test.

---

## v0.1.6 — Pin Infrastructure Versions

Pinned PostgreSQL 17.2 and Redis 7.2 across docker-compose, CI, and smoke tests.

---

## v0.1.5 — CI Migration Bootstrap

Added explicit migration step to CI after install so test tables exist before suites run.

---

## v0.1.4 — CI Service Wiring for Startup Migrations

Added PostgreSQL/Redis services to Docker publish smoke tests with host-gateway networking.

---

## v0.1.3 — Automatic DB Migrations on Boot

Added Drizzle migration execution at startup before workers/scheduler, with failure exit handling.

---

## v0.1.2 — CI Test Reliability

Added PostgreSQL/Redis service containers to CI, excluded `/healthz` from rate limiter, fixed module resolution.

---

## v0.1.1 — Production Docker & CI Pipeline

Multi-stage Dockerfile (Node 25, non-root), multi-arch Docker Hub publish on merge, smoke test script.

---

## v0.38 — Public Scan Guardrails + Deep Bundle Coverage

Browser fingerprint submission for public scans, IP/user rate limiting, redirect trust boundaries, merged head+tail evidence capture for large bundles.

---

## v0.37 — Scan Evidence Transparency + Sitemap Signal

Per-subdomain scanned-asset evidence in results, new missing-sitemap security check, extended coverage contracts.

---

## v0.36 — Subdomain Discovery + Scan Surface Hardening

One-hop subdomain discovery from links/sitemaps, discovery metadata in persistence, subdomain list in scan result UX, deterministic DB prep for e2e.

---

## v0.35 — Auth Navigation Consistency + App Entry Recovery

Session-aware nav on `/scan/:id`, preserved `Go to app` shortcut for authenticated users on home, settings→workspace route.

---

## v0.34 — Static CSS Build Pipeline

Replaced CDN Tailwind with CLI build step, static `/assets/*` serving, deterministic styling across environments.

---

## v0.33 — Homepage Intake Refresh + 404 Guardrail

Scan-first homepage with dominant CTA, `Dashboard` nav for authenticated users, deterministic 404 for unknown routes.

---

## v0.32 — Admin Basic Auth Hardening

`requireBasicAuth` middleware with env-configured credentials, `/admin` landing page, Bull Board under `/admin/queues`.

---

## v0.31 — Admin Queue Route Fix

Mounted Bull Board at `/admin/queues` with regression test coverage.

---

## v0.7 — Hourly Scheduled Scans

`createScanForDomainId` orchestration, queue contract switched to `{ domainId }`, BullMQ cron scheduler (`0 * * * *`) for all tracked domains.

---

## v0.30 — Severity Defaults for Check-Level Findings

Deterministic `defaultSeverityLevelByCheckId` mapping — PEM/JWT/credential-url as High, generic-secret/localstorage-jwt/source-map as Medium.

---

## v0.29 — Unified Demo Website

Single `/sandbox/demo` endpoint exercising every built-in check, CI parity guardrails requiring new checks to include demo payloads.

---

## v0.28 — Public Source Map Exposure Detection

New `public-source-map` check: discovers `.map` files via headers/inline comments, probes same-origin maps, reports `hasSourcesContent`.

---

## v0.27 — Settings Page + Sign Out Flow

`GET /settings` with auth protection showing email, logout redirects to `/`, `text-error-foreground` token.

---

## v0.26 — Auth Nav Component + Settings Entry

`AuthNavActions` component: signed-out → Sign in/Sign up, signed-in → Settings, component-level contract tests.

---

## v0.25 — Domains UX + Safe Deletion Flow

Last-scan health badges on domain rows, delete with confirmation, reusable `/domains/confirm` destructive-action page.

---

## v0.24 — Deterministic Scan Result UX Refresh

Sectioned layout with `PageHeader`/`EmptyStateCard`/`SkeletonList`, pending skeletons, failed-scan retry UI, severity badges.

---

## v0.23 — LocalStorage JWT/Token Storage Detection

`localstorage-jwt` check: detects `localStorage.setItem`/bracket assignment with token-like keys, JWT values, or token-like value identifiers.

---

## v0.22 — Environment Variable Key Leak Detection

`env-var-key` check: ~55 sensitive key names, assignment/property patterns, implausible-value blocklist, placeholder suppression.

---

## v0.21 — Pending Scan Result Experience

Pending mode with auto-refresh, split pending/completed render paths, preserved run context during execution.

---

## v0.20 — Scan Fidelity Fix + Modular Checks

Fixed cross-scan dedup suppressing findings on re-scan, decomposed monolithic checks into `checks/` package, e2e for all demo cards.

---

## v0.19 — Productized Scan Investigation Flow

Breadcrumb context, severity scoring, fail-first expandable check containers, standardized result language and presentation.

---

## v0.18 — Design System Enforcement + Deterministic Demo Actions

Custom ESLint rules for semantic UI constraints in CI, deterministic sandbox targets rendered in initial HTML.

---

## v0.17 — CI Pipeline

GitHub Actions workflow: ESLint + Vitest on Node.js 20, triggered on push and PR.

---

## v0.16 — Design System + Unified UI

Tokenized color system (light/dark), reusable UI primitives (StatusBadge, Section, ScanCard, Divider), refactored all pages.

---

## v0.15 — Check-Centric Detection + Explainable Results

Pluggable check registry replacing monolithic detector, `check_id` on findings, check-grouped scan result UX.

---

## v0.14 — Auth Entry Experience

Dedicated sign-in/sign-up pages, session-aware homepage nav, magic-link HTML form flow, post-verification redirect to workspace.

---

## v0.13 — Distributed Scan Guardrails

Redis-backed rate limiting, shared Redis for queue+rate-limit, DB-level domain hostname uniqueness, conflict-safe upserts.

---

## v0.12 — User Domains + Production Hardening

`GET/POST /domains` for domain tracking, per-IP sliding window rate limiting, shared e2e auth infrastructure.

---

## v0.11 — Passwordless Auth + Inspectable Email

Magic link flow with SHA-256 hashed tokens, server-side sessions, pluggable email (mock/SMTP), `requireAuth` middleware, security test suite.

---

## v0.10 — Source Expansion + Debug Console

Product Hunt as second ingestion source, source-specific input handling, `/debug/sources/:source` console with traces.

---

## v0.9 — Domain Sourcing

Fetch→extract→normalize→deduplicate→qualify→enqueue pipeline, pluggable `DomainSourceDefinition` registry, crt.sh as first source.

---

## v0.8 — Async Scan Queue + Visibility

BullMQ-backed `scanQueue`, non-blocking submit, pending/success/failed states, Bull Board at `/admin/queues`.

---

## v0.7 — Deduplication Foundation

Fingerprint-based dedup in scan write path, cross-scan fingerprint checks, `/dedupe` debug flow.

---

## v0.6 — Detection Hardening

Layered validation (pattern + entropy + context + allowlist), entropy-based filtering, expanded scenario fixtures.

---

## v0.5 — Domain Qualification

`qualifyDomain` with homepage fetch, HTML/script checks, parking detection, `GET/POST /qualify` debug tool.

---

## v0.4 — Product Loop

Manual scan flow: input → scan → store → render. Routes `GET /`, `POST /scan`, `GET /scan/:id`.

---

## v0.3 — Scenarios Environment

`/scenarios/*` routes with controlled leak scenarios, real HTML+JS for deterministic testing.

---

## v0.2 — Scan Pipeline

`scanDomain(domain)` pipeline: fetch homepage, extract scripts, detect PEM keys/JWTs/credential URLs, redaction, fingerprints.

---

## v0.1 — Foundation

Core entities (Domain, Scan, Finding), Zod schemas, PostgreSQL via Drizzle, foreign key relationships.
