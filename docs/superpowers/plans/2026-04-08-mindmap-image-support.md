# Mindmap Image Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render images inside mindmap node labels — both Anki-pasted `<img>` tags and markdown `![alt](src)` syntax — without corrupting the DOM-measurement layout pass.

**Architecture:** Two changes to `mindmap/back.html`. (1) **Cleanup phase:** park `<img>` tags behind `\u0000I<n>\u0000` sentinels before HTML stripping; restore them inside `inline()` next to the existing backtick-code restore step. This is the same pattern `summary/back.html:237-266` already uses. (2) **Render phase:** wrap the existing measure → layout → write block in a `Promise.all` that waits for every inserted `<img>` to decode before reading `offsetWidth`/`offsetHeight`, so node sizes are accurate on first paint.

**Tech Stack:** Vanilla browser JavaScript inside an Anki card template. No build step, no test runner for mindmap (the renderer uses real DOM APIs that the existing `summary/test/harness.js` cannot stub). Verification is manual via `mindmap/mindmap-sample.md`.

**Why no automated tests:** Mindmap's renderer creates real DOM elements with `document.createElement` and reads layout via `offsetWidth`. The summary template's vm-based test harness uses a minimal `document` stub that only supports `getElementById` returning an object with an `innerHTML` property — not enough surface area for the mindmap renderer. Adding jsdom is out of scope for an image-support change. All verification is manual.

**Spec:** `docs/superpowers/specs/2026-04-08-mindmap-image-support-design.md`

**Pre-existing in-progress work warning:** `git status` at the start of this session showed unstaged changes in `summary/style.css` and `summary/summary-note-type.md`. Those are unrelated to this plan. Do NOT touch them. Stage and commit only the files this plan modifies.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `mindmap/back.html` | Modify | Cleanup-phase sentinel parking, `inline()` sentinel restore, async-gated render |
| `mindmap/style.css` | Modify | New `.mindmap-node img` rule |
| `mindmap/mindmap-sample.md` | Modify | Add Image branch test fixture + checklist item |
| `mindmap/mindmap-note-type.md` | Modify | Move "images" from "Not supported" to "Supported" |

No new files. No new dependencies.

---

## Task 1: Add `imgs[]` closure variable and sentinel parking in cleanup

**Files:**
- Modify: `mindmap/back.html:13-26` (the IIFE opener and `cleanupAnkiHtml`)

**Why this task:** The cleanup pipeline currently strips all HTML tags via `.replace(/<[^>]+>/g, "")`, which destroys Anki-pasted `<img>` tags before they can reach the parser. Parking them behind a sentinel before the strip pass lets them ride through unchanged. The `imgs[]` array must live in the IIFE closure (not as a parameter) so the later `inline()` restore step can see it without changing function signatures.

- [ ] **Step 1: Add the closure-scoped `imgs[]` array**

Edit `mindmap/back.html`. Find:

```js
(function() {
  // ===== Phase 1: Cleanup =====
  function cleanupAnkiHtml(rawHtml) {
```

Replace with:

```js
(function() {
  // Sentinel store for <img> tags. Cleanup parks raw tags here behind
  // \u0000I<n>\u0000 placeholders so the HTML strip pass can't eat them;
  // inline() restores them after parsing. Same pattern as summary/back.html.
  var imgs = [];

  // ===== Phase 1: Cleanup =====
  function cleanupAnkiHtml(rawHtml) {
```

- [ ] **Step 2: Park `<img>` tags before the strip pass**

Find the body of `cleanupAnkiHtml`:

```js
  function cleanupAnkiHtml(rawHtml) {
    return rawHtml
      .replace(/<\/div>\s*<div[^>]*>/gi, "\n")
      .replace(/<div[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }
```

Replace with:

```js
  function cleanupAnkiHtml(rawHtml) {
    // 1. Park <img> tags behind \u0000I<n>\u0000 sentinels so the strip pass
    //    below doesn't eat them. inline() restores them after parsing.
    var parked = rawHtml.replace(/<img[^>]*>/gi, function(match) {
      imgs.push(match);
      return "\u0000I" + (imgs.length - 1) + "\u0000";
    });
    return parked
      .replace(/<\/div>\s*<div[^>]*>/gi, "\n")
      .replace(/<div[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }
```

