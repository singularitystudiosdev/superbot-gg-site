// superbot mascot engine — zero-dependency textmode renderer.
// Render loop: per-cell grid into a <pre>, row-diffed (play.core textrenderer pattern, Apache-2.0).
// Morph: hand port of tholman/ascii-morph's crush algorithm (MIT).
// Frames: procedural canvas drawing + luminance-ramp sampling (" .:-=+*#%@" family).

const RAMP = ' .-:=+*#%@';
const SPARKS = '+*/\\';

// ---------- rasterizer: offscreen canvas -> glyph rows ----------

const CELL_W = 6, CELL_H = 12; // sampling block per glyph cell (2:1, matches mono cell aspect)

// ctx.roundRect is recent (and absent in several privacy-hardened / older
// forks). Missing it used to throw straight out of the constructor and take
// the page's whole module script with it, so path it by hand when absent.
function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return; }
  const rad = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function makeCanvas(cols, rows) {
  const c = document.createElement('canvas');
  c.width = cols * CELL_W;
  c.height = rows * CELL_H;
  return c;
}

function sampleGrid(canvas, cols, rows, gamma = 1.0) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return Array.from({ length: rows }, () => ' '.repeat(cols));
  let img;
  try {
    img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    // canvas-fingerprint shields may throw on readback instead of zeroing it —
    // return a blank grid so the caller's fallback path takes over
    return Array.from({ length: rows }, () => ' '.repeat(cols));
  }
  const rowsOut = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      let acc = 0, n = 0;
      for (let py = 0; py < CELL_H; py += 3) {
        for (let px = 0; px < CELL_W; px += 2) {
          const i = ((y * CELL_H + py) * canvas.width + x * CELL_W + px) * 4;
          const lum = (0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]) / 255;
          acc += lum * (img[i + 3] / 255);
          n++;
        }
      }
      let v = Math.pow(acc / n, gamma);
      // subtle ordered dither so flat fills read as halftone texture, not solid blocks
      v += ((x * 7 + y * 13) % 5 - 2) * 0.018;
      const idx = Math.max(0, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))));
      line += RAMP[idx];
    }
    rowsOut.push(line);
  }
  return rowsOut;
}

// ---------- the superbot face, drawn parametrically ----------
// expr: { eyeL, eyeR: 'open'|'wink'|'happy'|'closed', mouth: 'smile'|'grin'|'o'|'w',
//         bob: -1..1, earTilt: -1..1, pupil: {x,y} -1..1 }
// shape: proportion preset — see VARIANTS. All factors are relative to canvas size,
// so every variant animates with the same expr machinery.

const BASE_SHAPE = {
  cy: 0.56, headW: 0.36, headH: 0.32, corner: 0.55, round: 0,
  hornScale: 1, hornAngle: 0.38, hornSpread: 0.66, hornBase: 0.9,
  eyeScale: 1, eyeTall: 1, eyeDX: 0.42, eyeY: -0.12,
  mouthScale: 1, mouthY: 0.38,
  blush: 0, arms: 0, feet: 0,
};

// the current default's base recipe, shared by its fine-tune micro-variants below
// mouthScale 0 = no mouth at all — the default look: big eyes carry the cute
const SMOL_BASE = { cy: 0.58, headW: 0.28, headH: 0.26, eyeScale: 1.5, eyeTall: 1.3, eyeDX: 0.4, eyeY: -0.06, mouthScale: 0, mouthY: 0.42, hornScale: 1.25, hornSpread: 0.72, blush: 1 };

