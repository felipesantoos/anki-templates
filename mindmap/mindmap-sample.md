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
  - Both children should appear to the right
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

1. The root node on the far left reads `Mindmap Feature Showcase` (the Title field), not `(untitled)`.
2. There are exactly **10** top-level branches flowing to the right of the root.
3. The first 8 top-level branches each have a **distinct color** (blue, green, orange, purple, red, teal, magenta, amber-brown).
4. Branches 9 and 10 (`Color cycling — branch 9` and `branch 10`) reuse the colors of branches 1 and 2 (blue and green).
5. The "Two-branch case" branch shows two children to its right, stacked vertically.
6. The "Five-branch alternation" branch shows five children stacked vertically to its right.
7. The "Three levels deep" branch reaches **three** distinct columns — root → branch → sub-branch → leaf.
8. The "Long-label branch with a deliberately verbose title" wraps gracefully and its connector still meets the node correctly.
9. The "Inline formatting" branch's children render with their formatting applied:
   - `**Bold** leaf` shows the word "Bold" in heavier weight.
   - `*Italic* leaf` shows the word "Italic" in italics.
   - `` `code` leaf with `snake_case_id` `` shows both `code` and `snake_case_id` in monospace with a subtle background, AND the underscores in `snake_case_id` are preserved (not collapsed by an italic rule).
   - `[Link leaf]` is underlined and clickable; clicking opens the system browser.
   - `~~Struck~~` shows the word "Struck" with a strike-through line.
   - `***Bold italic***` is both bold and italic.
10. The "Single-leaf branch" has no visible children (it's a leaf itself).
11. The "Mixed marker branch" treats `*` and `-` markers identically — both children appear normally, no marker visible in the rendered text.
12. Connectors between parent and child are smooth curved lines (cubic Bezier S-curves), not straight diagonals or right-angle elbows.
13. Each connector matches the **destination** branch's color (a connector entering an orange branch is orange).
14. The entire tree is visible in the scroll area; horizontal scrolling works if the tree is wider than the viewport.
15. Dark mode (system setting) inverts the card background and the 8 branch colors stay readable on the dark background.
16. No raw markdown syntax (`*`, `**`, `` ` ``, `[`) is visible anywhere in the rendered card — every inline mark has been converted.
17. No empty bullets or stray dashes appear in the diagram.
