// One-liner install snippet with OS detection. Shared by the landers:
//   import { mountInstallSnippet } from 'assets/install-snippet.js?v=13';
//   mountInstallSnippet(document.getElementById('oneliner'));
// Self-styled via CSS vars with fallbacks so it inherits each page's tokens
// (site/assets/site.css). A tab strip sits above the box: "Install" (default)
// shows the OS-detected bootstrap (curl | sh, or irm | iex on Windows) that
// installs Node if the machine lacks it, then runs the npx installer; "Skill"
// shows the paste-to-agent prose. WYSIWYG rule: the text displayed IS the text
// copied — no `$` prompt decoration anywhere, and every alternate command in
// the fold is its own row with its own copy button.
//
// Fires `superbot:copied` on window with { source } after a copy that
// actually happened (the mascot celebrates; /docs advances its step rail).

function detectOS() {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (p.includes('win')) return 'win';
  if (p.includes('mac') || p.includes('iphone') || p.includes('ipad')) return 'mac';
  return 'linux';
}

// Minimal tinting for copy boxes: the command word bright, flags muted,
// URLs in the accent. WYSIWYG contract: this styles the SAME text that is
// copied — the plain string still rides the copy handler untouched.
function tint(s) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s"]+)/g, '<span class="sb-url">$1</span>')
    .replace(/(^|\s)(curl|wget|powershell|npx|sh|claude)(?=\s|$)/g, '$1<b>$2</b>')
    .replace(/(^|\s)(-{1,2}[a-zA-Z][\w-]*)/g, '$1<span class="sb-flag">$2</span>');
}

const CHECK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const COPY = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.6"/></svg>';

