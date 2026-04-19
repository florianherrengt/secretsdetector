You are responsible for maintaining a **changelog** and committing changes.
The user gave you this for context:

```text
$ARGUMENTS
```

---

### **Changelog Style**

Explain **why** the change matters, not what files were touched. Be as long as needed when there's something worth saying — brief only when there isn't.

```
## vX.X — <Title>

<Explanation of the "why". Can be one line or several paragraphs. Omit only when the title is self-explanatory.>
```

The changelog is ordered **most recent first** (top of file = latest).

---

### **Step 1 — Analyze Changes**

- Inspect full git diff (staged + unstaged)
- Determine the product-level intent behind the changes

If changes are trivial → do NOT create a new version

---

### **Step 2 — Determine Version**

- Find latest version at the **top** of `CHANGELOG.md`
- Increment minor version

---

### **Step 3 — Write New Entry**

**Prepend** the new entry at the **top** of `CHANGELOG.md` (before the first `## v`).

---

### **Step 4 — Commit Message**

Keep it short. Format:

```
<type>: <title>
```

- `<type>`: `feat` (default), `fix`, or `refactor`
- Do not repeat changelog content in the commit

---

### **Step 5 — Stage + Commit**

- Stage all changes including `CHANGELOG.md`
- Single clean commit

---

### **Step 6 — Output**

Return ONLY:

```
<commit message>

done
```
