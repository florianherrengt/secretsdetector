Here is a clean, product-focused changelog covering Steps 1 → 4.

---

# CHANGELOG

## v0.1 — Foundation (Step 1)

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

## v0.2 — Scan Pipeline (Step 2)

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

## v0.3 — Scenarios Environment (Step 2.5)

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

## v0.4 — Product Loop (Step 3)

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

## v0.5 — Domain Qualification (Step 4)

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

## v0.6 — Detection Hardening (Step 5)

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

## v0.7 — Deduplication Foundation (Step 6)

**Made scan storage idempotent so repeated scans only add genuinely new signals**

- Added fingerprint-based suppression directly in the scan write path to prevent duplicate findings within a single scan run
- Added cross-scan fingerprint checks before insert so already-known leaks are skipped instead of being stored again
- Kept deduplication deterministic and inline in synchronous scan flow, without schema changes or background processing
- Introduced end-to-end deduplication debug flow (`/dedupe`) with stage-by-stage counts for raw findings, internal dedupe, inserted findings, and skipped known matches
- Updated product navigation/tests so dedupe behavior is visible and verifiable during normal development loops

**Outcome:**
System now maintains a clean, non-duplicative finding history that is suitable for future monitoring and change tracking.

---

## v0.8 — Async Scan Queue + Visibility (Step 7)

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

## v0.9 — Domain Sourcing (Step 8)

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

## v0.10 — Source Expansion + Debug Console (Step 9)

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

## v0.11 — Passwordless Auth + Inspectable Email (Step 10)

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

# Current State

The system now supports:

- scanning real or simulated websites
- detecting high-confidence leaks with layered validation
- storing and displaying results across async scan lifecycle states
- processing scans through an inspectable queue with retry visibility
- debugging qualification logic and deterministic scenarios
- discovering domains from external sources and feeding them into the scan pipeline
- authenticating users via passwordless magic links with inspectable local email delivery
