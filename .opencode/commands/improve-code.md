Review the codebase and identify areas where we are duplicating logic that should instead reuse an existing solution.

This includes:

- Replacing custom implementations with well-maintained external libraries when appropriate
- Reusing existing internal helpers, utilities, or modules instead of rewriting similar logic
  For each finding:

1.  Explain what the current implementation is doing
2.  Identify the duplication:
    - **External duplication**: functionality that should use a library
    - **Internal duplication**: logic that already exists elsewhere in the codebase

3.  If **internal reuse**:
    - Point to the existing function/module that should be reused
    - Explain why it is a better choice (consistency, less duplication, easier maintenance)

4.  If **external library**:
    - Propose 1–3 candidate NPM packages
    - Validate each package using:

           * Weekly downloads
           * Last publish date
           * Maintenance activity (commits/issues)
           * Ecosystem adoption

    - Select the best option and justify the choice

5.  Explain the benefit of the change:
    - Reduced duplication
    - Improved maintainability
    - Better reliability / security
      Constraints:

- Prefer **reusing internal code first** before introducing new dependencies
- Do not introduce a dependency if the existing internal solution is sufficient
- Avoid trivial abstractions
- Be strict about dependency quality (no unmaintained or low-signal packages)

Output format:

- One section per finding
- Clearly label: `Internal Reuse` or `External Library`
- Keep explanations concise and technical
- Focus only on high-impact improvements