- [ ] **Step 3: Verify the sentinel is opaque to all the strip regexes**

Read the new `cleanupAnkiHtml` body and trace `\u0000I0\u0000` through each `.replace()` line:
1. `<\/div>\s*<div[^>]*>` — needs literal `<` and `>`. Sentinel has neither. Survives.
2. `<div[^>]*>` — same. Survives.
3. `<\/div>` — same. Survives.
4. `<br\s*\/?>` — same. Survives.
5. `<[^>]+>` — same. Survives.
6. `&lt;` / `&gt;` / `&nbsp;` / `&amp;` — sentinel uses `\u0000` (null byte), not `&`. Survives.

If any of these would consume the sentinel, stop and reconsider. Otherwise mark this step done.

- [ ] **Step 4: Commit**

```bash
git add mindmap/back.html
git commit -m "$(cat <<'EOF'
Park <img> tags behind sentinels in mindmap cleanup

Mirrors the sentinel pattern from summary/back.html so the HTML
strip pass no longer destroys Anki-pasted images. The imgs[]
closure store will be drained by inline() in a follow-up commit.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Restore `<img>` sentinels inside `inline()`

**Files:**
- Modify: `mindmap/back.html:29-46` (the `inline` function)

**Why this task:** The sentinels parked in Task 1 survive `cleanupAnkiHtml` and `parseTree` because they contain no characters those passes care about. Now they need to be restored to their original `<img>` tags. The right place is inside `inline()`, right next to the existing backtick-code restore at line 43-45 — that keeps all sentinel logic in one place and ensures the restore happens after escaping/markdown but before the result is inserted into the DOM.

- [ ] **Step 1: Add the image-sentinel restore step**

Find the existing `inline()` function:

```js
  function inline(t) {
    t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    var codes = [];
    t = t.replace(/`([^`]+)`/g, function(_, c) {
      codes.push("<code>" + c + "</code>");
      return "\u0000C" + (codes.length - 1) + "\u0000";
    });
    t = t
      .replace(/!\[([^\]]*)\]\(((?:[^()]|\([^)]*\))+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(((?:[^()]|\([^)]*\))+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "<em>$1</em>")
      .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "<del>$1</del>");
    return t.replace(/\u0000C(\d+)\u0000/g, function(_, idx) {
      return codes[parseInt(idx, 10)];
    });
  }
```

Replace the final `return t.replace(...)` line with:

```js
    t = t.replace(/\u0000C(\d+)\u0000/g, function(_, idx) {
      return codes[parseInt(idx, 10)];
    });
    // Restore parked <img> tags. Runs after the escape pass so the raw
    // <img src=...> markup isn't HTML-escaped on its way through.
    return t.replace(/\u0000I(\d+)\u0000/g, function(_, idx) {
      return imgs[parseInt(idx, 10)];
    });
```

- [ ] **Step 2: Manually trace a worked example**

Trace this input through the entire cleanup → parse → inline pipeline by hand or by writing a one-line `node -e` snippet:

Input: `- before <img src="x.png"> after`

Expected after `cleanupAnkiHtml`: `- before \u0000I0\u0000 after`
Expected after `parseTree`: a single child node with `label: "before \u0000I0\u0000 after"`
Expected after `inline()`:
1. Escape: `before \u0000I0\u0000 after` (no `<>&` to escape)
2. Park codes: no change (no backticks)
3. Markdown image regex: no change (no `![...](...)`)
4. ...other inline rules: no change
5. Restore codes: no change
6. Restore imgs: `before <img src="x.png"> after` ✓

If the trace doesn't match, stop and debug before committing.

- [ ] **Step 3: Trace the edge case — image inside `**bold**`**

Input: `- **important <img src="x.png"> note**`

After cleanup: `- **important \u0000I0\u0000 note**`
After parseTree label: `**important \u0000I0\u0000 note**`
After inline() bold step: `<strong>important \u0000I0\u0000 note</strong>`
After image restore: `<strong>important <img src="x.png"> note</strong>` ✓

The `**...**` regex matches because the sentinel contains no `*` characters, so the bold opener and closer can find each other across it. Mark done if the trace works.

- [ ] **Step 4: Commit**

