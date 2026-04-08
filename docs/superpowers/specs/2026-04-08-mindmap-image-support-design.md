# Mindmap image support — design

## Goal

Add image rendering to mindmap node labels. Two input forms must work:

1. **Anki-pasted images** — `<img src="paste-xxx.png">` tags that Anki injects when the user pastes an image into the Mindmap field.
2. **Markdown image syntax** — `![alt](file.png)` typed inside a bullet label.

The mindmap currently strips both forms during the HTML cleanup pass and the note-type doc explicitly lists images under "What's not supported". This design lifts that restriction.

## Non-goals

- Image-only mindmap nodes are supported but not specially designed for; sizing follows the same `max-width: 200px` cap as text nodes.
- No support for explicit `=WxH` width/height extensions in markdown image syntax. CSS bounds the size; the user does not specify dimensions.
- No support for SVG, video, or other embeds. `<img>` only.
- No support for lazy loading. All images render before the mindmap appears.

## Constraints

- The mindmap renderer at `mindmap/back.html:158-238` uses **DOM measurement** (`offsetWidth` / `offsetHeight`) to compute node positions. A freshly inserted `<img>` measures as ~0×0 until the file decodes, which would cause image-bearing nodes to collapse and corrupt the layout.
- The sibling `summary/back.html` template solved the input-side problem (parking `<img>` past the strip pass) at lines 237-266. Mindmap should reuse that pattern verbatim for diff-ability between the two templates.
- The IIFE structure of `back.html` and the `inline()` sentinel convention for backtick code spans (`\u0000C<n>\u0000`) must be preserved.

## Architecture

Two changes, in two phases of the existing pipeline:

### Phase 1 — Cleanup (parser side, sentinel pattern)

Mirror `summary/back.html:237-266`:

