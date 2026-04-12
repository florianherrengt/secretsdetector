Here is a clean, product-focused changelog covering Steps 1 → 4.

---

# CHANGELOG

## v0.1 — Foundation

**Introduced core data model and persistence layer**

- Defined minimal entities:
  - `Domain`
  - `Scan`
  - `Finding`

- Established Zod as single source of truth for all schemas
- Derived all TypeScript types from Zod
- Implemented PostgreSQL schema using Drizzle
- Added foreign key relationships:
  - Scan → Domain
  - Finding → Scan

- Enforced strict typing and validation boundaries

**Outcome:**
System can persist scan results in a structured, type-safe way.

---

## v0.2 — Scan Pipeline

**Implemented core scanning capability for a single domain**

- Built `scanDomain(domain)` pipeline:
  - Fetch homepage
  - Extract script URLs
  - Fetch partial JS bundles
  - Run strict detection

- Implemented high-confidence detection for:
  - PEM private keys
  - JWT tokens
  - Credential URLs

- Added redaction for all detected secrets
- Generated deterministic fingerprints for findings
- Introduced early-exit logic for efficiency

**Outcome:**
System can detect real credential leaks from a single domain with high precision.

---

## v0.3 — Scenarios Environment

**Added deterministic local environment for testing and debugging**

- Introduced `/scenarios/*` routes
- Implemented controlled leak scenarios:
  - PEM key leak
  - JWT leak
  - Credential URL leak
  - No-leak case
  - Multi-script case

- Served real HTML + JS bundles to simulate production websites
- Ensured scanner runs against scenarios without special-casing

**Outcome:**
Reliable, reproducible environment for validating detection and debugging the pipeline.

---

## v0.4 — Product Loop

**Connected pipeline, database, and UI into a working application**

- Implemented manual scan flow:
  - Input domain → run scan → store results → render page

- Added routes:
  - `GET /` — domain input form
  - `POST /scan` — triggers scan
  - `GET /scan/:id` — displays results

- Persisted:
  - domains
  - scans (pending → success/failed)
  - findings

- Built server-rendered pages:
  - input page
  - scan results page

- Enforced validation at all boundaries (Zod)

**Outcome:**
End-to-end product loop is functional. Users can scan a domain and view results.

---

## v0.5 — Domain Qualification

**Introduced pre-scan filtering logic for pipeline use**

- Implemented `qualifyDomain(domain)`:
  - homepage fetch
  - HTML validation
  - `<script>` presence check
  - parking page detection
  - minimum size filter

- Added structured output:
  - `isQualified`
  - human-readable `reasons`

- Built internal debug tool:
  - `GET /qualify` (query-driven, shareable via `?domain=`)
  - `POST /qualify` (normalizes then redirects to shareable GET URL)
  - displays qualification result and reasons

- Explicit separation of scan modes:
  - Manual scans → always run
  - Pipeline scans → must qualify first

**Outcome:**
System can filter out low-quality domains before scanning, preparing for scalable ingestion.

---

## v0.6 — Detection Hardening

**Expanded leak detection coverage while preserving precision**

- Strengthened `scanDomain` detection with layered validation:
  - pattern match
  - entropy threshold (for generic tokens)
  - positive context requirement
  - negative context rejection
  - explicit allowlist suppression

- Added entropy-based filtering for generic candidate tokens
- Added context window validation to favor security-relevant signals (`token`, `secret`, `auth`, `password`, `apiKey`) and reject noisy contexts (`analytics`, `measurement`, `tracking`, `public`, `example`)
- Added allowlist checks for known safe/public identifiers (for example publishable keys and analytics IDs)

- Expanded scenario fixtures and tests for confidence and false-positive control:
  - valid generic token detection
  - short token rejection
  - publishable key suppression
  - analytics identifier suppression
  - weak-context high-entropy value suppression

- Preserved existing redaction behavior so raw secret values are never exposed in snippets

**Outcome:**
System detects more real frontend leaks while maintaining high-confidence, low-noise findings.

---

## v0.7 — Deduplication Foundation

**Made scan storage idempotent so repeated scans only add genuinely new signals**