const STYLE = `
.sb-oneliner {
  /* stay inside the page's centered column — never span the page margins */
  margin: 0 auto; max-width: var(--content, 720px); width: 100%; text-align: left;
  font-size: var(--fs-sm, 14px); line-height: var(--lh-sm, 20px);
}
.sb-oneliner .sb-or { color: var(--muted, #8b8778); margin-bottom: var(--sp-2, 8px); }
.sb-oneliner .sb-tabs { display: flex; gap: var(--sp-1, 4px); margin-bottom: var(--sp-3, 12px); }
.sb-oneliner .sb-tabs button {
  background: none; border: 1px solid var(--line, #232323); border-radius: var(--r-md, 6px);
  color: var(--muted, #8b8778); font: inherit; min-height: 32px; padding: 0 var(--sp-3, 12px); cursor: pointer;
  transition: color var(--dur-2, 150ms) var(--ease-std, ease), border-color var(--dur-2, 150ms) var(--ease-std, ease), background-color var(--dur-2, 150ms) var(--ease-std, ease);
}
.sb-oneliner .sb-tabs button:hover { color: var(--fg, #e8e4d9); background: var(--raised, #161616); }
.sb-oneliner .sb-tabs button[aria-selected="true"] { color: var(--fg, #e8e4d9); border-color: var(--accent, #7cb389); background: var(--card, #101010); }
.sb-oneliner .sb-cmd {
  display: flex; gap: var(--sp-3, 12px); align-items: center; background: var(--card, #101010);
  border: 1px solid var(--line, #232323); border-radius: var(--r-lg, 10px); padding: var(--sp-2, 8px) var(--sp-2, 8px) var(--sp-2, 8px) var(--sp-4, 16px);
  min-height: 52px;
  transition: border-color var(--dur-3, 200ms) var(--ease-std, ease), box-shadow var(--dur-3, 200ms) var(--ease-std, ease);
}
.sb-oneliner .sb-cmd:focus-within { border-color: var(--accent, #7cb389); }
.sb-oneliner .sb-cmd.copied {
  border-color: var(--accent, #7cb389);
  box-shadow: 0 0 0 4px rgba(124, 179, 137, 0.18), 0 0 24px rgba(124, 179, 137, 0.2);
}
.sb-oneliner .sb-cmd code {
  flex: 1; overflow-x: auto; white-space: nowrap; color: var(--fg, #e8e4d9); scrollbar-width: none;
  font-size: var(--fs-sm, 14px); line-height: var(--lh-sm, 20px); padding: var(--sp-1, 4px) 0;
}
/* the right edge fades only when the line runs past the box, so a phone
   never shows a command that looks complete and is not */
.sb-oneliner .sb-cmd code.overflow {
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
}
.sb-oneliner .sb-cmd code::-webkit-scrollbar { display: none; }
.sb-oneliner .sb-cmd .sb-copy, .sb-oneliner .sb-cmd .sb-copy-alt {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--accent, #7cb389); color: var(--accent-ink, #06120a); border: 0; border-radius: var(--r-md, 6px);
  font: inherit; font-weight: 600; min-height: 36px; padding: 0 var(--sp-3, 12px); cursor: pointer; flex: none;
  transition: transform var(--dur-1, 100ms) var(--ease-std, ease), filter var(--dur-2, 150ms) var(--ease-std, ease);
}
.sb-oneliner .sb-cmd .sb-copy:hover, .sb-oneliner .sb-cmd .sb-copy-alt:hover { filter: brightness(1.08); }
.sb-oneliner .sb-cmd .sb-copy:active, .sb-oneliner .sb-cmd .sb-copy-alt:active { transform: scale(0.96); }
.sb-oneliner .sb-cmd .sb-copy-alt { background: var(--raised, #161616); color: var(--fg, #e8e4d9); border: 1px solid var(--line, #232323); min-height: 32px; }
.sb-oneliner .sb-cmd .sb-copy-alt:hover { border-color: var(--accent, #7cb389); filter: none; }
.sb-oneliner .sb-cmd button.copied { background: var(--accent, #7cb389); color: var(--accent-ink, #06120a); border-color: transparent; }
/* fold rows: a small label above each alternate command, so each one is a
   self-contained copy target instead of a wrapped inline fragment */
.sb-oneliner .sb-row { margin-top: var(--sp-3, 12px); }
.sb-oneliner .sb-row .sb-lab { color: var(--muted, #8b8778); font-size: var(--fs-xs, 12px); line-height: var(--lh-xs, 16px); margin-bottom: var(--sp-1, 4px); }
.sb-oneliner .sb-row .sb-cmd { min-height: 44px; padding: var(--sp-1, 4px) var(--sp-1, 4px) var(--sp-1, 4px) var(--sp-3, 12px); }
.sb-oneliner .sb-row .sb-cmd code { font-size: var(--fs-xs, 12px); }
.sb-oneliner .sb-row.sb-links { display: flex; flex-wrap: wrap; gap: var(--sp-2, 8px); align-items: center; }
.sb-oneliner .sb-row.sb-links .sb-lab { width: 100%; }
.sb-oneliner a.sb-deep {
  display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 var(--sp-3, 12px);
  border: 1px solid var(--line, #232323); border-radius: var(--r-md, 6px); background: var(--card, #101010);
  color: var(--fg, #e8e4d9); text-decoration: none; font-size: var(--fs-xs, 12px);
  transition: border-color var(--dur-2, 150ms) var(--ease-std, ease), background-color var(--dur-2, 150ms) var(--ease-std, ease);
}
.sb-oneliner a.sb-deep:hover { border-color: var(--accent, #7cb389); background: var(--raised, #161616); }
.sb-oneliner a.sb-deep .sb-url { color: var(--accent, #7cb389); }
/* syntax tinting: verbs bright, flags muted, URLs accent — styling only,
   the text content stays byte-identical to what copy puts on the board */
.sb-oneliner .sb-cmd code b { color: var(--fg, #e8e4d9); font-weight: 600; }
.sb-oneliner .sb-cmd code .sb-flag { color: var(--muted, #8b8778); }
.sb-oneliner .sb-cmd code .sb-url { color: var(--accent, #7cb389); }
.sb-oneliner details.sb-fold { margin-top: var(--sp-3, 12px); }
.sb-oneliner details.sb-fold summary {
  color: var(--muted, #8b8778); cursor: pointer; list-style: none; user-select: none; text-align: left;
  display: inline-flex; align-items: center; min-height: 28px; border-radius: var(--r-sm, 4px);
  transition: color var(--dur-2, 150ms) var(--ease-std, ease);
}
.sb-oneliner details.sb-fold summary:hover { color: var(--fg, #e8e4d9); }
.sb-oneliner details.sb-fold summary::-webkit-details-marker { display: none; }
/* Child combinator: with folds nested, each arrow must key off its OWN
   details' open state, not any open ancestor's. */
.sb-oneliner details.sb-fold > summary::before { content: '▸'; color: var(--accent, #7cb389); width: 1.2em; display: inline-block; transition: transform var(--dur-3, 200ms) var(--ease-out, ease); }
.sb-oneliner details.sb-fold[open] > summary::before { transform: rotate(90deg); }
.sb-oneliner details.sb-fold .sb-cmd { margin-top: var(--sp-2, 8px); }
.sb-oneliner details.sb-fold details.sb-fold { margin-left: var(--sp-4, 16px); }
.sb-oneliner .sb-what { color: var(--muted, #8b8778); font-size: var(--fs-xs, 12px); line-height: var(--lh-xs, 16px); margin-top: var(--sp-2, 8px); max-width: 62ch; }
.sb-oneliner .sb-what code { color: var(--fg, #e8e4d9); }
.sb-oneliner .sb-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (prefers-reduced-motion: reduce) {
  .sb-oneliner details.sb-fold > summary::before { transition: none; }
}
`;