```bash
git add mindmap/back.html
git commit -m "$(cat <<'EOF'
Restore <img> sentinels in mindmap inline() pass

Drains the imgs[] store back into node label HTML after the
backtick-code restore, completing the round-trip for both
Anki-pasted <img> tags and markdown ![alt](src) syntax. Layout
correctness in the presence of images comes in a follow-up commit.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Gate DOM measurement on image decoding

**Files:**
- Modify: `mindmap/back.html:158-238` (the `renderMindmap` function)

**Why this task:** Now that `<img>` tags can reach the renderer, the layout pass at `back.html:184-187` reads `offsetWidth`/`offsetHeight` synchronously — but a freshly inserted image measures as ~0×0 until its file is decoded. Without this gate, image-bearing nodes would collapse and corrupt the entire layout. We use `img.decode()` (preferred — resolves only when the image is paint-ready, no forced reflow) with a `load`/`error` fallback for safety, all wrapped in `.catch(()=>{})` so a single broken image cannot deadlock the tree.

- [ ] **Step 1: Add the `decodeOrLoad` helper above `renderMindmap`**

Find the comment block immediately above `renderMindmap`:

```js
  // ===== Phase 4: Render =====
  // DOM measurement for accurate sizes, but optimized:
  // - DocumentFragment for batch insertion (one layout, not N)
  // - No visibility toggling (synchronous JS blocks painting,
  //   so the browser only paints the final state)
  // - Batch position writes after measurement
  var SVG_NS = "http://www.w3.org/2000/svg";

  function renderMindmap(root, container) {
```

Replace with:

```js
  // ===== Phase 4: Render =====
  // DOM measurement for accurate sizes, but optimized:
  // - DocumentFragment for batch insertion (one layout, not N)
  // - No visibility toggling (synchronous JS blocks painting,
  //   so the browser only paints the final state)
  // - Batch position writes after measurement
  // - Image decoding gates the measurement step so node sizes
  //   reflect the real rendered image instead of 0x0 placeholders
  var SVG_NS = "http://www.w3.org/2000/svg";

  // Resolves once the image is ready to paint (or has failed). Prefers
  // img.decode() because it doesn't trigger a forced layout the way
  // waiting on the load event from a freshly inserted img would. The
  // .catch ensures a 404 resolves rather than rejects, so a single
  // broken image can't deadlock the outer Promise.all.
  function decodeOrLoad(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (typeof img.decode === "function") {
      return img.decode().catch(function() {});
    }
    return new Promise(function(resolve) {
      img.addEventListener("load", function() { resolve(); }, { once: true });
      img.addEventListener("error", function() { resolve(); }, { once: true });
    });
  }

  function renderMindmap(root, container) {
```

- [ ] **Step 2: Split the render body into "insert" and "layout-and-finalize" halves**

Find the body of `renderMindmap`:

```js
  function renderMindmap(root, container) {
    assignBranches(root);

    // Clear container and set up canvas.
    while (container.firstChild) container.removeChild(container.firstChild);
    var canvas = document.createElement("div");
    canvas.className = "mindmap-canvas";
    canvas.style.position = "relative";
    container.appendChild(canvas);

    // Build all node divs in a DocumentFragment (no reflow yet).
    var frag = document.createDocumentFragment();
    walkAll(root, function(n) {
      var div = document.createElement("div");
      div.className = "mindmap-node" + (n === root ? " mindmap-hub" : "");
      if (n !== root) div.setAttribute("data-branch", String(n.branchIndex % COLOR_SLOTS));
      div.style.left = "0px";
      div.style.top = "0px";
      div.insertAdjacentHTML("afterbegin", inline(n.label));
      frag.appendChild(div);
      n._div = div;
    });
    // Single batch insertion — triggers one layout calculation.
    canvas.appendChild(frag);

    // Read actual rendered sizes (layout already computed, no extra reflow).
    walkAll(root, function(n) {
      n.width = n._div.offsetWidth;
      n.height = n._div.offsetHeight;
    });

    // Compute final positions (pure JS, no DOM access).
    assignX(root);
    assignY(root);
    computeBounds(root);

    // Batch-write final positions (no reflow until browser paints).
    walkAll(root, function(n) {
      n._div.style.left = n.x + "px";
      n._div.style.top = n.y + "px";
    });

    // Build SVG connectors.
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "mindmap-edges");
    svg.setAttribute("width", root.canvasWidth);
    svg.setAttribute("height", root.canvasHeight);
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";

    function emitConnector(parent, child) {
      var sx = parent.x + parent.width;
      var sy = parent.y;
      var ex = child.x;
      var ey = child.y;
      var mx = (sx + ex) / 2;
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d",
        "M " + sx + " " + sy +
        " C " + mx + " " + sy + ", " + mx + " " + ey + ", " + ex + " " + ey);
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

    // Insert SVG behind nodes, finalize canvas size.
    canvas.insertBefore(svg, canvas.firstChild);
    canvas.style.width = root.canvasWidth + "px";
    canvas.style.height = root.canvasHeight + "px";
    // Browser paints the final state here (after JS yields).
  }
```

Replace with:

```js
  function renderMindmap(root, container) {
    assignBranches(root);

    // Clear container and set up canvas.
    while (container.firstChild) container.removeChild(container.firstChild);
    var canvas = document.createElement("div");
    canvas.className = "mindmap-canvas";
    canvas.style.position = "relative";
    container.appendChild(canvas);

    // Build all node divs in a DocumentFragment (no reflow yet).
    var frag = document.createDocumentFragment();
    walkAll(root, function(n) {
      var div = document.createElement("div");
      div.className = "mindmap-node" + (n === root ? " mindmap-hub" : "");
      if (n !== root) div.setAttribute("data-branch", String(n.branchIndex % COLOR_SLOTS));
      div.style.left = "0px";
      div.style.top = "0px";
      div.insertAdjacentHTML("afterbegin", inline(n.label));
      frag.appendChild(div);
      n._div = div;
    });
    // Single batch insertion — triggers one layout calculation.
    canvas.appendChild(frag);

    // Wait for any inserted <img> tags to decode before measuring, so node
    // sizes reflect the real rendered image instead of a 0x0 placeholder.
    // Promise.all([]) resolves on the next microtask, so image-free
    // mindmaps pay essentially nothing.
    var imgEls = canvas.querySelectorAll("img");
    var waits = [];
    for (var i = 0; i < imgEls.length; i++) waits.push(decodeOrLoad(imgEls[i]));

    Promise.all(waits).then(function() {
      finalizeLayout(root, canvas);
    });
  }

  // Pure layout + connector emission. Runs after every <img> in the canvas
  // has decoded (or failed), so offsetWidth/offsetHeight are trustworthy.
  function finalizeLayout(root, canvas) {
    // Read actual rendered sizes (layout already computed, no extra reflow).
    walkAll(root, function(n) {
      n.width = n._div.offsetWidth;
      n.height = n._div.offsetHeight;
    });

    // Compute final positions (pure JS, no DOM access).
    assignX(root);
    assignY(root);
    computeBounds(root);

    // Batch-write final positions (no reflow until browser paints).
    walkAll(root, function(n) {
      n._div.style.left = n.x + "px";
      n._div.style.top = n.y + "px";
    });

    // Build SVG connectors.
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "mindmap-edges");
    svg.setAttribute("width", root.canvasWidth);
    svg.setAttribute("height", root.canvasHeight);
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";

    function emitConnector(parent, child) {
      var sx = parent.x + parent.width;
      var sy = parent.y;
      var ex = child.x;
      var ey = child.y;
      var mx = (sx + ex) / 2;
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d",
        "M " + sx + " " + sy +
        " C " + mx + " " + sy + ", " + mx + " " + ey + ", " + ex + " " + ey);
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

    // Insert SVG behind nodes, finalize canvas size.
    canvas.insertBefore(svg, canvas.firstChild);
    canvas.style.width = root.canvasWidth + "px";
    canvas.style.height = root.canvasHeight + "px";
    // Browser paints the final state here (after JS yields).
  }