1. Before any HTML stripping, scan `el.innerHTML` for `<img[^>]*>` matches and replace each with `\u0000I<n>\u0000`. Store the original tags in a closure-scoped `imgs[]` array.
2. Run the existing `cleanupAnkiHtml` HTML-strip pipeline on the result. Sentinels are opaque to all the strip regexes (they're plain `\u0000`-bracketed digits) and survive untouched.
3. Run `parseTree` on the cleaned text. Sentinels survive parsing because the bullet-line regex `^(\s*)[-*]\s+(.*)$` captures them as part of the label.
4. Inside `inline()`, after the existing backtick-restore step at `back.html:43-45`, add a parallel restore: replace `\u0000I(\d+)\u0000` with `imgs[idx]`.

The `imgs[]` array lives in the IIFE closure alongside `cleanupAnkiHtml` and `inline`, not threaded as a parameter. This keeps the public surface of both functions unchanged.

Markdown-syntax images (`![alt](file.png)`) continue to be handled by the existing regex at `back.html:37` — no change required for that path. The sentinel restore step adds support for the Anki-pasted form.

### Phase 2 — Render (layout side, async measurement gate)

Replace the synchronous render flow at `back.html:158-238`:

```
clear → build fragment → insert → measure → assignX/Y → computeBounds → write positions → build SVG
```

with an async-gated version:

```
clear → build fragment → insert
  → collect <img> nodes inside canvas
  → Promise.all(imgs.map(decodeOrLoad))
  → .then: measure → assignX/Y → computeBounds → write positions → build SVG
```

Key details:

- **`decodeOrLoad(img)`** prefers `img.decode()` (resolves only when the image is ready to paint, no forced layout). Falls back to a `new Promise(resolve => { img.onload = img.onerror = resolve })` if `img.decode` is undefined. Both branches are wrapped in `.catch(()=>{})` so a single broken image cannot block the whole `Promise.all`.
- The `Promise.all([])` case (no images in the tree) resolves on the next microtask — imperceptible delay, no behavior change for image-free mindmaps.
- The `renderMindmap` function does not need to *return* a Promise to its caller. The IIFE main block at `back.html:241-247` has nothing sequenced after `renderMindmap(tree, el)`, so making the post-insert work async-internal is invisible to the rest of the file.

### CSS

Add to `mindmap/style.css` after the existing `.mindmap-node code` rule:

```css
.mindmap-node img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 2px 0;
}
```

- `max-width: 100%` chains to the existing `.mindmap-node { max-width: 200px }` cap, bounding worst-case image width.
- `height: auto` preserves aspect ratio.
- `display: block` removes the inline-baseline gap so an image-only node renders as a clean rectangle.

## Data flow

```
Anki HTML field
  │ (innerHTML)
  ▼
[park <img> sentinels]  ──── imgs[] (closure)
  │
  ▼
cleanupAnkiHtml (strip <div>/<br>/HTML, decode entities)
  │
  ▼
parseTree (nested bullet → tree of {label, children, depth})
  │
  ▼ for each node.label:
inline(label)
  ├─ park backtick code spans
  ├─ escape & < >
  ├─ markdown image regex  ![alt](src) → <img src="src" alt="alt">
  ├─ markdown link / strong / em / del
  ├─ restore backtick code spans
  └─ restore <img> sentinels  ←── imgs[]
  │
  ▼
build DocumentFragment of .mindmap-node divs (insertAdjacentHTML)
  │
  ▼
canvas.appendChild(fragment)   ← single layout
  │
  ▼
collect canvas.querySelectorAll('img')
  │
  ▼
Promise.all(decodeOrLoad per img)   ← gate
  │
  ▼ then:
measure (offsetWidth/offsetHeight per node)
assignX → assignY → computeBounds
batch-write final left/top
build & insert SVG connectors
```

## Error handling

| Failure | Behavior |
|---|---|
| Image file missing (404) | `decodeOrLoad` resolves via `.catch`. Node measures small. Browser draws its broken-image glyph in place. Layout proceeds. |
| `img.decode` undefined | Fall back to `load`/`error` event Promise. Same outer behavior. |
| Sentinel restore vs. code-span restore order | `inline()` restores backticks first, then images. The sentinel namespaces (`\u0000C` vs `\u0000I`) cannot collide. |
| Multiple `<img>` tags in one bullet | Each gets its own `\u0000I<n>\u0000`; restoration is index-based and order-preserving. |
| Image inside `**bold**`, `*italic*`, `[link]`, etc. | Sentinel is opaque to inline regexes (digits between nulls), so wrapping markup applies cleanly around the eventual `<img>`. |

## Testing

Manual regression via `mindmap/mindmap-sample.md`. Updates required:

1. Insert a new top-level branch between "Inline formatting branch" and "Single-leaf branch", so it lands at the 6th top-level position:
   ```
   - Image branch
     - Markdown image: ![tiny dot](_test-dot.png)
     - Pasted image leaf <img src="_test-dot.png">
     - Text + ![inline](_test-dot.png) image
   ```
2. Add a regression-checklist item: "The Image branch shows three children, each with the test image rendered (not raw `<img>` markup, no broken-image icon)."
3. Add `_test-dot.png` (any small image, e.g. 16×16) to the Anki media folder when running the fixture.

**Fixture invariant note (no edit required, but worth knowing):** The existing fixture currently has 9 top-level branches even though checklist item 2 claims "exactly 10". Inserting "Image branch" as the 6th bullet brings the count to exactly 10, which makes both checklist item 2 (count) and checklist item 4 (color cycling: branches 9 and 10 reuse colors 1 and 2 = blue and green) accurate. This change therefore corrects a pre-existing fixture inconsistency as a side effect, with no edits to checklist items 2 or 4.

Documentation update:

- `mindmap/mindmap-note-type.md:22` — remove "images" from the "What's not supported" list.
- `mindmap/mindmap-note-type.md` "What's supported" section — add a bullet noting both Anki-pasted `<img>` tags and markdown `![alt](src)` syntax work inside node labels.

## Files touched

| File | Change |
|---|---|
| `mindmap/back.html` | Sentinel parking in cleanup; sentinel restore inside `inline()`; async image-decode gate before measurement in `renderMindmap` |
| `mindmap/style.css` | Add `.mindmap-node img` rule |
| `mindmap/mindmap-sample.md` | Add Image branch + checklist item; bump top-level branch count |
| `mindmap/mindmap-note-type.md` | Move images from "Not supported" to "Supported" |

No new files. No new dependencies. No changes to `front.html` or to the summary template.
