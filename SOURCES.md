# Domain Sourcing - How to Use

## Accessing Sourcing

- **Main page**: `/source` - Select a source, preview domains, run the full pipeline
- **Debug pages**: `/debug/sources/{sourceName}` - Debug individual sources with detailed traces

## Available Sources

### CRT.sh

Finds domains from certificate transparency logs.

**How to use:**
1. Go to `/source`
2. Select "crt.sh"
3. Enter a TLD suffix (e.g., `io`, `com`, `dev`)
4. Click "Preview domains" to see what you'll get
5. Click "Run pipeline" to process and enqueue scans

**Debug endpoint:** `/debug/sources/crtsh?tld=io`

### Product Hunt

Finds domains from newly launched products on Product Hunt.

**Setup required:**
```bash
# Add to your .env file
PRODUCT_HUNT_TOKEN=your_product_hunt_api_token
```

**How to use:**
1. Get a Product Hunt API token
2. Add `PRODUCT_HUNT_TOKEN` to your `.env` file
3. Restart the server
4. Go to `/source`
5. Select "Product Hunt"
6. Enter max pages to fetch (1-20, default: 10)
7. Click "Preview domains" or "Run pipeline"

**Debug endpoint:** `/debug/sources/producthunt?maxPages=5`

## Understanding the Pipeline

When you run the pipeline, it:

1. **Fetches** entries from the source
2. **Extracts** domains from those entries
3. **Normalizes** domains (lowercase, removes www.)
4. **Deduplicates** domains within the source
5. **Qualifies** domains (filters out invalid/low-quality domains)
6. **Enqueues** scans for qualified domains

## Debugging

Use debug pages to troubleshoot issues:

### Access Debug

1. Click "Debug [Source Name]" link on the main source page
2. Or go directly to `/debug/sources/{sourceName}`

### Debug Page Shows

- **Metadata**: How many entries fetched, how many domains found, timing
- **Skipped domains**: Which domains were excluded and why
- **Final domain list**: All valid domains with "Qualify" buttons
- **Transformation trace**: For each domain:
  - Input (raw value from source)
  - Output (normalized domain)
  - Status (ok/failed/filtered)
  - Reason (if failed or filtered)

### Common Issues

**Product Hunt returns no domains:**
- Check `PRODUCT_HUNT_TOKEN` is set in `.env`
- Verify the token is valid
- Check debug page for error messages

**Domains missing after normalization:**
- Check "Skipped domains" section in debug
- Look at transformation trace for failure reasons

**Pipeline runs but no scans enqueued:**
- Check qualification results in pipeline output
- Domains may be disqualified for various reasons

## Qualify Button

On debug pages, each domain has a "Qualify" button. Clicking it:
- Opens the qualification page for that specific domain
- Shows why it was qualified or rejected
- Allows manual testing of the qualification logic

## Environment Variables

**Required for Product Hunt:**
```bash
PRODUCT_HUNT_TOKEN=your_token_here
```

Get a token from [Product Hunt API](https://api.producthunt.com/v2/docs).