```

Two structural notes:

1. Everything from "Read actual rendered sizes" through the end of the old function moves verbatim into `finalizeLayout`. No logic changes inside that block — only its scope and triggering.
2. The IIFE main block at `back.html:241-247` does not need to change. It calls `renderMindmap(tree, el)` and there's nothing sequenced after it, so making the second half of the work async-internal is invisible to the caller.

- [ ] **Step 3: Verify the IIFE main block still works**

Read lines 241-247 of `back.html` (the bit after `renderMindmap` is defined):

```js
  // ===== Main =====
  var el = document.getElementById("mindmap-root");
  var rawText = cleanupAnkiHtml(el.innerHTML);
  var title = el.getAttribute("data-title") || "(untitled)";
  var tree = parseTree(rawText, title);
  renderMindmap(tree, el);
})();
```

Confirm:
- `renderMindmap` is the last call. There is no code that depends on it being finished synchronously. ✓ if this matches.
- `el` (the mindmap-root div) is what the renderer wipes and rebuilds inside. The async finalization writes back into this same element via the `canvas` reference captured in the closure. ✓

If anything else has been added between `renderMindmap(tree, el);` and `})();`, stop and adapt the plan — that code would now run before the layout is finalized.

- [ ] **Step 4: Commit**

```bash
git add mindmap/back.html
git commit -m "$(cat <<'EOF'
Gate mindmap layout on image decoding

