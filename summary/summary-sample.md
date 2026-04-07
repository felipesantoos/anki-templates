# Anki Summary Note — Full Feature Sample

This file is a test fixture for the patched **Summary** note type. It exercises every supported markdown feature **and** includes lines that reproduce the specific bugs fixed in the latest version — so if you see any of them render incorrectly, a regression has sneaked in.

## Fields to paste

| Field    | Value |
|----------|-------|
| Title    | Markdown Feature Showcase |
| Subject  | Test |
| Keywords | markdown, features, edge cases, regression |

## Summary field content

Copy everything between the `=== BEGIN ===` and `=== END ===` markers into the Summary field of your new note.

=== BEGIN ===

# Heading level 1 — page title
## Heading level 2 — major section
### Heading level 3 — subsection
#### Heading level 4 — deeper
##### Heading level 5 — fine grained
###### Heading level 6 — smallest

## Paragraphs & line folding

This is a paragraph that spans
three source lines but should
render as a single logical block.

This is a second paragraph, separated by a blank line. It verifies that consecutive paragraphs stay visually separated and do not merge into the previous one.

A third, short paragraph to round things out.

## Inline emphasis

Regular text, then **bold text**, then *italic text*, then ***bold and italic at once***.

You can combine emphasis with `inline code` inside the same sentence — for example the function **`parseMarkdown()`** returns an *HTML string*.

## Links