- Added fingerprint-based suppression directly in the scan write path to prevent duplicate findings within a single scan run
- Added cross-scan fingerprint checks before insert so already-known leaks are skipped instead of being stored again
- Kept deduplication deterministic and inline in synchronous scan flow, without schema changes or background processing
- Introduced end-to-end deduplication debug flow (`/dedupe`) with stage-by-stage counts for raw findings, internal dedupe, inserted findings, and skipped known matches
- Updated product navigation/tests so dedupe behavior is visible and verifiable during normal development loops

**Outcome:**
System now maintains a clean, non-duplicative finding history that is suitable for future monitoring and change tracking.

---

## v0.8 — Async Scan Queue + Visibility

**Moved scan execution into an asynchronous queue with first-class operational visibility**

- Converted manual scan flow to non-blocking execution: submit domain, create pending scan, enqueue job, redirect immediately to scan details
- Introduced a single BullMQ-backed `scanQueue` worker path that reuses existing qualification/detection/deduplication behavior while updating scan lifecycle states (`pending` -> `success`/`failed`)
- Added resilient job processing with explicit failure propagation so queue failures are visible and actionable instead of silent
- Preserved per-scan finding visibility even when fingerprints were seen previously, while keeping global deduplication semantics for new-signal accounting
- Added async-aware scan result UX with pending/failed/success states and server-driven auto-refresh until completion
- Exposed Bull Board at `/admin/queues` to inspect payloads, status transitions, errors, and retry failed jobs
- Expanded end-to-end coverage for async completion and repeated leak scans to prevent regressions in queued mode

**Outcome:**
The product is now non-blocking, observable, and operationally debuggable, making it ready to handle higher scan volume with clear runtime insight.

---

## v0.9 — Domain Sourcing

**Added inspectable domain ingestion pipeline with pluggable source registry**

- Built end-to-end source pipeline: fetch domains → extract → normalize → deduplicate → qualify → enqueue
- Introduced pluggable `DomainSourceDefinition` registry so new sources can be added without modifying shared pipeline logic
- Implemented first source: crt.sh Certificate Transparency logs, queryable by TLD with safe single-request usage
- Added domain preview mode to inspect raw fetched domains before committing to a full pipeline run
- Each domain in preview links directly to the qualification debug page for one-click inspection
- Pipeline result page renders full stage-by-stage debug output: fetch counts, normalization, deduplication, qualification pass/reject with reasons, enqueue status, and enqueue errors
- Enqueue failures are captured and displayed individually with domain and error message — nothing fails silently

**Outcome:**
The system can now discover and ingest domains from external sources, filter them through qualification, and feed them into the scan queue — all with full debug visibility and a clean extension path for future sources.

---

## v0.10 — Source Expansion + Debug Console

**Expanded domain ingestion beyond CT logs and added a dedicated source-level debugging workflow**

- Added Product Hunt as a second ingestion source, turning the sourcing pipeline into a true multi-source system
- Introduced source-specific input handling so each source can expose tailored controls while staying inside one shared product flow
- Added a dedicated source debug console (`/debug/sources/:source`) for query-driven, repeatable source troubleshooting
- Exposed end-to-end source traces in the debug UI, including fetched counts, normalization outcomes, skips, and timing
- Linked sourcing and debug experiences so operators can move directly from source selection to deep diagnostics
- Added source-focused end-to-end coverage to keep source selection, debug routing, and source-specific inputs stable over time

**Outcome:**
The product now supports multi-source ingestion with a first-class debug surface, making external source onboarding and operational troubleshooting faster and safer.

---

## v0.11 — Passwordless Auth + Inspectable Email

**Added magic link authentication with a fully debuggable email layer**

- Introduced pluggable email system:
  - `EmailProvider` interface with mock and SES implementations
  - Mock provider stores emails in DB for local inspection
  - SES provider wraps AWS SDK for production delivery
  - Provider selected automatically by environment