Splits renderMindmap into "insert" and "finalizeLayout" halves and
inserts a Promise.all over decodeOrLoad(img) between them. Node
sizes are now read after every <img> in the canvas has decoded,
so image-bearing nodes lay out correctly on first paint instead
of collapsing to 0x0. Image-free mindmaps pay nothing — the
Promise.all over an empty array resolves on the next microtask.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add CSS rule for images inside nodes

**Files:**
- Modify: `mindmap/style.css` (insert after the existing `.mindmap-node code` block at line 153-159)

**Why this task:** Without this rule, an image's intrinsic size determines the node width — a 1024×768 pasted screenshot would blow `.mindmap-node`'s `max-width: 200px` cap (because the image is a replaced element with its own intrinsic dimensions). The rule chains `max-width: 100%` off the parent's `200px` cap, with `height: auto` to preserve aspect ratio and `display: block` to avoid the inline-baseline gap below the image.

- [ ] **Step 1: Add the rule**

Edit `mindmap/style.css`. Find:

```css
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

Insert this block immediately after the dark-mode code rule (and before the closing of the file):

```css
.mindmap-node img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 2px 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add mindmap/style.css
git commit -m "$(cat <<'EOF'
Add CSS bounds for images inside mindmap nodes

max-width: 100% chains off the existing .mindmap-node 200px cap
so a large pasted screenshot can't blow up the layout. display:
block removes the inline-baseline gap so an image-only label
renders as a clean rectangle.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extend the regression fixture

**Files:**
- Modify: `mindmap/mindmap-sample.md` (insert new branch + add checklist item)

**Why this task:** The existing fixture has 9 top-level branches even though checklist item 2 claims "exactly 10". Inserting "Image branch" as the 6th bullet brings the count to 10, which corrects the pre-existing inconsistency as a side effect — without editing checklist items 2 or 4.

- [ ] **Step 1: Insert the Image branch in the fixture**

Edit `mindmap/mindmap-sample.md`. Find this block (the end of the Inline formatting branch and start of Single-leaf branch, around lines 37-44):

```markdown
- Inline formatting branch
  - **Bold** leaf
  - *Italic* leaf
  - `code` leaf with `snake_case_id`
  - [Link leaf](https://en.wikipedia.org/wiki/Mind_map)
  - ~~Struck~~ leaf
  - ***Bold italic*** leaf
- Single-leaf branch
```

Replace with:

```markdown
- Inline formatting branch
  - **Bold** leaf
  - *Italic* leaf
  - `code` leaf with `snake_case_id`
  - [Link leaf](https://en.wikipedia.org/wiki/Mind_map)
  - ~~Struck~~ leaf
  - ***Bold italic*** leaf
- Image branch
  - Markdown image: ![tiny dot](_test-dot.png)
  - Pasted image leaf <img src="_test-dot.png">
  - Text + ![inline](_test-dot.png) image
- Single-leaf branch
```

- [ ] **Step 2: Add a regression checklist item**

Find checklist item 17 at the bottom of the file:

```markdown
17. No empty bullets or stray dashes appear in the diagram.
```

