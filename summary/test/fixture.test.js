// End-to-end smoke test: render the entire === BEGIN === / === END ===
// block from summary-sample.md and assert on high-level structural
// invariants. This catches cross-feature interaction bugs that focused
// tests in parser.test.js would miss.
//
// Run with: node --test summary/test/*.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { render } = require('./harness');

function loadSample() {
  const p = path.join(__dirname, '..', 'summary-sample.md');
  const raw = fs.readFileSync(p, 'utf8');
  // Anchor to line start so we don't match the markers when they appear
  // inside backticks in the intro (e.g. "the `=== BEGIN ===` markers").
  const match = raw.match(/^=== BEGIN ===\s*([\s\S]*?)^=== END ===/m);
  if (!match) {
    throw new Error('no BEGIN/END markers found in summary-sample.md');
  }
  return match[1].trim();
}

// Simulate what Anki does to user-typed content before storing it in a
// field: escape `&`, `<`, `>` as HTML entities. The fixture file is plain
// markdown written for humans, so raw `<` chars (like `x <= y` inside a
// code span) would otherwise get eaten by the parser's general tag-strip
// regex. Ankifying matches the shape of input back.html's unwrap pipeline
// expects to receive.
//
// Order matters: replace `&` FIRST, then `<` and `>`. Otherwise the later
// replacements would double-escape the ampersands we just introduced —
// the mirror image of the parser's own decode-order regression (ckl#4).
function ankify(raw) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

test('full fixture renders with every major feature intact', () => {
  const fixture = loadSample();
  const out = render(ankify(fixture));

  // All six heading levels present
  for (const level of [1, 2, 3, 4, 5, 6]) {
    assert.match(out, new RegExp(`<h${level}>`), `missing <h${level}>`);
  }

  // Ordered list with custom start (the "5. 6. 7." section)
  assert.match(out, /<ol start="5">/);

  // Task-list checkboxes — sample has many; require at least 4
  const checkboxes = (out.match(/<input type="checkbox"/g) || []).length;
  assert.ok(checkboxes >= 4, `expected >=4 checkboxes, got ${checkboxes}`);

  // At least 2 fenced code blocks
  const preBlocks = (out.match(/<pre><code>/g) || []).length;
  assert.ok(preBlocks >= 2, `expected >=2 <pre><code> blocks, got ${preBlocks}`);

  // At least 2 tables
  const tables = (out.match(/<table>/g) || []).length;
  assert.ok(tables >= 2, `expected >=2 tables, got ${tables}`);

  // Regression ckl#3: snake_case identifiers survive verbatim
  assert.match(out, /user_role_permissions/);
  assert.match(out, /is_active_flag/);
  assert.match(out, /MAX_RETRY_COUNT/);
  assert.match(out, /created_at/);
  assert.match(out, /updated_at/);

  // Regression ckl#3: no <em> tag containing "role" — would mean _role_
  // was parsed as italic
  assert.doesNotMatch(out, /<em>[^<]*role[^<]*<\/em>/);

  // Regression ckl#4: literal <div> entity preserved as visible text, not
  // a real DOM element. The fixture's `&lt;div&gt;` goes through ankify
  // (→ `&amp;lt;div&amp;gt;`) then through inline()'s escape pass, so the
  // HTML source form is `&amp;lt;div&amp;gt;`. It renders as `&lt;div&gt;`.
  assert.match(out, /&amp;lt;div&amp;gt;/);
  // And no real <div> tag ever leaks into the output
  assert.doesNotMatch(out, /<div[>\s]/);

  // Regression ckl#18: Wikipedia-style URLs with parens (at least 3)
  const parenUrls = (out.match(/href="[^"]*\)"/g) || []).length;
  assert.ok(parenUrls >= 3, `expected >=3 href ending in ), got ${parenUrls}`);

  // Strikethrough section
  assert.match(out, /<del>/);

  // Horizontal rule section
  assert.match(out, /<hr>/);

  // Blockquote section
  assert.match(out, /<blockquote>/);

  // Regression ckl#19: escaped pipes in the table cells. The fixture wraps
  // the pipe expressions in `<code>` spans, so assert on that specific form
  // rather than a generic "any <td> with a pipe" pattern.
  assert.match(out, /<code>a \| b<\/code>/);
  assert.match(out, /<code>cat file \| grep foo<\/code>/);

  // Note: image rendering is intentionally NOT asserted here. Ankifying the
  // fixture encodes the raw <img> tag into `&lt;img ...&gt;`, so it renders
  // as visible text rather than a real img element. Image handling is
  // covered by the focused tests in parser.test.js instead.
});

test('Mixed real-world example section combines features correctly', () => {
  // The "Mixed real-world example" section in the fixture exercises
  // multiple features inside a single logical block: an ordered list
  // whose items contain inline emphasis, inline code, and triple
  // emphasis, followed by a multi-line blockquote, followed by a link.
  // If a cross-feature interaction breaks, this test should catch it.
  const out = render(ankify(loadSample()));

  // Ordered list items with inline emphasis and code
  assert.match(out, /<li><em>Passive<\/em> transport[^<]*<code>no_energy<\/code>/);
  assert.match(out, /<li><em>Active<\/em> transport[^<]*<code>ATP<\/code>/);
  assert.match(out, /<li><strong>Bulk<\/strong> transport/);

  // Triple emphasis nested inside a list item
  assert.match(out, /<strong><em>large molecules<\/em><\/strong>/);

  // Multi-line blockquote with <br> separators between the three lines
  assert.match(out, /<blockquote>Rule of thumb[^<]*<br>[^<]*<br>[^<]*<\/blockquote>/);

  // Wikipedia link in the mixed section
  assert.match(
    out,
    /<a href="https:\/\/en\.wikipedia\.org\/wiki\/Cell_membrane"[^>]*>Wikipedia article on cell membranes<\/a>/
  );

  // Intro paragraph with bolded phrase
  assert.match(out, /<p>The <strong>three main types<\/strong> of membrane transport are:<\/p>/);
});