- Implemented passwordless authentication:
  - Magic link flow: request link → receive email → verify token → create session
  - Cryptographic token generation with SHA-256 hashing (tokens never stored raw)
  - One-time tokens with 15-minute expiry, atomic consumption via `UPDATE...RETURNING`
  - Server-side sessions with 30-day expiry stored in PostgreSQL
  - Secure cookie handling (HttpOnly, SameSite=Lax, conditional Secure flag)

- Added debug tooling for local development:
  - `GET /debug/emails` — inspect all mock emails
  - `POST /debug/emails/clear` — reset state
  - `GET /auth/whoami` — verify current session

- Protected sensitive routes with `requireAuth` middleware:
  - `/scan/*` and `/admin/queues` now require authentication

- Built comprehensive security test suite:
  - Token replay, forgery, tampering, and fuzz rejection
  - Parallel replay (race condition) prevention
  - Session isolation and enumeration protection
  - 14-character token fuzzing across edge cases

**Outcome:**
The system now has production-ready passwordless auth that is fully testable locally with zero external dependencies, enabling real user flows without friction.

---

## v0.12 — User Domains + Production Hardening

**Introduced personal domain tracking and hardened the scan surface for production use**

- Added user-owned domain management:
  - `GET /domains` — list all tracked domains with add form
  - `POST /domains` — add a domain (validates, normalizes, persists)
  - Each domain links directly to scan via existing pipeline

- Hardened scan endpoint with rate limiting and concurrency control:
  - Per-IP sliding window rate limiting (configurable)
  - Global in-flight request cap to prevent queue flooding
  - Removed auth gate from `/scan` to allow anonymous scans with abuse protection

- Unified e2e auth infrastructure:
  - Shared `createAuthenticatedSession` helper with magic-link flow
  - Reusable `authed` fixtures (`authHeaders`, `authedPage`) for all protected-route tests
  - Migrated all existing e2e suites to shared helpers, eliminating duplicated auth plumbing

**Outcome:**
Users can now build a personal watchlist of domains they care about, and the scan endpoint is safe for unauthenticated production traffic. All e2e tests share a single auth foundation.

---

## v0.13 — Distributed Scan Guardrails

**Hardened scan ingestion for multi-instance operation with stronger data integrity under concurrency**

- Replaced in-memory scan throttling with Redis-backed rate limiting so abuse controls now hold consistently across multiple app instances
- Unified queue and rate-limit infrastructure on a shared Redis client, reducing drift between async processing and request admission control
- Added a database-level uniqueness guarantee for domain hostnames and aligned writes to conflict-safe upsert behavior
- Removed race-prone domain creation paths in scan and dedupe flows by reusing shared scan job primitives
- Tightened finding persistence to store only genuinely new fingerprints instead of re-inserting already known signals

**Outcome:**
The product can now enforce scan guardrails and domain uniqueness reliably in distributed deployments, while keeping stored findings cleaner under concurrent traffic.

---

## v0.14 — Auth Entry Experience

**Turned authentication into a complete, user-facing entry flow from homepage to workspace**

- Added dedicated auth entry pages for both sign-in and sign-up so users can start passwordless access from explicit, stable URLs
- Upgraded homepage navigation to be session-aware: anonymous users see sign-in/sign-up actions, authenticated users get a direct path into the app
- Extended magic-link request handling to support both API and HTML form submissions, enabling a native browser flow with immediate confirmation messaging
- Updated post-verification routing so successful magic-link login lands users in the domain workspace instead of looping back to marketing/home
- Hardened shared Redis client behavior for long-lived queue and rate-limit operations to reduce request retry instability
- Expanded end-to-end coverage across auth entry navigation, auth form submission, and authenticated home-state rendering

**Outcome:**
Users can now discover authentication from the homepage, complete the magic-link request flow in-app, and arrive directly in their working domain dashboard.

---

## v0.15 — Check-Centric Detection + Explainable Results

**Re-architected scanning around explicit checks so detections are modular, attributable, and easier to evolve over time**