Append a new item 18 immediately after:

```markdown
17. No empty bullets or stray dashes appear in the diagram.
18. The "Image branch" shows three children, each rendering the test image: the markdown leaf, the pasted-`<img>` leaf, and the mixed text-plus-image leaf. No raw `<img>` markup is visible. No broken-image icon appears. The image inside the mixed leaf sits between the words "Text +" and "image".
```

- [ ] **Step 3: Note the media file requirement**

Find the section "How to use this fixture" (around line 52-58):

```markdown
## How to use this fixture

1. Open Anki → **Add** → choose the **Mindmap** note type.
2. Paste the three field values from the table above.
3. Select everything between `=== BEGIN ===` and `=== END ===` in this file and paste it into the **Mindmap** field.
4. Click **Add**, then open the new note in the browser and flip it.
5. Walk through the **Regression checklist** below. Any failing item points to a specific bug.
```

Replace step 3 with two steps and renumber:

```markdown
## How to use this fixture

1. Open Anki → **Add** → choose the **Mindmap** note type.
2. Paste the three field values from the table above.
3. Add a small test image to your Anki media collection named `_test-dot.png`. Any image works (a 16×16 dot is fine). The leading underscore tells Anki not to flag it as unused during media checks.
4. Select everything between `=== BEGIN ===` and `=== END ===` in this file and paste it into the **Mindmap** field.
5. Click **Add**, then open the new note in the browser and flip it.
6. Walk through the **Regression checklist** below. Any failing item points to a specific bug.
```

- [ ] **Step 4: Commit**

```bash
git add mindmap/mindmap-sample.md
git commit -m "$(cat <<'EOF'
Add Image branch to mindmap regression fixture

Exercises markdown image syntax, raw <img> tags, and mixed
text+image labels. As a side effect, brings the top-level
branch count from 9 to 10, correcting a pre-existing mismatch
with checklist item 2.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update the note-type documentation

**Files:**
- Modify: `mindmap/mindmap-note-type.md` (lines 14-25, the supported/unsupported lists)

**Why this task:** The doc currently lists images under "What's not supported". With this change, both Anki-pasted `<img>` tags and markdown image syntax work. The doc should reflect that.

- [ ] **Step 1: Update both lists**

Edit `mindmap/mindmap-note-type.md`. Find:

```markdown
## What's supported in the Mindmap field

- Nested bullets at any depth (`-` and `*` are interchangeable; tabs normalize to 4 spaces)
- Inline markdown inside each bullet's label: `**bold**`, `*italic*`, `***bold italic***`, `` `code` ``, `[link](url)`, `~~strike~~`
- Up to 8 top-level branches with distinct colors; more cycle through the same palette

## What's not supported

- Block-level markdown inside a label (paragraphs, fenced code, headings, lists nested inside a label, images, tables, blockquotes). Node labels are single-line by design.
- Collapse/expand interactivity. Cards are fully expanded on flip.
- Radial or polar layouts. The tree grows strictly left-to-right.
```

Replace with:

```markdown
## What's supported in the Mindmap field

- Nested bullets at any depth (`-` and `*` are interchangeable; tabs normalize to 4 spaces)
- Inline markdown inside each bullet's label: `**bold**`, `*italic*`, `***bold italic***`, `` `code` ``, `[link](url)`, `~~strike~~`
- Images inside a label, two ways: paste an image into the field (Anki stores it as `<img src="...">`) or write markdown image syntax `![alt](filename.png)`. Images are sized to fit the node's 200px max width.
- Up to 8 top-level branches with distinct colors; more cycle through the same palette

## What's not supported

- Block-level markdown inside a label (paragraphs, fenced code, headings, lists nested inside a label, tables, blockquotes). Node labels are single-line by design.
- Collapse/expand interactivity. Cards are fully expanded on flip.
- Radial or polar layouts. The tree grows strictly left-to-right.
```

The change: added a new "Images inside a label" bullet to the supported list, and removed the word "images, " from the parenthetical in the unsupported list.

- [ ] **Step 2: Commit**

```bash
git add mindmap/mindmap-note-type.md
git commit -m "$(cat <<'EOF'
Document mindmap image support