export async function mountInstallSnippet(el, opts = {}) {
  if (!el) return;
  const mcpUrl = opts.mcpUrl || `${location.origin}/mcp`;
  // The bootstrap is served per-OS: curl | sh on mac/linux, irm | iex on
  // Windows. Both install Node if the machine lacks it, then run the npx
  // installer. The npx spec keeps the same cache-bust escape as before
  // (`?<version>`, fetched from clients.json) for the manual line in the
  // fold; the bootstrap's own version is baked in server-side.
  const shCmd = `curl -fsSL ${location.origin}/install/bootstrap.sh | sh`;
  const winCmd = `powershell -c "irm ${location.origin}/install/bootstrap.ps1 | iex"`;
  let spec = `${location.origin}/install/superbot-mcp.tgz`;
  try {
    const data = await (await fetch(`${location.origin}/install/clients.json`)).json();
    if (typeof data.cliVersion === 'string' && data.cliVersion) spec = `${spec}?${data.cliVersion}`;
  } catch {
    // origin unreachable — the unversioned spec still installs
  }
  const npxCmd = `npx -y ${spec} ${mcpUrl}`;
  // Claude Code's own add line: `-s user` is what puts it in every project
  // (the flag defaults to local, one directory).
  const claudeCmd = `claude mcp add --transport http superbot ${mcpUrl} -s user`;
  // VS Code's documented URL handler: vscode:mcp/install?{urlencoded json}.
  // A human clicks it; the page never tells an agent to.
  const vscodeHref = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'superbot', type: 'http', url: mcpUrl }))}`;
  // the undo is a first-class script now, not a raw npx line: same shape as
  // the install bootstrap (node ensured if missing), then --uninstall
  const undoSh = `curl -fsSL ${location.origin}/install/uninstall.sh | sh`;
  const undoWin = `powershell -c "irm ${location.origin}/install/uninstall.ps1 | iex"`;
  const undoCmd = detectOS() === 'win' ? undoWin : undoSh;
  // The Skill tab is the paste-to-agent prose: what it shows is what the
  // copy button puts on the clipboard, byte for byte. The fold explanation
  // follows the tab — installing and delegating to an agent are different
  // acts, so each tab says what ITS command does.
  const cmds = {
    install: detectOS() === 'win' ? winCmd : shCmd,
    skill: `install the Superbot MCP server globally: ${mcpUrl}`,
  };
  const labels = {
    install: 'one line, every AI client on this machine:',
    skill: 'give this to your agent:',
  };
  // the fold goes to innerHTML with intentional <code> markup, so the
  // origin is escaped here — a hostile Host header must not write markup
  // through it (the tint() path escapes its own interpolation; this one
  // would otherwise bypass that discipline)
  const eo = location.origin.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fold = {
    install: `installs node if missing (no sudo), then wires every AI client it finds. re-run the line = update. restart clients after.`,
    skill: `paste that into any coding agent and it fetches <code>${eo}/llms.txt</code>, picks its own client's recipe, and wires itself in. restart the client after.`,
  };
  let tab = 'install';

  if (!document.getElementById('sb-oneliner-style')) {
    const style = document.createElement('style');
    style.id = 'sb-oneliner-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  const copyBtn = (cls) => `<button class="${cls}" type="button" aria-label="copy command">${COPY}<span>copy</span></button>`;
  el.classList.add('sb-oneliner');
  el.innerHTML = `
    <div class="sb-tabs" role="tablist" aria-label="install method">
      <button type="button" role="tab" data-tab="install" id="sb-tab-install" aria-controls="sb-panel">Install</button>
      <button type="button" role="tab" data-tab="skill" id="sb-tab-skill" aria-controls="sb-panel">Skill</button>
    </div>
    <div id="sb-panel" role="tabpanel" aria-labelledby="sb-tab-install">
      <div class="sb-or"></div>
      <div class="sb-cmd"><code></code>${copyBtn('sb-copy')}</div>
    </div>
    <div class="sb-live" aria-live="polite"></div>
    <details class="sb-fold"><summary>what does this do?</summary>
      <div class="sb-what"></div>
      <div class="sb-extra">
        <div class="sb-row"><div class="sb-lab">windows (same install):</div><div class="sb-cmd"><code>${tint(winCmd)}</code>${copyBtn('sb-copy-alt sb-copy-win')}</div></div>
        <div class="sb-row"><div class="sb-lab">no curl? wget instead:</div><div class="sb-cmd"><code>${tint(`wget -qO- ${location.origin}/install/bootstrap.sh | sh`)}</code>${copyBtn('sb-copy-alt sb-copy-wget')}</div></div>
        <div class="sb-row"><div class="sb-lab">manual, no bootstrap:</div><div class="sb-cmd"><code>${tint(npxCmd)}</code>${copyBtn('sb-copy-alt sb-copy-npx')}</div></div>
        <div class="sb-row"><div class="sb-lab">just claude code:</div><div class="sb-cmd"><code>${tint(claudeCmd)}</code>${copyBtn('sb-copy-alt sb-copy-claude')}</div></div>
        <div class="sb-row sb-links"><div class="sb-lab">just vs code, one click:</div>
          <a class="sb-deep" href="${vscodeHref.replace(/"/g, '&quot;')}">add to VS Code</a>
          <span class="sb-what" style="margin:0">opens VS Code and asks you to confirm the <span class="sb-url">${eo}/mcp</span> server.</span>
        </div>
        <details class="sb-undo sb-fold"><summary>changed your mind?</summary>
          <div class="sb-cmd"><code>${tint(undoCmd)}</code>${copyBtn('sb-copy-alt sb-copy-undo')}</div>
          <div class="sb-what">removes the superbot entry from every client, restores configs it changed to their original bytes, and deletes only what the installer created.</div>
        </details>
      </div>
    </details>
  `;

  const code = el.querySelector('.sb-cmd code');
  const label = el.querySelector('.sb-or');
  const what = el.querySelector('.sb-fold > .sb-what');
  const extra = el.querySelector('.sb-extra');
  const panel = el.querySelector('#sb-panel');
  const live = el.querySelector('.sb-live');
  const tabs = [...el.querySelectorAll('.sb-tabs [role="tab"]')];
  const render = () => {
    for (const b of tabs) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `sb-tab-${tab}`);
    // WYSIWYG: tint() styles the same string the copy handler sends — only
    // spans differ from what is on the board
    code.innerHTML = tint(cmds[tab]);
    label.textContent = labels[tab];
    // the fold says what the SELECTED tab's command does; the windows/wget/
    // manual alternates and the undo only exist for the shell install
    what.innerHTML = fold[tab];
    extra.hidden = tab !== 'install';
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { tab = b.dataset.tab; render(); });
    // roving tabindex: arrows move between tabs, the tab key leaves the strip
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      tab = next.dataset.tab; render(); next.focus();
    });
  });

  // Same ladder as the landers' copy buttons: async clipboard in secure
  // contexts, execCommand elsewhere, prompt last — and feedback only on a
  // copy that actually happened. `text` may be a getter so the main box
  // always copies what is currently displayed.
  const wireCopy = (btn, text, source) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const value = typeof text === 'function' ? text() : text;
      const done = () => {
        const box = btn.closest('.sb-cmd');
        box.classList.remove('copied');
        void box.offsetWidth; // reflow so the ring replays on rapid re-clicks
        box.classList.add('copied');
        clearTimeout(box._t);
        box._t = setTimeout(() => box.classList.remove('copied'), 1500);
        dispatchEvent(new CustomEvent('superbot:copied', { detail: { source } }));
        btn.innerHTML = `${CHECK}<span>copied</span>`;
        btn.classList.add('copied');
        live.textContent = 'copied to clipboard';
        clearTimeout(btn._t);
        btn._t = setTimeout(() => { btn.innerHTML = `${COPY}<span>copy</span>`; btn.classList.remove('copied'); live.textContent = ''; }, 1500);
      };
      const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } finally {
          ta.remove();
        }
        if (ok) done();
        else {
          // both clipboard rungs refused: leave the command selected so one
          // keystroke copies it, and say so — no modal
          const codeEl = btn.closest('.sb-cmd')?.querySelector('code');
          if (codeEl) { const sel = getSelection(); sel.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(codeEl); sel.addRange(r); }
          live.textContent = 'clipboard blocked: the command is selected, press copy on your keyboard';
        }
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(value).then(done, fallback);
      else fallback();
    });
  };
  wireCopy(el.querySelector('.sb-copy'), () => cmds[tab], 'oneliner');
  wireCopy(el.querySelector('.sb-copy-win'), winCmd, 'oneliner');
  wireCopy(el.querySelector('.sb-copy-wget'), `wget -qO- ${location.origin}/install/bootstrap.sh | sh`, 'oneliner');
  wireCopy(el.querySelector('.sb-copy-npx'), npxCmd, 'oneliner');
  wireCopy(el.querySelector('.sb-copy-claude'), claudeCmd, 'oneliner');
  wireCopy(el.querySelector('.sb-copy-undo'), undoCmd, 'undo');
  // the deep link is an install too: the step rail on /docs listens for it
  el.querySelector('a.sb-deep')?.addEventListener('click', () => {
    dispatchEvent(new CustomEvent('superbot:copied', { detail: { source: 'vscode' } }));
  });
  render();
  // overflow fade: measured, not assumed — a 720px box holds the whole line
  // on a desktop and clips it on a phone
  const codes = [...el.querySelectorAll('.sb-cmd code')];
  const measure = () => { for (const c of codes) c.classList.toggle('overflow', c.scrollWidth > c.clientWidth + 1); };
  measure();
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(el);
  el.querySelector('.sb-tabs')?.addEventListener('click', () => requestAnimationFrame(measure));
}