- Replaced the monolithic detector path with a pluggable built-in check registry (PEM key, JWT, credential URL, generic secret) backed by shared check schemas and execution contracts
- Upgraded scan output to carry both per-check execution results and flattened findings tagged with check identity, preserving a stable flow for persistence and queue processing
- Extended findings persistence with mandatory `check_id` and supporting indexes, enabling efficient query and deduplication behavior in the new check-aware model
- Shifted deduplication semantics from fingerprint-only to `check_id + fingerprint`, preventing cross-check collisions while keeping repeated signal suppression intact
- Evolved scan result UX from a flat findings list to check-level status visibility and grouped findings, so users can immediately see what detector class triggered each issue
- Hardened autonomous improvement-loop tooling with strict input normalization, safe output serialization, and expanded test coverage for more reliable long-running automation

**Outcome:**
The product now provides check-attributed leak detection with stronger data integrity and clearer operator visibility, while creating a stable architecture for adding and iterating detectors independently.

---

## v0.16 — Design System + Unified UI

**Introduced a semantic design system and refactored all pages into a consistent, professional interface**

- Established a tokenized color system with semantic names (background, foreground, muted, card, border, primary, success, warning, error) supporting automatic light/dark mode
- Built reusable UI primitives following shadcn conventions: StatusBadge, Section, ScanCard, Divider — all with consistent spacing, subtle borders, and restrained status colors
- Refactored scan result page into three clear sections (Scan Summary, Checks Overview, Detailed Findings) with responsive grid layout and computed duration display
- Applied the design system uniformly across all pages: home, auth, domains, sourcing, source debug, dedupe, and qualification
- Standardized status representation with color-coded badges (success=green, failed=red, running=blue, idle=gray) replacing raw text labels
- Ensured Checks Overview and Detailed Findings only render after scan completion, with unit tests guarding the visibility contract
- Removed all hardcoded gray/red utility classes in favor of semantic tokens for maintainability and theme consistency

**Outcome:**
Every page in the product now shares a single design language with proper hierarchy, accessible contrast, and dark mode support — making future UI work deterministic and visually consistent.

---

## v0.17 — CI Pipeline

**Added automated validation that runs lint and tests on every push and pull request**

- Introduced a single GitHub Actions workflow triggered on all push and pull request events
- Runs ESLint and Vitest sequentially on Node.js 20 with deterministic dependency installation via `npm ci`
- Fails immediately on lint or test errors, preventing regressions from reaching the main branch

**Outcome:**
Every code change is now automatically verified in a clean environment, establishing a reliable quality gate before merge.

---

## v0.18 — Design System Enforcement + Deterministic Demo Actions

**Locked frontend consistency into CI and removed client-side fragility from demo scan actions**

- Added a design-system enforcement layer through custom ESLint rules, policy validation, and scoped frontend lint execution
- Extended core lint configuration to enforce semantic UI constraints (approved tokens, no raw semantic styling drift, safe classname composition, suppression formatting)
- Integrated design-system enforcement into CI so pull requests now fail when frontend code diverges from the approved design system contract
- Added dedicated enforcement documentation and test coverage to keep policy behavior explicit and regression-resistant
- Made demo scan actions deterministic by rendering sandbox scan targets directly in initial HTML instead of relying on runtime script mutation
- Added integration coverage for homepage and sandbox example pages to guarantee demo "Scan with tool" works without client-side JavaScript

**Outcome:**
Frontend consistency is now continuously enforced by automation, and demo scan flows are reliable from first render across environments with or without inline script execution.

---

## v0.19 — Productized Scan Investigation Flow

**Evolved scan results from a debug-oriented output into a structured investigation surface with deterministic severity and triage signals**

- Rebuilt the scan result experience around a clear operator flow: breadcrumb context, global status banner, compact summary, rerun action, and grouped check outcomes
- Introduced deterministic severity scoring and classification contracts at both check and global levels, so issue prioritization is consistent across runs
- Shifted check rendering to fail-first expandable containers with finding-level drill-down, enabling faster path from scan completion to concrete issue review
- Standardized result language and presentation semantics (`Issue Detected` / `No Issues Found`, issue-count grammar, `<1s` duration handling, clickable target URL, monospace evidence fields)
- Updated scan route view-model shaping to emit the richer check/finding contract required by the new product UI while preserving unknown-check visibility
- Promoted design-system enforcement from a temporary "phase" naming model to a stable product policy surface across lint scripts, CI workflow naming, docs, and test suites

