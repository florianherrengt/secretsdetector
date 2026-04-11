# Check Module Onboarding

1. Create a new folder at `src/pipeline/checks/checks/<check-id>/`.
2. Create `metadata.ts` with `id`, `name`, and `description` using `checkDefinitionSchema`.
3. Create `detector.ts` with check-specific detection logic that returns `ScriptDetection[]`.
4. Create `run.ts` that maps detections to findings and deduplicates findings.
5. Create `index.ts` that exports the check as `ScanCheck`.
6. Add the new check export to `src/pipeline/checks/registry.ts` in explicit order.
7. Add fixtures and tests for the check behavior.
