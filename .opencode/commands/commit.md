You are responsible for maintaining a **product-level changelog** and committing changes.
The user gave you this for context:

```text
$ARGUMENTS
```

This repository does **not** use conventional changelog formats.
It uses **versioned narrative entries** (v0.x), each describing a meaningful product milestone.

---

### **Changelog Style (STRICT)**

Each version must follow this structure:

```
## vX.X — <Step Name>

**<One-line product summary>**

- High-signal bullet points (grouped, not noisy)

**Outcome:**
<What this enables at product level>
```

Rules:

- This is **product storytelling**, not commit logs
- Focus on:
  - capabilities added
  - system evolution
  - architectural milestones

- Avoid:
  - low-level implementation details
  - file-level changes
  - obvious noise

---

### **Step 1 — Analyze Changes**

- Inspect full git diff (staged + unstaged)
- Determine:
  - what _capability_ was added or changed
  - where it fits in the product progression

If changes are trivial → do NOT create a new version

---

### **Step 2 — Determine Version**

- Find latest version in `CHANGELOG.md` (e.g. v0.5)
- Increment:
  - v0.6, v0.7, etc.

- Infer **step name** from intent (e.g. “Detection Improvements”, “Batch Pipeline”, etc.)

---

### **Step 3 — Write New Entry**

Append a new section at the bottom (after the latest version entry):

- Title: next version + step name
- Summary: one strong sentence
- Bullets:
  - grouped by theme if needed
  - no more than ~6–10 bullets

- Outcome:
  - must describe **what is now possible**

Avoid duplication with previous versions.

---

### **Step 4 — Generate Commit Message**

Format:

```
<type>: <step name>

- key capability 1
- key capability 2
```

Where:

- `<type>` is usually `feat` (default), or `fix` / `refactor` if clearly appropriate
- Keep aligned with changelog narrative

---

### **Step 5 — Stage + Commit**

- Stage all changes
- Include updated `CHANGELOG.md`
- Create a **single clean commit**

---

### **Step 6 — Verification Loop**

After commit:

- Ensure:
  - new version is correctly incremented
  - formatting matches previous entries exactly
  - no duplicate or redundant content

- If incorrect:
  - amend commit
  - retry (max 3 times)

---

### **Step 7 — Output (minimal)**

Return ONLY:

```
<commit message>

done
```

---

### **Critical Constraints**

- Do NOT switch to “Unreleased” style
- Do NOT list raw diffs
- Do NOT create multiple versions in one run
- Do NOT over-explain
- Maintain **consistent tone with existing entries**
