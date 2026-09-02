// Animated textmode background, ported from the superbot-ascii demo
// (singularitystudiosdev.github.io/superbot-ascii, itself after play.core's
// textmode program model, Apache-2.0). Background field only — the framed
// wordmark scene is deliberately not ported.
//
// Usage: <canvas id="ascii-bg" aria-hidden="true"></canvas> behind the page
// content, then <script src="assets/ascii-bg.js" data-bg="stars"></script>.
// The canvas is created if missing. Options on the script tag:
//   data-bg     variant key: flow | rain | life | rings | static | stars | void
//   data-speed  time multiplier (default 2.2)
//   data-fade   brightness multiplier (default 0.45)
//   data-color  "r,g,b" tint at full brightness (default 240,240,240 gray)
// ?bg=<key> in the URL overrides data-bg, and [ / ] cycle variants live.
// Elements marked data-ascii-damp quiet the field behind them, the way the
// original quiets around its wordmark. prefers-reduced-motion freezes time —
// every variant is deterministic, so the frozen frame still has structure.
(function () {
  'use strict'

  // ---- deterministic randomness and value noise ----
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

  function makeNoise(seed) {
    const size = 256
    const mask = size - 1
    const rand = mulberry32(seed)
    const vals = new Float32Array(size)
    const perm = new Uint16Array(size * 2)
    for (let i = 0; i < size; i++) {
      vals[i] = rand()
      perm[i] = i
    }
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = perm[i]
      perm[i] = perm[j]
      perm[j] = tmp
    }
    for (let i = 0; i < size; i++) perm[size + i] = perm[i]
    const at = (ix, iy) => vals[perm[perm[ix & mask] + (iy & mask)]]
    return function (x, y) {
      const ix = Math.floor(x)
      const iy = Math.floor(y)
      const fx = x - ix
      const fy = y - iy
      const ux = fx * fx * (3 - 2 * fx)
      const uy = fy * fy * (3 - 2 * fy)
      const a = at(ix, iy)
      const b = at(ix + 1, iy)
      const c = at(ix, iy + 1)
      const d = at(ix + 1, iy + 1)
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
    }
  }

  function makeFbm(seed, octaves) {
    const n = makeNoise(seed)
    const norm = 1 - Math.pow(0.5, octaves)
    return function (x, y) {
      let v = 0
      let amp = 0.5
      let f = 1
      for (let i = 0; i < octaves; i++) {
        v += amp * n(x * f, y * f)
        amp *= 0.5
        f *= 2.03
      }
      return v / norm
    }
  }

  const clamp01 = v => Math.max(0, Math.min(1, v))

  // ---- domain-warped fbm flow, stirred by the cursor ----
  const warp = makeFbm(11, 3)
  const base = makeFbm(47, 3)

  function flowAt(x, y, ctx, cursor) {
    const t = ctx.time * 0.00006
    let ux = x * ctx.aspect * 0.07
    let uy = y * 0.07
    if (cursor) {
      const dx = (x - cursor.x) * ctx.aspect
      const dy = y - cursor.y
      const s = 1.4 * Math.exp(-(dx * dx + dy * dy) / 110)
      if (s > 0.01) {
        const cs = Math.cos(s)
        const sn = Math.sin(s)
        const cx = cursor.x * ctx.aspect * 0.07
        const cy = cursor.y * 0.07
        const ox = ux - cx
        const oy = uy - cy
        ux = cx + ox * cs - oy * sn
        uy = cy + ox * sn + oy * cs
      }
    }
    const wx = warp(ux + t * 2.4, uy - t * 1.1)
    const wy = warp(ux - t * 1.7, uy + t * 2.1 + 7.3)
    let v = base(ux + 1.9 * (wx - 0.5), uy + 1.9 * (wy - 0.5))
    v = v * v * 1.7
    return clamp01(v)
  }

  // ---- background variants; contract per variant:
  //   frame(g, ctx, cursor) once per painted frame, at(x, y, damp) per cell ----
  const RAMP = ' .:-=+*#%@'

  function rampCell(v) {
    const idx = Math.round(v * (RAMP.length - 1))
    const ch = RAMP[Math.max(0, Math.min(RAMP.length - 1, idx))]
    if (ch === ' ') return null
    return { ch, shade: 0.12 + v * 0.62 }
  }

  function createBackgrounds(settings) {
    const flowS = { ctx: null, cursor: null }
    const flow = {
      key: 'flow',
      frame(g, ctx, cursor) {
        flowS.ctx = { cols: ctx.cols, rows: ctx.rows, aspect: ctx.aspect, time: ctx.time * settings.bgSpeed }
        flowS.cursor = cursor
      },
      at(x, y, damp) {
        return rampCell(clamp01(flowAt(x, y, flowS.ctx, flowS.cursor)) * damp)
      },
    }

    // Stateless Matrix-style rain: each column's head is a function of time.
    const RAIN_CHARS = '01<>[]{}|/\\+=*:;.xzkq'
    const rainS = { t: 0, rows: 0 }
    const rain = {
      key: 'rain',
      frame(g, ctx) {
        rainS.t = ctx.time * settings.bgSpeed
        rainS.rows = g.rows
      },
      at(x, y, damp) {
        const phase = cellRand(x, 0, 11)
        const speed = 0.006 + cellRand(x, 1, 12) * 0.011
        const trail = 6 + Math.floor(cellRand(x, 2, 13) * 10)
        const cycle = rainS.rows + trail + 16 + Math.floor(phase * 44)
        const head = (rainS.t * speed + phase * cycle * 3) % cycle
        const d = head - y
        if (d < 0 || d > trail) return null
        const v = (1 - d / trail) * damp
        if (v <= 0.03) return null
        const flicker = cellRand(x, y, 17 + (((rainS.t / 180) | 0) % 97))
        const ch = RAIN_CHARS[(flicker * RAIN_CHARS.length) | 0]
        return { ch, shade: d < 1 ? Math.min(1, 0.9 * damp + 0.1) : 0.14 + v * 0.55 }
      },
    }

    // Conway's Game of Life, ~8 ticks/s, toroidal, reseeded when it dies
    // out and stirred so it never goes still.
    const lifeS = { cols: 0, rows: 0, cells: null, next: null, age: null, last: 0, salt: 1, step: 0 }
    function seedLife(cols, rows) {
      const n = cols * rows
      lifeS.cols = cols
      lifeS.rows = rows
      lifeS.cells = new Uint8Array(n)
      lifeS.next = new Uint8Array(n)
      lifeS.age = new Uint8Array(n)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          lifeS.cells[y * cols + x] = cellRand(x, y, lifeS.salt * 31 + 5) < 0.16 ? 1 : 0
        }
      }
      lifeS.step = 0
    }
    function stepLife() {
      const { cols, rows, cells, next, age } = lifeS
      let pop = 0
      for (let y = 0; y < rows; y++) {
        const up = ((y + rows - 1) % rows) * cols
        const mid = y * cols
        const dn = ((y + 1) % rows) * cols
        for (let x = 0; x < cols; x++) {
          const l = (x + cols - 1) % cols
          const r = (x + 1) % cols
          const n =
            cells[up + l] + cells[up + x] + cells[up + r] +
            cells[mid + l] + cells[mid + r] +
            cells[dn + l] + cells[dn + x] + cells[dn + r]
          const alive = cells[mid + x] ? (n === 2 || n === 3) : n === 3
          next[mid + x] = alive ? 1 : 0
          age[mid + x] = alive ? Math.min(250, cells[mid + x] ? age[mid + x] + 1 : 1) : 0
          pop += alive ? 1 : 0
        }
      }
      lifeS.cells = next
      lifeS.next = cells
      lifeS.step++
      if (lifeS.step % 64 === 0) {
        for (let k = 0; k < 30; k++) {
          const x = (cellRand(k, lifeS.step, 41) * cols) | 0
          const y = (cellRand(k, lifeS.step, 43) * rows) | 0
          lifeS.cells[y * cols + x] = 1
          lifeS.age[y * cols + x] = 1
        }
      }
      if (pop < (cols * rows) / 200) {
        lifeS.salt++
        seedLife(cols, rows)
      }
    }
    const life = {
      key: 'life',
      frame(g, ctx, cursor) {
        if (lifeS.cols !== g.cols || lifeS.rows !== g.rows) seedLife(g.cols, g.rows)
        const t = ctx.time * settings.bgSpeed
        if (lifeS.last === 0 || t < lifeS.last || t - lifeS.last > 1000) lifeS.last = t - 125
        while (t - lifeS.last >= 125) {
          stepLife()
          lifeS.last += 125
        }
        if (cursor) {
          const cx = cursor.x | 0
          const cy = cursor.y | 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x = cx + dx
              const y = cy + dy
              if (x < 0 || x >= lifeS.cols || y < 0 || y >= lifeS.rows) continue
              if (cellRand(x, y, lifeS.step + 47) < 0.4) {
                lifeS.cells[y * lifeS.cols + x] = 1
                lifeS.age[y * lifeS.cols + x] = 1
              }
            }
          }
        }
      },
      at(x, y, damp) {
        if (!lifeS.cells || !lifeS.cells[y * lifeS.cols + x]) return null
        const a = lifeS.age[y * lifeS.cols + x]
        const ch = a <= 1 ? '#' : a < 6 ? 'o' : '·'
        const shade = (a <= 1 ? 0.95 : a < 6 ? 0.7 : 0.42) * damp
        if (shade <= 0.05) return null
        return { ch, shade }
      },
    }

    // Interference of two drifting circular waves.
    const ringS = { t: 0, c1: [0, 0], c2: [0, 0], aspect: 0.55 }
    const rings = {
      key: 'rings',
      frame(g, ctx) {
        const t = ctx.time * settings.bgSpeed * 0.001
        ringS.t = t
        ringS.aspect = ctx.aspect
        ringS.c1 = [g.cols * (0.5 + 0.35 * Math.sin(t * 0.21)), g.rows * (0.5 + 0.3 * Math.cos(t * 0.17))]
        ringS.c2 = [g.cols * (0.5 + 0.35 * Math.sin(t * 0.13 + 2.6)), g.rows * (0.5 + 0.3 * Math.cos(t * 0.23 + 1.2))]
      },
      at(x, y, damp) {
        const a = ringS.aspect
        const d1 = Math.hypot((x - ringS.c1[0]) * a, y - ringS.c1[1])
        const d2 = Math.hypot((x - ringS.c2[0]) * a, y - ringS.c2[1])
        let v = 0.5 + 0.25 * Math.sin(d1 * 0.9 - ringS.t * 2.4) + 0.25 * Math.sin(d2 * 0.9 + ringS.t * 2.0)
        v = clamp01(v)
        return rampCell(v * v * damp)
      },
    }

    // Low-glow receiver noise with a sweeping scanline.
    const STATIC_CHARS = '·:;+'
    const staticS = { gen: 0, scanY: -10 }
    const staticv = {
      key: 'static',
      frame(g, ctx) {
        const t = ctx.time * settings.bgSpeed
        staticS.gen = 23 + (((t / 90) | 0) % 251)
        staticS.scanY = ((t * 0.02) % (g.rows + 8)) - 4
      },
      at(x, y, damp) {
        const r = cellRand(x, y, staticS.gen)
        const band = Math.exp(-((y - staticS.scanY) ** 2) / 6)
        let v = (r < 0.55 ? 0 : (r - 0.55) * 0.5) + band * r * 0.5
        v *= damp
        if (v <= 0.04) return null
        const ch = STATIC_CHARS[Math.min(STATIC_CHARS.length - 1, (r * STATIC_CHARS.length) | 0)]
        return { ch, shade: 0.1 + v }
      },
    }

    // Near-empty night sky, ~1.5% of cells, slow twinkle.
    const starS = { t: 0 }
    const stars = {
      key: 'stars',
      frame(g, ctx) {
        starS.t = ctx.time * settings.bgSpeed
      },
      at(x, y, damp) {
        const r = cellRand(x, y, 3)
        if (r < 0.985) return null
        const b = cellRand(x, y, 5)
        const tw = 0.55 + 0.45 * Math.sin(starS.t * 0.0015 * (0.5 + b) + r * 400)
        const ch = b > 0.92 ? '*' : b > 0.6 ? '+' : '.'
        const shade = (0.25 + 0.6 * b) * tw * damp
        if (shade <= 0.05) return null
        return { ch, shade }
      },
    }

    // Close to nothing: two drifting motes and a blinking cursor.
    const voidS = { dots: [] }
    const voidv = {
      key: 'void',
      frame(g, ctx) {
        const t = ctx.time * settings.bgSpeed
        voidS.dots = [
          {
            x: Math.round(g.cols * (0.5 + 0.38 * Math.sin(t * 0.00013 + 1.7))),
            y: Math.round(g.rows * (0.5 + 0.32 * Math.sin(t * 0.00027 + 4.2))),
            ch: '·',
            shade: 0.5,
          },
          {
            x: Math.round(g.cols * (0.5 + 0.42 * Math.sin(t * 0.00009 + 3.9))),
            y: Math.round(g.rows * (0.5 + 0.36 * Math.sin(t * 0.00019 + 0.8))),
            ch: '.',
            shade: 0.35,
          },
          {
            x: Math.round(g.cols * 0.86),
            y: Math.round(g.rows * 0.14),
            ch: '_',
            shade: ((t / 900) | 0) % 2 === 0 ? 0.7 : 0,
          },
        ]
      },
      at(x, y, damp) {
        for (const d of voidS.dots) {
          if (d.x === x && d.y === y && d.shade > 0) return { ch: d.ch, shade: d.shade * damp }
        }
        return null
      },
    }

    const list = [flow, rain, life, rings, staticv, stars, voidv]
    return {
      list,
      get(key) {
        return list.find(v => v.key === key) || list[0]
      },
    }
  }

  // ---- boot: canvas, metrics, damp rects, frame loop ----
  const script = document.currentScript
  const ds = (script && script.dataset) || {}
  // An explicit "0" is a real value (full blackout / frozen), not unset.
  const num = (v, d) => {
    const n = Number(v)
    return v != null && v !== '' && Number.isFinite(n) ? n : d
  }
  // URL param > saved choice > script tag, like the reference's config.js.
  let storedBg = null
  try {
    storedBg = localStorage.getItem('sb-lander-bg')
  } catch (err) {
    console.error(err)
  }
  const settings = {
    bg: new URLSearchParams(location.search).get('bg') || storedBg || ds.bg || 'stars',
    bgSpeed: num(ds.speed, 2.2),
    bgFade: num(ds.fade, 0.45),
  }
  const tint = (ds.color || '240,240,240').split(',').map(n => Math.max(0, Math.min(255, Number(n) || 0)))

  let canvas = document.getElementById('ascii-bg')
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.id = 'ascii-bg'
    canvas.setAttribute('aria-hidden', 'true')
    document.body.prepend(canvas)
  }
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  // Negative z-index keeps normal-flow page content painting above the
  // canvas without the page needing positioned wrappers; the body background
  // propagates to the root canvas, which paints behind negative z-index.
  canvas.style.zIndex = '-1'
  canvas.style.pointerEvents = 'none'

  const ctx2d = canvas.getContext('2d')
  // Canvas blocked outright (fingerprint blockers return null) — the page
  // must keep working without the field, like mascot.js already does.
  if (!ctx2d) return
  const bgs = createBackgrounds(settings)
  let bgv = bgs.get(settings.bg)

  const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
  const TARGET_COLS = 112
  const g = { cols: 0, rows: 0, cellW: 9, cellH: 16, aspect: 0.55, fontSize: 16 }
  const cursor = { x: -1e3, y: -1e3, active: false }

  // 33 brightness steps toward the tint, over the page background.
  const STYLES = Array.from({ length: 33 }, (_, k) => {
    const u = 8 / 240 + (k / 32) * (232 / 240)
    return 'rgb(' + tint.map(c => Math.round(c * u)).join(',') + ')'
  })

  // Field cells inside a data-ascii-damp element's rect drop to near
  // nothing, with a soft shoulder around it, so the field quiets behind
  // the content the way the original quiets around its wordmark.
  let dampRects = []
  function measureDamp() {
    dampRects = []
    for (const el of document.querySelectorAll('[data-ascii-damp]')) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      dampRects.push({
        x0: r.left / g.cellW,
        x1: r.right / g.cellW,
        y0: r.top / g.cellH,
        y1: r.bottom / g.cellH,
        inner: num(el.getAttribute('data-ascii-damp'), 0.12),
      })
    }
  }

  function dampAt(x, y) {
    let damp = 1
    for (const r of dampRects) {
      if (x >= r.x0 - 2 && x < r.x1 + 2 && y >= r.y0 - 1 && y < r.y1 + 1) {
        const inside = x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1
        damp = Math.min(damp, inside ? r.inner : 0.3)
      }
    }
    return damp
  }

  function fit() {
    const dpr = window.devicePixelRatio || 1
    const vw = window.innerWidth
    const vh = window.innerHeight
    ctx2d.font = '100px ' + FONT
    const adv = ctx2d.measureText('M').width / 100
    g.fontSize = Math.max(6, Math.min(24, Math.floor(vw / (TARGET_COLS * adv))))
    canvas.width = Math.round(vw * dpr)
    canvas.height = Math.round(vh * dpr)
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx2d.font = g.fontSize + 'px ' + FONT
    ctx2d.textBaseline = 'top'
    g.cellW = ctx2d.measureText('M').width
    g.cellH = g.fontSize
    g.cols = Math.max(20, Math.floor(vw / g.cellW))
    g.rows = Math.max(10, Math.floor(vh / g.cellH))
    g.aspect = g.cellW / g.cellH
    measureDamp()
  }

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let frozenTime = 40000

  function paint(now) {
    const fctx = { cols: g.cols, rows: g.rows, time: now, aspect: g.aspect }
    bgv.frame(g, fctx, cursor.active ? cursor : null)
    ctx2d.clearRect(0, 0, window.innerWidth, window.innerHeight)
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        const damp = dampAt(x, y)
        if (damp <= 0) continue
        const cell = bgv.at(x, y, damp)
        if (!cell || cell.ch === ' ') continue
        const shade = Math.min(1, cell.shade * settings.bgFade)
        if (shade <= 0) continue
        ctx2d.fillStyle = STYLES[Math.max(0, Math.min(32, Math.round(shade * 32)))]
        ctx2d.fillText(cell.ch, x * g.cellW, y * g.cellH)
      }
    }
  }

  function frame(now) {
    paint(now)
    requestAnimationFrame(frame)
  }

  window.addEventListener('resize', () => {
    fit()
    if (reduced) paint(frozenTime)
  })
  window.addEventListener('scroll', () => {
    measureDamp()
    if (reduced) paint(frozenTime)
  }, { passive: true })
  window.addEventListener('pointermove', e => {
    cursor.x = e.clientX / g.cellW
    cursor.y = e.clientY / g.cellH
    cursor.active = true
  })
  document.addEventListener('pointerleave', () => {
    cursor.active = false
  })
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const tag = e.target && e.target.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
    if (e.key === '[' || e.key === ']') {
      const n = bgs.list.length
      const idx = bgs.list.indexOf(bgv)
      bgv = bgs.list[(idx + (e.key === ']' ? 1 : n - 1)) % n]
      try {
        localStorage.setItem('sb-lander-bg', bgv.key)
      } catch (err) {
        console.error(err)
      }
      if (reduced) paint(frozenTime)
    }
  })

  fit()
  if (reduced) paint(frozenTime)
  else requestAnimationFrame(frame)

  // Damped elements fill in asynchronously (the mascot renders from JS, the
  // installer mounts into an empty div, details expand on click), so watch
  // their sizes directly and keep a slow tick for position-only layout shifts.
  const remeasure = () => {
    measureDamp()
    if (reduced) paint(frozenTime)
  }
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(remeasure)
    for (const el of document.querySelectorAll('[data-ascii-damp]')) ro.observe(el)
  }
  setInterval(remeasure, 1500)
})()
