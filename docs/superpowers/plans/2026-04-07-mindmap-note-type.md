# Mindmap Note Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `mindmap/` Anki note type that converts a nested-bullet markdown list into a balanced horizontal mindmap diagram (root in center, branches fanning left and right). Sibling of the existing `summary/` note type.

**Architecture:** Three deliverables — `mindmap/mindmap-note-type.md` (drop-in template: fields + front HTML + back HTML + embedded `<script>` + CSS), `mindmap/mindmap-sample.md` (regression fixture), and the development scratchpad `mindmap/dev-preview.html` (used during build, deleted at the end). The script runs once on card flip: cleanup Anki HTML → parse bullets to tree → layout (alternation split + asymmetric centering + leaf-driven Y placement) → render HTML divs for nodes + SVG overlay for quadratic-Bezier connectors → scrollLeft to center the hub.

**Tech Stack:** HTML, CSS (with `@media (prefers-color-scheme: dark)`), vanilla JavaScript (ES5-compatible — Anki's older WebViews on AnkiDroid don't reliably support optional chaining or template literals), SVG `<path>` for connectors. Dev loop uses `python3 -m http.server` + the Playwright MCP tools for browser-based verification, with `node --check` as a syntax fallback.

**Reference spec:** `docs/superpowers/specs/2026-04-07-mindmap-note-type-design.md`

**Coding conventions:**

