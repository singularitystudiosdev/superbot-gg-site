// superbot /chat — minimalist black chat over the keyless /answer route.
// Multi-chat browser (localStorage), real markdown (md.js, escape-first),
// per-message actions through ONE delegated listener (copy / edit-and-resend /
// regenerate / retry), send↔stop over the GET /answer/stream SSE lane with the
// blocking route as fallback, token streaming with a backlog-proportional
// reveal (whole-blob typewriter as the no-delta fallback), scroll pinning with
// a jump-to-latest pill, sidebar search/rename/delete. A device that lands with
// ?join=<secret-or-url> redeems its key on the spot — the page links itself.
(async () => {
  const log = document.getElementById('log');
  const list = document.getElementById('list');
  const newbtn = document.getElementById('newbtn');
  const form = document.getElementById('f');
  const q = document.getElementById('q');
  const send = document.getElementById('send');
  const dot = document.getElementById('dot');
  const keybtn = document.getElementById('keybtn');
  const HIST_KEY = 'sb_chat_history'; // legacy single-history layout
  const CHATS_KEY = 'sb_chats';       // { [id]: { title, customTitle?, rows } }
  const ACTIVE_KEY = 'sb_active_chat';
  const KEY_STORE = 'sb_bearer_key';
  const CAP = 200;

  // Same cache-buster the edge stamped on this script tag (app.ts rewrites
  // assets/chat.js?v=<mtimeMs>); forwarded so md.js busts in lockstep.
  const SBV = document.currentScript ? new URL(document.currentScript.src).searchParams.get('v') : null;
  const { renderMd } = await import(`assets/md.js${SBV ? `?v=${SBV}` : ''}`);

  // Fallback id must satisfy the edge's session regex (^[\w-]{1,59}$) — a bare
  // Math.random() decimal would be silently dropped there, orphaning memory.
  const uuid = () =>
    crypto.randomUUID ? crypto.randomUUID() : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const readChats = () => {
    try { return JSON.parse(localStorage.getItem(CHATS_KEY) ?? '{}') ?? {}; } catch { return {}; }
  };
  const writeChats = (chats) => {
    try { localStorage.setItem(CHATS_KEY, JSON.stringify(chats)); return true; } catch { return false; }
  };
  const activeId = () => localStorage.getItem(ACTIVE_KEY);
  const setActive = (id) => { try { localStorage.setItem(ACTIVE_KEY, id); } catch {} };

  // Migrate the pre-multi-chat single history into a first chat. Remove the
  // legacy copy only once the new one actually persisted — a failed write
  // must not delete the only copy the device has.
  const migrate = () => {
    const chats = readChats();
    if (Object.keys(chats).length) return;
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(HIST_KEY) ?? '[]') ?? []; } catch {}
    const id = uuid();
    chats[id] = { title: 'first chat', rows: legacy };
    if (writeChats(chats)) {
      setActive(id);
      try { localStorage.removeItem(HIST_KEY); } catch {}
    }
  };

  const isErrRow = (r) => r.role !== 'me' && /^## error\b/m.test(r.text ?? '') && /kind:\s*\w/.test(r.text ?? '');
  const deriveTitle = (rows) => {
    const first = (rows ?? []).find((r) => r.role === 'me' && r.text && !isErrRow(r))?.text ?? '';
    return first.slice(0, 26) || 'new chat';
  };
  // One title read site: the custom rename wins, then the derived one.
  const titleOf = (chat) => chat.customTitle || chat.title || deriveTitle(chat.rows);

  // The harness bridge appends a delivery instruction after a --- rule; the
  // user must never watch that type itself out.
  const stripBoilerplate = (t) =>
    t.replace(/^# Superbot\n\n?/, '').replace(/\n+---\nCompleted answer from Superbot[\s\S]*$/, '').trimEnd();

  // ---------- scroll: stick to the bottom until the user scrolls up ----------
  let pinned = true;
  const follow = () => { if (pinned) log.scrollTop = log.scrollHeight; };
  const paintPill = () => {
    const pill = document.getElementById('pill');
    if (pill) pill.classList.toggle('show', !pinned && log.scrollHeight > log.clientHeight + 80);
  };
  log.addEventListener('scroll', () => {
    pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    paintPill();
  });
  // Intent beats position (cosmos follow-bottom rule): an upward wheel means
  // "stop following" NOW, before the scroll lands anywhere — content growing
  // under a stationary viewport must never re-stick a reader who left.
  log.addEventListener('wheel', (e) => {
    if (e.deltaY < 0) { pinned = false; paintPill(); }
  }, { passive: true });

  // ---------- rendering ----------
  const relTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  const actionsFor = (r, i, rows) => {
    if (isErrRow(r)) return '<span class="acts"><button class="act" data-act="regen" data-i="' + i + '" title="retry">retry</button></span>';
    const btns = ['<button class="act" data-act="copy" data-i="' + i + '" title="copy">copy</button>'];
    if (r.role === 'me') btns.push('<button class="act" data-act="edit" data-i="' + i + '" title="edit and resend">edit</button>');
    else if (i === rows.length - 1) btns.push('<button class="act" data-act="regen" data-i="' + i + '" title="try again">↻</button>');
    return `<span class="acts">${btns.join('')}</span>`;
  };

  const rowHtml = (r, i, rows) => {
    const cls = `msg ${r.role === 'me' ? 'me' : 'bot'}${isErrRow(r) ? ' err' : ''}`;
    return `<div class="${cls}" data-i="${i}">` +
      `<div class="who"${r.ts ? ` title="${relTime(r.ts)}"` : ''}>${r.role === 'me' ? 'you' : 'superbot'}${actionsFor(r, i, rows)}</div>` +
      `<div class="body">${renderMd(r.text)}</div></div>`;
  };

  // Fresh chat: the robot greets in the foreground, landing-page themed,
  // and the footer pet stands down until the conversation starts.
  const paintLog = () => {
    const chats = readChats();
    const chat = chats[activeId()];
    log.innerHTML = '';
    const rows = chat?.rows ?? [];
    document.body.classList.toggle('fresh', !rows.length);
    if (!rows.length) {
      log.innerHTML =
        '<div id="hello" class="hello"><div class="bubble" id="hellobubble" hidden></div>' +
        '<pre class="m" id="hellopet"></pre>' +
        '<div class="word">superbot<span class="gg">.gg</span></div></div>';
      dispatchEvent(new Event('sb:hello'));
      paintPill();
      return;
    }
    rows.forEach((r, i) => log.insertAdjacentHTML('beforeend', rowHtml(r, i, rows)));
    pinned = true;
    log.scrollTop = log.scrollHeight;
    paintPill();
  };

  const paintList = (filter) => {
    const chats = readChats();
    const act = activeId();
    for (const el of [...list.querySelectorAll('.rowx')]) el.remove();
    const f = (filter ?? '').trim().toLowerCase();
    for (const [id, chat] of Object.entries(chats)) {
      if (f && !(titleOf(chat) || '').toLowerCase().includes(f) &&
          !(chat.rows ?? []).some((r) => (r.text ?? '').toLowerCase().includes(f))) continue;
      const row = document.createElement('div');
      row.className = 'rowx';
      row.innerHTML =
        `<button class="chat${id === act ? ' active' : ''}"></button>` +
        `<span class="rowacts">` +
        `<button class="ract" data-cact="rename" data-id="${id}" title="rename">✎</button>` +
        `<button class="ract" data-cact="del" data-id="${id}" title="delete">✕</button></span>`;
      row.querySelector('button.chat').textContent = titleOf(chat) || 'new chat';
      row.querySelector('button.chat').onclick = () => { setActive(id); paintList(search?.value); paintLog(); q.focus(); };
      list.appendChild(row);
    }
  };

  const newChat = () => {
    const chats = readChats();
    const id = uuid();
    chats[id] = { title: 'new chat', rows: [] };
    writeChats(chats);
    setActive(id);
    paintList(search?.value);
    paintLog();
    q.focus();
  };
  newbtn.onclick = newChat;

  // ---------- sidebar: search / rename / delete (delegated) ----------
  const search = document.getElementById('search');
  if (search) search.addEventListener('input', () => paintList(search.value));
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      search?.focus();
      search?.select();
    }
  });

  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cact]');
    if (!b) return;
    const id = b.dataset.id;
    const chats = readChats();
    if (!chats[id]) return;
    if (b.dataset.cact === 'rename') {
      const btn = b.closest('.rowx').querySelector('button.chat');
      const inp = document.createElement('input');
      inp.className = 'ren';
      inp.value = titleOf(chats[id]);
      btn.replaceWith(inp);
      inp.focus();
      inp.select();
      let done = false;
      const commit = (keep) => {
        if (done) return;
        done = true;
        const cs = readChats();
        if (keep && cs[id] && inp.value.trim()) {
          cs[id].customTitle = inp.value.trim();
          cs[id].title = cs[id].customTitle;
          writeChats(cs);
        }
        paintList(search?.value);
      };
      inp.onkeydown = (ev) => {
        if (ev.key === 'Enter') commit(true);
        else if (ev.key === 'Escape') commit(false);
        else return;
        ev.preventDefault();
        ev.stopPropagation();
      };
      inp.onblur = () => commit(true);
    } else if (b.dataset.cact === 'del') {
      // Two-step in-row confirm: first click arms, second click within 2.5s deletes.
      if (!b.classList.contains('arm')) {
        b.classList.add('arm');
        b.textContent = 'sure?';
        setTimeout(() => { b.classList.remove('arm'); b.textContent = '✕'; }, 2500);
        return;
      }
      delete chats[id];
      writeChats(chats);
      if (id === activeId()) newChat();
      else paintList(search?.value);
    }
  });

  // ---------- message actions (delegated on the log) ----------
  const copyText = (t) => {
    const done = () => dispatchEvent(new Event('superbot:copied'));
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(done, done);
    else {
      const ta = document.createElement('textarea');
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
      done();
    }
  };

  log.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const i = Number(el.dataset.i);
    const chat = readChats()[activeId()];
    const rows = chat?.rows ?? [];
    const act = el.dataset.act;
    if (act === 'copy') copyText(rows[i]?.text ?? '');
    else if (act === 'copy-code') copyText(el.closest('.code')?.querySelector('code')?.textContent ?? '');
    else if (act === 'regen') regenerate(i);
    else if (act === 'edit') startEdit(i);
  });

  // Edit-and-resend: rewrite this row, truncate everything after it, re-ask.
  // ChatGPT semantics, chatbot-ui's truncate-at-index.
  const startEdit = (i) => {
    if (busy) return;
    const div = log.querySelector(`.msg[data-i="${i}"]`);
    const chat = readChats()[activeId()];
    if (!div || !chat || !chat.rows[i]) return;
    const body = div.querySelector('.body');
    const ta = document.createElement('textarea');
    ta.className = 'edit';
    ta.value = chat.rows[i].text;
    body.replaceWith(ta);
    ta.focus();
    ta.style.height = `${ta.scrollHeight}px`;
    let done = false;
    const commit = (keep) => {
      if (done) return;
      done = true;
      const cs = readChats();
      const c = cs[activeId()];
      if (!c) return;
      if (keep && ta.value.trim()) {
        c.rows = c.rows.slice(0, i + 1);
        c.rows[i] = { role: 'me', text: ta.value.trim(), ts: Date.now() };
        if (!c.customTitle) c.title = deriveTitle(c.rows);
        writeChats(cs);
        paintLog(); // the textarea swaps back to the rendered row before the re-ask
        ask(ta.value.trim(), activeId(), true);
      } else paintLog();
    };
    ta.onkeydown = (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
    };
    ta.onblur = () => commit(true);
  };

  const regenerate = (i) => {
    if (busy) return;
    const id = activeId();
    const chats = readChats();
    const chat = chats[id];
    if (!chat) return;
    const meIdx = chat.rows[i]?.role === 'me' ? i : i - 1;
    const text = chat.rows[meIdx]?.role === 'me' ? chat.rows[meIdx].text : null;
    if (!text) return;
    chat.rows = chat.rows.slice(0, meIdx + 1);
    if (!chat.customTitle) chat.title = deriveTitle(chat.rows);
    writeChats(chats);
    paintLog();
    ask(text, id, true);
  };

  // ---------- key + join redemption ----------
  const paintKey = () => {
    const has = Boolean(localStorage.getItem(KEY_STORE));
    keybtn.classList.toggle('set', has);
    keybtn.textContent = has ? 'key ✓' : 'key';
  };

  // Parse the sbk_ out of /join's markdown. Never throws: both callers render
  // the returned message as a row, so a network failure is a message, not an
  // unhandled rejection.
  const redeemJoin = async (raw) => {
    const m = /join_([A-Za-z0-9_-]+)/.exec(raw);
    if (!m) return 'That does not look like a join link (expected …/join/join_…).';
    try {
      const res = await fetch(`/join/join_${m[1]}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return 'Unknown or rotated join link — ask for a fresh one.';
      const md = await res.text();
      const key = /sbk_[A-Za-z0-9_-]+/.exec(md)?.[0];
      if (!key) return 'The join link served no key — ask for a fresh one.';
      localStorage.setItem(KEY_STORE, key);
      paintKey();
      return 'Linked ✓ — the full executor is unlocked for this device.';
    } catch {
      return 'Could not reach the origin to redeem that link — check the connection and retry.';
    }
  };

  keybtn.onclick = () => {
    const cur = localStorage.getItem(KEY_STORE) ?? '';
    const next = prompt('Paste an sbk_ key or a /join/join_… link (empty clears).', cur);
    if (next === null) return;
    const v = next.trim();
    if (!v) { localStorage.removeItem(KEY_STORE); paintKey(); return; }
    if (v.startsWith('sbk_')) { localStorage.setItem(KEY_STORE, v); paintKey(); return; }
    redeemJoin(v).then((msg) => appendRow('bot', msg));
  };

  // ?join= auto-redeem on first load: /pair success, /account and the
  // installer can all point a device here; the page links itself. The URL is
  // cleaned only after a successful redemption: a failed fetch must leave the
  // parameter on the URL so a reload can retry.
  const params = new URLSearchParams(location.search);
  const joinParam = params.get('join');
  if (joinParam) {
    redeemJoin(decodeURIComponent(joinParam)).then((msg) => {
      // Clean the URL only on a real redemption: redeemJoin resolves with a
      // failure message too, and that must leave the parameter on the URL so
      // a reload can retry.
      if (/Linked ✓/.test(msg)) history.replaceState(null, '', location.pathname);
      appendRow('bot', msg);
      q.focus();
    });
  }

  // ---------- conversation ----------
  let busy = false;
  let ctl = null; // the in-flight answer's AbortController

  const persistRow = (r, chatId) => {
    const chats = readChats();
    const chat = chats[chatId];
    if (!chat) return;
    chat.rows.push(r);
    chat.rows = chat.rows.slice(-CAP); // the cap is load-bearing
    if (!chat.customTitle) chat.title = deriveTitle(chat.rows);
    writeChats(chats);
    if (chatId === activeId()) paintList(search?.value);
  };

  const appendRow = (role, text, chatId) => {
    const r = { role, text, ts: Date.now() };
    persistRow(r, chatId);
    if (chatId !== activeId()) return; // background reply: persisted, not painted
    const chat = readChats()[chatId];
    const i = (chat?.rows.length ?? 1) - 1;
    log.insertAdjacentHTML('beforeend', rowHtml(r, i, chat?.rows ?? []));
    follow();
    paintPill();
  };

  // The in-flight bot row: the status line lives in its .who slot, so
  // "superbot · routing → tool: <slug> → writing▊" sits exactly where the
  // answer will land.
  let liveStage = null;
  const stageLabel = (stage, detail) =>
    stage === 'tool' ? `tool: ${detail ?? ''}` : stage === 'writing' ? 'writing' : stage;
  const mountLive = () => {
    const div = document.createElement('div');
    div.className = 'msg bot live';
    div.innerHTML = '<div class="who">superbot · <span class="stage">thinking</span><span class="crsr">▊</span></div>' +
      '<div class="body"><span class="crsr">▊</span></div>';
    log.appendChild(div);
    liveStage = div.querySelector('.stage');
    follow();
    return div;
  };
  const setStage = (stage, detail) => {
    if (liveStage) liveStage.textContent = stageLabel(stage, detail);
    dispatchEvent(new CustomEvent('sb:status', { detail: { stage, detail } }));
  };

  // Typewriter reveal: renderMd on every tick is half-fence-safe (md.js), so
  // a code fence only opens once its closer has been revealed. Any wheel or
  // key skips straight to the full answer.
  let revealRaf = 0;
  const reveal = (div, text, onDone) => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const body = div.querySelector('.body');
    if (reduce || text.length < 90) {
      body.innerHTML = renderMd(text);
      onDone();
      return;
    }
    const totalMs = Math.min(1100 + text.length * 2, 3800);
    const per = Math.max(12, Math.ceil(text.length / (totalMs / 16)));
    let i = 0;
    const skip = () => { i = text.length; };
    addEventListener('keydown', skip, { once: true });
    log.addEventListener('wheel', skip, { once: true, passive: true });
    const tick = () => {
      i = Math.min(text.length, i + per);
      body.innerHTML = renderMd(text.slice(0, i));
      follow();
      if (i < text.length) revealRaf = requestAnimationFrame(tick);
      else {
        body.innerHTML = renderMd(text);
        onDone();
      }
    };
    revealRaf = requestAnimationFrame(tick);
  };
  const stopReveal = () => { cancelAnimationFrame(revealRaf); revealRaf = 0; };

  // ---------- token streaming: backlog-proportional reveal ----------
  // Ported from cosmos stream-reveal.ts (measured knobs). Chars-per-frame is
  // proportional to the backlog, so the pace self-tunes to the model's real
  // speed instead of taxing latency with a fixed typewriter delay. The first
  // delta paints immediately — liveness beats smoothness on the first token —
  // and an over-cap backlog drains at a bounded per-frame dump so a paste-sized
  // delta is neither fake typing nor a single-frame jank spike.
  const REVEAL = { leadMs: 450, tailMs: 240, minCps: 55, maxCps: 1800, maxPending: 800, dumpPerFrame: 160 };
  const makeLiveReveal = (div) => {
    const body = div.querySelector('.body');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let recv = '';
    let shown = 0;
    let raf = 0;
    let closed = false;
    let settle;
    const finished = new Promise((r) => { settle = r; });
    const paint = () => {
      body.innerHTML = renderMd(recv.slice(0, shown));
      follow();
    };
    const budget = (frameMs) => {
      const backlog = recv.length - shown;
      if (backlog <= 0) return 0;
      // Reduced motion, or the reader scrolled away: nobody is watching the
      // animation, so smoothing would only delay the record.
      if (reduce || !pinned) return backlog;
      let per = (backlog * frameMs) / REVEAL.leadMs;
      if (closed) per = Math.max(per, (backlog * frameMs) / REVEAL.tailMs);
      if (backlog > REVEAL.maxPending) per = Math.max(per, REVEAL.dumpPerFrame);
      return Math.max(REVEAL.minCps * (frameMs / 1000), Math.min(per, REVEAL.maxCps * (frameMs / 1000)));
    };
    let last = 0;
    const tick = (now) => {
      raf = 0;
      const frameMs = Math.min(64, last ? now - last : 16);
      last = now;
      shown = Math.min(recv.length, shown + Math.max(1, Math.round(budget(frameMs))));
      paint();
      if (shown < recv.length) raf = requestAnimationFrame(tick);
      else if (closed) { div.classList.remove('streaming'); settle(); }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    return {
      get recv() { return recv; },
      push(piece) {
        if (!recv) {
          div.classList.add('streaming');
          recv = piece;
          shown = Math.min(recv.length, 80); // first paint is immediate
          paint();
        } else recv += piece;
        kick();
      },
      // Accelerated tail to the (possibly re-wrapped) final text; resolves
      // when the last char is on screen so the caller can swap rows seamlessly.
      finish(finalText) {
        closed = true;
        if (typeof finalText === 'string' && finalText !== recv) {
          if (finalText.startsWith(recv.slice(0, shown))) recv = finalText;
          else { recv = finalText; shown = recv.length; paint(); }
        }
        if (shown >= recv.length) { div.classList.remove('streaming'); settle(); }
        else kick();
        return finished;
      },
      cancel() { cancelAnimationFrame(raf); raf = 0; },
    };
  };

  const setBusy = (on) => {
    busy = on;
    dot.classList.toggle('on', on);
    send.textContent = on ? '■' : '↵';
    send.classList.toggle('stop', on);
    send.title = on ? 'stop' : 'send';
    dispatchEvent(new CustomEvent('sb:busy', { detail: on }));
  };

  const stop = () => { if (busy) ctl?.abort(); };

  // One generation, one AbortController; the ceiling composes with it so a
  // hung route still gives up. 370s: a harness research run legitimately
  // streams for minutes (the edge gives the compose 390s), and aborting the
  // stream at 120s either truncated a healthy answer or silently undid the
  // send. Stream first, blocking route as fallback — both return the same
  // markdown, so degradation is invisible.
  const timeoutSignal = (ac) => {
    try { return AbortSignal.any([ac.signal, AbortSignal.timeout(370_000)]); }
    catch { return ac.signal; }
  };

  // Failures are tagged: `retriable` means the edge never ran the intent (the
  // request failed to land, or was refused before the handler), so the
  // blocking /answer fallback is a first execution, not a second. A break
  // AFTER the stream opened means runAnswer already ran — re-sending the same
  // intent would execute it twice, so those surface as an error card whose
  // retry button leaves the decision to the user.
  const streamAnswer = async (text, signal, onStatus, onDelta, session) => {
    const headers = {};
    const key = localStorage.getItem(KEY_STORE);
    if (key) headers.authorization = `Bearer ${key}`;
    let res;
    try {
      // `session` keys the server-side conversation memory (this chat's id,
      // namespaced by the paired account edge-side) — follow-ups see what
      // was already asked without the client re-sending history.
      const sess = session ? `&session=${encodeURIComponent(session)}` : '';
      res = await fetch(`/answer/stream?intent=${encodeURIComponent(text)}${sess}`, { headers, signal });
    } catch (err) {
      if (err && typeof err === 'object') err.retriable = true;
      throw err;
    }
    if (!res.ok || !res.body) {
      const e = new Error(`stream ${res.status}`);
      e.retriable = true;
      throw e;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let answer = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // CRLF-normalized: the SSE spec allows \r\n endings, and a rewriting
      // middlebox would otherwise never match the \n\n frame delimiter
      // (JSON payloads escape their newlines, so nothing real is lost).
      buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let ev = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trimStart();
        }
        if (ev === 'status') {
          try { const s = JSON.parse(data); onStatus(s.stage, s.detail); } catch {}
        } else if (ev === 'delta') {
          // Inner-markdown tokens; the final answer event is still the
          // completion signal, so keep draining.
          try { const d = JSON.parse(data).text; if (d) onDelta?.(d); } catch {}
        } else if (ev === 'answer') {
          // Guarded like the other frames: a corrupt answer frame must fall
          // through to the kept-partial paths, not throw a stream_broken
          // card over an answer the server actually produced.
          try { answer = JSON.parse(data).text; } catch {}
          if (typeof answer === 'string') break;
        }
      }
      if (answer !== null) break;
    }
    if (answer === null) throw new Error('stream ended without an answer');
    return answer;
  };

  const authHeaders = () => {
    const h = {};
    const key = localStorage.getItem(KEY_STORE);
    if (key) h.authorization = `Bearer ${key}`;
    return h;
  };

  // chatId is captured BEFORE the fetch: a mid-flight sidebar switch must
  // never route the reply into the wrong chat. skipMe for edit-and-resend /
  // regenerate: the (rewritten) me row is already the last row — re-appending
  // it would duplicate the user's message, ChatGPT regenerates in place.
  const ask = async (text, chatId = activeId(), skipMe = false) => {
    if (busy) return;
    q.value = '';
    autosize();
    if (!skipMe) appendRow('me', text, chatId);
    setBusy(true);
    const live = chatId === activeId() ? mountLive() : null;
    ctl = new AbortController();
    const signal = timeoutSignal(ctl);
    let out = null;
    // The token lane: paints into the live row via the proportional reveal.
    // liveCtl also holds everything received so far, which is what makes stop
    // honest — an abort mid-stream keeps the paid-for partial answer.
    let liveCtl = null;
    let recvRaw = '';
    const onDelta = (d) => {
      recvRaw += d;
      if (live) {
        if (!liveCtl) liveCtl = makeLiveReveal(live);
        liveCtl.push(d);
      }
    };
    try {
      out = await streamAnswer(text, signal, (stage, detail) => setStage(stage, detail), onDelta, chatId);
    } catch (err) {
      if (signal.aborted && recvRaw) {
        // Honest stop: tokens already arrived, so the record is the partial
        // answer — never an undo of the question.
        out = recvRaw;
      } else if (signal.aborted) {
        live?.remove();
        // Stop before any answer lands undoes the send: the just-appended me
        // row goes away and its text returns to the composer. An abort after
        // the answer row persisted keeps everything (the row is the record).
        const cs = readChats();
        const c = cs[chatId];
        const last = c?.rows.at(-1);
        if (c && !skipMe && c.rows.length && last.role === 'me' && last.text === text) {
          c.rows.pop();
          writeChats(cs);
          if (chatId === activeId()) { paintLog(); paintList(search?.value); }
        }
        q.value = text;
        setBusy(false);
        q.focus();
        return;
      } else if (err?.retriable) {
        try {
          const sess = chatId ? `&session=${encodeURIComponent(chatId)}` : '';
          const res = await fetch(`/answer?intent=${encodeURIComponent(text)}${sess}`, { headers: authHeaders(), signal });
          if (!res.ok) throw new Error(`superbot answered ${res.status}`);
          out = await res.text();
        } catch (err2) {
          if (signal.aborted) { live?.remove(); return; }
          dispatchEvent(new Event('sb:error'));
          out = `# Superbot\n\n## error\n\nkind: adapter_error\n\nfetch failed: ${String(err2)}`;
        }
      } else if (recvRaw) {
        // The stream broke after tokens landed: keep what arrived — the ↻ on
        // the last bot row is the deliberate re-run, never a silent resend.
        dispatchEvent(new Event('sb:error'));
        out = `${recvRaw}\n\n> the connection dropped mid-answer — this is what arrived. ↻ runs it again.`;
      } else {
        // The stream broke mid-answer: the request DID run on the edge, so
        // re-sending it silently could execute the intent twice. Tell the
        // user; the card's retry button re-runs it on purpose.
        dispatchEvent(new Event('sb:error'));
        out = `# Superbot\n\n## error\n\nkind: stream_broken\n\nThe connection dropped mid-answer (${String(err?.message ?? err)}). The request did reach Superbot — press retry to run it again.`;
      }
    }
    stopReveal();
    const clean = stripBoilerplate(String(out)).replace(/^# Superbot\s*/, '');
    // Persist BEFORE painting: an abort or switch mid-reveal must never lose
    // the row (paintLog replays from storage, never from the DOM).
    if (recvRaw && liveCtl && chatId === activeId()) {
      // Streaming lane: the live row already shows (most of) the text. Persist
      // now, drain the accelerated tail, then swap the live row for the real
      // one — never a flash-to-full, never re-typing what was already revealed.
      persistRow({ role: 'bot', text: clean, ts: Date.now() }, chatId);
      paintList(search?.value);
      await liveCtl.finish(clean);
      // A switch-away-AND-BACK during the tail drain repaints this log from
      // storage, which already includes the row persisted above — swapping
      // in another copy doubled the bubble. The live node's connectedness is
      // the discriminator: detached means a repaint happened.
      const liveWasMounted = live?.isConnected ?? false;
      live?.remove();
      if (chatId === activeId()) {
        if (liveWasMounted) {
          // Still the same DOM this stream painted: swap live row for real.
          const chat = readChats()[chatId];
          const i = (chat?.rows.length ?? 1) - 1;
          if (chat) log.insertAdjacentHTML('beforeend', rowHtml(chat.rows[i], i, chat.rows));
        }
        follow();
        paintPill();
      }
    } else {
      liveCtl?.cancel();
      live?.remove();
      appendRow('bot', clean, chatId);
      if (chatId === activeId()) {
        const div = log.querySelector('.msg:last-child');
        if (div) reveal(div, clean, () => paintPill());
      }
    }
    if (isErrRow({ role: 'bot', text: clean })) dispatchEvent(new Event('sb:error'));
    setBusy(false);
    q.focus();
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const text = q.value.trim();
    if (!text || busy) return;
    ask(text, activeId());
  };

  // The send button IS the stop button while busy — one control, two states.
  send.type = 'button';
  send.onclick = () => { if (busy) stop(); else form.requestSubmit(); };

  addEventListener('keydown', (e) => {
    // Enter sends, Shift+Enter breaks the line — the composer is a textarea.
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement === q && !busy) {
      e.preventDefault();
      const text = q.value.trim();
      if (text) ask(text, activeId());
    } else if (e.key === 'Escape' && busy) {
      e.preventDefault();
      stop();
    }
  });

  const autosize = () => {
    q.style.height = 'auto';
    q.style.height = `${Math.min(q.scrollHeight, 176)}px`;
  };
  q.addEventListener('input', autosize);

  // ---------- boot ----------
  migrate();
  // A fresh device with no chats at all starts one.
  if (!Object.keys(readChats()).length) newChat();
  paintList();
  paintLog();
  paintKey();
  autosize();
})();