// tuned against retrieved Kirby reference art: body-as-face sphere, TALL
// close-set oval eyes, blush beside them, nub arms, foot lobes
export const VARIANTS = {
  classic: {},
  round: { round: 1, headW: 0.37, headH: 0.35, eyeTall: 1.35, eyeDX: 0.34, eyeY: -0.1, blush: 1, hornScale: 0.85, hornSpread: 0.6, mouthScale: 1.15 },
  puff: { round: 1, cy: 0.52, headW: 0.34, headH: 0.34, eyeScale: 0.95, eyeTall: 1.7, eyeDX: 0.26, eyeY: -0.18, mouthScale: 0.8, mouthY: 0.3, blush: 1, arms: 1, feet: 1, hornScale: 0.6, hornSpread: 0.5, hornBase: 0.92, hornAngle: 0.45 },
  chunky: { headW: 0.44, headH: 0.28, corner: 0.7, hornScale: 1.35, hornSpread: 0.7, eyeScale: 0.95, eyeDX: 0.48, mouthScale: 1.2, mouthY: 0.42 },
  smol: SMOL_BASE,
  // smol fine-tunes: minor eye / ear plays on the current default — all with MUCH
  // bigger mouths than the base's 0.6 (user: the small mouth reads too timid)
  smolWide: { ...SMOL_BASE, eyeDX: 0.46, eyeScale: 1.65, mouthScale: 1.6, mouthY: 0.44 },
  smolTall: { ...SMOL_BASE, eyeTall: 1.7, eyeScale: 1.3, eyeDX: 0.34, mouthScale: 1.55, mouthY: 0.44 },
  smolGrin: { ...SMOL_BASE, mouthScale: 2.0, mouthY: 0.46, eyeY: -0.1 },
  smolFloppy: { ...SMOL_BASE, hornScale: 1.5, hornAngle: 0.55, hornSpread: 0.66, mouthScale: 1.6, mouthY: 0.44 },
  smolTiny: { ...SMOL_BASE, hornScale: 0.85, eyeScale: 1.7, mouthScale: 1.5, mouthY: 0.42 },
  tall: { headW: 0.3, headH: 0.37, corner: 0.45, cy: 0.55, hornSpread: 0.6 },
  wide: { headW: 0.45, headH: 0.24, corner: 0.9, eyeDX: 0.5, mouthScale: 1.3 },
  boxy: { corner: 0.18, headW: 0.38, headH: 0.3, eyeTall: 0.9 },
  bean: { round: 1, headW: 0.31, headH: 0.37, cy: 0.54, eyeY: 0.0, eyeDX: 0.36, blush: 1, hornScale: 0.7, mouthY: 0.45 },
  megaround: { round: 1, headW: 0.38, headH: 0.35, cy: 0.53, eyeTall: 1.25, eyeDX: 0.3, blush: 1, hornScale: 0.7, arms: 1, mouthScale: 1.2 },
  longhorn: { headW: 0.36, headH: 0.27, cy: 0.62, hornScale: 1.6, hornSpread: 0.72, hornAngle: 0.3 },
  nubbin: { round: 1, headW: 0.36, headH: 0.32, blush: 1, hornScale: 0.45, hornSpread: 0.55, feet: 1 },
  dozer: { eyeTall: 0.55, eyeY: -0.08, mouthScale: 0.7, headW: 0.38, headH: 0.3, hornAngle: 0.55 },
  saucer: { round: 1, headW: 0.34, headH: 0.34, cy: 0.54, eyeDX: 0.52, eyeScale: 1.3, eyeTall: 1.5, hornScale: 0.4, mouthScale: 0.5 },
  floppy: { hornScale: 1.45, hornAngle: 0.6, hornSpread: 0.58, headW: 0.35, headH: 0.31, blush: 1 },
};

// the site-wide default character — swap back to 'classic' by changing this one word
export const DEFAULT_VARIANT = 'smol';

// animation-energy profiles: statue barely moves, hyper vibrates. Consumed by tick().
const BASE_ANIM = {
  fps: 80, bobPeriod: 900, bobAmp: 1, earPeriod: 1400, earAmp: 0.6,
  breathPeriod: 1300, breathAmp: 0, blinkMin: 1800, blinkMax: 5000, winkP: 0.2,
  pupilGain: 1, morphMin: 9000, morphMax: 15000, autoMorph: true, jitterP: 0,
};
export const ANIMS = {
  default: {},
  statue: { bobAmp: 0, earAmp: 0, blinkMin: 6000, blinkMax: 12000, autoMorph: false, pupilGain: 0.3 },
  sleepy: { fps: 150, bobPeriod: 1700, bobAmp: 0.5, earAmp: 0.2, blinkMin: 800, blinkMax: 2200, winkP: 0, autoMorph: false, pupilGain: 0.4 },
  calm: { bobPeriod: 1300, bobAmp: 0.7, morphMin: 14000, morphMax: 22000 },
  breathe: { breathAmp: 1, bobAmp: 0.5 },
  perky: { bobPeriod: 600, bobAmp: 1.2, earPeriod: 900, blinkMin: 1200, blinkMax: 3000, morphMin: 7000, morphMax: 11000 },
  jittery: { jitterP: 0.07, bobPeriod: 700, earAmp: 0.8, blinkMin: 1000, blinkMax: 2600 },
  hyper: { fps: 45, bobPeriod: 320, bobAmp: 1.5, earPeriod: 500, earAmp: 0.9, blinkMin: 900, blinkMax: 2000, winkP: 0.35, morphMin: 5000, morphMax: 8000, pupilGain: 1.4, breathAmp: 0.6, breathPeriod: 700 },
};

