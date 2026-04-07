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

  // ===== Phase 3: Layout (two-pass measurement) =====
  // The layout runs in two passes around a real DOM render. Pass 1 only knows
  // each node's depth and which side it's on (alternation). After the nodes
  // are inserted into the DOM with `visibility: hidden`, we read their actual
  // offsetWidth and offsetHeight via Pass 2 — that gives true sizes for any
  // wrapped multi-line label, which a constants-based estimate cannot do.
  // Pass 3 then computes vertical positions from those measured heights and
  // a final bounding box from the measured widths, before revealing the canvas.
  var COLOR_SLOTS = 8;
  var LEVEL_WIDTH = 240;       // px between depth levels (must exceed CSS max-width)
  var LEAF_GAP_PX = 12;        // vertical gap between adjacent leaf slots
  var MIN_LEAF_SLOT_PX = 36;   // floor for a leaf's vertical slot height
  var CANVAS_PAD = 16;         // padding around the bounding box

  // Propagate the top-level branch index to every descendant so they share a color.
  function propagateBranch(node, branchIndex) {
    node.branchIndex = branchIndex;
    for (var i = 0; i < node.children.length; i++) {
      propagateBranch(node.children[i], branchIndex);
    }
  }

  // Pre-order walk over the tree, calling cb on each node.
  function walkAll(node, cb) {
    cb(node);
    for (var i = 0; i < node.children.length; i++) walkAll(node.children[i], cb);
  }

  // Pass 1 — assign branch families and horizontal positions (no DOM access).
  // Top-level branches alternate left/right; descendants inherit their top-level
  // ancestor's branchIndex and side. Returns { left, right } for use in Pass 3.
  function assignBranchesAndX(root) {
    var leftBranches = [];
    var rightBranches = [];
    for (var i = 0; i < root.children.length; i++) {
      propagateBranch(root.children[i], i % COLOR_SLOTS);
      if (i % 2 === 0) rightBranches.push(root.children[i]);
      else leftBranches.push(root.children[i]);
    }
    root.branchIndex = -1; // hub has no branch family

    function assignX(node, side) {
      node.x = node.depth * LEVEL_WIDTH * (side === "left" ? -1 : 1);
      for (var i = 0; i < node.children.length; i++) {
        assignX(node.children[i], side);
      }
    }
    for (var i = 0; i < leftBranches.length; i++) assignX(leftBranches[i], "left");
    for (var i = 0; i < rightBranches.length; i++) assignX(rightBranches[i], "right");
    root.x = 0;

    return { left: leftBranches, right: rightBranches };
  }

  // Pass 3 — vertical layout using measured heights.
  // Each leaf gets a slot of (measured height + gap), with a minimum floor.
  // Each parent's slot height is the sum of its children's slot heights, so a
  // sub-tree with many leaves naturally claims more vertical space than a leaf.
  // Each side is then offset so its midpoint aligns with the hub (asymmetric
  // centering — a single-branch left side stays on the hub's horizontal axis).
  function assignY(root, sides) {
    function computeSlot(node) {
      if (node.children.length === 0) {
        var h = node.height + LEAF_GAP_PX;
        if (h < MIN_LEAF_SLOT_PX) h = MIN_LEAF_SLOT_PX;
        node.slotHeight = h;
        return h;
      }
      var sum = 0;
      for (var i = 0; i < node.children.length; i++) {
        sum += computeSlot(node.children[i]);
      }
      node.slotHeight = sum;
      return sum;
    }

    function placeY(node, topY) {
      node.y = topY + node.slotHeight / 2;
      var cursor = topY;
      for (var i = 0; i < node.children.length; i++) {
        placeY(node.children[i], cursor);
        cursor += node.children[i].slotHeight;
      }
    }

    var leftHeight = 0;
    for (var i = 0; i < sides.left.length; i++) leftHeight += computeSlot(sides.left[i]);
    var rightHeight = 0;
    for (var i = 0; i < sides.right.length; i++) rightHeight += computeSlot(sides.right[i]);
    var totalHeight = Math.max(leftHeight, rightHeight, MIN_LEAF_SLOT_PX);

    var leftOffset = (totalHeight - leftHeight) / 2;
    var rightOffset = (totalHeight - rightHeight) / 2;

    var cursor = leftOffset;
    for (var i = 0; i < sides.left.length; i++) {
      placeY(sides.left[i], cursor);
      cursor += sides.left[i].slotHeight;
    }
    cursor = rightOffset;
    for (var i = 0; i < sides.right.length; i++) {
      placeY(sides.right[i], cursor);
      cursor += sides.right[i].slotHeight;
    }

    // Hub at the vertical midpoint of the canvas.
    root.y = totalHeight / 2;
  }

  // Compute bounding box from measured widths/heights at final positions, then
  // translate everything so the bounding box top-left is at (CANVAS_PAD, CANVAS_PAD).
  function computeBoundsAndTranslate(root) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    walkAll(root, function(n) {
      var halfW = n.width / 2;
      var halfH = n.height / 2;
      if (n.x - halfW < minX) minX = n.x - halfW;
      if (n.x + halfW > maxX) maxX = n.x + halfW;
      if (n.y - halfH < minY) minY = n.y - halfH;
      if (n.y + halfH > maxY) maxY = n.y + halfH;
    });
    var dx = CANVAS_PAD - minX;
    var dy = CANVAS_PAD - minY;
    walkAll(root, function(n) {
      n.x += dx;
      n.y += dy;
    });
    root.canvasWidth = (maxX - minX) + CANVAS_PAD * 2;
    root.canvasHeight = (maxY - minY) + CANVAS_PAD * 2;
    // Hub-only / single-leaf trees: ensure the canvas isn't smaller than the hub.
    if (root.canvasWidth < root.width + CANVAS_PAD * 2) {
      root.canvasWidth = root.width + CANVAS_PAD * 2;
    }
    if (root.canvasHeight < root.height + CANVAS_PAD * 2) {
      root.canvasHeight = root.height + CANVAS_PAD * 2;
    }
  }

  // ===== Phase 4: Render =====
  // Helper: empty a container by removing every child.
  function clearContainer(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  var SVG_NS = "http://www.w3.org/2000/svg";

  function renderMindmap(root, container) {
    // Pass 1: branch families and horizontal positions (no DOM yet).
    var sides = assignBranchesAndX(root);

    // Set every node's y to 0 for the initial hidden render — we don't know
    // real heights yet, and the actual y comes after measurement.
    walkAll(root, function(n) { n.y = 0; });

    // Build the canvas hidden so the initial position flash isn't visible.
    clearContainer(container);
    var canvas = document.createElement("div");
    canvas.className = "mindmap-canvas";
    canvas.style.position = "relative";
    canvas.style.visibility = "hidden";
    container.appendChild(canvas);

    // Render every node into the canvas at its initial (x, 0). The DOM has
    // to exist for the browser to lay out the wrapped text and let us read
    // offsetWidth / offsetHeight.
    walkAll(root, function(n) {
      var div = document.createElement("div");
      div.className = "mindmap-node" + (n === root ? " mindmap-hub" : "");
      if (n !== root) div.setAttribute("data-branch", String(n.branchIndex % COLOR_SLOTS));
      div.setAttribute("data-depth", String(n.depth));
      div.style.left = n.x + "px";
      div.style.top = n.y + "px";
      div.insertAdjacentHTML("afterbegin", inline(n.label));
      canvas.appendChild(div);
      n._div = div;
    });

    // Pass 2: read each node's actual rendered size from the DOM.
    walkAll(root, function(n) {
      n.width = n._div.offsetWidth;
      n.height = n._div.offsetHeight;
    });

    // Pass 3: assign vertical positions using the measured heights, then
    // recompute the bounding box and translate so origin is at (0,0).
    assignY(root, sides);
    computeBoundsAndTranslate(root);

    // Apply the final positions back to each div.
    walkAll(root, function(n) {
      n._div.style.left = n.x + "px";
      n._div.style.top = n.y + "px";
    });

    // Build the SVG connector layer with the final positions and widths.
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "mindmap-edges");
    svg.setAttribute("width", root.canvasWidth);
    svg.setAttribute("height", root.canvasHeight);
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";

    function emitConnector(parent, child) {
      var startX, endX;
      if (child.x > parent.x) {
        // Right side: leaves parent's right edge, enters child's left edge.
        startX = parent.x + parent.width / 2;
        endX = child.x - child.width / 2;
      } else {
        // Left side (mirror).
        startX = parent.x - parent.width / 2;
        endX = child.x + child.width / 2;
      }
      // Quadratic Bezier with control point at (endX, parent.y) — the line
      // leaves the parent horizontally and curves into the child horizontally.
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

    // Insert SVG before the node divs so connectors render behind nodes.
    canvas.insertBefore(svg, canvas.firstChild);

    // Finalize canvas size and reveal.
    canvas.style.width = root.canvasWidth + "px";
    canvas.style.height = root.canvasHeight + "px";
    canvas.style.visibility = "visible";
  }

  // ===== Main =====
  var el = document.getElementById("mindmap-root");
  var rawText = cleanupAnkiHtml(el.innerHTML);
  var title = el.getAttribute("data-title") || "(untitled)";
  var tree = parseTree(rawText, title);
  renderMindmap(tree, el);

  // Center the hub horizontally in the scroll viewport on first paint.
  var scroll = document.querySelector(".mindmap-scroll");
  var hub = el.querySelector(".mindmap-hub");
  if (scroll && hub) {
    // hub.offsetLeft is its left edge inside the scroll container.
    // Add half its width to get its center, then subtract half the viewport.
    scroll.scrollLeft = hub.offsetLeft + hub.offsetWidth / 2 - scroll.clientWidth / 2;
  }
})();
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
  max-width: 200px;
  white-space: normal;
  word-wrap: break-word;
  text-align: center;
  line-height: 1.25;
  box-sizing: border-box;
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
