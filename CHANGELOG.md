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

# Current State

The system now supports:

- scanning real or simulated websites
- detecting high-confidence leaks
- storing and displaying results
- debugging qualification logic