**Outcome:**
Security scan output now supports reliable triage and repeatable investigation in one page, while UI policy enforcement is packaged as a durable, first-class quality gate.

---

## v0.20 — Scan Fidelity Fix + Modular Checks

**Fixed silent finding suppression on repeat scans and modularized the detection layer**

- Fixed scan persistence so each scan records its own findings independently — previous cross-scan deduplication was incorrectly suppressing all findings on re-scan of known domains
- Decomposed the monolithic checks module into a dedicated `checks/` package with separate contracts, registry, shared utilities, and per-check implementations
- Added end-to-end coverage for every demo example card on the homepage (PEM key, JWT, credential URL, clean baseline, multi-script leak)
- Updated e2e assertions to match the current result UI semantics and added rate-limit resilience for reliable local test runs

**Outcome:
Every scan now reliably surfaces its findings regardless of prior scan history, and the detection architecture is organized for independent check iteration.**

---

## v0.21 — Pending Scan Result Experience

**Turned in-flight scans into a dedicated live state so operators can monitor progress without interim noise**

- Added a scan-result pending mode with automatic refresh and explicit in-progress messaging while jobs are still running
- Split pending and completed rendering paths so investigation-only signals (global severity, duration, rerun action) appear only after results exist
- Preserved key run context during execution (target URL and start timestamp) so users can confirm what is being processed in real time
- Added contract coverage to lock visibility rules for pending scans and prevent regressions in state transitions

**Outcome:**
Users can now open scan results immediately after submission, watch progress clearly, and move into triage only when complete data is available.

---

## v0.22 — Environment Variable Key Leak Detection

**Added a new detection check for known sensitive environment variable key names inlined into client-side bundles**

- Introduced `env-var-key` check: detects when build tools leak sensitive env var keys as JavaScript identifiers with hardcoded string values (e.g., `AWS_SECRET_ACCESS_KEY = "AKIA..."`)
- Curated a list of ~55 known sensitive key names (AWS, Azure, database URLs, API tokens, etc.) with an implausible-value blocklist to suppress placeholder noise
- Detects both `=` assignment and `:` object-property forms, case-insensitive, with identifier-boundary guards to prevent partial matches
- Filters out non-leak patterns: `process.env.` references, function/variable assignments, template literals with interpolation, and implausible values like `"test"` or `"changeme"`
- Added positive and negative sandbox scenarios with integration tests
- Added "Environment variable key leak" to the homepage demo examples

**Outcome:**
The scanner now catches an additional class of frontend misconfiguration — build tools inlining real secret-bearing environment variable names — complementing existing value-based detection.

---

## v0.23 — LocalStorage JWT/Token Storage Detection

**Added a new detection check for tokens and JWTs written to localStorage in client-side JavaScript**

- Introduced `localstorage-jwt` check: detects unsafe persistence of tokens/JWTs via `localStorage.setItem()` and `localStorage["key"] = value` patterns
- Detects three sink variants: `localStorage`, `window.localStorage`, `globalThis.localStorage`
- Three triggering rules:
  - Token-like key names (token, jwt, access_token, refresh_token, id_token, auth_token, session_token, bearer_token) — case-insensitive, hyphen/underscore normalized
  - JWT literal values (3-segment base64url strings starting with `eyJ`) regardless of key name
  - Token-like value identifiers regardless of key name
- Filters out read-only operations (`getItem`, `removeItem`, `clear`) and `sessionStorage` writes
- Filters out template literals with interpolation to avoid dynamic-value false positives
- Uses deterministic signature-based fingerprinting (sink + normalized key + value type) for stable deduplication
- Added positive and negative sandbox scenarios with integration tests
- Added "Token Storage Exposure" classification in scan result UI

**Outcome:**
The scanner now detects insecure token storage patterns in localStorage — a common OWASP-documented vulnerability — complementing existing value-based and key-based detection.

---

## v0.24 — Deterministic Scan Result UX Refresh

