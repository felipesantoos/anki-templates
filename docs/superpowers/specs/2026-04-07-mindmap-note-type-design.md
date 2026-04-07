# Mindmap Note Type — Design Spec

**Date:** 2026-04-07
**Status:** Approved for implementation
**Sibling of:** `summary/summary-note-type.md`

---

## 1. Goal

Add a new Anki note type, `Mindmap`, that converts a markdown nested-bullet list into a balanced horizontal mindmap diagram (root in the center, branches fanning left and right). The note type lives in a new `mindmap/` folder and follows the same conventions as `summary/`: a single drop-in `*.md` template plus a `*-sample.md` regression fixture.

The two note types are designed as siblings — same field shape, same typography, same cleanup pipeline for AnkiDroid `<div>` wrapping — so a user can convert a note from `Summary` to `Mindmap` (or vice versa) by changing only the note type.

## 2. Non-goals

- Full CommonMark parsing inside node labels. Only **inline** formatting (bold, italic, code, links, strikethrough). No headings, fenced code, blockquotes, tables, or images inside labels.
- Interactivity. The card is fully expanded the moment you flip it. No collapse/expand, no hover, no zoom.
- True polar / sunburst layouts. Branches grow horizontally outward from the hub; we do not radiate at arbitrary angles.
- Heading-driven mindmaps. The tree is defined exclusively by indented bullets.

## 3. Files

```
mindmap/
├── mindmap-note-type.md   # Drop-in template — fields, front, back, CSS
└── mindmap-sample.md      # Test fixture with regression checklist
```

## 4. Fields

| # | Field      | Required | Purpose                                                          |
|---|------------|----------|------------------------------------------------------------------|
| 1 | `Title`    | yes      | Central hub of the mindmap; also the front-side card heading.    |
| 2 | `Subject`  | no       | Small uppercase label above the title (e.g. "Biology").          |
| 3 | `Keywords` | no       | Small label shown on the back next to the title.                 |
| 4 | `Mindmap`  | yes      | Nested-bullet markdown defining the branches.                    |

Field names match `summary/` exactly (`Mindmap` replaces `Summary`); Anki preserves field values across note-type changes when names match, so conversion between the two is lossless.

## 5. Front template

Identical in shape to `summary/`'s front: optional subject label, then the title, both centered. No mindmap rendering on the front.

```html
{{#Subject}}<div class="subject">{{Subject}}</div>{{/Subject}}
<div class="title">{{Title}}</div>
```

## 6. Back template

The back deliberately does **not** render `{{FrontSide}}`. Reason: the Title is going to appear as the hub in the center of the mindmap, and replaying the front would show it twice on the same screen. The hub serves the same "what was this card about" role that `{{FrontSide}}` normally plays.

A slim back-header replaces it: optional Subject (small uppercase, like the front) and optional Keywords. Then a horizontal divider, then the mindmap container.

```html
<div class="back-header">
  {{#Subject}}<div class="subject">{{Subject}}</div>{{/Subject}}
  {{#Keywords}}<div class="keywords">{{Keywords}}</div>{{/Keywords}}
</div>

<hr id="answer">

<div class="mindmap-scroll">
  <div class="mindmap" id="mindmap-root"
       data-title="{{text:Title}}">{{Mindmap}}</div>
</div>

<script> /* see Section 7 */ </script>
```

The `data-title="{{text:Title}}"` attribute uses Anki's `text:` filter to pass the raw title to the script without HTML wrapping (the script needs the literal string for the hub label).

## 7. Script — execution pipeline

The script runs once per card flip. Five sequential phases:

```
┌──────────────────────────────────────────────┐
│ 1. Cleanup     │ undo Anki's HTML wrapping   │
├──────────────────────────────────────────────┤
│ 2. Parse       │ indented bullets → tree     │
├──────────────────────────────────────────────┤
│ 3. Layout      │ assign x, y to every node   │
├──────────────────────────────────────────────┤
│ 4. Render      │ emit HTML divs + SVG paths  │
├──────────────────────────────────────────────┤
│ 5. Center      │ scrollLeft so hub is in view│
└──────────────────────────────────────────────┘
```

