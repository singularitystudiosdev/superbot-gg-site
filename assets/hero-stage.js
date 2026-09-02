// The resident-agent hero: the mascot at the keyboard, incident cards that pop
// up around it, a beam of traffic while it works, the fix typed in, a check,
// then the next one. Choreography and its sources: harness-notes/brand-refresh.md
// (Sentry's incident cards at 5-8s each, Cluely's enter → work → swipe-out
// cycle, sonner's stack math: 3 visible, 14px gap, 5% scale per depth,
// Material 3 durations). Usage:
//
//   import { mountStage } from 'assets/hero-stage.js';
//   mountStage(stageEl, { mascot, incidents, stacked: () => bool, onResolve });
//
// The stage element carries .stage-bar, svg.beam (path.line + path.traffic),
// pre.mascot and any .card.static fallbacks (removed here: the loop owns the
// stage once it runs). Only transform, opacity and the SVG dash offset animate;
// the typed fix line is the one main-thread effect, the same device the
// lander's wire log used. The loop pauses while the stage is offscreen, the
// tab is hidden, or a card is hovered.

const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';
const EASE_IN = 'cubic-bezier(.55, 0, .85, .36)';
// consecutive cards never share a slot or a side of the mascot
const SLOTS = ['tl', 'mr', 'tr', 'ml'];
const VISIBLE = 3;
const CHAR_MS = 26;

// the keyboard under the mascot: two staggered rows, laid out as the letters
// sit on a real board so a typed 'a' strikes the key where 'a' is. Paw by key
// position (bongo.cat: the left half of the row is the left paw), a 90ms
// pulse per key, the keycap flash decaying over 180ms in CSS.
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl'];
const KEY_HOLD_MS = 60;

const clamp = (v) => Math.max(-1, Math.min(1, v));
const dist = ([x, y], p) => Math.hypot(x - p.x, y - p.y);
// site.css zooms the page on wide screens; rectangles come back in zoomed
// px while inline left/top are unzoomed, so anything measured from a rect
// and written back as a style is divided by this
const zoomOf = () => Number(getComputedStyle(document.documentElement).zoom) || 1;

// the autonomy dial (lander-agent.html): what each setting does to a card.
// nag me asks before every fix; ask first asks only where the incident is
// flagged (the current middle); hands-off never asks. `policy` is read per
// card, so a click takes effect on the next one.
const POLICIES = {
  nag: { ask: () => true, wait: 1400, foot: 'waited for you 1.4s · nag me' },
  ask: { ask: (inc) => !!inc.ask, wait: 1200, foot: 'waited for you 1.2s · ask first' },
  off: { ask: () => false, wait: 0, foot: null },
};
// what a card asks when its incident carries no ask line of its own (nag me
// asks before everything): a plain yes/no, nothing promised beyond the fix
const ASK_LINE = 'ok to fix this?';

// the help beat: a smaller, stuck character (another app's agent) walks in
// from the wing carrying a prompt it could not finish; superbot types the
// answer at HELP_RATE (3x the normal keystroke rate: the same model, fewer
// steps and fewer tokens is the one measured claim, ledger
// harness-notes/brand-refresh.md), the helper cheers up and leaves. Walk
// timings: Fluent 2 motion, fast ease-out in, faster out.
const HELP_RATE = 3;
const HELP_WALK_IN_MS = 700;
const HELP_WALK_OUT_MS = 450;

// the thought bubble in the stage's spare corner (bottom-right on the desk,
// top-left when stacked: the one lane no card, the helper or the keyboard
// uses). On an incident marked `important` the character thinks out loud
// before it works (its `think`, written as a read of THIS user's setup);
// after every third fix it "dreams" instead: packs what it learned about you
// a little tighter (the profile blocks `superbot sync` keeps,
// edge/src/profile.ts). Never on every card (owner: every third, or the
// important ones), and it clears when the next task arrives. Thinking is not
// typing: no keystrokes, a faster reveal, gaze up and away.
const THINK_MS = 14;
const DREAM_EVERY = 3;
const DREAMS = [
  'you run the tests after every edit. i do that now too.',
  'you say "ship it" when you\'re happy with a diff. noted.',
  'your rules mention postgres nine times. keeping those close.',
  'nothing runs between 1am and 7am. the boring stuff can wait for then.',
  'packing today\'s fixes into what i know about you.',
  'cursor is for the frontend, claude code for the api. routing by that.',
];