Visit the [official Anki manual](https://docs.ankiweb.net/) for deeper coverage, or jump to [CommonMark](https://commonmark.org/) for the reference spec. Links should be visible in both light and dark modes.

## Inline code — with edge cases

Simple: `console.log("hi")`.

HTML inside inline code must be shown as text, not parsed: `<div class="container">`, `<script>alert(1)</script>`, `<img src=x>`.

Special characters: `a && b || c`, `x <= y`, `path/to/file.js`, `user_id == 42`.

## Underscore identifiers (regression check)

The old parser mangled these. All three should appear untouched:

- `user_role_permissions`
- `is_active_flag`
- `MAX_RETRY_COUNT`

Used inline: the column `created_at` stores the insert timestamp, while `updated_at` tracks the latest change.

## HTML entity literal (regression check)

If the decoder runs in the wrong order, `&lt;` silently becomes `<`. This line should render as a literal: `&lt;div&gt;`. And this sentence should show the ampersand plainly: "rock & roll".

## Unordered list

- Simple item
- Item with **bold** and *italic*
- Item with [a link](https://example.com)
- Item with `snake_case_code`
- Item with ***all three*** kinds of emphasis at once

## Ordered list

1. First, read the source material.
2. Then, identify the atomic facts.
3. Next, write one card per fact.
4. Finally, review on the spaced-repetition schedule.

## Ordered list — custom start

5. This list starts at five (should render `<ol start="5">`).
6. Second visible item shows **six**.
7. Third visible item shows **seven**.

## Nested lists — unordered inside unordered

- Passive transport
  - Simple diffusion
  - Osmosis
  - Facilitated diffusion
- Active transport
  - Primary active transport
  - Secondary active transport
- Bulk transport

## Nested lists — ordered inside unordered

- Cell membrane transport
  1. Identify the concentration gradient.
  2. Determine whether ATP is required.
  3. Classify the transport mechanism.
- Key takeaway: the gradient tells you whether it's passive or active.

## Nested lists — unordered inside ordered

1. Read the chapter.
   - Highlight unfamiliar terms.
   - Star the key diagrams.
2. Summarize the section.
   - One sentence per subsection.
   - Link back to the source page.
3. Create Anki cards from the summary.

## Nested lists — three levels deep

- Biology
  - Cell biology
    - Membrane transport
    - Cell signaling
    - Cell division
  - Genetics
    - Mendelian inheritance
    - Molecular genetics
- Chemistry
  - Organic
    - Functional groups
    - Reaction mechanisms
  - Inorganic

## Nested lists — mixed markers and custom start

1. Morning routine
   - Wake up at 6 AM
   - Drink water
   - Stretch
2. Study session
   3. Review yesterday's cards
   4. Learn new material
   5. Take notes in markdown
3. Evening routine
   * Dinner
   * Read
   * Sleep

## Task lists

- [ ] Unchecked task
- [x] Checked task (lowercase x)
- [X] Also checked (capital X)
- [ ] Another todo item
- Regular list item mixed in with tasks
- [x] Final done item

## Task lists — nested inside a regular list

- Study plan
  - [x] Read chapter 3
  - [x] Highlight key terms
  - [ ] Write summary
  - [ ] Create Anki cards
- Review plan
  - [ ] Flip today's due cards
  - [ ] Rate each card honestly

## Task lists — inside an ordered list

1. Morning
   - [x] Coffee
   - [x] Email triage
   - [ ] Daily standup
2. Afternoon
   - [ ] Deep work block
   - [ ] Code review
3. Evening
   - [ ] Gym
   - [ ] Read one chapter

## Strikethrough

Use ~~strikethrough~~ to mark deleted text. Works inline inside **bold ~~and struck~~ text** and *italic ~~struck~~ passages* too.

The sentence `a ~ b ~ c` should **not** be struck — whitespace-adjacent `~` must stay literal.

## Links with parens in the URL (regression check)

- [Wikipedia — SQL (programming language)](https://en.wikipedia.org/wiki/SQL_(programming_language))
- [Wikipedia — Go (programming language)](https://en.wikipedia.org/wiki/Go_(programming_language))
- [MDN — URLs containing parens](https://developer.mozilla.org/en-US/docs/Web/API/URL#examples_(section))

All three should render as clickable links whose URLs include the `(…)` suffix intact.

## Table with escaped pipes (regression check)

| Pattern          | Matches                 | Example                    |
|------------------|-------------------------|----------------------------|
| Pipe literal     | `a \| b`                | `cat file \| grep foo`     |
| Logical OR in JS | `x \|\| y`              | `user \|\| "anonymous"`    |
| Plain text       | No pipes                | `hello world`              |

The first column should show `Pipe literal`, the second column should literally render `a | b`, and the code-styled example column should show `cat file | grep foo` — the pipes must survive the table split.

## Blockquote — single line

> A single-line quote used for short citations or reminders.

## Blockquote — multi-line

> The first line of a longer quotation.
> The second line continues the same thought.
> And a third line wraps things up neatly.

## Horizontal rule

Text above the divider.

---

Text below the divider. The `---` above should render as an `<hr>`, not as a heading underline.

## Fenced code block — plain

```
function greet(name) {
  console.log("Hello, " + name + "!");
  return { greeted: true };
}
```

## Fenced code block — with HTML inside

The HTML should be shown verbatim, not rendered:

```
<div class="card">
  <h2>Title</h2>
  <p>Some <strong>bold</strong> text &amp; an entity.</p>
</div>
```

## Table

| Feature             | Status | Notes                                       |
|---------------------|--------|---------------------------------------------|
| Headings 1–6        | Works  | All six levels supported                    |
| Paragraph fold      | Works  | Consecutive lines join into one `<p>`       |
| Bold / italic       | Works  | `**`, `*`, `***` variants                   |
| Strikethrough       | Works  | `~~text~~` via `<del>`                      |
| Inline code         | Works  | HTML inside is escaped                      |
| Links               | Works  | `[text](url)`; URLs allow one level of `()` |
| Unordered list      | Works  | `-` or `*` prefix                           |
| Ordered list        | Works  | `1.` prefix; non-1 start preserved          |
| Nested lists        | Works  | 2-space indent, mixed markers OK            |
| Task lists          | Works  | `- [ ]` / `- [x]`; nestable                 |
| Blockquote          | Works  | `>` prefix, multi-line                      |
| Horizontal rule     | Works  | `---` on its own line                       |
| Fenced code         | Works  | Triple backticks                            |
| Tables              | Works  | Leading/trailing `\|` required; `\\\|` escapes |
| Images              | Works  | Markdown `![alt](url)` or raw `<img>`       |

## Image

<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png" alt="PNG transparency demo">

## Mixed real-world example

The **three main types** of membrane transport are:

1. *Passive* transport — uses `no_energy`, moves substances down the concentration gradient.
2. *Active* transport — requires `ATP`, moves substances against the gradient.
3. **Bulk** transport — moves ***large molecules*** via vesicles (endocytosis and exocytosis).

> Rule of thumb: passive transport follows the gradient for free;
> active transport pays ATP to fight it;
> bulk transport wraps the cargo in a membrane and ships it.

See the [Wikipedia article on cell membranes](https://en.wikipedia.org/wiki/Cell_membrane) for more depth.

## Regression checklist

If every bullet below renders correctly, the patched parser is healthy:

1. All six heading levels are visible and bold.
2. The "paragraph folding" section shows **two** paragraphs, not six.
3. `user_role_permissions` keeps all of its underscores.
4. The literal text `&lt;div&gt;` is visible — not an actual `<div>`.
5. The horizontal rule is a thin line, not a missing heading.
6. The two fenced code blocks render in a monospaced box, with HTML shown as text.
7. The table has a header row separated from the body by a line.
8. The image loads (or shows alt text if offline).
9. The link to Wikipedia is clickable and colored.
10. `***bold and italic***` shows as both bold and italic at once.
11. The "Ordered list — custom start" section starts numbering at **5**, not 1.
12. The four nested-list sections all show proper indentation, with sub-items visually offset from their parent.
13. The "three levels deep" example reaches **three** distinct visual indents (Biology → Cell biology → Membrane transport).
14. The "mixed markers and custom start" example mixes numbered and bulleted sub-lists correctly under each numbered parent.
15. Task list section renders four checkboxes: two unchecked, two checked (one from `[x]`, one from `[X]`), mixed with one plain bullet.
16. Nested task lists show checkboxes *inside* a regular list and *inside* an ordered list.
17. The strikethrough sentence shows `strikethrough` with a line through it; `a ~ b ~ c` shows plainly with no strike.
18. All three Wikipedia links render as clickable, and their URLs visibly end with `(programming_language)` or similar — the closing paren stays part of the link.
19. The "Table with escaped pipes" section renders three columns; the middle and right columns contain visible `|` characters inside their cells.

=== END ===

## How to use this fixture

1. Open Anki → **Add** → choose the **Summary** note type.
2. Paste the three field values from the table above.
3. Select everything between `=== BEGIN ===` and `=== END ===` in this file and paste it into the **Summary** field.
4. Click **Add**, then open the new note in the browser and flip it.
5. Walk through the **Regression checklist** at the bottom of the card. Any failing bullet points to a specific bug.