### 7.1 Cleanup

Lifted **verbatim** from `summary-note-type.md` (the exact same Anki cross-platform quirks apply):

1. Park `<img>` tags behind `\u0000I<n>\u0000` sentinels (defensive — even though images aren't supported in labels, a user might try and we don't want the strip pass to eat surrounding text).
2. Normalize line breaks: `</div>\s*<div[^>]*>` → `\n`, then `<div[^>]*>` → `\n`, then `</div>` → ``, then `<br\s*/?>` → `\n`.
3. Strip remaining HTML tags.
4. Decode entities — order matters: `&lt;`, `&gt;`, `&nbsp;`, then `&amp;` **last** (so `&amp;lt;` doesn't double-decode into `<`).

### 7.2 Parse — bullets to tree

```js
function parseTree(text, rootLabel) {
  var root = { label: rootLabel, children: [], depth: 0 };
  var stack = [{ indent: -1, node: root }];

  text.split("\n").forEach(function(line) {
    var m = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (!m || !m[2].trim()) return;          // skip non-bullets and empty bullets
    var indent = m[1].replace(/\t/g, "    ").length;
    var node = { label: m[2], children: [], depth: 0 };

    while (stack[stack.length - 1].indent >= indent) stack.pop();
    var parent = stack[stack.length - 1].node;
    node.depth = parent.depth + 1;
    parent.children.push(node);
    stack.push({ indent: indent, node: node });
  });

  return root;
}
```

If `text` is empty or contains no bullets, the returned tree has only the root — the renderer handles this by drawing just the hub.

### 7.3 Inline formatting

The `inline()` function from `summary-note-type.md` is lifted **verbatim**, including the code-span placeholder convention. Specifically: HTML escape → park code spans → image/link/emphasis/strikethrough substitutions → restore code spans. The `_italic_` rule stays omitted (same reason: it collides with `snake_case`).

We do **not** lift `parseMarkdown()` or `BLOCK_START` — there are no block-level elements inside a node label.

### 7.4 Side assignment & layout

**Step 1 — split top-level branches:** alternation. Index 0 → right, 1 → left, 2 → right, 3 → left, …

**Step 2 — measure (recursive):**
```
measure(node):
  if node has no children: node.units = 1
  else: node.units = sum(measure(child) for child in node.children)
  return node.units
```

**Step 3 — place (recursive, side-aware):**
```
place(node, topUnits, side):
  node.uy = topUnits + node.units / 2
  node.ux = node.depth * (side === "left" ? -1 : 1)
  cursor = topUnits
  for child in node.children:
    place(child, cursor, side)
    cursor += child.units
```

**Hub centering for asymmetric trees.** Let `leftUnits = sum(units of left top-level branches)` and `rightUnits = sum(units of right top-level branches)`. Set `totalUnits = max(leftUnits, rightUnits)`. Each side starts at its own offset so its branches are vertically centered on the same axis as the hub:

```
leftOffset  = (totalUnits - leftUnits)  / 2
rightOffset = (totalUnits - rightUnits) / 2

for each leftBranch:  place(leftBranch, leftOffset + cursor, "left")
for each rightBranch: place(rightBranch, rightOffset + cursor, "right")
```

The hub is then placed at `(0, totalUnits / 2)`. With this offsetting, a tree with 5 right branches and 1 left branch puts the single left branch directly across from the hub instead of at the top.

**Step 4 — convert units to pixels:**
```
LEVEL_WIDTH = 140      // horizontal distance per depth level
LINE_HEIGHT = 36       // vertical distance per leaf slot
node.x = node.ux * LEVEL_WIDTH
node.y = node.uy * LINE_HEIGHT
```

**Step 5 — bounding box & translation:** walk all nodes once, compute `minX, maxX, minY, maxY` (including each node's estimated or measured width — see Section 7.6), pad by 16px, then translate every node so `(0, 0)` is the top-left.

### 7.5 Render — HTML divs + SVG overlay

Container structure:

```html
<div class="mindmap-canvas" style="width:Wpx; height:Hpx; position:relative">
  <svg class="mindmap-edges" width="W" height="H"
       style="position:absolute; inset:0; pointer-events:none">
    <path d="M ... Q ... ..." stroke="..." stroke-width="2" fill="none"/>
    ...
  </svg>
  <div class="mindmap-node mindmap-hub" data-depth="0"
       style="left:Xpx; top:Ypx">Title</div>
  <div class="mindmap-node" data-branch="0" data-depth="1"
       style="left:Xpx; top:Ypx">Branch label</div>
  <div class="mindmap-node" data-branch="0" data-depth="2"
       style="left:Xpx; top:Ypx">Sub label</div>
  ...
</div>
```

Each rendered node carries two attributes:

- `data-branch="N"` — which top-level branch family (0–7) this node belongs to. Inherited from the top-level ancestor; cycles modulo 8 for branches beyond slot 7. The hub has no `data-branch`.
- `data-depth="N"` — depth from the hub (0 for the hub, 1 for top-level branches, 2+ for descendants). Used by CSS for the depth-based de-emphasis rules in Section 8.2.

Each node is absolutely positioned at its computed `(x, y)`, anchored by **center**, achieved with `transform: translate(-50%, -50%)`. The SVG layer occupies the same coordinate space.

### 7.6 Connector geometry — quadratic Bezier

For a child on the **right** side:
```
start   = (parent.right_edge_x,  parent.y)
control = (child.left_edge_x,    parent.y)
end     = (child.left_edge_x,    child.y)
path    = `M ${start.x},${start.y} Q ${control.x},${control.y} ${end.x},${end.y}`
```

Mirrored for the left side (use `parent.left_edge_x` and `child.right_edge_x`).

The `right_edge_x` and `left_edge_x` of a node are computed after the layout pass by measuring the rendered node width via `getBoundingClientRect()` on a hidden first-pass render. (Alternatively, estimate width as `label.length * 7 + 20` for a simpler one-pass implementation. We will start with the estimate; if labels misalign with connectors, switch to the two-pass measure.)

The connector's `stroke` attribute is set to the destination branch's color (same `data-branch` index).

### 7.7 Center the hub on first paint

```js
var canvas = document.querySelector(".mindmap-canvas");
var scroll = document.querySelector(".mindmap-scroll");
var hub = canvas.querySelector(".mindmap-hub");
scroll.scrollLeft = hub.offsetLeft - scroll.clientWidth / 2;
```

## 8. CSS

Reuses `summary/`'s typography (`Georgia, serif`, light/dark via `prefers-color-scheme`). New rules cover the canvas, the eight branch colors, and the node/connector styling.

### 8.1 Branch colors

```css
.mindmap {
  --branch-0: #2a6df4; --branch-1: #2ea043;
  --branch-2: #d97706; --branch-3: #9333ea;
  --branch-4: #dc2626; --branch-5: #0891b2;
  --branch-6: #db2777; --branch-7: #854d0e;
}

@media (prefers-color-scheme: dark) {
  .mindmap {
    --branch-0: #6aa9ff; --branch-1: #56d364;
    --branch-2: #f59e0b; --branch-3: #c084fc;
    --branch-4: #f87171; --branch-5: #22d3ee;
    --branch-6: #f472b6; --branch-7: #ca8a04;
  }
}

.mindmap-node[data-branch="0"] { border-bottom-color: var(--branch-0); color: var(--branch-0); }
.mindmap-node[data-branch="1"] { border-bottom-color: var(--branch-1); color: var(--branch-1); }
.mindmap-node[data-branch="2"] { border-bottom-color: var(--branch-2); color: var(--branch-2); }
.mindmap-node[data-branch="3"] { border-bottom-color: var(--branch-3); color: var(--branch-3); }
.mindmap-node[data-branch="4"] { border-bottom-color: var(--branch-4); color: var(--branch-4); }
.mindmap-node[data-branch="5"] { border-bottom-color: var(--branch-5); color: var(--branch-5); }
.mindmap-node[data-branch="6"] { border-bottom-color: var(--branch-6); color: var(--branch-6); }
.mindmap-node[data-branch="7"] { border-bottom-color: var(--branch-7); color: var(--branch-7); }
```

(The implementation expands all 8 selectors. Branch indices ≥ 8 cycle modulo 8 in the renderer, so they reuse one of these slots.)

### 8.2 Node styling

```css
.mindmap-scroll  { overflow-x: auto; padding: 8px 0; }
.mindmap-canvas  { margin: 0 auto; }

.mindmap-node {
  position: absolute;
  transform: translate(-50%, -50%);
  font-family: Georgia, serif;
  font-size: 14px;
  padding: 4px 10px;
  border-radius: 14px;
  border-bottom: 2px solid currentColor;
  white-space: nowrap;          /* labels stay on one line */
}

.mindmap-hub {
  font-size: 18px;
  font-weight: bold;
  color: inherit;
  border-bottom: 2px solid currentColor;
  padding: 6px 14px;
}

/* Depth-based de-emphasis for leaves at depth 3+ */
.mindmap-node[data-depth="3"],
.mindmap-node[data-depth="4"],
.mindmap-node[data-depth="5"] {
  font-size: 13px;
  opacity: 0.85;
}
```

### 8.3 Connector styling

Stroke width and linecap go on the SVG path attributes (set in JS). No additional CSS needed for connectors beyond what the SVG attributes provide.

## 9. Edge cases

| Case                                  | Behavior                                                                                  |
|---------------------------------------|-------------------------------------------------------------------------------------------|
| `Mindmap` field empty                 | Render only the hub, centered. SVG layer omitted.                                         |
| `Title` field empty                   | Hub shows literal `(untitled)`. Bullets are **not** promoted to root.                     |
| Single top-level bullet               | Goes on the right side. Left side stays empty.                                            |
| Empty bullet (`-` alone)              | Skipped during parse.                                                                     |
| Mixed `-` and `*` markers             | Treated identically.                                                                      |
| Tabs in indentation                   | Normalized to 4 spaces before depth comparison.                                           |
| Image / heading / fenced code in label | Rendered literally as text. Documented as out of scope.                                  |
| AnkiDroid `<div>` wrapping            | Cleaned up by the lifted pipeline from `summary-note-type.md`.                            |
| Tree wider than the card              | `.mindmap-scroll` provides horizontal scrolling; hub centered on first paint.             |
| More than 8 top-level branches        | Color palette cycles modulo 8. Documented in changelog.                                   |
| Label contains `&`, `<`, `>`          | HTML-escaped by `inline()` (lifted from `summary-note-type.md`).                          |

## 10. Test fixture — `mindmap-sample.md`

Same shape as `summary-sample.md`:

1. **Field paste table** — Title, Subject, Keywords ready to paste.
2. **`=== BEGIN === / === END ===` block** containing the Mindmap field content.
3. **Coverage sections** that each exercise one feature:
   - Two-branch tree (smallest non-trivial case)
   - Five-branch tree (verifies alternation)
   - Three-level deep tree
   - Long-label branch (word wrap + bounding box)
   - Inline formatting in labels (`**bold**`, `*italic*`, `` `code` ``, `[link](url)`, `~~strike~~`)
   - Single-branch tree
   - 10-branch tree (verifies color cycling past slot 7)
   - Mixed `-`/`*` marker tree
4. **Regression checklist** — numbered bullets the reviewer walks through after pasting into Anki, each tied to a specific section above.

## 11. Open implementation choices (non-blocking)

These can be decided during implementation without changing the design:

- **Width measurement**: start with the `length * 7 + 20` estimate; if connectors visibly misalign with node edges on long labels, switch to a two-pass `getBoundingClientRect()` measure.
- **`LEVEL_WIDTH` and `LINE_HEIGHT` constants**: start at 140 / 36 px; tune by visual inspection against the test fixture.
- **Hub border color**: neutral (`currentColor`) by default; could be a 9th palette slot if visual testing shows the hub blending into the background.

## 12. Out of scope (explicitly deferred)

- Block-level markdown inside labels (paragraphs, code blocks, headings, lists nested inside a label, images, tables, blockquotes).
- Collapse/expand interactivity.
- True polar layout.
- Heading-driven mindmaps (`#`/`##` as tree structure).
- Custom per-note color overrides.
- Exporting the rendered mindmap as an image.