export function drawMascot(canvas, expr = {}, shape = {}) {
  const { eyeL = 'open', eyeR = 'open', mouth = 'smile', bob = 0, earTilt = 0, pupil = { x: 0, y: 0 } } = expr;
  const S = { ...BASE_SHAPE, ...shape };
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return; // canvas blocked outright — sampleGrid's guard turns this into a blank grid
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(0, bob * H * 0.02);

  const cx = W / 2, cy = H * S.cy;
  const br = 1 + (expr.breath ?? 0) * 0.045; // breathing: whole body gently swells
  const hw = W * S.headW * br, hh = H * S.headH * br; // head half-extents
  const r = Math.min(hw, hh) * S.corner;

  // feet + arm nubs go under the head so its edge overlaps them
  if (S.feet) {
    ctx.fillStyle = '#8f8f8f';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * hw * 0.5, cy + hh * 0.95, hw * 0.34, hh * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (S.arms) {
    ctx.fillStyle = '#8a8a8a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * hw * 0.94, cy + hh * 0.12, hw * 0.2, hh * 0.3, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // paws at a keyboard (hero-stage.js): { l, r } each 0..1, 1 = pressed down
  // onto the key row under the body. bongo.cat's two frames, drawn under the
  // head like the arms so its edge overlaps them; a press moves the paw one
  // glyph row lower.
  if (expr.paws) {
    ctx.fillStyle = '#8a8a8a';
    for (const [s, down] of [[-1, expr.paws.l ?? 0], [1, expr.paws.r ?? 0]]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * hw * 0.62, cy + hh * (0.96 + down * 0.2), hw * 0.24, hh * 0.2, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // mid-gray fill maps to the middle of the ramp — dash/plus halftone, not solid '@'
  ctx.fillStyle = '#787878';
  ctx.beginPath();
  if (S.round) ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
  else roundRectPath(ctx, cx - hw, cy - hh, hw * 2, hh * 2, r);
  ctx.fill();

  // horn-ears: cute curved nubs on the top corners
  ctx.fillStyle = '#9a9a9a'; // horns slightly denser than the head so they read at low res
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + s * hw * S.hornSpread, cy - hh * S.hornBase);
    ctx.rotate(s * (S.hornAngle + earTilt * 0.18));
    ctx.scale(S.hornScale, S.hornScale);
    ctx.beginPath();
    ctx.moveTo(-W * 0.09, H * 0.085);
    ctx.quadraticCurveTo(-W * 0.014, -H * 0.2, W * 0.08, -H * 0.032);
    ctx.quadraticCurveTo(W * 0.05, H * 0.07, 0, H * 0.115);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#787878';

  // features are cut out of the head (dark on light, like the reference)
  ctx.globalCompositeOperation = 'destination-out';

  const eyeY = cy + hh * S.eyeY, eyeDX = hw * S.eyeDX;
  const ew = hw * 0.17 * S.eyeScale, eh = hh * 0.22 * S.eyeScale * S.eyeTall;
  const eye = (x, kind) => {
    ctx.beginPath();
    if (kind === 'open') {
      ctx.ellipse(x + pupil.x * hw * 0.08, eyeY + pupil.y * hh * 0.08, ew, eh, 0, 0, Math.PI * 2);
    } else if (kind === 'wink' || kind === 'closed') {
      roundRectPath(ctx, x - ew * 1.25, eyeY - hh * 0.05, ew * 2.5, hh * 0.1, hh * 0.05);
    } else if (kind === 'happy') { // ^ shaped
      ctx.lineWidth = hh * 0.1;
      ctx.moveTo(x - ew, eyeY + eh * 0.45);
      ctx.lineTo(x, eyeY - eh * 0.45);
      ctx.lineTo(x + ew, eyeY + eh * 0.45);
      ctx.stroke();
      return;
    }
    ctx.fill();
  };
  eye(cx - eyeDX, eyeL);
  eye(cx + eyeDX, eyeR);

  // mouth — filled shapes only: a thin stroke averages away in the luminance
  // sampler and reads as nothing at glyph resolution. mouthScale 0 = mouthless
  // at rest, but expressive moments (wink, happy eyes, a grin) reveal a small
  // smile so the face reads as smiling rather than blank.
  const mY = cy + hh * S.mouthY;
  let mS = S.mouthScale;
  const expressive = eyeL === 'happy' || eyeL === 'wink' || eyeR === 'happy' || eyeR === 'wink' || mouth === 'grin';
  if (mS <= 0 && expressive) mS = 1.1;
  ctx.beginPath();
  if (mS <= 0) {
    // no mouth
  } else if (mouth === 'smile') {
    ctx.arc(cx, mY - hh * 0.12, hw * 0.26 * mS, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
  } else if (mouth === 'grin') {
    ctx.arc(cx, mY - hh * 0.14, hw * 0.24 * mS, 0, Math.PI);
    ctx.fill();
    // tiny fang left in the grin
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#787878';
    ctx.beginPath();
    ctx.moveTo(cx - hw * 0.12, mY - hh * 0.14);
    ctx.lineTo(cx - hw * 0.05, mY - hh * 0.14);
    ctx.lineTo(cx - hw * 0.085, mY + hh * 0.0);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
  } else if (mouth === 'o') {
    ctx.ellipse(cx, mY - hh * 0.08, hw * 0.1 * mS, hh * 0.13 * mS, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (mouth === 'w') { // cat mouth: two filled half-discs
    ctx.arc(cx - hw * 0.11 * mS, mY - hh * 0.12, hw * 0.12 * mS, 0, Math.PI);
    ctx.arc(cx + hw * 0.11 * mS, mY - hh * 0.12, hw * 0.12 * mS, Math.PI, 0, true);
    ctx.fill();
  }

  // blush: denser-than-head patches beside the eyes (they survive the glyph ramp)
  if (S.blush) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#b2b2b2';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * hw * 0.64, eyeY + hh * 0.32, hw * 0.13, hh * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

export function mascotFrame(cols, rows, expr, shape) {
  const c = makeCanvas(cols, rows);
  drawMascot(c, expr, shape);
  return sampleGrid(c, cols, rows);
}

export function emojiFrame(cols, rows, emoji) {
  const c = makeCanvas(cols, rows);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return Array.from({ length: rows }, () => ' '.repeat(cols));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.floor(c.height * 0.82)}px "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText(emoji, c.width / 2, c.height / 2 + c.height * 0.04);
  return sampleGrid(c, cols, rows, 0.75); // lift midtones: emoji art is darker than white-fill drawings
}

// ---------- morph: port of ascii-morph's crush algorithm ----------

const pad = (lines, cols, rows) => {
  const out = [];
  const top = Math.floor((rows - lines.length) / 2);
  for (let y = 0; y < rows; y++) {
    const src = lines[y - top] ?? '';
    out.push(src.padEnd(cols, ' ').slice(0, cols));
  }
  return out;
};

function crushStep(lines) {
  // erode each row's outermost glyphs into sparks drifting toward the vertical center
  const rows = lines.length;
  const out = lines.map((l) => l.split(''));
  let changed = false;
  for (let y = 0; y < rows; y++) {
    const line = out[y];
    let first = -1, last = -1;
    for (let x = 0; x < line.length; x++) if (line[x] !== ' ') { if (first < 0) first = x; last = x; }
    if (first < 0) continue;
    changed = true;
    const toCenter = y < rows / 2 ? 1 : -1;
    const spark = () => SPARKS[(Math.random() * SPARKS.length) | 0];
    line[first] = ' ';
    if (last !== first) line[last] = ' ';
    const ty = y + toCenter;
    if (out[ty] && first + 1 < line.length && out[ty][first + 1] !== undefined && Math.random() < 0.8) out[ty][first + 1] = spark();
    if (out[ty] && last - 1 >= 0 && out[ty][last - 1] !== undefined && Math.random() < 0.8) out[ty][last - 1] = spark();
  }
  return { lines: out.map((l) => l.join('')), changed };
}

export function morphFrames(from, to, cols, rows) {
  const seq = [];
  let cur = pad(from, cols, rows);
  for (let i = 0; i < 200; i++) {
    const { lines, changed } = crushStep(cur);
    if (!changed) break;
    seq.push(lines);
    cur = lines;
  }
  const back = [];
  let tgt = pad(to, cols, rows);
  back.push(tgt);
  for (let i = 0; i < 200; i++) {
    const { lines, changed } = crushStep(tgt);
    if (!changed) break;
    back.push(lines);
    tgt = lines;
  }
  return seq.concat(back.reverse());
}

// clipboard helper for the copy buttons — the async clipboard API only exists
// in secure contexts (https / loopback), so fall back to execCommand elsewhere
export function copyUrl(btn, url = 'https://superbot.gg') {
  // the resting label lives on the button, not in a closure — a second click
  // inside the revert window must not snapshot "copied ✓" as the label
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  const done = () => {
    btn.textContent = 'copied ✓';
    btn.classList.remove('copied');
    void btn.offsetWidth; // reflow so the pop animation replays on rapid re-clicks
    btn.classList.add('copied');
    dispatchEvent(new CustomEvent('superbot:copied')); // the mascot celebrates
    clearTimeout(btn._copyT);
    btn._copyT = setTimeout(() => { btn.textContent = btn.dataset.label; btn.classList.remove('copied'); }, 1400);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } finally {
      ta.remove();
    }
    if (ok) done();
    else prompt('copy the URL:', url); // last-ditch: clipboard API rejected AND execCommand failed
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(done, fallback);
    return;
  }
  fallback();
}
if (typeof window !== 'undefined') window.copyUrl = copyUrl;

// ---------- speech bubble: kind greetings in the visitor's own language ----------
// language pick is client-side negotiation: navigator.languages mirrors the
// Accept-Language header, so a static page needs no server help. Full tag
// ('zh-tw') is checked before the base ('zh') so script variants win.

// tone: warm observations, never instructions — the bubble tells the visitor
// how glad the bot is that they showed up, and how keen it is to help.
export const GREETINGS = {
  en: { lines: ["oh, hi! i was hoping you'd come by.", "so glad you're here.", "let's do awesome things together."] },
  es: { lines: ['¡hola! qué alegría que estés aquí.', 'me encantaría ayudarte.', 'hagamos algo increíble juntos.'] },
  fr: { lines: ['salut ! ça me fait plaisir de te voir.', "j'ai hâte de t'aider.", 'faisons un truc génial ensemble.'] },
  de: { lines: ['oh, hallo! schön, dass du da bist.', 'ich helfe dir so gerne.', 'lass uns was großartiges bauen.'] },
  pt: { lines: ['oi! que bom que você veio.', 'mal posso esperar para ajudar.', 'vamos criar algo incrível juntos.'] },
  it: { lines: ['oh, ciao! che bello che tu sia qui.', "non vedo l'ora di aiutarti.", 'facciamo qualcosa di bello insieme.'] },
  ja: { lines: ['来てくれてうれしいです！', 'お手伝いできるのが楽しみです。', '一緒にすごいことをしましょう！'] },
  ko: { lines: ['어서 와요! 만나서 정말 반가워요.', '도와드릴 게 기대돼요.', '같이 멋진 걸 만들어요!'] },
  zh: { lines: ['你来啦！真开心见到你。', '好期待能帮到你。', '我们一起做点酷的事吧！'] },
  'zh-tw': { lines: ['你來啦！真開心見到你。', '好期待能幫到你。', '我們一起做點酷的事吧！'] },
  'zh-hant': { lines: ['你來啦！真開心見到你。', '好期待能幫到你。', '我們一起做點酷的事吧！'] },
  ru: { lines: ['привет! как здорово, что ты здесь.', 'мне не терпится помочь.', 'давай сделаем что-то крутое вместе.'] },
  uk: { lines: ['привіт! як добре, що ти тут.', 'мені не терпиться допомогти.', 'зробімо разом щось круте.'] },
  ar: { dir: 'rtl', lines: ['أهلاً! سعيد جداً بوجودك هنا.', 'متحمس لمساعدتك.', 'لنصنع شيئاً رائعاً معاً.'] },
  he: { dir: 'rtl', lines: ['היי! איזה כיף שבאת.', 'אני כבר מתרגש לעזור.', 'בוא נעשה משהו מגניב ביחד.'] },
  hi: { lines: ['नमस्ते! आप आए, बहुत अच्छा लगा।', 'मदद करने के लिए उत्साहित हूँ।', 'चलो साथ मिलकर कुछ शानदार बनाएँ।'] },
  nl: { lines: ['hoi! wat fijn dat je er bent.', 'ik heb er zin in om te helpen.', 'laten we samen iets tofs maken.'] },
  pl: { lines: ['cześć! jak miło, że jesteś.', 'nie mogę się doczekać, żeby pomóc.', 'zróbmy razem coś świetnego.'] },
  tr: { lines: ['merhaba! gelmene çok sevindim.', 'yardım etmek için sabırsızlanıyorum.', 'birlikte harika bir şey yapalım.'] },
  sv: { lines: ['hej! vad kul att du är här.', 'jag ser fram emot att hjälpa till.', 'vi gör något häftigt tillsammans.'] },
  da: { lines: ['hej! dejligt at du er her.', 'jeg glæder mig til at hjælpe.', 'lad os lave noget fedt sammen.'] },
  no: { lines: ['hei! så fint at du er her.', 'jeg gleder meg til å hjelpe.', 'la oss lage noe kult sammen.'] },
  nb: { lines: ['hei! så fint at du er her.', 'jeg gleder meg til å hjelpe.', 'la oss lage noe kult sammen.'] },
  fi: { lines: ['hei! kiva että olet täällä.', 'autan tosi mielelläni.', 'tehdään yhdessä jotain mahtavaa.'] },
  cs: { lines: ['ahoj! jsem rád, že jsi tu.', 'moc se těším, až ti pomůžu.', 'pojďme spolu vytvořit něco skvělého.'] },
  el: { lines: ['γεια! χαίρομαι πολύ που είσαι εδώ.', 'ανυπομονώ να βοηθήσω.', 'ας φτιάξουμε κάτι τέλειο μαζί.'] },
  th: { lines: ['สวัสดี! ดีใจที่คุณมา', 'ตื่นเต้นที่จะได้ช่วยเลย', 'มาทำอะไรเจ๋ง ๆ ด้วยกันเถอะ'] },
  vi: { lines: ['xin chào! rất vui vì bạn đã đến.', 'mình háo hức được giúp bạn lắm.', 'cùng nhau làm gì đó thật hay nhé.'] },
  id: { lines: ['halo! senang sekali kamu datang.', 'sudah tidak sabar ingin membantu.', 'ayo bikin sesuatu yang keren bersama.'] },
};

// bubble → face sync: the face acts out what the bubble is saying. Beats are
// keyed by position, not locale — every locale's list runs hello → warm →
// let's-play-together, so one beat map fits all of them.
const beatFor = (idx, n) => (idx === 0 ? 0 : idx === n - 1 ? 2 : 1);
const BEAT_EXPRS = [
  { eyeL: 'open', eyeR: 'wink', mouth: 'grin' },    // hello: a wink for the arrival
  { eyeL: 'happy', eyeR: 'happy', mouth: 'smile' }, // warm: soft happy eyes
  { eyeL: 'happy', eyeR: 'happy', mouth: 'grin' },  // let's-play: full grin + excited bob
];
const PLAY_MORPHS = ['🪄', '✨', '💜']; // the let's-play beat ends in a matching morph

// Hong Kong and Macau report plain region tags (zh-HK / zh-MO) with no script
// subtag, but read Traditional — alias them so prefix matching lands right.
GREETINGS['zh-hk'] = GREETINGS['zh-mo'] = GREETINGS['zh-hant'];

export function pickGreetings(langs) {
  const prefs = langs ?? (navigator.languages?.length ? navigator.languages : [navigator.language || 'en']);
  for (const raw of prefs) {
    // longest-prefix match so 'zh-Hant-TW' finds 'zh-hant' before falling to 'zh'
    const parts = String(raw).toLowerCase().split('-');
    for (let n = parts.length; n >= 1; n--) {
      const key = parts.slice(0, n).join('-');
      if (GREETINGS[key]) return { lang: key, ...GREETINGS[key] };
    }
  }
  return { lang: 'en', ...GREETINGS.en };
}

// Types each greeting into `el` with a blinking caret, holds, backspaces, and
// moves to the next — forever, like the bot is quietly chatting. The page
// supplies .bubble / .caret styling; this only builds the DOM and the loop.
export function mountGreeting(el, opts = {}) {
  const { lines, dir, lang } = pickGreetings(opts.langs);
  const typeMs = opts.typeMs ?? 42, eraseMs = opts.eraseMs ?? 16, holdMs = opts.holdMs ?? 6500;
  el.setAttribute('dir', dir ?? 'ltr');
  el.setAttribute('lang', lang);
  // NOT a live region: the typewriter rewrites textContent every few ms, which
  // a live region would re-announce each tick. Screen readers get one static
  // label; the churning spans are decoration.
  el.setAttribute('aria-label', lines[0]);
  el.hidden = false;
  const text = document.createElement('span');
  const caret = document.createElement('span');
  text.setAttribute('aria-hidden', 'true');
  caret.setAttribute('aria-hidden', 'true');
  caret.className = 'caret';
  caret.textContent = '▌';
  el.append(text, caret);

  // when a Mascot instance is passed, the bubble conducts the face — random
  // auto-morphs give way to synced ones. Disabled BEFORE the reduced-motion
  // return: a static bubble must not leave the face morphing out of sync.
  const mascot = opts.mascot;
  if (mascot) mascot.autoMorph = false;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    text.textContent = lines[0]; // static single greeting, no churn
    return;
  }

  // the morph lands mid-hold whatever holdMs is, never after the erase
  const morphAt = Math.min(2000, holdMs * 0.3);
  const shown = (idx, tries = 0) => {
    if (!mascot) return;
    if (mascot.state !== 'idle') {
      // busy with a click-triggered morph — wait it out rather than dropping
      // this beat, so a visitor playing with the mascot doesn't desync the face
      if (mascot.state !== 'fallback' && tries < 12) setTimeout(() => shown(idx, tries + 1), 400);
      return;
    }
    const b = beatFor(idx, lines.length);
    // the expression stays for most of the line's hold, not a 2s flash
    mascot.setExpr(BEAT_EXPRS[b], Math.max(2400, holdMs - 1200));
    if (b === 2) {
      // excited bob until the morph takes the stage MID-hold: he says "let's
      // do awesome things" and then does one, finishing well before the next
      // line types so its expression is never raced by a running morph.
      mascot.excitedUntil = performance.now() + morphAt;
      setTimeout(() => {
        if (mascot.state === 'idle') mascot.morphToEmoji(PLAY_MORPHS[(Math.random() * PLAY_MORPHS.length) | 0]);
      }, morphAt);
    }
  };

  const chars = (s) => [...s]; // code points, not UTF-16 units — greetings include astral scripts
  const step = (line, k, dK, onShown, next) => {
    text.textContent = chars(line).slice(0, k).join('');
    const len = chars(line).length;
    if (dK > 0 && k >= len) { onShown?.(); setTimeout(() => step(line, len, -1, null, next), holdMs); }
    else if (dK < 0 && k <= 0) next();
    else setTimeout(() => step(line, k + dK, dK, onShown, next), dK > 0 ? typeMs : eraseMs);
  };
  // deterministic opener: the "oh, hi!" line always plays first, then cycle in order
  const play = (idx) => step(lines[idx], 0, 1, () => shown(idx), () => {
    setTimeout(() => play((idx + 1) % lines.length), 500);
  });
  setTimeout(() => play(0), opts.delayMs ?? 900);
}

// console easter egg — for the people who open devtools on a landing page
export function consoleEgg({ email = 'hi@superbot.gg', lines = [] } = {}) {
  const face = [
    '   .+*:            :*+.',
    '   =+*+=:........:=+*+=',
    ' :+=    (O)   (--)    =+:',
    '  :+=      \\__/      =+:',
    '   .=+==============+=.',
  ].join('\n');
  const mono = 'font-family:ui-monospace,Menlo,monospace;';
  console.log('%c' + face, mono + 'color:#7cb389;');
  console.log('%calways learning. always evolving.', mono + 'color:#8b8778;');
  for (const l of lines) console.log('%c' + l, mono + 'color:#e8e4d9;');
  console.log('%c→ ' + email, mono + 'color:#7cb389;font-weight:bold;');
}

// ---------- canvas-readback fallback ----------
// Fingerprint shields (CanvasBlocker, Brave farbling, hardened Chromium forks)
// zero out getImageData, which samples every cell to ' ' and erases the bot.
// This is the resting smol face pre-rendered by the same pipeline, baked in so
// those visitors still meet the mascot — static, but present.

const FALLBACK_ART = [
  ' .===:.                  .--:.',
  '.++**+*+-              -=+**+*-',
  '-*+++*+*=------------::++*+++*+*',
  '=+*+++*++==++====+==+++*+*+++*:',
  ':+*++*+=--====+=====::=+++====',
  ':=+++=-    --==+=:     .==++==',
  ':====:       ===+       :===+=',
  '=====:       ====       -====+',
  ':+=+++:.   --+===-     :++====',
  ':=+++++:--:===+===::--:+++====',
  ':==++====+=====+=====+====++==',
  '.====+====+=====+=====+=====+.',
  '  :===+====++====+=====+==--.',
  '     ..---------------...',
];

const blankish = (rows) => rows.join('').replace(/ /g, '').length < 40;

function centerArt(lines, cols, rows) {
  const w = Math.max(...lines.map((l) => l.length));
  const left = Math.max(0, (cols - w) >> 1);
  const top = Math.max(0, (rows - lines.length) >> 1);
  const out = [];
  for (let y = 0; y < rows; y++) {
    out.push((' '.repeat(left) + (lines[y - top] ?? '')).padEnd(cols).slice(0, cols));
  }
  return out;
}

// ---------- renderer + behavior loop ----------

export class Mascot {
  constructor(el, opts = {}) {
    this.el = el;
    this.cols = opts.cols ?? 46;
    this.rows = opts.rows ?? 23;
    this.emojis = opts.emojis ?? ['✨', '🪄', '👻', '😹', '💜'];
    this.shape = typeof opts.variant === 'string'
      ? (VARIANTS[opts.variant] ?? VARIANTS[DEFAULT_VARIANT])
      : (opts.shape ?? VARIANTS[DEFAULT_VARIANT]);
    this.anim = { ...BASE_ANIM, ...(typeof opts.anim === 'string' ? (ANIMS[opts.anim] ?? {}) : (opts.anim ?? {})) };
    this.autoMorph = (opts.autoMorph ?? true) && this.anim.autoMorph;
    this.prev = [];
    this.spans = [];
    this.state = 'idle';
    this.expr = { eyeL: 'open', eyeR: 'open', mouth: 'smile', bob: 0, pupil: { x: 0, y: 0 } };
    // the mascot always animates by default — macOS "Reduce Motion" propagates
    // here as prefers-reduced-motion and was freezing the character for those
    // users. Pass respectReducedMotion: true to honor the OS setting instead.
    this.reduced = (opts.respectReducedMotion ?? false) && matchMedia('(prefers-reduced-motion: reduce)').matches;

    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'superbot, a cute ASCII robot mascot');
    el.textContent = '';
    for (let y = 0; y < this.rows; y++) {
      const s = document.createElement('span');
      s.style.display = 'block';
      el.appendChild(s);
      this.spans.push(s);
      this.prev.push(null);
    }

    // a draw that throws must never take the page's module script with it —
    // degrade to the baked face, the same way a blocked readback does
    let first;
    try {
      first = mascotFrame(this.cols, this.rows, this.expr, this.shape);
    } catch (err) {
      console.warn('[superbot] mascot render unavailable, using baked frame:', err);
      first = [];
    }
    if (blankish(first)) {
      // canvas readback is dead (privacy shield zeroing getImageData): every
      // frame this session would sample blank, so show the baked face instead.
      // state 'fallback' (never 'idle') keeps greeting-sync hooks and morphs
      // from doing dead work against a canvas that cannot render them.
      this.state = 'fallback';
      this.render(centerArt(FALLBACK_ART, this.cols, this.rows));
      return;
    }
    this.render(first);
    if (this.reduced) return; // static frame only

    el.style.cursor = 'pointer';
    el.addEventListener('click', () => this.morphToEmoji());
    addEventListener('superbot:copied', () => {
      // celebrate a copy: happy face + a burst of fast bobbing.
      // mid-morph the stage is busy — park the celebration for the morph's end.
      if (this.state === 'idle') {
        this.excitedUntil = performance.now() + 1600;
        this.setExpr({ eyeL: 'happy', eyeR: 'happy', mouth: 'grin' }, 1600);
      } else {
        this.excitePending = true;
      }
    });
    el.addEventListener('pointerenter', () => {
      // decorative, like blinks: never stomp a flourish already on stage
      if (performance.now() < (this.flourishUntil ?? 0)) return;
      this.setExpr({ eyeL: 'open', eyeR: 'wink', mouth: 'grin' }, 900);
    });
    addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const g = this.anim.pupilGain;
      this.expr.pupil = {
        x: Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / r.width)) * g,
        y: Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / r.height)) * g,
      };
    });

    this.tick = this.tick.bind(this);
    this.last = 0;
    this.nextBlink = performance.now() + 2500;
    this.nextMorph = performance.now() + this.anim.morphMin * 0.8 + Math.random() * (this.anim.morphMax - this.anim.morphMin);
    requestAnimationFrame(this.tick);
  }

  render(lines) {
    for (let y = 0; y < this.rows; y++) {
      const line = lines[y] ?? '';
      if (line !== this.prev[y]) {  // row diff: only touch changed rows
        this.spans[y].textContent = line;
        this.prev[y] = line;
      }
    }
  }

  setExpr(patch, revertMs) {
    // revert always lands on the canonical resting face, never a snapshot —
    // a snapshot taken mid-flourish would bake the flourish in permanently
    Object.assign(this.expr, patch);
    clearTimeout(this.revertT);
    if (revertMs) {
      this.flourishUntil = performance.now() + revertMs; // blinks hold off until this expires
      this.revertT = setTimeout(() => Object.assign(this.expr, { eyeL: 'open', eyeR: 'open', mouth: 'smile' }), revertMs);
    }
  }

  morphToEmoji(emoji) {
    if (this.state !== 'idle' || document.hidden) return;
    this.state = 'morph';
    const pick = emoji ?? this.emojis[(Math.random() * this.emojis.length) | 0];
    const here = mascotFrame(this.cols, this.rows, this.expr, this.shape);
    if (blankish(here)) {
      // readback died mid-session — freeze on the baked face, don't morph to nothing
      this.state = 'fallback';
      this.render(centerArt(FALLBACK_ART, this.cols, this.rows));
      return;
    }
    const there = emojiFrame(this.cols, this.rows, pick);
    if (there.join('').replace(/ /g, '').length < 40) {
      // emoji font missing (bare Linux): the sampled grid is blank — skip the morph
      this.state = 'idle';
      this.nextMorph = performance.now() + 60_000;
      return;
    }
    const go = morphFrames(here, there, this.cols, this.rows);
    const back = morphFrames(there, mascotFrame(this.cols, this.rows, { ...this.expr, eyeL: 'happy', eyeR: 'happy', mouth: 'grin' }, this.shape), this.cols, this.rows);
    let i = 0;
    const play = () => {
      if (i < go.length) {
        this.render(go[i++]);
        setTimeout(play, 20);
      } else if (i < go.length + 55) { // hold the emoji ~1.1s
        i++;
        setTimeout(play, 20);
      } else if (i - 55 < go.length + back.length) {
        this.render(back[i++ - 55 - go.length]);
        setTimeout(play, 20);
      } else {
        this.state = 'idle';
        // one clock for face and bob: a parked copy celebration extends both windows together
        const holdMs = this.excitePending ? 1600 : 1200;
        this.setExpr({ eyeL: 'happy', eyeR: 'happy', mouth: 'grin' }, holdMs);
        if (this.excitePending) {
          this.excitePending = false;
          this.excitedUntil = performance.now() + holdMs;
        }
        this.nextMorph = performance.now() + this.anim.morphMin + Math.random() * (this.anim.morphMax - this.anim.morphMin);
      }
    };
    play();
  }

  press(side, holdMs = 90) {
    // a keystroke from the stage: that paw goes down onto the key row for
    // holdMs (a fixed pulse, keyviz-style, since synthetic typing has no keyup)
    (this.pawUntil ??= {})[side === 'left' ? 'l' : 'r'] = performance.now() + holdMs;
  }

  tick(t) {
    requestAnimationFrame(this.tick);
    if (this.state !== 'idle' || document.hidden) return;
    const A = this.anim;
    // low-fps idle is plenty for textmode; typing ticks faster so a 90ms paw
    // pulse always lands on a frame
    if (t - this.last < (this.typing ? 40 : A.fps)) return;
    this.last = t;

    const excited = t < (this.excitedUntil ?? 0);
    // stage hooks (hero-stage.js): `typing` is a steady keyboard bob between
    // idle and excited; `lookAt` {x,y} in -1..1 points the pupils at a card and
    // wins over the pointer until cleared
    const typing = this.typing && !excited;
    this.expr.bob = excited ? Math.sin(t / 180) * 1.4
      : typing ? Math.sin(t / 320) * 0.9
      : Math.sin(t / A.bobPeriod) * A.bobAmp;
    if (this.lookAt) this.expr.pupil = { x: this.lookAt.x, y: this.lookAt.y };
    this.expr.paws = this.typing
      ? { l: t < (this.pawUntil?.l ?? 0) ? 1 : 0, r: t < (this.pawUntil?.r ?? 0) ? 1 : 0 }
      : undefined;
    this.expr.earTilt = Math.sin(t / (excited ? 300 : A.earPeriod)) * A.earAmp
      + (Math.random() < A.jitterP ? (Math.random() - 0.5) * 1.6 : 0);
    this.expr.breath = A.breathAmp ? ((Math.sin(t / A.breathPeriod) + 1) / 2) * A.breathAmp : 0;

    if (t > this.nextBlink) {
      if (t < (this.flourishUntil ?? 0)) {
        // a flourish is on stage — a blink's revert would cut it short
        this.nextBlink = this.flourishUntil + 400 + Math.random() * 800;
      } else {
        const wink = Math.random() < A.winkP;
        this.setExpr(wink ? { eyeR: 'wink' } : { eyeL: 'closed', eyeR: 'closed' }, wink ? 500 : 140);
        this.nextBlink = t + A.blinkMin + Math.random() * (A.blinkMax - A.blinkMin);
      }
    }
    if (this.autoMorph && t > this.nextMorph) { this.morphToEmoji(); return; }

    const f = mascotFrame(this.cols, this.rows, this.expr, this.shape);
    if (blankish(f)) {
      // readback died mid-session: park on the baked face for good ('fallback'
      // is never 'idle', so ticks and morphs stop touching the stage)
      this.state = 'fallback';
      this.render(centerArt(FALLBACK_ART, this.cols, this.rows));
      return;
    }
    this.render(f);
  }
}
