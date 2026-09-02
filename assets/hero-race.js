// The race: two claude code panes, the same request typed into both, one with
// /superbot in front. The clocks start when the prompt is submitted (typing
// the request costs the same in both windows) and land on the two measured
// means from the benchmarks ledger: superbot's pane at `targets.super` ms,
// the plain pane at `targets.plain` ms (8551 vs 24057, verdict-v3). Every
// pause in a script is a weight that the pane rescales so its pauses sum to
// its target, so the finish clocks ARE the ledger's numbers; the steps
// between are an example of what fills that time, never a recording of
// claude code. Usage:
//
//   import { mountRace } from 'assets/hero-race.js';
//   mountRace(sectionEl, { scripts: { plain: [...], super: [...] }, targets: { super: 8551, plain: 24057 } });
//
// A script line is { k: 'p'|'t'|'ok'|'wait', text, ms }: 'p' is the typed
// prompt (its clock has not started, so its ms is ignored); every other line
// appears at once and holds for its share of the target. Only unpaused time
// reaches a clock: offscreen and hidden tabs pause both panes together, and
// the clock never credits the time away. Loops after a hold.

const CHAR_MS = 22;
// a stopwatch, to the millisecond: 8551 → 0:08.551. It runs while the pane
// works and stops on the pane's own finish.
const fmt = (ms) => {
  const m = Math.floor(ms / 60000);
  const s = (ms - m * 60000) / 1000;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

// `bot` is the Mascot in the superbot pane (site/assets/mascot.js): it types
// while that pane runs (keyboard bob + a paw on alternate sides every
// PAW_MS of the pane's own clock, so it rests whenever the race pauses) and
// cheers when the stopwatch stops.
const PAW_MS = 110;

export function mountRace(section, { scripts, targets = { super: 8551, plain: 24057 }, holdMs = 4200, bot = null } = {}) {
  const panes = [...section.querySelectorAll('.pane')].map((el) => ({
    el,
    arm: el.dataset.arm,
    term: el.querySelector('[data-term]'),
    clock: el.querySelector('[data-clock]'),
  }));
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
  // sleep in short chunks so a pause lands within a chunk; when a clock is
  // passed, only the time actually slept is credited to it, and the chunks
  // are frame-sized so the stopwatch visibly counts milliseconds
  const sleep = async (ms, clk) => {
    let left = ms;
    while (left > 0) {
      await untilResumed();
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, Math.min(clk ? 16 : 50, left)));
      const dt = performance.now() - t0;
      left -= dt;
      if (clk) {
        clk.ms += dt;
        clk.el.textContent = fmt(clk.ms);
        clk.tick?.(clk.ms);
      }
    }
  };
  const io = new IntersectionObserver(([e]) => (e.isIntersecting ? resume('offscreen') : pause('offscreen')), { threshold: 0.2 });
  io.observe(section);
  const onVis = () => (document.hidden ? pause('hidden') : resume('hidden'));
  document.addEventListener('visibilitychange', onVis);

  const line = (term, k, text) => {
    const el = document.createElement('span');
    el.className = k;
    el.textContent = text;
    term.append(el, '\n');
    return el;
  };
  // the prompt is typed; when it opens with the command (`cmd`), that part
  // lands in its own badge, lit the moment it is complete
  const typeLine = async (term, k, text, cmd) => {
    const el = line(term, k, '');
    el.classList.add('cur');
    const hasCmd = cmd && text.startsWith(cmd);
    const badge = hasCmd ? document.createElement('b') : null;
    if (badge) {
      badge.className = 'cmd';
      el.append(badge);
    }
    const rest = document.createTextNode('');
    el.append(rest);
    for (let i = 1; i <= text.length; i++) {
      await untilResumed();
      if (badge && i <= cmd.length) {
        badge.textContent = text.slice(0, i);
        if (i === cmd.length) badge.classList.add('lit');
      } else {
        rest.textContent = text.slice(badge ? cmd.length : 0, i);
      }
      await sleep(CHAR_MS);
    }
    el.classList.remove('cur');
    return el;
  };

  // the superbot pane's steps type in fast (owner ask, 2026-09-01): a
  // typewriter at a quarter of the prompt's pace, still finishing well inside
  // the step's share of the target so the clocks keep landing on the ledger
  const STEP_CHAR_MS = 6;
  const typeStep = async (pane, k, text) => {
    const el = line(pane.term, k, '');
    el.classList.add('cur');
    for (let i = 1; i <= text.length; i++) {
      await untilResumed();
      el.textContent = text.slice(0, i);
      await sleep(STEP_CHAR_MS);
    }
    el.classList.remove('cur');
  };

  // one pane's steps after the prompt: each line holds for its share of the
  // pane's target, and the clock it drives is that pane's own
  const runSteps = async (pane, steps, target) => {
    const weight = steps.reduce((a, s) => a + (s.ms ?? 600), 0) || 1;
    const clk = { ms: 0, el: pane.clock };
    clk.el.textContent = fmt(0);
    pane.el.classList.add('running');
    const working = bot && pane.arm === 'super';
    if (working) {
      // heads down: typing on, eyes on the terminal, a paw every PAW_MS
      bot.typing = true;
      bot.lookAt = { x: -0.5, y: -0.55 };
      let beat = -1;
      clk.tick = (ms) => {
        const b = Math.floor(ms / PAW_MS);
        if (b === beat) return;
        beat = b;
        bot.press?.(b % 2 ? 'right' : 'left', 70);
      };
    }
    for (const s of steps) {
      if (pane.arm === 'super') {
        // typing credits the clock like any other work; the hold is what is
        // left of the step's share, so the finish still lands on the target
        await typeStep(pane, s.k, s.text);
        const typed = s.text.length * STEP_CHAR_MS;
        await sleep(Math.max(0, ((s.ms ?? 600) / weight) * target - typed), clk);
      } else {
        line(pane.term, s.k, s.text);
        await sleep(((s.ms ?? 600) / weight) * target, clk);
      }
    }
    // the finish reads the ledger's number, not the sum of timer overshoots
    clk.el.textContent = fmt(target);
    pane.el.classList.remove('running');
    pane.el.classList.add('done');
    if (working) {
      bot.typing = false;
      bot.lookAt = null;
      bot.setExpr({ eyeL: 'happy', eyeR: 'happy', mouth: 'grin' }, 1800);
      bot.excitedUntil = performance.now() + 1500;
    }
  };

  const cycle = async () => {
    for (const p of panes) {
      p.el.classList.remove('done', 'running');
      p.term.textContent = '';
      p.clock.textContent = fmt(0);
    }
    if (bot) {
      // a fresh request: back to the resting face, watching the prompt land
      bot.typing = false;
      bot.setExpr({ eyeL: 'open', eyeR: 'open', mouth: 'smile' });
      bot.lookAt = { x: -0.7, y: -0.8 };
    }
    // both prompts are typed first, clocks idle: the request costs the same
    // to type in either window, and the longer one finishing is "submit"
    await Promise.all(panes.map((p) => {
      const prompt = scripts[p.arm].find((s) => s.k === 'p');
      return typeLine(p.term, 'p', prompt?.text ?? '', prompt?.cmd);
    }));
    await sleep(350);
    await Promise.all(panes.map((p) => runSteps(p, scripts[p.arm].filter((s) => s.k !== 'p'), targets[p.arm])));
  };

  let running = true;
  (async () => {
    while (running && section.isConnected) {
      await untilResumed();
      await cycle();
      await sleep(holdMs);
    }
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
  })();

  return { pause, resume, stop: () => { running = false; resume('stop'); } };
}