export function mountStage(stage, { mascot, incidents, stacked = () => false, onResolve, policy = () => 'ask', helper } = {}) {
  const beam = stage.querySelector('.beam');
  const line = beam?.querySelector('.line');
  const traffic = beam?.querySelector('.traffic');
  const mascotEl = stage.querySelector('.mascot');
  const keys = stage.querySelector('.keys');
  const keyRows = keys ? [...keys.querySelectorAll('.row')].map((r) => [...r.querySelectorAll('i')]) : [];
  const thought = stage.querySelector('.thought');
  const thoughtLab = thought?.querySelector('.lab') ?? null;
  const thoughtT = thought?.querySelector('.t') ?? null;
  for (const el of stage.querySelectorAll('.card.static')) el.remove();

  // a typed character strikes its key and drops the paw on that side
  const strike = (ch) => {
    if (!keyRows.length) return;
    const c = ch.toLowerCase();
    let row = KEY_ROWS.findIndex((r) => r.includes(c));
    let col = row < 0 ? -1 : KEY_ROWS[row].indexOf(c);
    if (row < 0) {
      // digits, punctuation, space: a stable spot on the board, not a random one
      const code = c.charCodeAt(0);
      row = code % 2;
      col = (code * 7) % KEY_ROWS[row].length;
    }
    const key = keyRows[row]?.[col];
    if (key) {
      key.classList.add('hit');
      setTimeout(() => key.classList.remove('hit'), KEY_HOLD_MS);
    }
    // paw and keycap hold together (confirmation finding: they had drifted 30ms apart)
    mascot.press?.(col < KEY_ROWS[row].length / 2 ? 'left' : 'right', KEY_HOLD_MS);
  };

  // ---- pause bookkeeping: any reason holds the loop; phases wait it out ----
  const reasons = new Set();
  let waiters = [];
  const paused = () => reasons.size > 0;
  const pause = (why) => reasons.add(why);
  const resume = (why) => {
    reasons.delete(why);
    if (paused()) return;
    const w = waiters;
    waiters = [];
    for (const r of w) r();
  };
  const untilResumed = () => (paused() ? new Promise((r) => waiters.push(r)) : Promise.resolve());
  const sleep = async (ms) => {
    let left = ms;
    while (left > 0) {
      await untilResumed();
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, Math.min(50, left)));
      left -= performance.now() - t0;
    }
  };

  const sync = () => {
    stage.classList.toggle('stacked', stacked() || stage.clientWidth < 560);
    const r = stage.getBoundingClientRect();
    beam?.setAttribute('viewBox', `0 0 ${Math.max(1, r.width)} ${Math.max(1, r.height)}`);
    // the keyboard sits centred under the character in either layout
    if (keys && mascotEl.clientWidth) {
      const m = mascotEl.getBoundingClientRect();
      keys.style.left = `${(m.left - r.left + m.width / 2) / zoomOf()}px`;
    }
  };
  sync();
  new ResizeObserver(sync).observe(stage);
  new IntersectionObserver(([e]) => (e.isIntersecting ? resume('offscreen') : pause('offscreen')), { threshold: 0.15 }).observe(stage);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause('hidden') : resume('hidden')));

  // ---- geometry, relative to the stage box ----
  const rel = (el) => {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, sw: s.width, sh: s.height };
  };
  const head = () => {
    const m = rel(mascotEl);
    return { x: m.x + m.w / 2, y: m.y + m.h * 0.18, sw: m.sw, sh: m.sh };
  };
  // the beam leaves from the keyboard's edge on the card's side: what he types
  // is what reaches the card
  const origin = (card) => {
    if (!keys?.clientWidth) return head();
    const k = rel(keys);
    const c = rel(card);
    const toLeft = c.x + c.w / 2 < k.x + k.w / 2;
    return { x: toLeft ? k.x : k.x + k.w, y: k.y + k.h / 2, sw: k.sw, sh: k.sh };
  };
  const lookAt = (card) => {
    const h = head();
    const c = rel(card);
    mascot.lookAt = {
      x: clamp((c.x + c.w / 2 - h.x) / (h.sw / 2)),
      y: clamp((c.y + c.h / 2 - h.y) / (h.sh / 2)),
    };
  };

  const drawBeam = async (card) => {
    if (!line || !traffic || !mascotEl.clientHeight) return;
    const h = origin(card);
    const c = rel(card);
    const corners = [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h], [c.x + c.w / 2, c.y + c.h]];
    const [tx, ty] = corners.reduce((a, b) => (dist(b, h) < dist(a, h) ? b : a));
    const dx = tx - h.x, dy = ty - h.y, len = Math.hypot(dx, dy) || 1;
    // a gentle bend off the straight line so the beam reads as drawn, not ruled
    const bend = 0.16 * len;
    const cx = (h.x + tx) / 2 - (dy / len) * bend;
    const cy = (h.y + ty) / 2 + (dx / len) * bend;
    const d = `M ${h.x} ${h.y} Q ${cx} ${cy} ${tx} ${ty}`;
    line.setAttribute('d', d);
    traffic.setAttribute('d', d);
    const total = line.getTotalLength();
    line.style.strokeDasharray = `${total}`;
    line.style.strokeDashoffset = '0';
    line.style.opacity = '.55';
    await line.animate([{ strokeDashoffset: total }, { strokeDashoffset: 0 }], { duration: 400, easing: EASE_OUT }).finished;
    beam.classList.add('on');
  };
  const fadeBeam = async () => {
    if (!line) return;
    beam.classList.remove('on');
    line.style.opacity = '0';
    await line.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 200, easing: 'linear' }).finished;
  };

  // ---- cards ----
  let hovered = null;
  const build = (inc) => {
    const card = document.createElement('div');
    // the churn is for eyes: the stage figure's aria-label describes the scene
    // and the log block below carries the same content accessibly
    card.className = 'card';
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML =
      '<div class="card-in"><div class="card-bar"><i></i><i></i><i></i><span></span><em class="led"></em></div>' +
      '<div class="card-body"><div class="problem"></div><div class="ask" hidden></div><div class="fix" hidden><span class="t"></span></div></div>' +
      '<div class="card-foot" hidden></div></div>';
    card.querySelector('.card-bar span').textContent = inc.client;
    card.querySelector('.problem').textContent = inc.problem;
    card.querySelector('.ask').textContent = inc.ask ?? '';
    card.querySelector('.card-foot').textContent = inc.foot;
    card.addEventListener('pointerenter', () => { hovered = card; pause('hover'); });
    card.addEventListener('pointerleave', () => { if (hovered === card) hovered = null; resume('hover'); });
    return card;
  };

  const live = []; // on stage, newest first: index is the stack depth
  const restack = () => {
    // in a stack the cards behind take the front card's height (sonner's
    // --front-toast-height), so an older, taller card never peeks out below
    const front = live[0]?.querySelector('.card-in');
    const h = stage.classList.contains('stacked') && front ? `${front.offsetHeight}px` : '';
    live.forEach((c, i) => {
      c.setAttribute('data-depth', String(Math.min(i, 2)));
      c.querySelector('.card-in').style.height = i === 0 ? '' : h;
    });
  };
  const exit = async (card) => {
    if (!card.isConnected) return;
    const i = live.indexOf(card);
    if (i >= 0) live.splice(i, 1);
    restack();
    const inner = card.querySelector('.card-in');
    inner.style.opacity = '0';
    await inner.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.9)', opacity: 0 }], { duration: 200, easing: EASE_IN }).finished;
    if (hovered === card) { hovered = null; resume('hover'); }
    card.remove();
  };

  const typeInto = async (el, text, ms = CHAR_MS) => {
    for (let i = 1; i <= text.length; i++) {
      await untilResumed();
      el.textContent = text.slice(0, i);
      strike(text[i - 1]);
      await sleep(ms);
    }
  };

  // a thought is revealed, not typed: no keystrokes, and the character looks
  // up and away from the cards while it forms
  let thoughtSeq = 0;
  const clearThought = () => {
    thoughtSeq++;
    thought?.classList.remove('on');
  };
  const think = async (label, text) => {
    if (!thought || !text) return;
    const seq = ++thoughtSeq;
    thoughtLab.textContent = label;
    thoughtT.textContent = '';
    thought.classList.add('on');
    for (let i = 1; i <= text.length; i++) {
      await untilResumed();
      if (seq !== thoughtSeq) return; // a newer thought took over
      thoughtT.textContent = text.slice(0, i);
      await sleep(THINK_MS);
    }
  };
  let dreamIdx = 0;
  const dream = () => think('dreaming', DREAMS[dreamIdx++ % DREAMS.length]);
  let played = 0;

  // ---- the helper character: a second, smaller mascot in the wing ----
  const helperEl = helper?.el ?? null;
  const helperBot = helper?.mascot ?? null;
  const helperTag = helperEl?.parentElement?.querySelector('.helper-tag') ?? null;
  const helperWalk = async (dir) => {
    if (!helperEl) return;
    const wrap = helperEl.parentElement;
    const inMs = HELP_WALK_IN_MS, outMs = HELP_WALK_OUT_MS;
    if (dir === 'in') {
      wrap.hidden = false;
      wrap.style.opacity = '1';
      wrap.style.transform = 'none';
      await wrap.animate(
        [{ transform: 'translateX(-140%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: inMs, easing: EASE_OUT },
      ).finished;
    } else {
      wrap.style.opacity = '0';
      await wrap.animate(
        [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-140%)', opacity: 0 }],
        { duration: outMs, easing: EASE_IN },
      ).finished;
      wrap.hidden = true;
    }
  };

  let slotIdx = 0;
  const play = async (inc, onNext) => {
    const card = build(inc);
    const isHelp = inc.kind === 'help' && helperEl && helperBot;
    if (isHelp) {
      // the stuck agent walks in first, carrying the card it could not finish
      card.dataset.slot = 'ml';
      card.dataset.kind = 'help';
      if (helperTag) helperTag.textContent = inc.from ?? 'another agent';
      helperBot.setExpr({ eyeL: 'open', eyeR: 'wink', mouth: 'o' }, 60_000);
      helperBot.lookAt = { x: 0.9, y: -0.4 };
      await helperWalk('in');
    } else {
      card.dataset.slot = SLOTS[slotIdx++ % SLOTS.length];
    }
    const inner = card.querySelector('.card-in');
    const led = card.querySelector('.led');
    const problem = card.querySelector('.problem');
    const ask = card.querySelector('.ask');
    const fix = card.querySelector('.fix');
    const foot = card.querySelector('.card-foot');
    // append BEFORE any restack: a restack over a detached front card measures
    // offsetHeight 0 and hands every card behind it a 0px height
    stage.append(card);
    live.unshift(card);
    while (live.length > VISIBLE) exit(live.pop());
    restack();

    // ENTER: grow out of the slot's own corner, then a beat to read the problem
    await inner.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 250, easing: EASE_OUT }).finished;
    // THINK: on an important card, the read of it in the character's own
    // words, gaze up; otherwise the previous thought clears as the task lands
    const thinks = !!(inc.important && inc.think && thought);
    if (thinks) {
      mascot.lookAt = { x: 0.6, y: 0.5 };
      await think('thinking', inc.think);
      await sleep(260);
    } else {
      clearThought();
      await sleep(500);
    }
    lookAt(card);
    led.className = 'led work';
    mascot.typing = true;
    await drawBeam(card);

    // a permission card asks first: the mascot stops typing and waits for the
    // policy. Which cards ask is the dial's call, read now for this card.
    const pol = POLICIES[policy()] ?? POLICIES.ask;
    const asks = pol.ask(inc);
    if (asks) {
      ask.textContent = inc.ask ?? ASK_LINE;
      ask.hidden = false;
      mascot.typing = false;
      mascot.setExpr({ mouth: 'o' }, pol.wait);
      await sleep(pol.wait);
      mascot.typing = true;
    }

    // WORK: the fix is typed in, as if from the keyboard below; a help card
    // is typed at HELP_RATE, the one place the stage shows speed
    fix.hidden = false;
    await typeInto(fix.querySelector('.t'), inc.fix, isHelp ? CHAR_MS / HELP_RATE : CHAR_MS);
    if (asks) foot.textContent = pol.foot;

    // RESOLVE
    mascot.typing = false;
    fix.classList.add('done');
    // the gain chip: the reader's own benefit from this fix, floating up off
    // the card's top edge and gone in a second
    if (inc.gain) {
      const chip = document.createElement('span');
      chip.className = 'gain';
      chip.textContent = inc.gain;
      const c = rel(card);
      const z = zoomOf();
      chip.style.left = `${(c.x + c.w / 2) / z}px`;
      chip.style.top = `${(c.y - 6) / z}px`;
      stage.append(chip);
      setTimeout(() => chip.remove(), 1200);
    }
    led.className = 'led on';
    problem.classList.add('dim');
    foot.hidden = false;
    mascot.setExpr({ eyeL: 'happy', eyeR: 'happy', mouth: 'grin' }, 900);
    if (inc.closer) mascot.excitedUntil = performance.now() + 1200;
    if (isHelp) {
      // relief: the helper's face flips and it bounces before it goes
      helperBot.setExpr({ eyeL: 'happy', eyeR: 'happy', mouth: 'grin' }, 2400);
      helperBot.excitedUntil = performance.now() + 1400;
      helperBot.lookAt = null;
    }
    onResolve?.(inc.id);
    fadeBeam();
    // every third fix it dreams: what it just learned about you, packed away.
    // The next task clears it (or, if important, thinks over it).
    played++;
    if (!thinks && played % DREAM_EVERY === 0) dream();

    // HOLD: the next card starts while this one is still up (Sentry paces its
    // incident cards at 5-8s each; this lands one every ~5s)
    const hold = inc.hold ?? 2600;
    await sleep(Math.min(1400, hold));
    onNext();
    await sleep(Math.max(0, hold - 1400));
    // no lookAt clear: the next card's own lookAt() is the only thing that
    // should move the gaze (clearing here raced the next card mid-typing)
    if (isHelp) helperWalk('out');
    await exit(card);
  };

  let running = true;
  (async () => {
    let i = 0;
    while (running && stage.isConnected) {
      const inc = incidents[i++ % incidents.length];
      await untilResumed();
      await new Promise((next) => {
        play(inc, next).catch((err) => {
          console.error('[superbot] hero stage:', err);
          next();
        });
      });
    }
  })();

  return { pause, resume, stop: () => { running = false; } };
}
