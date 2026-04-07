// Test harness for the Summary note type parser.
//
// back.html is the single source of truth. This harness loads it from disk,
// regex-extracts the inline <script> body, and runs it inside a Node vm
// sandbox with a minimal `document` stub. The script mutates the element's
// innerHTML in place, so we stuff the input in before eval and read the
// output back out afterward.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACK_HTML_PATH = path.join(__dirname, '..', 'back.html');

function extractScript() {
  const html = fs.readFileSync(BACK_HTML_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('No <script> block found in ' + BACK_HTML_PATH);
  }
  return match[1];
}

// Render a string of Anki field content (the same thing that would land in
// the {{Summary}} placeholder) through the parser and return the resulting
// HTML string.
//
// Note: the parser expects Anki-style wrapping (lines wrapped in <div>, HTML
// entities for <, >, &). For most tests you can pass plain markdown — the
// entity-decode and tag-strip steps are no-ops on plain text. If your test
// needs to exercise the unwrap pipeline, pass `<div>line1</div><div>line2</div>`
// or `&lt;` etc. explicitly.
function render(rawFieldContent) {
  const scriptBody = extractScript();
  const el = { innerHTML: rawFieldContent };
  const sandbox = {
    document: {
      getElementById(id) {
        return id === 'summary-content' ? el : null;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptBody, sandbox);
  return el.innerHTML;
}

module.exports = { render };
