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

# Current State

The system now supports:

- scanning real or simulated websites
- detecting high-confidence leaks with layered validation
- storing and displaying results
- debugging qualification logic and deterministic scenarios
