# Mindmap Note Type

A drop-in Anki note type that converts a markdown nested-bullet list into a horizontal tree diagram (root on the left, branches flowing right).

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
- Radial or polar layouts. The tree grows strictly left-to-right.

---

## Templates

The card template code lives in sibling files so it can be edited
directly.

| Anki template slot | File |
|---|---|
| Front Template | [`front.html`](./front.html) |
| Back Template  | [`back.html`](./back.html) |
| Styling        | [`style.css`](./style.css) |

To install in Anki: open the Mindmap note type's card template editor and
paste each file's contents into the matching slot.
