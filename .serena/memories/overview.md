# Project Overview

Secret Detector - a system that finds exposed secrets on real websites.

## Tech Stack
- Hono (HTTP framework, server-rendered JSX)
- Drizzle ORM + PostgreSQL
- BullMQ + Redis (async scan queue)
- Zod (validation, type derivation)
- Tailwind CSS (via browser CDN)
- Vitest (unit tests), Playwright (e2e)

## Architecture
- Server-rendered only, no client frameworks
- JSX as templating DSL (hono/jsx)
- Zod schemas are single source of truth for all types
- Views are pure functions: input → JSX → HTML
- Pipeline pattern: fetch → extract → detect → persist

## Project Structure
```
src/server/app.ts         - entry point
src/server/routes/        - Hono route handlers
src/server/db/            - Drizzle schema + client
src/server/scan/          - BullMQ queue, worker, job logic
src/pipeline/             - Domain qualification, scanning logic
src/schemas/              - Zod schemas for domain, scan, finding
src/views/                - JSX pages + layout
src/lib/                  - render helper
drizzle/                  - DB migrations
```

## Key Patterns
- Routes: Zod parse request → execute logic → render typed view
- All functions wrapped with z.function() for validation
- DB dedup via hostname lookup on domains table
- Scan queue: enqueue with UUID jobId, worker resolves scan record