- ES5 syntax only inside the `<script>` block (`var`, function expressions, no arrow functions, no template literals, no optional chaining). Anki's WebView on Android can be Chromium 70+; the safer floor is "what works in IE11-equivalent strict mode". This matches the existing `summary/summary-note-type.md`.
- Lift `cleanupAnkiHtml()` and `inline()` from `summary/summary-note-type.md` **verbatim** — same code-span placeholder convention, same regex set, same escape order.
- Use the `\u0000` sentinel convention for all placeholders (matches `summary/`).
- Use `insertAdjacentHTML('afterbegin', ...)` to inject formatted label HTML into a node `<div>`. (Functionally equivalent to assigning the inner content but plays better with security tooling. The single trusted source is the user's own Anki note — same trust model as `summary/`.)
- All `data-*` attributes serialized via `String(...)` for clarity.
- Indent: 2 spaces inside script blocks, 2 spaces inside CSS rules (matches `summary/`).

---

## File Structure

| Path | Purpose | Lifecycle |
|---|---|---|
| `mindmap/mindmap-note-type.md` | Drop-in template — fields, front HTML, back HTML+JS, CSS. Final deliverable. | Created in Task 14, never deleted. |
| `mindmap/mindmap-sample.md` | Regression fixture with 8 coverage sections + checklist. Final deliverable. | Created in Task 15, never deleted. |
| `mindmap/dev-preview.html` | Standalone HTML page for browser-based iteration. Single-file: HTML + CSS + JS + hardcoded sample data. | Created in Task 1, edited in Tasks 2–13, **deleted in Task 16**. |

The dev-preview.html is the iteration substrate for Tasks 1–13. Once the implementation is stable and visually verified, Task 14 extracts the working code into `mindmap-note-type.md` (which is structured as Anki fields + Mustache templates and is harder to iterate against directly). Task 16 deletes the scratchpad.

---

## Dev Verification Loop

For each task that produces visible output, the verification step is **either** of these (in order of preference):

1. **Browser screenshot via Playwright MCP** — `python3 -m http.server 8765` is started in Task 1 (background process). Each task calls `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost:8765/mindmap/dev-preview.html`, then `mcp__plugin_playwright_playwright__browser_take_screenshot` and visually inspects the result. If Playwright tools aren't available, run `ToolSearch` with `query: "select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_take_screenshot,mcp__plugin_playwright_playwright__browser_console_messages"` to load them.

2. **JS syntax check fallback** — if Playwright is unreachable, `node --check <(python3 -c "...")` to extract the script content from the HTML and verify it parses. This catches syntax errors but not runtime/visual bugs.

3. **Final acceptance** — Task 16 instructs the human user to paste `mindmap-sample.md` content into Anki and walk the regression checklist. The agent cannot perform this step.

---

## Task 1: Scaffold dev environment and HTML skeleton

**Files:**
- Create: `mindmap/dev-preview.html`
- Background: start `python3 -m http.server 8765` in `/mnt/c/Users/felip/Projects/anki-templates/`

- [ ] **Step 1: Create the `mindmap/` folder and the dev preview file**

```bash
mkdir -p /mnt/c/Users/felip/Projects/anki-templates/mindmap
```

Create `/mnt/c/Users/felip/Projects/anki-templates/mindmap/dev-preview.html` with this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Mindmap dev preview</title>
<style>
/* === BASE CARD STYLING (will be copied to mindmap-note-type.md later) === */
body {
  font-family: Georgia, serif;
  font-size: 16px;
  line-height: 1.7;
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
  background-color: #ffffff;
  color: #111111;
}
@media (prefers-color-scheme: dark) {
  body { background-color: #1a1a1a; color: #e8e8e8; }
}
.subject {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #888;
  text-align: center;
  margin-bottom: 10px;
}
.back-header {
  border-bottom: 1px solid #e8e8e8;
  padding-bottom: 12px;
  margin-bottom: 16px;
  text-align: center;
}
@media (prefers-color-scheme: dark) {
  .back-header { border-bottom-color: #333; }
}
.keywords {
  font-size: 12px;
  color: #777;
}
hr#answer {
  border: none;
  border-top: 1px solid #ddd;
  margin: 20px 0;
}
@media (prefers-color-scheme: dark) {
  hr#answer { border-top-color: #333; }
}

/* === MINDMAP-SPECIFIC STYLES (built up across the plan) === */
.mindmap-scroll {
  overflow-x: auto;
  padding: 8px 0;
}
.mindmap-canvas {
  margin: 0 auto;
  position: relative;
}
</style>
</head>
<body>

<div class="back-header">
  <div class="subject">DEV PREVIEW</div>
  <div class="keywords">mindmap, sample</div>
</div>

<hr id="answer">

<div class="mindmap-scroll">
  <div class="mindmap" id="mindmap-root" data-title="Photosynthesis">
- Light reactions
  - Photolysis
  - Photophosphorylation
- Calvin cycle
  - Carbon fixation
  - Reduction
  - Regeneration
- Regulation
  - Stomatal control
  - Enzyme activation
  </div>
</div>

<script>
(function() {
  // Implementation will be built up across the plan tasks.
  // For Task 1 we just verify the page loads.
  console.log("dev-preview.html loaded; mindmap-root present:",
              !!document.getElementById("mindmap-root"));
})();
</script>

</body>
</html>
```

- [ ] **Step 2: Start the dev HTTP server in the background**

Use the Bash tool with `run_in_background: true`:

```bash
cd /mnt/c/Users/felip/Projects/anki-templates && python3 -m http.server 8765
```

- [ ] **Step 3: Verify the page loads via Playwright**

Load Playwright tools if not already available:
```
ToolSearch query: "select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_take_screenshot,mcp__plugin_playwright_playwright__browser_console_messages,mcp__plugin_playwright_playwright__browser_close" max_results: 4
```

Then call:
```
mcp__plugin_playwright_playwright__browser_navigate
  url: "http://localhost:8765/mindmap/dev-preview.html"

mcp__plugin_playwright_playwright__browser_console_messages
  (no parameters)
```

Expected console output: `dev-preview.html loaded; mindmap-root present: true`.

If Playwright is unavailable or fails, fall back to:
```bash
curl -s http://localhost:8765/mindmap/dev-preview.html | head -20
```
Expected: HTML output starting with `<!DOCTYPE html>`.

- [ ] **Step 4: Commit**

```bash
cd /mnt/c/Users/felip/Projects/anki-templates && git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Add mindmap dev preview scaffold

Standalone HTML page used as the development iteration substrate
for the upcoming mindmap note type. Will be deleted once the final
mindmap-note-type.md is assembled.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add the Anki HTML cleanup pipeline

**Why:** Anki wraps user input in `<div>` tags (desktop) or `<br>` (some clients), and entity-encodes `<`, `>`, `&`. Before parsing as markdown, we have to undo all of that. The pipeline is lifted verbatim from `summary/summary-note-type.md` because the same Anki quirks apply.

**Files:**
- Modify: `mindmap/dev-preview.html` — add `cleanupAnkiHtml()` inside the `<script>` IIFE.

- [ ] **Step 1: Add the cleanup function**

Locate the `<script>` block in `mindmap/dev-preview.html`. Replace its entire body with:

```js
(function() {
  // ===== Phase 1: Cleanup =====
  // Lifted verbatim from summary-note-type.md. Anki wraps lines in <div>
  // (desktop/AnkiDroid) or <br> (older clients) and entity-encodes special
  // chars. We undo all of that to recover the plain markdown source.
  function cleanupAnkiHtml(rawHtml) {
    return rawHtml
      // Normalize line breaks — AnkiDroid wraps each line in <div>, desktop uses <br>.
      .replace(/<\/div>\s*<div[^>]*>/gi, "\n")
      .replace(/<div[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      // Strip any remaining tags.
      .replace(/<[^>]+>/g, "")
      // Decode entities. &amp; MUST be last so &amp;lt; doesn't double-decode into <.
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }

  // ===== Main =====
  var el = document.getElementById("mindmap-root");
  var rawText = cleanupAnkiHtml(el.innerHTML);
  console.log("CLEANED:", JSON.stringify(rawText));
})();
```

- [ ] **Step 2: Reload and verify the cleanup output**

Reload the page in Playwright:
```
mcp__plugin_playwright_playwright__browser_navigate
  url: "http://localhost:8765/mindmap/dev-preview.html"

mcp__plugin_playwright_playwright__browser_console_messages
```

Expected: a `CLEANED:` log line whose value contains `\n- Light reactions\n  - Photolysis\n  - Photophosphorylation\n- Calvin cycle\n  ...` — each bullet on its own line, indentation preserved, no `<div>` or `&` artifacts.

- [ ] **Step 3: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Add Anki HTML cleanup pipeline to mindmap

Lifted verbatim from summary-note-type.md. Recovers plain-text
markdown from Anki's HTML-wrapped storage on every client.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add the bullet-tree parser

**Why:** Convert the cleaned text into a `{label, children, depth}` tree. Indent depth (with tabs normalized to 4 spaces) determines the parent. Empty bullets and non-bullet lines are skipped.

**Files:**
- Modify: `mindmap/dev-preview.html` — add `parseTree()` inside the IIFE, after `cleanupAnkiHtml()`.

- [ ] **Step 1: Add the parser**

Inside the IIFE in `dev-preview.html`, add this function **after** `cleanupAnkiHtml()` and **before** the `// ===== Main =====` marker:

```js
  // ===== Phase 2: Parse =====
  // Indented bullets → tree of { label, children, depth }.
  // - Skips lines that aren't bullets (regex match fails).
  // - Skips empty bullets (label after the marker is whitespace-only).
  // - Tab indents are normalized to 4 spaces before depth comparison.
  // - Each new node attaches to the deepest open ancestor whose indent is < its own.
  function parseTree(text, rootLabel) {
    var root = { label: rootLabel, children: [], depth: 0 };
    var stack = [{ indent: -1, node: root }];
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(\s*)[-*]\s+(.*)$/);
      if (!m) continue;
      var label = m[2].trim();
      if (!label) continue;
      var indent = m[1].replace(/\t/g, "    ").length;
      var node = { label: label, children: [], depth: 0 };
      while (stack[stack.length - 1].indent >= indent) stack.pop();
      var parent = stack[stack.length - 1].node;
      node.depth = parent.depth + 1;
      parent.children.push(node);
      stack.push({ indent: indent, node: node });
    }
    return root;
  }
```

Then **replace** the `// ===== Main =====` block with:

```js
  // ===== Main =====
  var el = document.getElementById("mindmap-root");
  var rawText = cleanupAnkiHtml(el.innerHTML);
  var title = el.getAttribute("data-title") || "(untitled)";
  var tree = parseTree(rawText, title);
  console.log("TREE:", JSON.stringify(tree, null, 2));
```

- [ ] **Step 2: Reload and verify the tree shape**

```
mcp__plugin_playwright_playwright__browser_navigate
  url: "http://localhost:8765/mindmap/dev-preview.html"

mcp__plugin_playwright_playwright__browser_console_messages
```

Expected: a `TREE:` log whose JSON has `label: "Photosynthesis"` at the root, three direct children (`Light reactions`, `Calvin cycle`, `Regulation`), each with their own children. The deepest leaf should have `depth: 2`. The root has `depth: 0`, top-level branches have `depth: 1`.

- [ ] **Step 3: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Add bullet-tree parser for mindmap

Walks indented bullets with a depth stack and returns a tree of
{ label, children, depth }. Tab indents normalized to 4 spaces.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add inline formatter (lifted from summary)

**Why:** Node labels can contain `**bold**`, `*italic*`, `` `code` ``, `[links](url)`, and `~~strike~~`. The `inline()` function from `summary/summary-note-type.md` already handles all of this with the correct ordering (HTML escape → park code spans → inline substitutions → restore code spans). Lift it verbatim.

**Files:**
- Modify: `mindmap/dev-preview.html` — add `inline()` inside the IIFE.

- [ ] **Step 1: Add the inline formatter**

Inside the IIFE, add this function **immediately after** `cleanupAnkiHtml()` and **before** `parseTree()`:

```js
  // ===== Phase 1b: Inline formatter =====
  // Lifted verbatim from summary-note-type.md. Handles bold/italic/code/links/
  // strikethrough/escapes inside a single line of text. Code spans are parked
  // behind \u0000 sentinels so the link/emphasis rules can't reach inside them.
  // The _italic_ rule is intentionally omitted — it collided with snake_case.
  function inline(t) {
    // 1. Escape HTML special chars first.
    t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 2. Park code spans behind placeholders.
    var codes = [];
    t = t.replace(/`([^`]+)`/g, function(_, c) {
      codes.push("<code>" + c + "</code>");
      return "\u0000C" + (codes.length - 1) + "\u0000";
    });

    // 3. Inline substitutions. Image MUST run before link.
    t = t
      .replace(/!\[([^\]]*)\]\(((?:[^()]|\([^)]*\))+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(((?:[^()]|\([^)]*\))+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "<em>$1</em>")
      .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "<del>$1</del>");

    // 4. Restore code spans.
    return t.replace(/\u0000C(\d+)\u0000/g, function(_, idx) {
      return codes[parseInt(idx, 10)];
    });
  }
```

- [ ] **Step 2: Smoke test the inline formatter**

Append a quick console check at the bottom of the `// ===== Main =====` block (after the existing `console.log("TREE:", ...)`):

```js
  console.log("INLINE bold:", inline("hello **world** done"));
  console.log("INLINE link:", inline("see [docs](https://example.com)"));
  console.log("INLINE code:", inline("the `<div>` tag"));
```

Reload and check console:
```
mcp__plugin_playwright_playwright__browser_navigate
  url: "http://localhost:8765/mindmap/dev-preview.html"

mcp__plugin_playwright_playwright__browser_console_messages
```

Expected:
- `INLINE bold: hello <strong>world</strong> done`
- `INLINE link: see <a href="https://example.com" target="_blank" rel="noopener">docs</a>`
- `INLINE code: the <code>&lt;div&gt;</code> tag`

- [ ] **Step 3: Remove the smoke-test logs**

Delete the three `console.log("INLINE ...")` lines you just added — they're just for verification.

- [ ] **Step 4: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Add inline markdown formatter for mindmap node labels

Lifted verbatim from summary-note-type.md. Handles bold, italic,
code, links, images, and strikethrough inside a single text line.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Layout — measure & place with alternation and asymmetric centering

**Why:** Compute `(ux, uy)` in unit space for every node. The hub goes to `(0, totalUnits/2)`. Top-level branches alternate left/right by index. Each side measures its own subtree, then offsets so it's vertically centered against the other side. Each branch's children get `uy` from the leaves-drive-height recursion described in spec §7.4.

**Files:**
- Modify: `mindmap/dev-preview.html` — add `measure()`, `place()`, `propagateBranch()`, `layoutTree()` inside the IIFE.

- [ ] **Step 1: Add the layout functions**

Inside the IIFE, **after** `parseTree()` and **before** `// ===== Main =====`, add:

```js
  // ===== Phase 3: Layout =====
  var COLOR_SLOTS = 8;

  // Recursively compute "units" — leaves are 1, parents sum their children.
  function measure(node) {
    if (node.children.length === 0) {
      node.units = 1;
      return 1;
    }
    var sum = 0;
    for (var i = 0; i < node.children.length; i++) {
      sum += measure(node.children[i]);
    }
    node.units = sum;
    return sum;
  }

  // Recursively assign uy (vertical center in units) and ux (depth, signed by side).
  // - topUnits is the unit-space top edge of this node's slot.
  // - uy is the midpoint of the slot.
  // - Children fill the slot from top to bottom in declaration order.
  function place(node, topUnits, side) {
    node.uy = topUnits + node.units / 2;
    node.ux = node.depth * (side === "left" ? -1 : 1);
    var cursor = topUnits;
    for (var i = 0; i < node.children.length; i++) {
      place(node.children[i], cursor, side);
      cursor += node.children[i].units;
    }
  }

  // Propagate the top-level branch index to every descendant so they share a color.
  function propagateBranch(node, branchIndex) {
    node.branchIndex = branchIndex;
    for (var i = 0; i < node.children.length; i++) {
      propagateBranch(node.children[i], branchIndex);
    }
  }

  // Top-level orchestration: split branches by alternation, measure each side,
  // offset each side so its midpoint aligns with the hub, then place.
  function layoutTree(root) {
    var leftBranches = [];
    var rightBranches = [];
    for (var i = 0; i < root.children.length; i++) {
      propagateBranch(root.children[i], i % COLOR_SLOTS);
      if (i % 2 === 0) rightBranches.push(root.children[i]);
      else leftBranches.push(root.children[i]);
    }

    var leftUnits = 0;
    for (var i = 0; i < leftBranches.length; i++) leftUnits += measure(leftBranches[i]);
    var rightUnits = 0;
    for (var i = 0; i < rightBranches.length; i++) rightUnits += measure(rightBranches[i]);
    var totalUnits = Math.max(leftUnits, rightUnits, 1);

    var leftOffset = (totalUnits - leftUnits) / 2;
    var rightOffset = (totalUnits - rightUnits) / 2;

    var cursor = leftOffset;
    for (var i = 0; i < leftBranches.length; i++) {
      place(leftBranches[i], cursor, "left");
      cursor += leftBranches[i].units;
    }
    cursor = rightOffset;
    for (var i = 0; i < rightBranches.length; i++) {
      place(rightBranches[i], cursor, "right");
      cursor += rightBranches[i].units;
    }

    // Hub
    root.ux = 0;
    root.uy = totalUnits / 2;
    root.units = totalUnits;
    root.branchIndex = -1; // sentinel: hub has no branch family
    return root;
  }
```

- [ ] **Step 2: Wire layoutTree() into Main and verify**

Replace the `// ===== Main =====` block with:

```js
  // ===== Main =====
  var el = document.getElementById("mindmap-root");
  var rawText = cleanupAnkiHtml(el.innerHTML);
  var title = el.getAttribute("data-title") || "(untitled)";
  var tree = parseTree(rawText, title);
  layoutTree(tree);

  // Verification: log every node with its (ux, uy, branchIndex).
  function logTreeUnits(node, prefix) {
    console.log(prefix + node.label + " ux=" + node.ux + " uy=" + node.uy + " branch=" + node.branchIndex);
    for (var i = 0; i < node.children.length; i++) {
      logTreeUnits(node.children[i], prefix + "  ");
    }
  }
  logTreeUnits(tree, "");
```

Reload via Playwright and check console.

Expected output (with the dev sample of 3 top-level branches: Light reactions / Calvin cycle / Regulation):

```
Photosynthesis ux=0 uy=4 branch=-1
  Light reactions ux=1 uy=1 branch=0
    Photolysis ux=2 uy=0.5 branch=0
    Photophosphorylation ux=2 uy=1.5 branch=0
  Calvin cycle ux=-1 uy=4 branch=1
    Carbon fixation ux=-2 uy=2.5 branch=1
    Reduction ux=-2 uy=3.5 branch=1
    Regeneration ux=-2 uy=4.5 branch=1
  Regulation ux=1 uy=6 branch=2
    Stomatal control ux=2 uy=5.5 branch=2
    Enzyme activation ux=2 uy=6.5 branch=2
```

The hub has `uy = 4` (midpoint of 0..8). Light reactions and Regulation are on the right (positive ux); Calvin cycle is on the left (negative ux). The single left branch (Calvin cycle) is centered against the hub vertically thanks to the asymmetric offset.

- [ ] **Step 3: Remove the verification log**

Delete the `function logTreeUnits` definition and the call `logTreeUnits(tree, "");` — verification only.

- [ ] **Step 4: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Add mindmap layout pass

Recursive measure (leaves drive height) and place (assigns uy + ux
in unit space). Top-level branches alternate left/right; each side
is offset so its midpoint aligns with the hub.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Layout — pixel conversion and bounding box

**Why:** The unit-space coordinates from Task 5 need to become pixels, and the whole tree has to be translated so `(0, 0)` is the top-left of the canvas. We also estimate each node's rendered width here so the bounding box is accurate.

**Files:**
- Modify: `mindmap/dev-preview.html` — add `walkAll()` helper and pixel conversion in `layoutTree()`.

- [ ] **Step 1: Add the layout constants**

In `dev-preview.html`, locate `var COLOR_SLOTS = 8;` and add immediately after it:

```js
  var LEVEL_WIDTH = 140;   // px between depth levels
  var LINE_HEIGHT = 36;    // px between leaf slots
  var NODE_PAD_X = 20;     // node label horizontal padding (matches CSS later)
  var NODE_HEIGHT = 24;    // estimated node height for bbox
  var CHAR_WIDTH = 7;      // estimated px per character for label width
  var MAX_NODE_WIDTH = 220;
  var CANVAS_PAD = 16;
```

- [ ] **Step 2: Add the `walkAll` helper**

**Above** `layoutTree()`, add:

```js
  // Pre-order walk over the tree, calling cb on each node.
  function walkAll(node, cb) {
    cb(node);
    for (var i = 0; i < node.children.length; i++) walkAll(node.children[i], cb);
  }
```

- [ ] **Step 3: Add pixel conversion to `layoutTree()`**

**At the end of `layoutTree()`** (just before `return root;`), insert:

```js
    // Walk every node and convert (ux, uy) → (x, y) in pixels.
    // Also estimate width/height so the bounding box is correct.
    walkAll(root, function(n) {
      n.x = n.ux * LEVEL_WIDTH;
      n.y = n.uy * LINE_HEIGHT;
      n.width = Math.min(n.label.length * CHAR_WIDTH + NODE_PAD_X, MAX_NODE_WIDTH);
      n.height = NODE_HEIGHT;
    });

    // Bounding box across all nodes (accounting for each node's half-width).
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    walkAll(root, function(n) {
      var halfW = n.width / 2;
      var halfH = n.height / 2;
      if (n.x - halfW < minX) minX = n.x - halfW;
      if (n.x + halfW > maxX) maxX = n.x + halfW;
      if (n.y - halfH < minY) minY = n.y - halfH;
      if (n.y + halfH > maxY) maxY = n.y + halfH;
    });

    // Translate so (CANVAS_PAD, CANVAS_PAD) is the top-left of the bounding box.
    var dx = CANVAS_PAD - minX;
    var dy = CANVAS_PAD - minY;
    walkAll(root, function(n) {
      n.x += dx;
      n.y += dy;
    });

    root.canvasWidth = (maxX - minX) + CANVAS_PAD * 2;
    root.canvasHeight = (maxY - minY) + CANVAS_PAD * 2;
```

- [ ] **Step 4: Verify pixel coordinates**

Replace `// ===== Main =====` block again with a verification log:

```js
  // ===== Main =====
  var el = document.getElementById("mindmap-root");
  var rawText = cleanupAnkiHtml(el.innerHTML);
  var title = el.getAttribute("data-title") || "(untitled)";
  var tree = parseTree(rawText, title);
  layoutTree(tree);

  console.log("CANVAS:", tree.canvasWidth + "x" + tree.canvasHeight);
  walkAll(tree, function(n) {
    console.log("  " + n.label + " (" + n.x.toFixed(0) + ", " + n.y.toFixed(0) + ") w=" + n.width);
  });
```

Reload and check console. Expected: `CANVAS: ` line followed by node positions, all with `x ≥ 16` and `y ≥ 16` (CANVAS_PAD), and `canvasWidth` ≈ `2 * LEVEL_WIDTH * maxDepth + maxNodeWidth + 2 * CANVAS_PAD` (for a 3-branch tree with depth 2, roughly 600–700 px).

- [ ] **Step 5: Replace the verification log with the streamlined Main**

Replace the verification `// ===== Main =====` block with:

```js
  // ===== Main =====
  var el = document.getElementById("mindmap-root");
  var rawText = cleanupAnkiHtml(el.innerHTML);
  var title = el.getAttribute("data-title") || "(untitled)";
  var tree = parseTree(rawText, title);
  layoutTree(tree);
  // Render call comes in Task 7.
```

Leave the IIFE closing `})();` alone.

- [ ] **Step 6: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Add pixel conversion and bounding box for mindmap layout

Converts (ux, uy) → (x, y) px, estimates each node's width from
label length, computes canvas bounding box, and translates the
tree so the canvas origin is at (0, 0).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Render — DOM nodes (no styling yet)

**Why:** Walk the laid-out tree and emit one absolutely-positioned `<div>` per node. The `data-branch` and `data-depth` attributes are set so CSS in Task 8 can style them. Inline formatting is run on each label via `inline()`. The hub gets the `mindmap-hub` class.

**Files:**
- Modify: `mindmap/dev-preview.html` — add `renderMindmap()` and call it from Main.

- [ ] **Step 1: Add the render function**

Inside the IIFE, **after** `layoutTree()` and **before** `// ===== Main =====`, add:

```js
  // ===== Phase 4: Render =====
  // Helper: empty a container by removing every child.
  function clearContainer(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function renderMindmap(root, container) {
    // Outer canvas: position:relative so absolute children anchor to it.
    var canvas = document.createElement("div");
    canvas.className = "mindmap-canvas";
    canvas.style.width = root.canvasWidth + "px";
    canvas.style.height = root.canvasHeight + "px";

    // Walk and emit one div per node.
    walkAll(root, function(n) {
      var div = document.createElement("div");
      div.className = "mindmap-node" + (n === root ? " mindmap-hub" : "");
      if (n !== root) div.setAttribute("data-branch", String(n.branchIndex % COLOR_SLOTS));
      div.setAttribute("data-depth", String(n.depth));
      div.style.left = n.x + "px";
      div.style.top = n.y + "px";
      // Inject formatted label HTML. inline() output is the only HTML source
      // here; same trust model as summary-note-type.md (user owns their notes).
      div.insertAdjacentHTML("afterbegin", inline(n.label));
      canvas.appendChild(div);
    });

    clearContainer(container);
    container.appendChild(canvas);
  }
```

- [ ] **Step 2: Wire it into Main**

Replace the existing `// ===== Main =====` block with:

```js
  // ===== Main =====
  var el = document.getElementById("mindmap-root");
  var rawText = cleanupAnkiHtml(el.innerHTML);
  var title = el.getAttribute("data-title") || "(untitled)";
  var tree = parseTree(rawText, title);
  layoutTree(tree);
  renderMindmap(tree, el);
```

- [ ] **Step 3: Verify nodes appear in the browser**

```
mcp__plugin_playwright_playwright__browser_navigate
  url: "http://localhost:8765/mindmap/dev-preview.html"

mcp__plugin_playwright_playwright__browser_take_screenshot
```

Expected: a screenshot showing the canvas area with **9 visible text labels** scattered at different (x, y) positions — `Photosynthesis` near the center, then `Light reactions`, `Photolysis`, `Photophosphorylation`, `Calvin cycle`, `Carbon fixation`, `Reduction`, `Regeneration`, `Regulation`, `Stomatal control`, `Enzyme activation`. They will look like raw black text without borders or pills (styling comes in Task 8).

If the labels overlap or stack on top of each other, there's a bug in the layout pass — re-check Task 5/6 output before proceeding.

- [ ] **Step 4: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Render mindmap nodes as absolutely positioned divs

Each node becomes one div with data-branch and data-depth attributes.
Hub gets mindmap-hub class. Labels passed through inline() for
markdown formatting. No styling yet — that's the next task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: CSS — node styling and 8-color branch palette

**Why:** Style the nodes as pill-shaped labels with a colored bottom border. Each top-level branch gets one of 8 distinct colors, propagated to all descendants via `data-branch`. Hub gets larger neutral styling. Light + dark mode supported via `prefers-color-scheme`.

**Files:**
- Modify: `mindmap/dev-preview.html` — add CSS rules to the existing `<style>` block.

- [ ] **Step 1: Add the mindmap CSS rules**

Locate the comment `/* === MINDMAP-SPECIFIC STYLES (built up across the plan) === */` in the `<style>` block. **Replace** the existing rules under that comment (the `.mindmap-scroll` and `.mindmap-canvas` rules) with the full set:

```css
/* === MINDMAP-SPECIFIC STYLES === */
.mindmap-scroll {
  overflow-x: auto;
  padding: 8px 0;
}

.mindmap-canvas {
  margin: 0 auto;
  position: relative;
}

.mindmap {
  --branch-0: #2a6df4;
  --branch-1: #2ea043;
  --branch-2: #d97706;
  --branch-3: #9333ea;
  --branch-4: #dc2626;
  --branch-5: #0891b2;
  --branch-6: #db2777;
  --branch-7: #854d0e;
}

@media (prefers-color-scheme: dark) {
  .mindmap {
    --branch-0: #6aa9ff;
    --branch-1: #56d364;
    --branch-2: #f59e0b;
    --branch-3: #c084fc;
    --branch-4: #f87171;
    --branch-5: #22d3ee;
    --branch-6: #f472b6;
    --branch-7: #ca8a04;
  }
}

.mindmap-node {
  position: absolute;
  transform: translate(-50%, -50%);
  font-family: Georgia, serif;
  font-size: 14px;
  padding: 4px 10px;
  border-radius: 14px;
  border-bottom: 2px solid currentColor;
  white-space: nowrap;
  line-height: 1.2;
}

.mindmap-hub {
  font-size: 18px;
  font-weight: bold;
  color: inherit;
  border-bottom: 2px solid currentColor;
  padding: 6px 14px;
}

.mindmap-node[data-branch="0"] { border-bottom-color: var(--branch-0); color: var(--branch-0); }
.mindmap-node[data-branch="1"] { border-bottom-color: var(--branch-1); color: var(--branch-1); }
.mindmap-node[data-branch="2"] { border-bottom-color: var(--branch-2); color: var(--branch-2); }
.mindmap-node[data-branch="3"] { border-bottom-color: var(--branch-3); color: var(--branch-3); }
.mindmap-node[data-branch="4"] { border-bottom-color: var(--branch-4); color: var(--branch-4); }
.mindmap-node[data-branch="5"] { border-bottom-color: var(--branch-5); color: var(--branch-5); }
.mindmap-node[data-branch="6"] { border-bottom-color: var(--branch-6); color: var(--branch-6); }
.mindmap-node[data-branch="7"] { border-bottom-color: var(--branch-7); color: var(--branch-7); }

.mindmap-node[data-depth="3"],
.mindmap-node[data-depth="4"],
.mindmap-node[data-depth="5"],
.mindmap-node[data-depth="6"] {
  font-size: 13px;
  opacity: 0.85;
}

.mindmap-node a {
  color: inherit;
  text-decoration: underline;
}

.mindmap-node code {
  font-family: monospace;
  font-size: 12px;
  background-color: rgba(0, 0, 0, 0.06);
  padding: 0 4px;
  border-radius: 3px;
}

@media (prefers-color-scheme: dark) {
  .mindmap-node code { background-color: rgba(255, 255, 255, 0.1); }
}
```

- [ ] **Step 2: Verify styling**

```
mcp__plugin_playwright_playwright__browser_navigate
  url: "http://localhost:8765/mindmap/dev-preview.html"

mcp__plugin_playwright_playwright__browser_take_screenshot
```

Expected: each node now appears as a pill-shaped label with a colored bottom border. Specifically:
- `Photosynthesis` is large, bold, centered, with a neutral (`currentColor`) border.
- `Light reactions` and its two children (`Photolysis`, `Photophosphorylation`) are blue (slot 0).
- `Calvin cycle` and its three children are green (slot 1).
- `Regulation` and its two children are orange (slot 2).

- [ ] **Step 3: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Add mindmap node styling and 8-color branch palette

Each top-level branch gets one of 8 colors, propagated to all
descendants via data-branch. Hub stays neutral. Light + dark mode
via prefers-color-scheme. Depth-based de-emphasis for leaves.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Render — SVG connectors with quadratic Bezier paths

**Why:** Draw curved lines from each parent to each child using a single quadratic Bezier per connector. The control point at `(child.x, parent.y)` produces the classic mindmap "swoop" — the line leaves the parent horizontally and curves to meet the child horizontally. Each connector inherits the destination branch's color.

**Files:**
- Modify: `mindmap/dev-preview.html` — extend `renderMindmap()` to also build the SVG layer.

- [ ] **Step 1: Replace `renderMindmap()` with the SVG-aware version**

In the IIFE, **replace the entire `renderMindmap()` function** with this version (the `clearContainer` helper from Task 7 stays where it was — keep it):

```js
  // ===== Phase 4: Render =====
  var SVG_NS = "http://www.w3.org/2000/svg";

  function renderMindmap(root, container) {
    var canvas = document.createElement("div");
    canvas.className = "mindmap-canvas";
    canvas.style.width = root.canvasWidth + "px";
    canvas.style.height = root.canvasHeight + "px";

    // SVG layer for connectors. pointer-events: none so it never intercepts taps.
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "mindmap-edges");
    svg.setAttribute("width", root.canvasWidth);
    svg.setAttribute("height", root.canvasHeight);
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";
    canvas.appendChild(svg);

    // Walk parent → child pairs and emit one Bezier path per edge.
    function emitConnector(parent, child) {
      var startX, endX;
      if (child.x > parent.x) {
        // Right side: line leaves parent's right edge, enters child's left edge.
        startX = parent.x + parent.width / 2;
        endX = child.x - child.width / 2;
      } else {
        // Left side (mirror).
        startX = parent.x - parent.width / 2;
        endX = child.x + child.width / 2;
      }
      // Quadratic Bezier: control point at (endX, parent.y) — gives the mindmap "swoop".
      var d = "M " + startX + " " + parent.y +
              " Q " + endX + " " + parent.y +
              " " + endX + " " + child.y;
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("stroke", "var(--branch-" + (child.branchIndex % COLOR_SLOTS) + ")");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("fill", "none");
      svg.appendChild(path);
    }

    function walkConnectors(node) {
      for (var i = 0; i < node.children.length; i++) {
        emitConnector(node, node.children[i]);
        walkConnectors(node.children[i]);
      }
    }
    walkConnectors(root);

    // Walk and emit one div per node.
    walkAll(root, function(n) {
      var div = document.createElement("div");
      div.className = "mindmap-node" + (n === root ? " mindmap-hub" : "");
      if (n !== root) div.setAttribute("data-branch", String(n.branchIndex % COLOR_SLOTS));
      div.setAttribute("data-depth", String(n.depth));
      div.style.left = n.x + "px";
      div.style.top = n.y + "px";
      div.insertAdjacentHTML("afterbegin", inline(n.label));
      canvas.appendChild(div);
    });

    clearContainer(container);
    container.appendChild(canvas);
  }
```

- [ ] **Step 2: Verify connectors**

```
mcp__plugin_playwright_playwright__browser_navigate
  url: "http://localhost:8765/mindmap/dev-preview.html"

mcp__plugin_playwright_playwright__browser_take_screenshot
```

Expected: each parent is now connected to each child by a curved line. The lines leave the parent horizontally on its left or right edge, curve smoothly, and meet the child horizontally on the opposite edge. Each connector takes the destination branch's color (blue lines into the Light reactions subtree, green into Calvin cycle, orange into Regulation).

- [ ] **Step 3: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Render mindmap connectors as SVG quadratic Bezier paths

One curved path per parent→child edge. Control point at
(child.x, parent.y) gives the classic mindmap swoop. Stroke
color matches the destination branch.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Center the hub on first paint

**Why:** A wide tree will overflow the card horizontally. Without centering, the user sees the leftmost edge of the canvas — usually the leftmost leaf, not the hub. We compute `scrollLeft` so the hub sits in the middle of the visible viewport.

**Files:**
- Modify: `mindmap/dev-preview.html` — add a centering snippet to the end of the IIFE Main block.

- [ ] **Step 1: Add the centering call**

In the IIFE's Main block, **after** the `renderMindmap(tree, el);` line and **before** the closing `})();`, add:

```js
  // Center the hub horizontally in the scroll viewport on first paint.
  var scroll = document.querySelector(".mindmap-scroll");
  var hub = el.querySelector(".mindmap-hub");
  if (scroll && hub) {
    // hub.offsetLeft is its left edge inside the scroll container.
    // Add half its width to get its center, then subtract half the viewport.
    scroll.scrollLeft = hub.offsetLeft + hub.offsetWidth / 2 - scroll.clientWidth / 2;
  }
```

- [ ] **Step 2: Verify by widening the sample tree**

To make centering observable, temporarily expand the sample data so the canvas is wider than the viewport. **Edit** the inner `#mindmap-root` block in `dev-preview.html` to:

```html
  <div class="mindmap" id="mindmap-root" data-title="Photosynthesis">
- Light reactions
  - Photolysis of water molecules
  - Photophosphorylation of ADP into ATP
- Calvin cycle
  - Carbon fixation by RuBisCO
  - Reduction of 3-PGA to G3P
  - Regeneration of RuBP
- Regulation
  - Stomatal control
  - Enzyme activation
- Photosynthetic pigments
  - Chlorophyll a
  - Chlorophyll b
  - Carotenoids
  </div>
```

Reload via Playwright and screenshot.

Expected: the screenshot shows the hub (`Photosynthesis`) at the horizontal center of the visible scroll area, with branches fanning out symmetrically left and right. Without the centering code, the hub would be off to the left or right.

- [ ] **Step 3: Restore the original sample data**

Revert the `#mindmap-root` block back to the original three-branch sample (the one from Task 1) to keep subsequent tasks deterministic.

- [ ] **Step 4: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Center mindmap hub on first paint

Set scrollLeft so the hub sits in the middle of the visible scroll
viewport. Without this, wide trees show their leftmost edge first.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Edge cases — empty Mindmap, empty Title, single branch

**Why:** Spec §9 lists the failure modes that have to behave gracefully. We handle three of them here (the rest — marker normalization, empty bullets, color cycling — fall out of the existing parser code without extra work).

**Files:**
- Modify: `mindmap/dev-preview.html` — small guards in `Main` and `layoutTree()`.

- [ ] **Step 1: Empty Mindmap field**

Test the empty case first. **Temporarily** edit the `#mindmap-root` block to empty contents:

```html
  <div class="mindmap" id="mindmap-root" data-title="Photosynthesis"></div>
```

Reload via Playwright. Expected: only the hub (`Photosynthesis`) renders, centered, no branches, no SVG paths.

If an error appears in the console, check that:
- `parseTree("", title)` returns a root with `children: []` (it should).
- `layoutTree()` handles a tree with no children: `Math.max(0, 0, 1) = 1`, so `totalUnits = 1`, hub goes to `(0, 0.5)`. The walks over empty children loops do nothing. Should work as-is.
- `walkAll(root, ...)` is called once on the root, which has `width` and `height` set, so `minX/minY/maxX/maxY` are populated. Should work.

If the canvas dimensions come out smaller than the hub, add this guard at the end of `layoutTree()`, just before `return root;`:

```js
    // If there are no children, the canvas needs to be at least the hub's size.
    if (root.canvasWidth < root.width + CANVAS_PAD * 2) {
      root.canvasWidth = root.width + CANVAS_PAD * 2;
    }
    if (root.canvasHeight < root.height + CANVAS_PAD * 2) {
      root.canvasHeight = root.height + CANVAS_PAD * 2;
    }
```

Reload and verify the hub renders alone.

- [ ] **Step 2: Empty Title**

**Temporarily** edit `#mindmap-root` to:

```html
  <div class="mindmap" id="mindmap-root" data-title="">
- Light reactions
- Calvin cycle
  </div>
```

Reload. Expected: hub shows the literal `(untitled)`, two branches fan out left/right.

The fallback already exists in Main: `var title = el.getAttribute("data-title") || "(untitled)";`. Verify it works. If `data-title` is missing entirely (not just empty), `getAttribute` returns `null`, and `null || "(untitled)"` is `"(untitled)"`. Good.

- [ ] **Step 3: Single top-level branch**

**Temporarily** edit `#mindmap-root` to:

```html
  <div class="mindmap" id="mindmap-root" data-title="Hub only">
- Solo branch
  - Sub leaf
  </div>
```

Reload. Expected: hub on the left, single branch fans to the right (because index 0 → right per the alternation rule), nothing on the left side.

If the single branch ends up on the left or vertically off-center, re-check the asymmetric centering logic in Task 5.

- [ ] **Step 4: Restore the original sample**

Restore `#mindmap-root` to the three-branch sample from Task 1.

- [ ] **Step 5: Commit**

```bash
git add mindmap/dev-preview.html && git commit -m "$(cat <<'EOF'
Handle mindmap edge cases — empty mindmap, empty title, single branch

Guards canvas size when there are no children, falls back to
'(untitled)' when data-title is missing, and verifies the
single-branch case fans to the right.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Visual stress test — deep nesting and color cycling

**Why:** Two more behaviors from spec §9 need explicit verification: trees with depth ≥ 3 (CSS de-emphasis kicks in) and trees with > 8 top-level branches (color palette cycles). No code changes — just visual verification.

**Files:**
- Modify: `mindmap/dev-preview.html` — temporarily change the sample data, then revert.

- [ ] **Step 1: Three-level deep tree**

**Temporarily** edit `#mindmap-root` to:

```html
  <div class="mindmap" id="mindmap-root" data-title="Biology">
- Cell biology
  - Membrane transport
    - Passive
    - Active
  - Cell signaling
    - Receptors
    - Second messengers
- Genetics
  - Mendelian
    - Dominant
    - Recessive
  - Molecular
    - Replication
    - Transcription
  </div>
```

Reload. Expected: the depth-3 leaves (`Passive`, `Active`, `Receptors`, …) render slightly smaller and faded compared to the depth-2 nodes. Connectors between depth-2 and depth-3 are visible. No overlap between sub-subtrees.

- [ ] **Step 2: 10-branch color cycling tree**

**Temporarily** edit `#mindmap-root` to:

```html
  <div class="mindmap" id="mindmap-root" data-title="Many branches">
- Branch 1
- Branch 2
- Branch 3
- Branch 4
- Branch 5
- Branch 6
- Branch 7
- Branch 8
- Branch 9
- Branch 10
  </div>
```

Reload. Expected: 10 branches alternating left/right. Branches 1–8 use distinct colors (slots 0–7). Branches 9 and 10 cycle back to slots 0 and 1 (blue and green again). No errors in the console.

- [ ] **Step 3: Restore the original sample**

Revert `#mindmap-root` to the three-branch sample from Task 1.

- [ ] **Step 4: No commit needed — verification only**

Tasks 11 and 12 verified existing behavior and (in Task 11) added a small canvas-size guard that was already committed in Task 11. Skip the commit step here.

---

## Task 13: Validate inline formatting in node labels

**Why:** Labels can contain inline markdown. Verify it actually works end-to-end (parser → label → inline() → DOM).

**Files:**
- Modify: `mindmap/dev-preview.html` — temporarily change sample data.

- [ ] **Step 1: Sample with inline formatting**

**Temporarily** edit `#mindmap-root` to:

```html
  <div class="mindmap" id="mindmap-root" data-title="Inline test">
- **Bold** branch
  - *Italic* leaf
  - `code` leaf
- [Link](https://example.com)
  - ~~Struck~~ leaf
  - ***Bold italic*** leaf
  </div>
```

Reload via Playwright and screenshot.

Expected:
- `**Bold** branch` renders with **Bold** in heavier weight.
- `*Italic* leaf` shows *Italic* in italics.
- `` `code` leaf `` shows `code` in monospace with subtle background.
- `[Link](https://example.com)` renders as an underlined clickable link.
- `~~Struck~~ leaf` shows Struck with a line through it.
- `***Bold italic***` renders as both bold and italic.

If anything renders as literal markdown syntax (e.g. asterisks visible), `inline()` isn't being called or the label is being escaped twice.

- [ ] **Step 2: Restore the original sample**

Revert `#mindmap-root` to the three-branch sample from Task 1.

- [ ] **Step 3: No commit needed — verification only**

Skip the commit step.

---

## Task 14: Assemble `mindmap-note-type.md`

**Why:** Tasks 1–13 built and visually verified the implementation in `dev-preview.html`. Now assemble the final deliverable in the format Anki expects: a markdown file with named code blocks for the front template, back template, and CSS.

**Files:**
- Create: `mindmap/mindmap-note-type.md`

- [ ] **Step 1: Create the file with the documented template**

Create `/mnt/c/Users/felip/Projects/anki-templates/mindmap/mindmap-note-type.md` with this content. Note the two `[[INSERT ...]]` markers in the Back Template and Styling sections — Step 2 fills them in:

````markdown
# Mindmap Note Type

A drop-in Anki note type that converts a markdown nested-bullet list into a balanced horizontal mindmap diagram (root in the center, branches fanning left and right).

Sibling of the **Summary** note type — same field shape, same typography, same Anki HTML cleanup pipeline. A note can be converted between the two by changing only the note type.

## Fields

1. `Title`
2. `Subject` (optional)
3. `Keywords` (optional)
4. `Mindmap` (nested-bullet markdown — `-` or `*` markers, indent for nesting)

## What's supported in the Mindmap field

- Nested bullets at any depth (`-` and `*` are interchangeable; tabs normalize to 4 spaces)
- Inline markdown inside each bullet's label: `**bold**`, `*italic*`, `***bold italic***`, `` `code` ``, `[link](url)`, `~~strike~~`
- Up to 8 top-level branches with distinct colors; more cycle through the same palette

## What's not supported

- Block-level markdown inside a label (paragraphs, fenced code, headings, lists nested inside a label, images, tables, blockquotes). Node labels are single-line by design.
- Collapse/expand interactivity. Cards are fully expanded on flip.
- True polar / sunburst layouts. Branches grow horizontally outward from the hub.

---

## Front Template

```html
{{#Subject}}<div class="subject">{{Subject}}</div>{{/Subject}}
<div class="title">{{Title}}</div>
```

---

## Back Template

```html
<div class="back-header">
  {{#Subject}}<div class="subject">{{Subject}}</div>{{/Subject}}
  {{#Keywords}}<div class="keywords">{{Keywords}}</div>{{/Keywords}}
</div>

<hr id="answer">

<div class="mindmap-scroll">
  <div class="mindmap" id="mindmap-root" data-title="{{text:Title}}">{{Mindmap}}</div>
</div>

<script>
[[INSERT_SCRIPT_BODY]]
</script>
```

---

## Styling

```css
.card {
  font-family: Georgia, serif;
  font-size: 16px;
  line-height: 1.7;
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
  background-color: #ffffff;
  color: #111111;
}

@media (prefers-color-scheme: dark) {
  .card {
    background-color: #1a1a1a;
    color: #e8e8e8;
  }
}

/* Front */
.subject {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #888;
  text-align: center;
  margin-bottom: 10px;
}

@media (prefers-color-scheme: dark) {
  .subject { color: #666; }
}

.title {
  font-size: 22px;
  font-weight: bold;
  text-align: center;
  line-height: 1.3;
  word-break: break-word;
}

/* Back */
hr#answer {
  border: none;
  border-top: 1px solid #ddd;
  margin: 20px 0;
}

@media (prefers-color-scheme: dark) {
  hr#answer { border-top-color: #333; }
}

.back-header {
  border-bottom: 1px solid #e8e8e8;
  padding-bottom: 12px;
  margin-bottom: 16px;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .back-header { border-bottom-color: #333; }
}

.keywords {
  font-size: 12px;
  color: #777;
}

@media (prefers-color-scheme: dark) {
  .keywords { color: #999; }
}

[[INSERT_MINDMAP_CSS]]
```
````

- [ ] **Step 2: Replace the two `[[INSERT_*]]` markers with the real content**

Read `mindmap/dev-preview.html` to capture the script body and the mindmap-specific CSS rules. Use the Edit tool to perform two replacements:

**Replacement A — script body:**
- `old_string`: `[[INSERT_SCRIPT_BODY]]`
- `new_string`: the **exact contents** of the `<script>...</script>` block in `dev-preview.html` — meaning everything *between* the opening and closing `<script>` tags, starting with `(function() {` and ending with `})();`. Copy character-for-character.

**Replacement B — mindmap CSS:**
- `old_string`: `[[INSERT_MINDMAP_CSS]]`
- `new_string`: the **exact contents** of the `/* === MINDMAP-SPECIFIC STYLES === */` block in `dev-preview.html`'s `<style>` tag, starting with the comment `/* === MINDMAP-SPECIFIC STYLES === */` and ending after the dark-mode `.mindmap-node code` rule. Copy character-for-character.

- [ ] **Step 3: Sanity check — file structure**

```bash
grep -c '^## ' mindmap/mindmap-note-type.md
```
Expected: at least 4 (Fields, Front Template, Back Template, Styling).

```bash
grep -c 'INSERT_' mindmap/mindmap-note-type.md
```
Expected: 0 (no markers left).

```bash
sed -n '/^<script>$/,/^<\/script>$/p' mindmap/mindmap-note-type.md | sed '1d;$d' > /tmp/mindmap-script.js && node --check /tmp/mindmap-script.js && echo "JS OK"
```
Expected: `JS OK`. (If `node --check` reports a parse error, fix the script before continuing.)

- [ ] **Step 4: Commit**

```bash
git add mindmap/mindmap-note-type.md && git commit -m "$(cat <<'EOF'
Add mindmap note type drop-in template

Final assembled deliverable. Fields, front + back templates, embedded
script, and CSS — assembled from the verified dev-preview.html
implementation. Sibling of the existing summary note type.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Write the regression fixture `mindmap-sample.md`

**Why:** Spec §10 specifies the test fixture: a paste-ready markdown file with field values, the Mindmap content between BEGIN/END markers, and a numbered regression checklist. Mirror the structure of `summary/summary-sample.md`.

**Files:**
- Create: `mindmap/mindmap-sample.md`

- [ ] **Step 1: Create the fixture file**

Create `/mnt/c/Users/felip/Projects/anki-templates/mindmap/mindmap-sample.md`:

```markdown
# Anki Mindmap Note — Regression Fixture

This file is the test fixture for the **Mindmap** note type. Pasting the content between the `=== BEGIN ===` and `=== END ===` markers into the Mindmap field of a new note exercises every feature listed in the regression checklist at the bottom.

## Fields to paste

| Field    | Value |
|----------|-------|
| Title    | Mindmap Feature Showcase |
| Subject  | Test |
| Keywords | mindmap, regression, edge cases |

## Mindmap field content

Copy everything between `=== BEGIN ===` and `=== END ===` into the Mindmap field of your new note.

=== BEGIN ===
- Two-branch case
  - Verifies the smallest non-trivial split
  - Should fan one branch right, one left
- Five-branch alternation
  - First child
  - Second child
  - Third child
  - Fourth child
  - Fifth child
- Three levels deep
  - Level two A
    - Level three A1
    - Level three A2
  - Level two B
    - Level three B1
    - Level three B2
- Long-label branch with a deliberately verbose title
  - This leaf also has a fairly long label to verify wrapping
  - Short leaf
- Inline formatting branch
  - **Bold** leaf
  - *Italic* leaf
  - `code` leaf with `snake_case_id`
  - [Link leaf](https://en.wikipedia.org/wiki/Mind_map)
  - ~~Struck~~ leaf
  - ***Bold italic*** leaf
- Single-leaf branch
- Mixed marker branch
  * Star marker child
  * Another star marker child
- Color cycling — branch 9
- Color cycling — branch 10
=== END ===

## How to use this fixture

1. Open Anki → **Add** → choose the **Mindmap** note type.
2. Paste the three field values from the table above.
3. Select everything between `=== BEGIN ===` and `=== END ===` in this file and paste it into the **Mindmap** field.
4. Click **Add**, then open the new note in the browser and flip it.
5. Walk through the **Regression checklist** below. Any failing item points to a specific bug.

## Regression checklist

If every bullet below renders correctly, the parser, layout pass, and renderer are healthy:

1. The hub at the center reads `Mindmap Feature Showcase` (the Title field), not `(untitled)`.
2. There are exactly **10** top-level branches arranged around the hub, alternating left and right.
3. The first 8 top-level branches each have a **distinct color** (blue, green, orange, purple, red, teal, magenta, amber-brown).
4. Branches 9 and 10 (`Color cycling — branch 9` and `branch 10`) reuse the colors of branches 1 and 2 (blue and green).
5. The "Two-branch case" branch shows two children arranged vertically below it.
6. The "Five-branch alternation" branch shows five children stacked vertically.
7. The "Three levels deep" branch reaches **three** distinct visual indents — root → branch → grandchild.
8. The "Long-label branch with a deliberately verbose title" wraps gracefully and its connector still meets the node correctly.
9. The "Inline formatting" branch's children render with their formatting applied:
   - `**Bold** leaf` shows the word "Bold" in heavier weight.
   - `*Italic* leaf` shows the word "Italic" in italics.
   - `` `code` leaf with `snake_case_id` `` shows both `code` and `snake_case_id` in monospace with a subtle background, AND the underscores in `snake_case_id` are preserved (not collapsed by an italic rule).
   - `[Link leaf]` is underlined and clickable; clicking opens the system browser.
   - `~~Struck~~` shows the word "Struck" with a strike-through line.
   - `***Bold italic***` is both bold and italic.
10. The "Single-leaf branch" has no visible children (it's a leaf itself, despite the alternation rule still placing it on the correct side).
11. The "Mixed marker branch" treats `*` and `-` markers identically — both children appear normally, no marker visible in the rendered text.
12. Connectors between parent and child are smooth curved lines (quadratic Bezier), not straight diagonals or right-angle elbows.
13. Each connector matches the **destination** branch's color (a connector entering an orange branch is orange).
14. The hub is horizontally centered in the visible scroll area on first paint, even though the canvas overflows.
15. Dark mode (system setting) inverts the card background and the 8 branch colors stay readable on the dark background.
16. No raw markdown syntax (`*`, `**`, `` ` ``, `[`) is visible anywhere in the rendered card — every inline mark has been converted.
17. No empty bullets or stray dashes appear in the diagram.
```

- [ ] **Step 2: Verify it parses as markdown (no broken structure)**

```bash
grep -c '^=== BEGIN ===$' mindmap/mindmap-sample.md
```
Expected: 1.

```bash
grep -c '^=== END ===$' mindmap/mindmap-sample.md
```
Expected: 1.

```bash
grep -cE '^[0-9]+\.' mindmap/mindmap-sample.md
```
Expected: 17 (one per regression checklist item).

- [ ] **Step 3: Commit**

```bash
git add mindmap/mindmap-sample.md && git commit -m "$(cat <<'EOF'
Add mindmap-sample.md regression fixture

Mirrors the structure of summary-sample.md — paste-ready field
values, the mindmap content between BEGIN/END markers, and a
17-item regression checklist that exercises every spec feature.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Cleanup — delete dev preview, kill HTTP server, final review

**Why:** The development scratchpad is no longer needed. The two final deliverables are committed. Final pass to make sure nothing's left dangling.

**Files:**
- Delete: `mindmap/dev-preview.html`
- Background process: `python3 -m http.server 8765` (started in Task 1)

- [ ] **Step 1: Kill the dev HTTP server**

Find the background bash shell ID for `python3 -m http.server 8765` (started in Task 1) and kill it via the `KillShell` tool. If `KillShell` isn't available, use:

```bash
pkill -f "http.server 8765" || true
```

- [ ] **Step 2: Delete the dev preview file**

```bash
rm /mnt/c/Users/felip/Projects/anki-templates/mindmap/dev-preview.html
```

- [ ] **Step 3: Verify the final folder layout**

```bash
ls -la /mnt/c/Users/felip/Projects/anki-templates/mindmap/
```
Expected: only two files — `mindmap-note-type.md` and `mindmap-sample.md`.

```bash
git status
```
Expected: `mindmap/dev-preview.html` shows as deleted; nothing else unexpected. (`summary/` is allowed to remain untracked — it was already untracked when this work began and is out of scope.)

- [ ] **Step 4: Read both final files to spot anything off**

Use the Read tool on:
- `/mnt/c/Users/felip/Projects/anki-templates/mindmap/mindmap-note-type.md`
- `/mnt/c/Users/felip/Projects/anki-templates/mindmap/mindmap-sample.md`

Spot-check:
- The Front Template `<script>` tag (if any) is closed properly. Front template should NOT contain a script — only the back template does.
- The Back Template's `<script>` block contains the full IIFE — no orphaned `[[INSERT_*]]` markers.
- The CSS `.mindmap-node[data-branch="N"]` rules cover all 8 slots (0–7).
- The dark-mode `@media (prefers-color-scheme: dark)` block is present and inverts all 8 branch colors.
- The Mindmap content between `=== BEGIN ===` and `=== END ===` has no trailing whitespace and ends cleanly.

- [ ] **Step 5: Commit the cleanup**

```bash
git add -A mindmap/ && git commit -m "$(cat <<'EOF'
Remove mindmap dev-preview scratchpad

Implementation is complete and assembled into mindmap-note-type.md.
The dev preview was an iteration aid only.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Hand off to the user for the final acceptance test**

Tell the user:

> Implementation complete. The mindmap note type lives at `mindmap/mindmap-note-type.md` and the regression fixture at `mindmap/mindmap-sample.md`.
>
> **Final acceptance test (you have to do this — I can't run Anki):**
>
> 1. In Anki, go to **Tools → Manage Note Types → Add → Add: Basic** and create a new note type named "Mindmap".
> 2. Edit the new note type's fields to: `Title`, `Subject`, `Keywords`, `Mindmap` (matching the order in `mindmap-note-type.md`).
> 3. Edit the note type's templates: paste the **Front Template** code block into the front template field, the **Back Template** code block into the back template field, and the **Styling** code block into the styling field.
> 4. Open `mindmap/mindmap-sample.md`, copy the field values from the table at the top, and paste each into the corresponding field of a new note (Add → choose Mindmap).
> 5. Copy everything between `=== BEGIN ===` and `=== END ===` into the **Mindmap** field.
> 6. Save the note, open it in the browser, flip it, and walk the **17-item regression checklist** at the bottom of `mindmap-sample.md`.
> 7. Report any failing items — each one points to a specific bug to fix.

---

## Self-Review Notes (filled in by the plan author)

**Spec coverage:** Walked spec §1–§12 against this plan.

| Spec section | Covered by |
|---|---|
| §1 Goal | Plan header |
| §2 Non-goals | Plan header + Task 14 docs |
| §3 Files | File Structure section + Tasks 1, 14, 15 |
| §4 Fields | Task 14 |
| §5 Front template | Task 14 |
| §6 Back template (no FrontSide, slim header) | Task 14 |
| §7.1 Cleanup pipeline | Task 2 |
| §7.2 parseTree | Task 3 |
| §7.3 inline() lifted from summary | Task 4 |
| §7.4 Side assignment, vertical layout, asymmetric centering | Task 5 |
| §7.4 step 4 px conversion | Task 6 |
| §7.4 step 5 bounding box | Task 6 |
| §7.5 Render substrate (HTML divs + SVG overlay) | Tasks 7 + 9 |
| §7.6 Quadratic Bezier connectors | Task 9 |
| §7.7 Center hub on first paint | Task 10 |
| §8.1 Branch palette (light + dark) | Task 8 |
| §8.2 Node styling, hub, depth de-emphasis | Task 8 |
| §8.3 Connector stroke | Task 9 (set as SVG attributes) |
| §9 Edge cases | Tasks 11, 12, 13 |
| §10 Test fixture | Task 15 |
| §11 Open implementation choices | Task 6 (estimate-based width); LEVEL_WIDTH/LINE_HEIGHT constants set in Task 6 |
| §12 Out of scope | Task 14 docs |

**Placeholder scan:** No "TBD", "TODO", or vague instructions remain. The two `[[INSERT_*]]` markers in Task 14 Step 1 are explicitly removed in Task 14 Step 2 and verified in Task 14 Step 3.

**Type/name consistency:** `cleanupAnkiHtml`, `parseTree`, `inline`, `measure`, `place`, `propagateBranch`, `layoutTree`, `walkAll`, `clearContainer`, `renderMindmap`, `COLOR_SLOTS`, `LEVEL_WIDTH`, `LINE_HEIGHT`, `CANVAS_PAD` — all referenced consistently across Tasks 2–10. Node properties: `label`, `children`, `depth`, `units`, `ux`, `uy`, `x`, `y`, `width`, `height`, `branchIndex`, `canvasWidth`, `canvasHeight` — used consistently.

**Scope check:** Single feature, single deliverable folder, ~16 bite-sized tasks. Not a candidate for sub-project decomposition.
