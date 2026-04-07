// Run with: node --test summary/test/*.test.js
//
// These tests load the real inline <script> from back.html (via harness.js)
// and run it in a Node vm sandbox. Each describe() block maps to a section
// of summary-sample.md; regression guards cite the checklist item at the
// bottom of that file (ckl#N).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('./harness');

describe('headings', () => {
  it('renders all six heading levels', () => {
    const out = render('# one\n## two\n### three\n#### four\n##### five\n###### six');
    assert.match(out, /<h1>one<\/h1>/);
    assert.match(out, /<h2>two<\/h2>/);
    assert.match(out, /<h3>three<\/h3>/);
    assert.match(out, /<h4>four<\/h4>/);
    assert.match(out, /<h5>five<\/h5>/);
    assert.match(out, /<h6>six<\/h6>/);
  });

  it('requires a space after #', () => {
    const out = render('#notheading');
    assert.doesNotMatch(out, /<h1/);
    assert.match(out, /<p>#notheading<\/p>/);
  });

  it('supports inline code inside heading', () => {
    const out = render('# The `parseMarkdown` function');
    assert.match(out, /<h1>The <code>parseMarkdown<\/code> function<\/h1>/);
  });

  it('supports bold inside heading', () => {
    const out = render('## Really **important**');
    assert.match(out, /<h2>Really <strong>important<\/strong><\/h2>/);
  });
});

describe('paragraphs and line folding (ckl#2)', () => {
  it('folds three consecutive source lines into one paragraph', () => {
    const out = render('This is a paragraph that spans\nthree source lines but should\nrender as a single logical block.');
    assert.match(out, /<p>This is a paragraph that spans three source lines but should render as a single logical block\.<\/p>/);
  });

  it('blank line separates paragraphs', () => {
    const out = render('first paragraph\n\nsecond paragraph');
    const pCount = (out.match(/<p>/g) || []).length;
    assert.equal(pCount, 2);
    assert.match(out, /<p>first paragraph<\/p>/);
    assert.match(out, /<p>second paragraph<\/p>/);
  });

  it('paragraph fold stops at a heading', () => {
    const out = render('para line\n# heading\nmore text');
    assert.match(out, /<p>para line<\/p>/);
    assert.match(out, /<h1>heading<\/h1>/);
    assert.match(out, /<p>more text<\/p>/);
  });

  it('empty input produces no output', () => {
    const out = render('');
    assert.equal(out, '');
  });
});

describe('inline emphasis (ckl#10)', () => {
  it('renders **bold**', () => {
    assert.match(render('hello **world** there'), /<strong>world<\/strong>/);
  });

  it('renders *italic*', () => {
    assert.match(render('hello *world* there'), /<em>world<\/em>/);
  });

  it('renders ***bold italic*** together', () => {
    assert.match(render('hello ***world*** there'), /<strong><em>world<\/em><\/strong>/);
  });

  it('renders `inline code`', () => {
    assert.match(render('use `console.log()` to debug'), /<code>console\.log\(\)<\/code>/);
  });

  it('leaves asterisks surrounded by whitespace literal', () => {
    // Non-whitespace adjacency rule: `a * b * c` must not become <em>
    const out = render('compute a * b * c manually');
    assert.doesNotMatch(out, /<em>/);
    assert.match(out, /a \* b \* c/);
  });

  it('leaves numeric multiplication literal', () => {
    const out = render('result: 5 * 3 = 15');
    assert.doesNotMatch(out, /<em>/);
  });

  it('nests italic inside bold', () => {
    // Bold replacement runs first, so the outer **...** wraps everything.
    // The italic pass then finds the inner *italic* inside the already-
    // wrapped string and nests it. Reordering the chain in inline() would
    // silently break this.
    const out = render('**bold *italic* bold**');
    assert.match(out, /<strong>bold <em>italic<\/em> bold<\/strong>/);
  });

  it('nests bold inside italic', () => {
    // Symmetric case: **bold** is matched first (bold runs before italic),
    // then the surrounding *italic* wraps the result.
    const out = render('*italic **bold** italic*');
    assert.match(out, /<em>italic <strong>bold<\/strong> italic<\/em>/);
  });

  it('leaves double-asterisk surrounded by whitespace literal', () => {
    // Symmetric to `a * b * c` — the non-whitespace adjacency rule applies
    // to ** as well. Guards against `a ** b ** c` or `5 ** 3` (Python-ish
    // exponentiation) being mangled into <strong>.
    const out = render('phrase a ** b ** c and 5 ** 3 = 125');
    assert.doesNotMatch(out, /<strong>/);
    assert.match(out, /a \*\* b \*\* c/);
  });
});

describe('underscore identifiers (ckl#3)', () => {
  it('preserves snake_case inside inline code', () => {
    const out = render('`user_role_permissions` and `is_active_flag` and `MAX_RETRY_COUNT`');
    assert.match(out, /<code>user_role_permissions<\/code>/);
    assert.match(out, /<code>is_active_flag<\/code>/);
    assert.match(out, /<code>MAX_RETRY_COUNT<\/code>/);
    assert.doesNotMatch(out, /<em>/);
  });

  it('preserves snake_case in plain prose', () => {
    const out = render('the column user_role_permissions stores the role');
    assert.match(out, /user_role_permissions/);
    assert.doesNotMatch(out, /<em>/);
  });
});

describe('HTML entity literal / decode order (ckl#4)', () => {
  it('does not double-decode &amp;lt; into a real <', () => {
    // Anki stores user-typed `&lt;` as doubly-escaped `&amp;lt;`. Decoding
    // `&amp;` first would turn it into `&lt;`, which the next step would
    // then turn into `<` — the old bug. Fix: `&amp;` is decoded LAST.
    const out = render('&amp;lt;div&amp;gt;');
    assert.match(out, /&amp;lt;div&amp;gt;/);
    assert.doesNotMatch(out, /<div[>\s]/);
  });

  it('preserves literal & in prose', () => {
    const out = render('rock &amp; roll');
    assert.match(out, /rock &amp; roll/);
  });
});

describe('inline code edge cases', () => {
  it('escapes HTML tags inside code spans', () => {
    // Anki escapes `<` and `>` before they reach us; pass the entity form.
    const out = render('`&lt;div class="x"&gt;`');
    assert.match(out, /<code>&lt;div class="x"&gt;<\/code>/);
    assert.doesNotMatch(out, /<div class/);
  });

  it('escapes <script> inside code span', () => {
    const out = render('`&lt;script&gt;alert(1)&lt;/script&gt;`');
    assert.match(out, /<code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code>/);
  });

  it('handles && and || literal inside code', () => {
    const out = render('`a &amp;&amp; b || c`');
    assert.match(out, /<code>a &amp;&amp; b \|\| c<\/code>/);
  });

  it('does not parse link syntax inside a code span', () => {
    const out = render('see `[text](url)` for example');
    assert.match(out, /<code>\[text\]\(url\)<\/code>/);
    assert.doesNotMatch(out, /<a href="url"/);
  });

  it('leaves path-like strings intact', () => {
    const out = render('edit `path/to/file.js` now');
    assert.match(out, /<code>path\/to\/file\.js<\/code>/);
  });

  it('escapes <img> tag inside code span', () => {
    // User-typed `<img>` arrives Anki-escaped, so the input has entity form.
    // The img-parker runs on the raw el.innerHTML *before* code spans exist,
    // so this test also guards the implicit contract that Anki pre-escapes
    // `<` in normal field content — a raw `<img>` in user input would be
    // parked before the code span could protect it.
    const out = render('`&lt;img src=x&gt;`');
    assert.match(out, /<code>&lt;img src=x&gt;<\/code>/);
    assert.doesNotMatch(out, /<img /);
  });
});

describe('links (ckl#9)', () => {
  it('renders a basic link', () => {
    const out = render('visit [docs](https://example.com/docs) today');
    assert.match(out, /<a href="https:\/\/example\.com\/docs" target="_blank" rel="noopener">docs<\/a>/);
  });

  it('preserves link text with spaces', () => {
    const out = render('[CommonMark spec](https://commonmark.org/)');
    assert.match(out, /<a href="https:\/\/commonmark\.org\/"[^>]*>CommonMark spec<\/a>/);
  });

  it('renders multiple links in one paragraph', () => {
    const out = render('[one](https://a.com) and [two](https://b.com)');
    const anchorCount = (out.match(/<a href/g) || []).length;
    assert.equal(anchorCount, 2);
  });
});

describe('links with parens in URL (ckl#18)', () => {
  it('handles Wikipedia SQL (programming_language) URL', () => {
    const out = render('[SQL](https://en.wikipedia.org/wiki/SQL_(programming_language))');
    assert.match(out, /<a href="https:\/\/en\.wikipedia\.org\/wiki\/SQL_\(programming_language\)"/);
    assert.match(out, />SQL<\/a>/);
  });

  it('handles Go (programming_language) URL', () => {
    const out = render('[Go](https://en.wikipedia.org/wiki/Go_(programming_language))');
    assert.match(out, /<a href="https:\/\/en\.wikipedia\.org\/wiki\/Go_\(programming_language\)"/);
  });

  it('handles MDN URL with parens', () => {
    const out = render('[URL examples](https://developer.mozilla.org/en-US/docs/Web/API/URL#examples_(section))');
    assert.match(out, /href="[^"]*examples_\(section\)"/);
  });
});

describe('strikethrough (ckl#17)', () => {
  it('renders ~~text~~ as <del>', () => {
    const out = render('use ~~old code~~ never');
    assert.match(out, /<del>old code<\/del>/);
  });

  it('leaves tildes with whitespace literal', () => {
    const out = render('the sentence a ~ b ~ c should stay literal');
    assert.doesNotMatch(out, /<del>/);
    assert.match(out, /a ~ b ~ c/);
  });

  it('nests strikethrough inside bold', () => {
    const out = render('**bold ~~and struck~~ text**');
    assert.match(out, /<strong>bold <del>and struck<\/del> text<\/strong>/);
  });

  it('handles multiple strikethroughs in one line', () => {
    const out = render('~~one~~ and ~~two~~');
    const delCount = (out.match(/<del>/g) || []).length;
    assert.equal(delCount, 2);
  });
});

describe('images (ckl#8)', () => {
  it('renders markdown image syntax', () => {
    const out = render('![my alt](https://example.com/pic.png)');
    assert.match(out, /<img src="https:\/\/example\.com\/pic\.png" alt="my alt">/);
  });

  it('preserves raw <img> tag verbatim', () => {
    const out = render('<img src="https://example.com/x.png" alt="x">');
    assert.match(out, /<img src="https:\/\/example\.com\/x\.png" alt="x">/);
  });

  it('renders image inside a list item', () => {
    const out = render('- before\n- ![alt](https://example.com/y.png)\n- after');
    assert.match(out, /<li><img src="https:\/\/example\.com\/y\.png" alt="alt"><\/li>/);
  });
});

describe('unordered lists', () => {
  it('renders basic unordered list', () => {
    const out = render('- apple\n- banana\n- cherry');
    assert.match(out, /<ul><li>apple<\/li><li>banana<\/li><li>cherry<\/li><\/ul>/);
  });

  it('accepts * as marker', () => {
    const out = render('* one\n* two');
    assert.match(out, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  });

  it('parses inline formatting inside items', () => {
    const out = render('- **bold** item\n- `code` item\n- [link](https://x.com)');
    assert.match(out, /<li><strong>bold<\/strong> item<\/li>/);
    assert.match(out, /<li><code>code<\/code> item<\/li>/);
    assert.match(out, /<li><a href="https:\/\/x\.com"[^>]*>link<\/a><\/li>/);
  });
});

describe('ordered lists (ckl#11)', () => {
  it('renders a basic ordered list starting at 1', () => {
    const out = render('1. first\n2. second\n3. third');
    assert.match(out, /<ol><li>first<\/li><li>second<\/li><li>third<\/li><\/ol>/);
  });

  it('preserves custom starting number', () => {
    const out = render('5. five\n6. six\n7. seven');
    assert.match(out, /<ol start="5">/);
    assert.match(out, /<li>five<\/li>/);
  });

  it('does not emit start="1"', () => {
    const out = render('1. one\n2. two');
    assert.doesNotMatch(out, /start="1"/);
    assert.match(out, /<ol><li>one<\/li>/);
  });

  it('renders single-item ordered list', () => {
    const out = render('1. lonely');
    assert.match(out, /<ol><li>lonely<\/li><\/ol>/);
  });
});

describe('nested lists (ckl#12, #13)', () => {
  it('nests ul inside ul (2-space indent)', () => {
    const out = render('- outer\n  - inner\n  - inner2\n- outer2');
    assert.match(out, /<ul><li>outer<ul><li>inner<\/li><li>inner2<\/li><\/ul><\/li><li>outer2<\/li><\/ul>/);
  });

  it('nests ol inside ul', () => {
    const out = render('- steps:\n  1. one\n  2. two');
    assert.match(out, /<ul><li>steps:<ol><li>one<\/li><li>two<\/li><\/ol><\/li><\/ul>/);
  });

  it('nests ul inside ol', () => {
    const out = render('1. read\n   - highlight\n   - star');
    assert.match(out, /<ol><li>read<ul><li>highlight<\/li><li>star<\/li><\/ul><\/li><\/ol>/);
  });

  it('handles three levels of nesting', () => {
    const out = render('- Biology\n  - Cell biology\n    - Membrane transport');
    assert.match(out, /<ul><li>Biology<ul><li>Cell biology<ul><li>Membrane transport<\/li><\/ul><\/li><\/ul><\/li><\/ul>/);
  });

  it('switches list type at same depth', () => {
    const out = render('- a\n- b\n1. c\n2. d');
    assert.match(out, /<ul><li>a<\/li><li>b<\/li><\/ul><ol><li>c<\/li><li>d<\/li><\/ol>/);
  });

  it('preserves custom start in nested ordered list', () => {
    const out = render('- outer\n  5. five\n  6. six');
    assert.match(out, /<ul><li>outer<ol start="5">/);
  });

  it('normalizes tabs to 4 spaces in list indentation', () => {
    // buildNestedList does `match[1].replace(/\t/g, "    ").length` to
    // measure depth, so a tab-indented child is treated as depth 4 —
    // deeper than the depth-0 parent, which opens a nested list.
    // Guards against someone removing the tab-normalization step.
    const out = render('- outer\n\t- inner');
    assert.match(out, /<ul><li>outer<ul><li>inner<\/li><\/ul><\/li><\/ul>/);
  });
});

describe('task lists (ckl#15, #16)', () => {
  it('renders unchecked task', () => {
    const out = render('- [ ] buy milk');
    assert.match(out, /<li class="task"><input type="checkbox" disabled> buy milk<\/li>/);
  });

  it('renders checked task (lowercase x)', () => {
    const out = render('- [x] done');
    assert.match(out, /<li class="task"><input type="checkbox" disabled checked> done<\/li>/);
  });

  it('accepts capital X for checked', () => {
    const out = render('- [X] done');
    assert.match(out, /<input type="checkbox" disabled checked>/);
  });

  it('mixes task and non-task items in one list', () => {
    const out = render('- [ ] todo\n- regular\n- [x] done');
    assert.match(out, /<li class="task"><input[^>]+disabled> todo/);
    assert.match(out, /<li>regular<\/li>/);
    assert.match(out, /<li class="task"><input[^>]+checked> done/);
  });

  it('nests task list inside regular list', () => {
    const out = render('- plan\n  - [x] step 1\n  - [ ] step 2');
    assert.match(out, /<li>plan<ul><li class="task"><input[^>]+checked> step 1<\/li>/);
  });

  it('renders task list inside ordered list', () => {
    const out = render('1. morning\n   - [x] coffee\n   - [ ] email');
    assert.match(out, /<ol><li>morning<ul><li class="task"><input[^>]+checked> coffee/);
  });
});

describe('blockquotes', () => {
  it('renders single-line blockquote', () => {
    const out = render('> a reminder');
    assert.match(out, /<blockquote>a reminder<\/blockquote>/);
  });

  it('joins multi-line blockquote with <br>', () => {
    const out = render('> line one\n> line two\n> line three');
    assert.match(out, /<blockquote>line one<br>line two<br>line three<\/blockquote>/);
  });

  it('parses inline formatting inside blockquote', () => {
    const out = render('> this is **bold** inside');
    assert.match(out, /<blockquote>this is <strong>bold<\/strong> inside<\/blockquote>/);
  });
});

describe('horizontal rule (ckl#5)', () => {
  it('renders --- as <hr>', () => {
    const out = render('above\n\n---\n\nbelow');
    assert.match(out, /<hr>/);
    assert.match(out, /<p>above<\/p>/);
    assert.match(out, /<p>below<\/p>/);
  });

  it('accepts longer dash runs', () => {
    const out = render('text\n\n-----\n\nmore');
    assert.match(out, /<hr>/);
  });

  it('--- after a paragraph becomes <hr>, not a setext heading', () => {
    const out = render('paragraph\n---');
    assert.match(out, /<hr>/);
    assert.doesNotMatch(out, /<h2>paragraph<\/h2>/);
  });
});

describe('fenced code blocks (ckl#6)', () => {
  it('renders triple-backtick fence', () => {
    const out = render('```\nhello world\n```');
    assert.match(out, /<pre><code>hello world<\/code><\/pre>/);
  });

  it('escapes HTML inside code fence', () => {
    const out = render('```\n&lt;div class="x"&gt;text&lt;/div&gt;\n```');
    assert.match(out, /<pre><code>&lt;div class="x"&gt;text&lt;\/div&gt;<\/code><\/pre>/);
    assert.doesNotMatch(out, /<div class="x">/);
  });

  it('preserves multi-line content', () => {
    const out = render('```\nline 1\nline 2\nline 3\n```');
    assert.match(out, /<pre><code>line 1\nline 2\nline 3<\/code><\/pre>/);
  });

  it('accepts (but does not emit) a language tag on the opening fence', () => {
    // The fence regex is `^```` with no length/tag constraint, so ```js
    // is a valid opener. The language identifier is discarded — the
    // parser doesn't do syntax highlighting. This test guards against a
    // future refactor that tightens the opener regex and accidentally
    // breaks language-tagged fences.
    const out = render('```js\nconst x = 1;\n```');
    assert.match(out, /<pre><code>const x = 1;<\/code><\/pre>/);
    // The "js" tag should not appear as text in the output
    assert.doesNotMatch(out, /<pre><code>js/);
  });
});

describe('tables (ckl#7)', () => {
  it('renders a basic 3-column table', () => {
    const out = render('| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |');
    assert.match(out, /<table><thead><tr><th>a<\/th><th>b<\/th><th>c<\/th><\/tr><\/thead>/);
    assert.match(out, /<tbody><tr><td>1<\/td><td>2<\/td><td>3<\/td><\/tr><\/tbody>/);
  });

  it('requires a header separator row', () => {
    const out = render('| a | b |\n| 1 | 2 |');
    assert.doesNotMatch(out, /<table/);
  });

  it('parses inline formatting in cells', () => {
    const out = render('| col |\n|---|\n| **bold** |');
    assert.match(out, /<td><strong>bold<\/strong><\/td>/);
  });

  it('handles multiple body rows', () => {
    const out = render('| x |\n|---|\n| 1 |\n| 2 |\n| 3 |');
    const tdCount = (out.match(/<td>/g) || []).length;
    assert.equal(tdCount, 3);
  });

  it('renders empty cells as empty <td>', () => {
    const out = render('| a | b | c |\n|---|---|---|\n| 1 |   | 3 |');
    assert.match(out, /<td>1<\/td><td><\/td><td>3<\/td>/);
  });
});

describe('escaped pipes in tables (ckl#19)', () => {
  it('renders literal | from \\|', () => {
    const out = render('| pattern | meaning |\n|---|---|\n| a \\| b | alternation |');
    assert.match(out, /<td>a \| b<\/td>/);
    assert.match(out, /<td>alternation<\/td>/);
  });

  it('handles double-escaped pipes', () => {
    const out = render('| expr | meaning |\n|---|---|\n| x \\|\\| y | or |');
    assert.match(out, /<td>x \|\| y<\/td>/);
  });

  it('preserves escaped pipe inside inline code in a cell', () => {
    const out = render('| cmd |\n|---|\n| `cat file \\| grep foo` |');
    assert.match(out, /<td><code>cat file \| grep foo<\/code><\/td>/);
  });
});

describe('Anki HTML unwrapping', () => {
  it('converts <div> wrapping to newlines', () => {
    const out = render('<div>first line</div><div>second line</div>');
    assert.match(out, /<p>first line second line<\/p>/);
  });

  it('converts <br> to newline', () => {
    const out = render('before<br>after');
    assert.match(out, /<p>before after<\/p>/);
  });

  it('decodes &nbsp; to space', () => {
    const out = render('word1&nbsp;word2');
    assert.match(out, /<p>word1 word2<\/p>/);
  });

  it('handles mix of <div> and <br>', () => {
    const out = render('<div>line1<br>line2</div><div>line3</div>');
    assert.match(out, /<p>line1 line2 line3<\/p>/);
  });

  it('strips unknown HTML tags', () => {
    const out = render('hello <span class="foo">inner</span> world');
    assert.match(out, /<p>hello inner world<\/p>/);
  });
});

describe('block transitions without blank lines', () => {
  // These tests exist to catch the class of bug where a refactor of the
  // main parseMarkdown loop forgets to `continue` after emitting a block,
  // or miscounts `i` so the next block gets absorbed by the previous one.
  // Each test asserts that two adjacent blocks of different types render
  // as two separate siblings with no interleaving.

  it('heading immediately followed by list', () => {
    const out = render('# Title\n- item 1\n- item 2');
    assert.match(out, /<h1>Title<\/h1><ul><li>item 1<\/li><li>item 2<\/li><\/ul>/);
  });

  it('list immediately followed by paragraph', () => {
    const out = render('- item 1\n- item 2\nparagraph text');
    assert.match(out, /<ul><li>item 1<\/li><li>item 2<\/li><\/ul><p>paragraph text<\/p>/);
  });

  it('paragraph immediately followed by heading', () => {
    const out = render('some prose\n## Section');
    assert.match(out, /<p>some prose<\/p><h2>Section<\/h2>/);
  });

  it('paragraph immediately followed by fenced code block', () => {
    const out = render('some prose\n```\ncode\n```');
    assert.match(out, /<p>some prose<\/p><pre><code>code<\/code><\/pre>/);
  });

  it('blockquote immediately followed by paragraph', () => {
    const out = render('> quote\nprose');
    assert.match(out, /<blockquote>quote<\/blockquote><p>prose<\/p>/);
  });

  it('fenced code block immediately followed by heading', () => {
    const out = render('```\ncode\n```\n# After');
    assert.match(out, /<pre><code>code<\/code><\/pre><h1>After<\/h1>/);
  });
});
