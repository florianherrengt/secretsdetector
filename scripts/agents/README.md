WORK IN PROGRESS

# Agent Sanity Scripts

CLI tooling produces noisy, unbounded output. These scripts act as a **filter layer** between raw tools and consuming agents — capturing, parsing, and reducing output to a minimal structured JSON signal.

## Usage

Run any script individually:

```bash
node scripts/agents/eslint.js
node scripts/agents/tsc.js
node scripts/agents/vitest.js
node scripts/agents/e2e.js
```

Or run everything at once:

```bash
node scripts/agents/sanity.js
```

### Flags

| Flag              | Description                              |
| ----------------- | ---------------------------------------- |
| `--files <paths>` | Comma-separated file list (eslint only)  |
| `--verbose`       | Include warnings and full error messages |
| `--timeout <ms>`  | Override default timeout                 |

## Output

Every script prints a single JSON object to stdout:

```json
{
  "status": "pass | fail",
  "tool": "eslint",
  "summary": "ESLint: 2 errors",
  "metrics": { "errors": 2 },
  "errors": [{ "message": "...", "file": "...", "line": 42 }]
}
```

`sanity.js` combines all results:

```json
{
  "status": "pass | fail",
  "summary": "All checks passed:\n- ESLint: 0 errors\n- TypeScript: OK\n- Unit tests: 12 passed\n- E2E: 4 passed",
  "results": {
    "eslint": { ... },
    "tsc": { ... },
    "unit": { ... },
    "e2e": { ... }
  }
}
```

## Exit Codes

- `0` — script ran successfully (even if the tool reported failures)
- `1` — script itself crashed

## Files

```
scripts/agents/
  _shared/
    runner.js      subprocess execution
    truncate.js    error limiting, ANSI stripping
    format.js      result object construction
    types.js       schema documentation
  eslint.js        ESLint
  tsc.js           TypeScript compiler
  vitest.js        unit tests
  e2e.js           Playwright E2E tests
  sanity.js        aggregator (runs all of the above)
```

## Design Rules

- Never print raw tool output
- Max 3 errors, max 200 chars per message
- No stack traces, no ANSI codes
- Deterministic — same input, same output
- No timestamps, no environment-dependent formatting
