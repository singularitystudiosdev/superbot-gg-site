// "PASTE INTO ANY LLM, UNLOCK ___" — the blank decodes through glyph noise
// into each capability, then holds until the next cycle. Ported from the
// superbot-ascii demo's app/tagline.js into a DOM element: mounts into
// [data-scramble-tagline] as a muted .pre span plus a bright .phrase span.
(function () {
  'use strict'

  const PREFIX = 'PASTE INTO ANY LLM, UNLOCK '
  const PHRASES = [
    'SAVED MEMORY BETWEEN AGENTS',
    'SHARED SKILLS ACROSS PLATFORMS',
    'PROMPT TRANSLATION',
    'LEADING AGENT ARCHETYPES',
    'CONTEXT OPTIMIZATION',
    'SCRAPING',
    'AND BEYOND',
  ]
  const CYCLE = 2600
  const DECODE = 520
  const GLYPHS = '@#%*+=<>/\\:'

  // Same deterministic per-cell random as ascii-bg.js, so a given scramble
  // frame is stable rather than flickering per repaint.
  function mulberry32(seed) {
    let t = seed >>> 0
    return function () {
      t += 0x6D2B79F5
      let r = Math.imul(t ^ (t >>> 15), t | 1)
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
  }
  function cellRand(x, y, salt) {
    return mulberry32(((x + 1) * 374761393) ^ ((y + 1) * 668265263) ^ (salt * 69069))()
  }

  function taglineAt(time) {
    const k = Math.floor(time / CYCLE) % PHRASES.length
    const target = PHRASES[k]
    const age = time % CYCLE
    if (age >= DECODE) return target
    const reveal = Math.floor((age / DECODE) * target.length)
    const tick = Math.floor(age / 45)
    let s = ''
    for (let i = 0; i < target.length; i++) {
      if (i < reveal || target[i] === ' ') s += target[i]
      else s += GLYPHS[Math.floor(cellRand(i, tick, k) * GLYPHS.length)]
    }
    return s
  }

  const el = document.querySelector('[data-scramble-tagline]')
  if (!el) return
  el.setAttribute('aria-label', PREFIX.toLowerCase() + PHRASES.join(', ').toLowerCase())
  const pre = document.createElement('span')
  pre.className = 'pre'
  pre.textContent = PREFIX
  pre.setAttribute('aria-hidden', 'true')
  const ph = document.createElement('span')
  ph.className = 'phrase'
  ph.setAttribute('aria-hidden', 'true')
  el.append(pre, ph)

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ph.textContent = PHRASES[0]
    return
  }

  let last = ''
  function frame(now) {
    const s = taglineAt(now)
    if (s !== last) {
      ph.textContent = s
      last = s
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})()
