# Debug Endpoints

Diagnostic tools for development and troubleshooting. **Disabled by default** and **not authenticated**.

## Security

- **Disabled by default**: Requires `DEBUG_ENDPOINT=true`
- **No auth**: Publicly accessible when enabled
- **Production**: Do not enable in production

## Enabling

```bash
DEBUG_ENDPOINT=true npm run start
```

Or in `.env`:
```
DEBUG_ENDPOINT=true
```

## Endpoints

### Source Debug

**GET** `/debug/sources/:sourceName`

Runs a source fetch and displays detailed transformation traces.

Query params:
- `tld` (crtsh only): Filter by TLD suffix (e.g., `?tld=io`)
- `maxPages` (producthunt only): Limit pages fetched (1-20, default 10)

Examples:
```
/debug/sources/crtsh?tld=io
/debug/sources/producthunt?maxPages=5
```

Response includes:
- `fetchError`: Error message if fetch failed
- `fetchedEntries`: Number of entries fetched
- `rawDomains`: Total raw domains before normalization
- `normalizedDomains`: Unique domains after normalization
- `skippedDomains`: Domains that failed normalization
- `domains`: List of normalized domains
- `transformations`: Full transformation trace (input → output, status, reason)
- `metadata.timing`: `fetchMs`, `normalizeMs`, `totalMs`
- `metadata.skips`: Domains skipped with reasons
- `metadata.sampleRaw`: First 5 raw entries

### Mock Emails

**GET** `/debug/emails`

Returns mock emails JSON array ordered by creation date (newest first).

**POST** `/debug/emails/clear`

Clears all mock emails from the database. Returns `{ success: true }`.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG_ENDPOINT` | `false` | Enable debug endpoints |

## Test Environment

Debug endpoints are enabled in:
- E2E tests (`playwright.config.ts`)
- CI workflow (`.github/workflows/ci.yml`)