Moves images from "Not supported" to a dedicated bullet under
"Supported", calling out both the paste-into-Anki workflow and
markdown ![alt](src) syntax.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual regression in Anki

**Files:** None modified.

**Why this task:** This is the only verification path available — there is no test runner for the mindmap renderer. Walking the full checklist after each implementation pass catches regressions in unrelated features (color cycling, link rendering, three-level depth) that the focused tasks above might have inadvertently broken.

- [ ] **Step 1: Install the updated templates**

Open the Mindmap note type's card template editor in Anki. Paste the current contents of `mindmap/back.html` into the Back Template slot and the current contents of `mindmap/style.css` into the Styling slot. Save.

- [ ] **Step 2: Add the test image to the media collection**

Drop a small image file named `_test-dot.png` into your Anki media folder (`Tools → Check Media → Open` shows the location). Any image works — a 16×16 colored square is plenty.

- [ ] **Step 3: Create a fresh fixture note**

Follow the "How to use this fixture" steps in `mindmap/mindmap-sample.md`. Create the note, open it in the browser, and flip to the back.

- [ ] **Step 4: Walk every checklist item**

Verify items 1-18 in the regression checklist. Pay particular attention to:

- **Item 2**: exactly 10 top-level branches (was previously 9 — adding Image branch fixes this).
- **Item 4**: branches 9 and 10 (the two "Color cycling" branches) reuse blue and green.
- **Item 8**: long-label wrapping still works (was a previous bug).
- **Item 13**: connector colors match destination branch.
- **Item 18 (new)**: Image branch shows three working images.

If any item fails, stop. The bug is in this PR. Diagnose, fix, commit, and re-run from Step 1.

- [ ] **Step 5: Verify the broken-image edge case**

Temporarily edit the new fixture note to point at a non-existent file (e.g. change one `_test-dot.png` to `_does-not-exist.png`). Save and flip. Confirm:
- The mindmap still renders. The other two image leaves still work.
- The broken leaf shows the browser's broken-image glyph but does not blow up the layout.
- No "Promise rejection" or other error appears in Anki's debug console.

Restore the fixture file before the next step.

- [ ] **Step 6: Verify dark mode**

Toggle your OS to dark mode (or use Anki's built-in dark theme preview). Re-flip the card. Confirm:
- Branch colors stay readable on dark background (item 15 of the checklist).
- The new image rule's `border-radius: 4px` looks fine in both modes (no special dark-mode treatment needed; it's a static visual property).

- [ ] **Step 7: No commit**

This task produces no git commit — it is verification of the previous six tasks. If everything passes, the feature is done. If anything fails, the failing task gets a follow-up commit that this final verification re-runs against.

---

## Self-Review Notes

After writing this plan, I checked it against the spec:

| Spec section | Where it lands in the plan |
|---|---|
| Phase 1 Cleanup (sentinel parking) | Task 1 |
| Phase 1 Cleanup (sentinel restore in `inline()`) | Task 2 |
| Phase 2 Render (async decode gate) | Task 3 |
| `decodeOrLoad` with `img.decode` + load fallback + `.catch` | Task 3 Step 1 |
| `Promise.all([])` no-op for image-free trees | Task 3 Step 2 (in the inserted code + comment) |
| Renderer becomes internally async, caller unchanged | Task 3 Step 3 (verification of IIFE main) |
| CSS `.mindmap-node img` rule | Task 4 |
| Test fixture: Image branch insertion | Task 5 Step 1 |
| Test fixture: new checklist item | Task 5 Step 2 |
| Test fixture: `_test-dot.png` media file note | Task 5 Step 3 |
| Note that count goes 9 → 10, no edits to items 2/4 | Task 5 (Why-this-task), reinforced in Task 7 Step 4 |
| Doc: move images from Not Supported to Supported | Task 6 |
| Manual regression run | Task 7 |
| Pre-existing in-progress work in `summary/` not touched | Header warning |
| Error handling for broken images | Task 7 Step 5 |
| Edge case: image inside `**bold**` | Task 2 Step 3 |

No spec section is unaccounted for. All steps that mention code show the actual code. No `TODO` or `TBD` markers. Function names (`decodeOrLoad`, `finalizeLayout`, `renderMindmap`) are consistent across all tasks that reference them.
