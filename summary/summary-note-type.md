# Summary Note Type — Patched

Drop-in replacements for the Anki **Summary** note type. All high-priority bugs from the review are fixed.

## Fields

1. `Title`
2. `Subject` (optional)
3. `Keywords` (optional)
4. `Summary` (markdown)

---

## Templates

The card template code lives in sibling files so it can be tested and
edited directly. `back.html` is the single source of truth — the test
harness in `test/harness.js` loads its inline `<script>` at test time, so
there is no separate parser copy to keep in sync.

| Anki template slot | File |
|---|---|
| Front Template | [`front.html`](./front.html) |
| Back Template  | [`back.html`](./back.html) |
| Styling        | [`style.css`](./style.css) |

To install in Anki: open the Summary note type's card template editor and
paste each file's contents into the matching slot.

## Tests

```sh
node --test summary/test/*.test.js
```

77 tests grouped by feature in `test/parser.test.js` plus one end-to-end
smoke test in `test/fixture.test.js` that renders the entire
[`summary-sample.md`](./summary-sample.md) fixture through the parser.

---

## Changelog vs. previous version

| # | Fix | Why it matters |
|---|-----|----------------|
| 1 | Decode `&amp;` **last** | Previously `&amp;lt;` would double-decode into `<`, corrupting any literal entity in your notes. |
| 2 | Removed `_italic_` rule | It mangled `snake_case_identifiers`. `*italic*` still works. |
| 3 | Convert `<div>` wrappers to `\n` before stripping | AnkiDroid wraps each line in `<div>`, not `<br>` — without this, lines silently collapsed. |
| 4 | Paragraph folding | Consecutive non-blank lines now form **one** `<p>`, matching standard markdown. |
| 5 | Image tags restored verbatim | No more duplicate `style=""` attributes. CSS `.summary img` is the single source of truth. |
| 6 | Fenced code blocks (` ``` `) restored | Multi-line code samples now render in `<pre><code>`. |
| 7 | Inline `code` is HTML-escaped | `` `<div>` `` now displays as text instead of being parsed as a tag. |
| 8 | Link support `[text](url)` | Common markdown feature that was missing. |
| 9 | Horizontal rule (`---` on its own line) | Adds a section divider. |
| 10 | `.summary > *:first-child { margin-top: 0 }` | Removes awkward gap below the back-header. |
| 11 | `.summary pre` styles + `pre code` background reset | Fenced blocks look consistent in light & dark mode. |
| 12 | `.summary a` styles + dark mode | Links are now visible. |
| 13 | Per-level heading sizes (h1–h6) | Previously **all** headings shared `font-size: 16px`, killing the visual hierarchy. |
| 14 | HTML-escape prose inside `inline()` | Literal `x < y`, `a && b`, `foo > 5` in free text no longer break the DOM — `<` is escaped to `&lt;` before substitutions. |
| 15 | Code spans parked behind placeholders | `` `[text](url)` `` inside a code span is no longer rewritten into an `<a>` tag. Placeholder substitution isolates code from every other inline rule. |
| 16 | Emphasis requires non-whitespace adjacency | `a * b * c` and `5 * 3` no longer get mangled into `<em>` tags. Uses ES2018 lookbehind — supported on every Anki WebView in current use. |
| 17 | Markdown image syntax `![alt](url)` | You can now write images the markdown way in addition to raw `<img>` HTML. Runs before the link rule so `!` prefix wins. |
| 18 | Links open externally | `target="_blank" rel="noopener"` — on Anki desktop this opens the system browser; `rel="noopener"` is standard hygiene. |
| 19 | Ordered lists preserve starting number | `3. foo` now renders as `<ol start="3">`, matching CommonMark. Lists starting at 1 still emit a bare `<ol>`. |
| 20 | `word-break: break-word` on `.title` / `.back-title` | Very long single-word titles no longer overflow the card horizontally. |
| 21 | Nested lists (stack-based) | Arbitrary depth, mixed `-`/`*`/`1.` at any level, tab-normalized indent. Nested lists nest **inside** the parent `<li>` (spec-correct). Indent 2 spaces per level. |
| 22 | Escaped pipes in table cells (`\|`) | `splitRow()` replaces `\|` with a `\u0000` sentinel before splitting on `|`, then restores. `\| code \| pipe \|` now survives as a literal cell value. |
| 23 | Link/image URLs allow balanced parens | `https://en.wikipedia.org/wiki/Foo_(bar)` now matches correctly. Regex uses `(?:[^()]\|\([^)]*\))+` for one level of nesting — covers all real-world cases. |
| 24 | Strikethrough `~~text~~` | Standard GFM strikethrough via `<del>`. Uses the same non-whitespace adjacency rule as emphasis so `a ~ b ~ c` stays literal. |
| 25 | Task lists `- [ ]` / `- [x]` | Rendered as disabled checkboxes inside `<li class="task">`. Works at any nesting depth, mixed with regular items, and inside ordered lists. `[X]` (capital) also accepted. |
| 26 | Extract `openListTag()` helper | Deduped the two near-identical list-opening branches in `buildNestedList`. `openTag2`/`startNum2` suffixes gone. |
| 27 | Unified placeholder sentinels on `\u0000` | `<img>`, inline code spans, and escaped pipes now share the same sentinel convention — consistency and no risk of collision with literal `%%IMG_N%%` in user text. |
| 28 | Moved `_italic_` comment next to emphasis rules | Was orphaned after `return` in `inline()`, effectively invisible to readers. |
| 29 | Renamed inner loop counters | `ci`/`ti` → `end` (both scans look for block end); `k` → `i` (standard). |
| 30 | Extracted `BLOCK_START` regex constant | Paragraph-fold stop pattern is now a named, documented constant — reduces drift risk when adding new block types. |
| 31 | Annotated cleanup pipeline per step | Main execution flow now labels each stage (park images → normalize breaks → strip tags → decode entities → parse → restore images). |
| 32 | Clarified `.summary strong`/`em` | Added comment explaining they're defensive resets for Anki's base stylesheet. |
| 33 | Removed redundant `text-decoration: line-through` from `.summary del` | `<del>` has strikethrough as the browser default. |
| 34 | Moved `.summary img` next to `.summary pre` | Groups block-level media styles together instead of dangling at the end. |
| 35 | Reduced summary heading sizes | `h1 20 / h2 18 / h3 16` — so summary `# Heading` no longer competes with the 22px card title above it. |
| 36 | Fix infinite loop on malformed tables | Removed `\|` from `BLOCK_START` and added a table-start check in the paragraph fold. A table line without a separator row used to hang the main loop because `BLOCK_START` said "block" while the table branch rejected it. |
| 37 | Extracted templates to `front.html` / `back.html` / `style.css` | `back.html` is now the single source of truth. Automated tests in `test/` load its inline `<script>` via a Node vm sandbox — see `test/harness.js`. |
| 38 | Italic no longer eats into `**` pairs | Added `(?<!\*)` / `(?!\*)` lookarounds on the italic regex so `a ** b ** c` and `5 ** 3` stay literal instead of rendering as `a <em>* b *</em> c`. The old non-whitespace-adjacency rule forbade whitespace next to `*` but not another `*`, so italic was stealing one `*` out of every whitespace-flanked `**` pair. |