**Redesigned `/scan/:id` into a clearer, contract-driven investigation flow with explicit loading, failure, and empty states**

- Refactored scan result layout into deterministic page structure: `PageHeader` + sectioned content (`Scan Status`, `Scan Overview`, `Findings`, `Passed Checks`)
- Introduced reusable UI primitives for consistent composition:
  - `PageHeader`
  - `EmptyStateCard`
  - `SkeletonList`
- Added pending-state skeleton rendering (`SkeletonList`) so in-flight scans show structured loading content instead of status text alone
- Added explicit failed-scan recovery UI with actionable retry messaging and preserved `Re-run Scan` as the single dominant CTA
- Improved findings readability with clearer check grouping, severity badges, metadata labeling, and snippet overflow handling
- Updated design-system enforcement policy to allow the new primitives and kept all styling inside approved semantic tokens/classes
- Expanded `scanResult` page tests to lock the new hierarchy and state contracts (header/status sections, pending skeletons, failed recovery state)

**Outcome:**
Scan results now present a stable, high-signal triage surface with stronger UX determinism and fully covered state behavior across pending, failed, and completed runs.

---

## v0.25 — Domains UX + Safe Deletion Flow

**Reworked `/domains` into a clearer operations surface with inline health state and a reusable confirmation step**

- Moved `Add Domain` to the top to prioritize primary intent before list management
- Enriched saved-domain rows with last-check outcome badges from latest successful scan:
  - green tick for passed (no findings)
  - red cross for issues found
  - neutral state when no successful scan exists yet
- Added per-domain delete action with explicit confirmation to prevent accidental removal
- Introduced a generic confirm page (`/domains/confirm`) that accepts display text, next endpoint, and cancel target for reusable destructive-action UX
- Added deletion endpoint (`POST /domains/:domainId/delete`) with input validation and auth protection
- Expanded route coverage for new confirm/delete endpoints and kept frontend design-system enforcement green

**Outcome:**
Domain management now supports faster triage and safer cleanup, with clear scan signal visibility and a reusable confirmation mechanism for destructive actions.

---

## v0.26 — Auth Nav Component + Settings Entry

**Extracted top navigation auth actions into a reusable component with deterministic signed-in/signed-out behavior**

- Added `AuthNavActions` component to own all auth-related top-nav button rendering
- Updated shared `Layout` to delegate nav actions to `AuthNavActions` instead of inline conditional markup
- Enforced signed-out contract: show only `Sign in` (`/auth/sign-in`) and `Sign up` (`/auth/sign-up`)
- Enforced signed-in contract: show only `Settings` (`/settings`)
- Updated authenticated pages (`/domains` and confirm page) to pass `topNavMode="app"` so the signed-in nav contract renders consistently
- Added component-level contract tests covering both render modes and mutual exclusivity of actions

**Outcome:**
Top navigation behavior is now centralized, deterministic, and reusable across pages, with explicit mode-driven rendering for authentication state.

---

## v0.27 — Settings Page + Sign Out Flow

**Added `/settings` page showing account email with a working sign out button**

- Added `GET /settings` route protected by `requireAuth` middleware, rendering user email from session
- Created `SettingsPage` view using existing `Layout`, `Section`, and `ScanCard` components with design-system-compliant styling
- Updated `POST /auth/logout` to redirect form submissions to `/` (previously returned JSON only)
- Added `text-error-foreground` to design-system policy approved tokens
- Added unit test for unauthenticated access and e2e tests covering the full sign-out flow (visit settings, click sign out, redirected to home, session destroyed)
- Removed non-null assertion on `c.user` in settings route, replaced with explicit guard

---

## v0.28 — Public Source Map Exposure Detection

**Added a built-in scan check that detects publicly accessible `.map` source map files linked from production JavaScript bundles**

