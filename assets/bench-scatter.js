// Score against cost (or time) per task, one polyline per model across its
// effort levels, the cursorbench shape (cursor.com/cursorbench, retrieved
// 2026-09-01: score on y, cost on x with cheaper to the RIGHT, one focusable
// control per point so a screen reader gets every value). Hover or focus a
// point: its series comes forward, the rest fade, a tooltip names the value.
// The numbers come from the page's JSON block and are PLACEHOLDERS until
// superbot's own run is published; the chart says so in its own chrome.
//
//   import { mountScatter } from 'assets/bench-scatter.js';
//   mountScatter(sectionEl, { series, axes: { cost: {...}, time: {...} } });

const W = 760, H = 420, PAD = { l: 54, r: 28, t: 22, b: 50 };
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
};

export function mountScatter(section, { series, axes, metric = 'cost' }) {
  const host = section.querySelector('[data-chart]');
  const tip = section.querySelector('[data-tip]');
  const tabs = [...section.querySelectorAll('[role="tab"]')];
  const yMin = 45, yMax = 75;
  const sy = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const render = () => {
    const ax = axes[metric];
    // cheaper (or faster) to the right: the axis runs from max down to 0
    const sx = (v) => PAD.l + (1 - v / ax.max) * (W - PAD.l - PAD.r);
    host.textContent = '';
    // a tab switch mid-hover would leave the old metric's tip on screen
    tip.hidden = true;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ariaLabel(ax) });
    // grid + y labels
    for (let v = yMin; v <= yMax; v += 5) {
      svg.append(el('line', { class: 'grid', x1: PAD.l, x2: W - PAD.r, y1: sy(v), y2: sy(v) }));
      svg.append(el('text', { class: 'tick', x: PAD.l - 10, y: sy(v) + 4, 'text-anchor': 'end' }, `${v}%`));
    }
    for (const v of ax.ticks) {
      svg.append(el('line', { class: 'grid v', x1: sx(v), x2: sx(v), y1: PAD.t, y2: H - PAD.b }));
      svg.append(el('text', { class: 'tick', x: sx(v), y: H - PAD.b + 20, 'text-anchor': 'middle' }, ax.fmt(v)));
    }
    svg.append(el('text', { class: 'axis', x: (PAD.l + W - PAD.r) / 2, y: H - 10, 'text-anchor': 'middle' }, ax.label));

    // series: polyline through the effort levels, a dot per level, one label
    for (const s of series) {
      const g = el('g', { class: `series${s.us ? ' us' : ''}`, 'data-id': s.id, style: `--c:${s.color}` });
      const pts = [...s.points].sort((a, b) => b[metric] - a[metric]);
      if (pts.length > 1) g.append(el('polyline', { points: pts.map((p) => `${sx(p[metric])},${sy(p.score)}`).join(' ') }));
      const top = pts.reduce((a, b) => (b.score > a.score ? b : a));
      for (const p of pts) {
        const c = el('circle', {
          cx: sx(p[metric]), cy: sy(p.score), r: s.us ? 6 : 4.2, tabindex: 0, role: 'button',
          'aria-label': `${s.name}, ${p.effort}: ${p.score.toFixed(1)}% at ${ax.fmt(p[metric])} per task`,
        });
        const show = () => {
          svg.classList.add('hover');
          g.classList.add('hot');
          tip.innerHTML = `<b>${s.name}</b> · ${p.effort}<br>${p.score.toFixed(1)}% · ${ax.fmt(p[metric])} per task`;
          tip.hidden = false;
          // the tip is absolutely positioned against its offsetParent (the
          // section), not the chart box, so measure from that
          // and rectangles come back in the page's zoomed px (site.css zooms
          // wide screens) while inline left/top are unzoomed
          const z = Number(getComputedStyle(document.documentElement).zoom) || 1;
          const r = c.getBoundingClientRect();
          const base = (tip.offsetParent ?? host).getBoundingClientRect();
          const left = (r.left - base.left + r.width / 2) / z;
          tip.style.left = `${Math.max(90, Math.min(base.width / z - 90, left))}px`;
          tip.style.top = `${(r.top - base.top - 12) / z}px`;
        };
        const hide = () => {
          svg.classList.remove('hover');
          g.classList.remove('hot');
          tip.hidden = true;
        };
        c.addEventListener('pointerenter', show);
        c.addEventListener('focus', show);
        c.addEventListener('pointerleave', hide);
        c.addEventListener('blur', hide);
        g.append(c);
      }
      const lx = sx(top[metric]), ly = sy(top.score);
      const left = lx > W * 0.55;
      g.append(el('text', {
        class: 'name', x: left ? lx - 10 : lx + 10, y: ly - 9, 'text-anchor': left ? 'end' : 'start',
      }, s.name));
      svg.append(g);
    }
    host.append(svg);
  };

  const ariaLabel = (ax) =>
    `cursorbench 3.2 score against ${ax.label}, placeholder numbers until superbot's run is published: ` +
    series.map((s) => {
      const top = s.points.reduce((a, b) => (b.score > a.score ? b : a));
      return `${s.name} ${top.score.toFixed(1)}% at ${ax.fmt(top[metric])}`;
    }).join(', ');

  for (const t of tabs) {
    t.addEventListener('click', () => {
      metric = t.dataset.metric;
      tabs.forEach((o) => {
        const on = o === t;
        o.setAttribute('aria-selected', String(on));
        o.tabIndex = on ? 0 : -1;
      });
      render();
    });
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = tabs[(tabs.indexOf(t) + d + tabs.length) % tabs.length];
      n.click();
      n.focus();
    });
  }
  render();
  return { render };
}