- Defined `sourceMapProbeSchema` and `sourceMapDiscoveryMethodSchema` in check contracts for structured source map probe results
- Extended `checkRunInputSchema` with optional `sourceMaps` array (defaults to empty) passed to all checks
- Created `public-source-map` check module (`metadata`, `detector`, `run`, `index`) following existing check conventions
- Discovery methods supported in precedence order: `SourceMap` header → `X-SourceMap` header → `//# sourceMappingURL=` inline → `//@ sourceMappingURL=` legacy inline
- Only same-origin map URLs are probed; cross-origin and `data:` URLs are rejected
- Map probe: GET with bounded timeout/bytes, accessible on any 2xx (including 206)
- Fingerprint: deterministic SHA-256 of map URL only
- `hasSourcesContent`: reports `true` if JSON has `sourcesContent` with ≥1 non-null entry, `false` if JSON parses but no content, `null` on parse failure
- Extended `fetchTextResource` in `scanDomain.ts` to return response headers alongside body and content type
- Added source map extraction, resolution, and probing pipeline to `scanDomain` flow
- Registered check in `builtinChecks` array and added to scan result classification config
- Added sandbox scenarios (`public-source-map` with inline `sourceMappingURL` + `.map` asset, `public-source-map-clean` with no reference)
- Added integration tests for both positive and negative cases

**Outcome:**
Scans now detect publicly accessible source map files that expose original source code, variable names, and file paths from production JavaScript bundles.

---

## v0.29 — Unified Demo Website for Detection Regression

**Consolidated sandbox testing and product demoing into one static vulnerable website that exercises every built-in check in a single scan.**

- Replaced the multi-scenario sandbox surface with one canonical demo endpoint (`/sandbox/demo`) served from static HTML/JS assets
- Removed legacy scenario routes and compatibility paths so the demo contract is now singular and unambiguous
- Packed all current issue patterns into one JavaScript bundle, including a linked source map, to mirror a realistic frontend leak surface
- Updated homepage demo actions and scan defaults to target the unified demo website directly
- Added deterministic build-time asset copy so demo files are always present in production build output
- Reworked regression coverage so both pipeline and e2e flows enforce that every built-in check produces findings against the demo site
- Added CI-facing parity guardrails: when a new built-in check is introduced, tests fail until the demo bundle includes a triggering payload

**Outcome:**
The product now has one reliable, production-like demo target that doubles as a strict regression harness for all built-in detectors, making check evolution safer and easier to validate.

---

## v0.30 — Severity Defaults for Check-Level Findings

**Improved scan result severity classification when findings do not yet carry explicit per-finding severity values.**

- Added a deterministic `defaultSeverityLevelByCheckId` mapping in scan result configuration
- Assigned `pem-key`, `jwt-token`, and `credential-url` to `High` by default
- Assigned `generic-secret`, `localstorage-jwt`, and `public-source-map` to `Medium` by default
- Updated severity derivation to prefer explicit finding severity when present and otherwise use the check-level default
- Preserved `Medium` as fallback for unknown checks with missing finding severity
- Added regression test coverage to enforce that `pem-key` findings without explicit severity resolve to `High (75)`

**Outcome:**
High-impact checks such as PEM private key exposure are no longer under-classified in the investigation UI when legacy/null finding severity is returned from persistence.

---

## v0.7 — Hourly Scheduled Scans

**Introduced unified scan creation and BullMQ-based hourly scheduling**

- Added `createScanForDomainId(domainId)`: single orchestration function for scan creation
  - Creates pending scan record, enqueues job, handles enqueue failures
  - Replaces scattered create+enqueue+fail patterns across codebase
- Switched queue contract from `{ domain }` to `{ domainId }`
  - Worker resolves domain from DB via `getDomainById`
  - Missing/deleted domains fail gracefully (return without throwing)
- Added BullMQ job scheduler (`upsertJobScheduler`) with cron pattern `0 * * * *`
  - Fires every hour on the hour for all domains in the database
  - Separate `schedulerQueue` with its own worker
- Refactored manual scan route and sources pipeline to use shared `createScanForDomainId`
- Scheduler `dispatchScans` continues on per-domain errors instead of fail-fast

**Outcome:**
All scan creation paths (manual, scheduled, source pipeline) now go through a single function. Hourly scans run automatically for every tracked domain via BullMQ's built-in cron scheduling.
