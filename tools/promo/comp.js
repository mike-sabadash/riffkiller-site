// Riff Killer promo v2 — deterministic motion composition. renderFrame(t) draws the frame at output time t (s).
const HOOK = new URLSearchParams(location.search).get('hook') || 'h1';
const $ = id => document.getElementById(id);
const FPS = 30;

// ---------- easing ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  lin: x => x,
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  inOutQuart: x => x < .5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2,
  inOutQuint: x => x < .5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  inOutExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  inCubic: x => x * x * x,
  outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  outElastic: x => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (2 * Math.PI) / 3) + 1,
};
const seg = (t, a, b, ease = E.lin) => ease(clamp((t - a) / (b - a)));

// ---------- camera: screen-css point (cx,cy) lands at output (540+dx, Y0), zoom z ----------
const WIDE = { cx: 196.5, cy: 426, z: 1.55, Y0: 880, ry: 0, rx: 0, dx: 0 };
const C = {
  wide: WIDE,
  wideTilt: { cx: 196.5, cy: 426, z: 1.62, Y0: 880, ry: -9, rx: 3, dx: 0 },
  parts: { cx: 196.5, cy: 742, z: 2.75, Y0: 760, ry: 0, rx: 0, dx: 0 },
  parts2: { cx: 190, cy: 752, z: 2.98, Y0: 760, ry: 0, rx: 0, dx: 0 },
  speed: { cx: 262, cy: 560, z: 2.95, Y0: 700, ry: 0, rx: 0, dx: 0 },
  speed2: { cx: 280, cy: 555, z: 3.2, Y0: 700, ry: 0, rx: 0, dx: 0 },
  video: { cx: 196.5, cy: 330, z: 2.62, Y0: 620, ry: 0, rx: 0, dx: 0 },
  video2: { cx: 196.5, cy: 340, z: 2.78, Y0: 620, ry: 0, rx: 0, dx: 0 },
  tab: { cx: 196.5, cy: 440, z: 2.42, Y0: 680, ry: 0, rx: 0, dx: 0 },
  trainerIn: { cx: 220, cy: 300, z: 2.15, Y0: 620, ry: 0, rx: 0, dx: 0 },
  trainer: { cx: 220, cy: 300, z: 2.5, Y0: 620, ry: 0, rx: 0, dx: 0 },
  trainer2: { cx: 225, cy: 310, z: 2.62, Y0: 620, ry: 0, rx: 0, dx: 0 },
  card: { cx: 196.5, cy: 520, z: 2.55, Y0: 640, ry: 0, rx: 0, dx: 0 },
  card2: { cx: 196.5, cy: 530, z: 2.7, Y0: 640, ry: 0, rx: 0, dx: 0 },
  stars: { cx: 196.5, cy: 300, z: 1.62, Y0: 600, ry: 0, rx: 0, dx: 0 },
  stars2: { cx: 196.5, cy: 300, z: 1.72, Y0: 600, ry: 0, rx: 0, dx: 0 },
  dive: { cx: 196.5, cy: 172, z: 11, Y0: 900, ry: 0, rx: 0, dx: 0 },
};
// [t, pose, ease used to arrive here]
const KEYS = [
  [2.60, C.wide, E.lin], [3.95, C.wideTilt, E.inOutSine],
  [4.25, C.parts, E.inOutExpo], [5.55, C.parts2, E.outCubic],
  [5.90, C.speed, E.inOutExpo], [7.50, C.speed2, E.outCubic],
  [7.80, C.video, E.inOutExpo], [8.70, C.video2, E.outCubic],
  [9.12, C.tab, E.inOutQuint], [9.96, C.tab, E.lin],
  [10.58, C.trainerIn, E.lin], [10.92, C.trainer, E.outBack], [12.05, C.trainer2, E.outCubic],
  [12.35, C.card, E.inOutExpo], [12.95, C.card2, E.outCubic],
  [13.45, C.stars, E.inOutQuint], [14.06, C.stars2, E.outCubic],
  [14.62, C.dive, E.inExpo],
];
function cam(t) {
  if (t <= KEYS[0][0]) return KEYS[0][1];
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, p1, ease] = KEYS[i], [t0, p0] = KEYS[i - 1];
    if (t <= t1) {
      if (t0 === 9.96 && t1 === 10.58) return p1;      // hard cut around the drop insert
      const k = ease((t - t0) / (t1 - t0));
      // zoom interpolated in log space so speed feels even
      const z = Math.exp(lerp(Math.log(p0.z), Math.log(p1.z), k));
      return { cx: lerp(p0.cx, p1.cx, k), cy: lerp(p0.cy, p1.cy, k), z, Y0: lerp(p0.Y0, p1.Y0, k), ry: lerp(p0.ry, p1.ry, k), rx: lerp(p0.rx, p1.rx, k), dx: lerp(p0.dx, p1.dx, k) };
    }
  }
  return KEYS[KEYS.length - 1][1];
}
const toOut = (c, x, y) => [540 + c.dx + (x - c.cx) * c.z, c.Y0 + (y - c.cy) * c.z];

// ---------- screen source (which capture is on the phone) ----------
const SRC = [
  [2.60, 3.95, 'm2', t => Math.min(1.0, t - 2.6)],
  [3.95, 5.725, 'm3', t => t - 3.5],
  [5.725, 7.65, 'm3', t => t + 0.12],
  [7.65, 8.90, 'm2', t => t + 3.85],
  [8.90, 9.96, 'm2', t => t + 7.96],
  [9.96, 12.20, 't3a', t => t - 9.17],
  [12.20, 15.0, 't3b', t => t + 30.29],
];
const pad = n => String(n).padStart(4, '0');
function screenSrc(t) {
  for (const [a, b, s, f] of SRC) if (t >= a && t < b) {
    const st = f(t);
    if (s === 'm2') return `fr/m2/${pad(clamp(Math.round(st * FPS), 0, 709))}.jpg`;
    if (s === 'm3') return `fr/m3/${pad(clamp(Math.round(st * FPS), 0, 269))}.jpg`;
    if (s === 't3a') return `fr/t3/a${pad(clamp(Math.round(st * FPS), 0, 119))}.jpg`;
    if (s === 't3b') return `fr/t3/b${pad(clamp(Math.round((st - 40) * FPS), 0, 215))}.jpg`;
  }
  return `fr/m2/0000.jpg`;
}
function reelSrc(t) {
  if (t < 3.2) return `fr/reels/a${pad(clamp(Math.round(t * FPS), 0, 95))}.jpg`;
  if (t < 11) return `fr/reels/b${pad(clamp(Math.round((t - 9.8) * FPS), 0, 29))}.jpg`;
  return `fr/reels/c${pad(clamp(Math.round((t - 13.9) * FPS), 0, 191))}.jpg`;
}

// ---------- taps (screen css coords) ----------
const TAPS = [[4.60, 104, 758], [6.55, 350, 523], [8.00, 143, 227], [8.95, 304, 227], [10.95, 260, 385], [12.88, 76, 556]];

// ---------- titles ----------
// each: {in, out, y (center of block), size, lines:[{text, hl:bool, color, sub}], gap}
const HOOKS = {
  h1: [
    { in: 0.12, out: 1.22, y: 1330, size: 132, lines: [{ text: 'Watched my' }, { text: 'breakdown?' }] },
    { in: 1.27, out: 2.52, y: 1330, size: 132, lines: [{ text: "Still can't" }, { text: 'play it?', hl: true }] },
  ],
  h2: [
    { in: 0.12, out: 2.52, y: 1300, size: 140, lines: [{ text: 'Stop' }, { text: 'rewinding' }, { text: 'YouTube.', hl: true, at: 1.25 }] },
  ],
  h3: [
    { in: 0.12, out: 1.22, y: 1330, size: 132, lines: [{ text: 'Learn' }, { text: 'Paranoid' }] },
    { in: 1.27, out: 2.52, y: 1330, size: 132, lines: [{ text: 'one shot' , hl: true }, { text: 'at a time.' }] },
  ],
};
const TITLES = [
  ...HOOKS[HOOK],
  { in: 3.12, out: 3.92, y: 1395, size: 112, lines: [{ text: 'Now practice it', hl: true }], logo: true },
  { in: 4.68, out: 5.82, y: 1380, size: 128, lines: [{ text: 'Loop' }, { text: 'one shot', hl: true }, { text: 'Any part, on repeat', sub: true, size: 46 }] },
  { in: 6.62, out: 7.72, y: 1400, size: 128, lines: [{ text: 'Slow it' }, { text: 'down', hl: true }] },
  { in: 8.02, out: 8.90, y: 1390, size: 128, lines: [{ text: 'See both' }, { text: 'hands', hl: true }] },
  { in: 9.00, out: 9.92, y: 1390, size: 128, lines: [{ text: 'Follow' }, { text: 'the tab', hl: true }] },
  { in: 10.66, out: 12.12, y: 1310, size: 112, lines: [{ text: 'Speed trainer' }] , ladder: true },
  { in: 12.25, out: 12.80, y: 1390, size: 150, lines: [{ text: 'Clean?' }] },
  { in: 13.0, out: 14.05, y: 1380, size: 120, lines: [{ text: 'At full speed' }], stars: true },
  { in: 15.22, out: 19.20, y: 1250, size: 132, lines: [{ text: 'Kill', hl: true }, { text: 'every riff.' }] },
  { in: 16.73, out: 19.20, y: 1450, size: 66, lines: [{ text: 'One shot at a time.', sub: true }] },
];
const titleEls = TITLES.map(T => {
  const root = document.createElement('div'); root.className = 'abs'; $('titles').appendChild(root);
  const els = []; let y = 0; const sizes = T.lines.map(l => l.size || T.size); const lh = sizes.map(s => s * 1.02);
  const total = lh.reduce((a, b) => a + b, 0) + (T.lines.length - 1) * 6; let top = T.y - total / 2;
  T.lines.forEach((L, i) => {
    const line = document.createElement('div'); line.className = 'line'; line.style.top = top + 'px'; line.style.height = (lh[i] + 8) + 'px';
    const sp = document.createElement('span'); sp.style.fontSize = sizes[i] + 'px'; if (L.sub) sp.classList.add('sub');
    sp.textContent = L.text;
    let hl = null; if (L.hl) { hl = document.createElement('i'); hl.className = 'hl'; sp.appendChild(hl); }
    line.appendChild(sp); root.appendChild(line); els.push({ sp, hl, L, i });
    top += lh[i] + 6;
  });
  let extra = {};
  if (T.logo) { const im = document.createElement('img'); im.src = 'assets/logo_big.png'; im.style.cssText = 'position:absolute;width:420px;left:330px;top:' + (T.y - 150) + 'px'; root.appendChild(im); extra.logo = im; }
  if (T.ladder) {
    const row = document.createElement('div'); row.style.cssText = `position:absolute;left:0;width:1080px;top:${T.y + 85}px;display:flex;justify-content:center;gap:26px`;
    extra.chips = ['×0.5', '×0.75', '×1'].map(s => { const c = document.createElement('div'); c.textContent = s;
      c.style.cssText = 'font-weight:900;font-size:76px;padding:14px 30px;border-radius:24px;background:rgba(255,255,255,.08);color:#8d8a99;letter-spacing:-.02em'; row.appendChild(c); return c; });
    root.appendChild(row);
  }
  if (T.stars) {
    const s = document.createElement('div'); s.textContent = '★★★'; s.style.cssText = `position:absolute;left:0;width:1080px;text-align:center;top:${T.y - 240}px;font-size:150px;color:#CFFF55;font-family:DejaVu Sans,sans-serif;text-shadow:0 0 40px rgba(207,255,85,.55)`;
    root.appendChild(s); extra.stars = s;
  }
  return { T, root, els, extra };
});
function drawTitles(t) {
  for (const { T, root, els, extra } of titleEls) {
    const vis = t >= T.in - 0.01 && t < T.out + 0.4 && !(t >= 9.96 && t < 10.58);
    root.style.display = vis ? 'block' : 'none'; if (!vis) continue;
    const outK = seg(t, T.out, T.out + 0.2, E.inCubic);
    els.forEach(({ sp, hl, L, i }) => {
      const tin = (L.at || T.in) + i * 0.075;
      const k = seg(t, tin, tin + 0.6, E.outExpo);
      const y = (1 - k) * 140 - outK * 145;
      sp.style.transform = `translateY(${y}%)`;
      sp.style.opacity = L.sub ? k * (1 - outK) : 1;
      if (hl) { const hk = seg(t, tin + 0.18, tin + 0.62, E.outExpo); hl.style.transform = `scaleX(${hk})`; }
    });
    if (extra.logo) { const k = seg(t, T.in - 0.05, T.in + 0.5, E.outExpo); extra.logo.style.opacity = k * (1 - outK); extra.logo.style.transform = `translateY(${(1 - k) * 40 - outK * 60}px)`; }
    if (extra.chips) {
      const beats = [10.95, 11.32, 11.70];
      extra.chips.forEach((c, j) => {
        const ap = seg(t, T.in + 0.1 + j * 0.07, T.in + 0.6 + j * 0.07, E.outBack);
        const on = t >= beats[j] && (j === 2 || t < beats[j + 1]);
        const pop = t >= beats[j] ? 1 + 0.18 * (1 - seg(t, beats[j], beats[j] + 0.35, E.outCubic)) : 1;
        c.style.transform = `translateY(${(1 - ap) * 60 - outK * 80}px) scale(${pop})`; c.style.opacity = ap * (1 - outK);
        c.style.background = on ? (j === 2 ? '#CFFF55' : '#9355E5') : 'rgba(255,255,255,.08)';
        c.style.color = on ? (j === 2 ? '#0a0a0f' : '#fff') : '#8d8a99';
      });
    }
    if (extra.stars) { const k = seg(t, T.in, T.in + 0.7, E.outElastic); extra.stars.style.transform = `scale(${0.2 + 0.8 * k})`; extra.stars.style.opacity = clamp(k * 1.5) * (1 - outK); }
  }
}

// ---------- background ----------
function drawBg(t) {
  const a = 30 + 8 * Math.sin(t * 0.5), b = 28 + 6 * Math.cos(t * 0.4);
  $('bg').style.background = `radial-gradient(900px 900px at ${a}% ${b}%, rgba(147,85,229,.55), rgba(147,85,229,0) 70%),` +
    `radial-gradient(800px 800px at ${78 - 6 * Math.sin(t * .3)}% ${78}%, rgba(207,255,85,.10), rgba(207,255,85,0) 70%), #08080c`;
  $('grain').style.backgroundPosition = `${(t * 997) % 512}px ${(t * 613) % 512}px`;
}

// ---------- packshot ----------
const P = $('pack');
P.innerHTML = `
 <div class="card" id="cBD" style="left:70px;top:390px"><img src="assets/bd.png"><span class="free">Free</span></div>
 <div class="card" id="cPA" style="left:610px;top:390px"><img src="assets/par.png"><span class="free">Free</span></div>
 <img id="pLogo" src="assets/logo_big.png" style="position:absolute;left:110px;top:730px;width:860px">
 <div id="pTitle" class="line" style="top:900px;height:104px"><span style="font-size:80px;white-space:nowrap">Paranoid & Black Dog</span></div>
 <div id="pFree" style="position:absolute;left:0;width:1080px;top:1030px;text-align:center"><span style="display:inline-block;background:#CFFF55;color:#0a0a0f;font-weight:900;font-size:72px;padding:18px 42px;border-radius:22px;letter-spacing:-.01em">FREE TO PRACTICE</span></div>
 <div id="pLink" style="position:absolute;left:0;width:1080px;top:1215px;text-align:center;font-weight:700;font-size:58px;color:#fff">Link in bio <span id="pArrow" style="display:inline-block">↗</span></div>`;
function drawPack(t) {
  const on = t >= 19.29; P.style.display = on ? 'block' : 'none'; if (!on) return;
  const card = (el, t0, dir, rot) => { const k = seg(t, t0, t0 + 0.7, E.outBack); el.style.transform = `translateX(${(1 - k) * 700 * dir}px) rotate(${rot * k}deg)`; el.style.opacity = clamp(k * 2); };
  card($('cBD'), 19.35, -1, -6); card($('cPA'), 19.45, 1, 6);
  const lk = seg(t, 19.29, 19.95, E.outExpo); $('pLogo').style.clipPath = `inset(0 ${100 - lk * 100}% 0 0)`; $('pLogo').style.transform = `translateY(${(1 - lk) * 30}px) scale(${1.06 - 0.06 * lk})`;
  const tk = seg(t, 19.66, 20.26, E.outExpo); $('pTitle').firstChild.style.transform = `translateY(${(1 - tk) * 140}%)`;
  const fk = seg(t, 20.0, 20.9, E.outElastic); $('pFree').style.transform = `scale(${0.3 + 0.7 * fk})`; $('pFree').style.opacity = clamp(fk * 2);
  const lnk = seg(t, 20.38, 20.9, E.outExpo); $('pLink').style.opacity = lnk; $('pLink').style.transform = `translateY(${(1 - lnk) * 40}px)`;
  const bob = t > 20.75 ? Math.abs(Math.sin((t - 20.75) * Math.PI / 0.74)) : 0; $('pArrow').style.transform = `translate(${bob * 8}px,${-bob * 8}px)`;
  // fade to black at the very end
  P.style.opacity = 1;
}

// ---------- taps ----------
const tapEls = TAPS.map(() => { const d = document.createElement('div'); d.className = 'abs'; d.innerHTML = '<div class="tap"></div><div class="tap"></div>'; $('taps').appendChild(d); return d; });
function drawTaps(t, c) {
  TAPS.forEach(([tt, x, y], i) => {
    const d = tapEls[i]; const dt = t - tt;
    if (dt < -0.18 || dt > 0.75) { d.style.display = 'none'; return; }
    d.style.display = 'block'; const [ox, oy] = toOut(c, x, y);
    const [dot, ring] = d.children;
    const pre = seg(t, tt - 0.18, tt, E.outCubic), post = seg(t, tt, tt + 0.55, E.outCubic);
    const r = 44 * (1 - 0.18 * seg(t, tt - 0.06, tt, E.lin) + 0.18 * seg(t, tt, tt + 0.12, E.outCubic));
    const a = pre * (1 - seg(t, tt + 0.25, tt + 0.6, E.lin));
    Object.assign(dot.style, { left: ox - r + 'px', top: oy - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px', background: `rgba(255,255,255,${0.45 * a})`, boxShadow: `0 0 0 3px rgba(255,255,255,${0.9 * a}), 0 6px 24px rgba(0,0,0,${0.35 * a})` });
    const rr = 44 + 90 * post; const ra = dt > 0 ? (1 - post) * 0.9 : 0;
    Object.assign(ring.style, { left: ox - rr + 'px', top: oy - rr + 'px', width: 2 * rr + 'px', height: 2 * rr + 'px', boxShadow: `0 0 0 ${3 + 3 * (1 - post)}px rgba(207,255,85,${ra})` });
  });
}

// ---------- stars burst near the part's stars ----------
const burst = document.createElement('div'); burst.className = 'abs'; $('taps').appendChild(burst);
const SPARKS = Array.from({ length: 14 }, (_, i) => { const s = document.createElement('div'); s.textContent = '★'; s.style.cssText = 'position:absolute;color:#CFFF55;font-family:DejaVu Sans;font-size:34px;text-shadow:0 0 14px rgba(207,255,85,.8)'; burst.appendChild(s); return { s, ang: i / 14 * Math.PI * 2 + (i % 3) * 0.2, d: 120 + (i % 4) * 45 }; });
function drawBurst(t, c) {
  const t0 = 13.0, k = seg(t, t0, t0 + 0.9, E.outExpo);
  if (t < t0 || t > t0 + 0.95) { burst.style.display = 'none'; return; }
  burst.style.display = 'block'; const [ox, oy] = toOut(c, 163, 560);
  SPARKS.forEach(({ s, ang, d }) => { const x = ox + Math.cos(ang) * d * k, y = oy + Math.sin(ang) * d * k; s.style.left = x - 12 + 'px'; s.style.top = y - 20 + 'px'; s.style.opacity = 1 - seg(t, t0 + 0.45, t0 + 0.95); s.style.transform = `scale(${1.3 - 0.7 * k})`; });
}

// ---------- main ----------
const imgs = { scr: $('scr'), reel: $('reelImg'), full: $('fullImg') };
async function setSrc(img, src) { if (img.getAttribute('src') !== src) { img.src = src; try { await img.decode(); } catch (e) {} } }
window.renderFrame = async function (t) {
  drawBg(t);
  const c = cam(t);
  // phone
  const phoneVis = t >= 2.6 && t < 14.75 && !(t >= 9.96 && t < 10.58);
  $('cam').style.display = phoneVis ? 'block' : 'none';
  if (phoneVis) {
    const morphIn = seg(t, 2.95, 3.35, E.outCubic);
    $('cam').style.transform = `translate(${540 + c.dx - c.cx * c.z}px, ${c.Y0 - c.cy * c.z}px) scale(${c.z})`;
    $('phone').style.transform = `perspective(1600px) rotateY(${c.ry}deg) rotateX(${c.rx}deg)`;
    $('bezel').style.opacity = morphIn; $('island').style.opacity = morphIn;
    await setSrc(imgs.scr, screenSrc(t));
  }
  // reels morph into the screen (2.6–3.45)
  const rb = $('reelBox');
  if (t < 3.45) {
    rb.style.display = 'block';
    const k = seg(t, 2.6, 3.25, E.inOutQuart);
    const [sx, sy] = toOut(WIDE, 0, 0); const sw = 393 * WIDE.z, sh = 852 * WIDE.z;
    const x = lerp(0, sx, k), y = lerp(0, sy, k), w = lerp(1080, sw, k), h = lerp(1920, sh, k);
    Object.assign(rb.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', borderRadius: (50 * WIDE.z * k) + 'px', opacity: 1 - seg(t, 3.18, 3.45, E.inOutSine) });
    const s = Math.max(w / 1080, h / 1920), push = 1.0 + 0.07 * seg(t, 0, 2.6, E.outCubic);
    const iw = 1080 * s * push, ih = 1920 * s * push;
    Object.assign(imgs.reel.style, { width: iw + 'px', height: ih + 'px', left: (w - iw) / 2 + 'px', top: (h - ih) / 2 + 'px' });
    await setSrc(imgs.reel, reelSrc(t));
  } else rb.style.display = 'none';
  // full-bleed reels: drop insert and finale
  const fullOn = (t >= 9.96 && t < 10.58) || t >= 14.45;
  $('full').style.display = fullOn ? 'block' : 'none';
  if (fullOn) {
    let sc = 1, op = 1, blur = 0, bright = 1;
    if (t < 10.58) sc = 1.14 - 0.14 * seg(t, 9.96, 10.4, E.outExpo);
    else { op = seg(t, 14.45, 14.62, E.lin); sc = 1.3 - 0.27 * seg(t, 14.45, 15.2, E.outExpo) + 0.05 * seg(t, 15.2, 19.29, E.lin);
      const pk = seg(t, 19.29, 19.8, E.outCubic); blur = 26 * pk; bright = 1 - 0.68 * pk; }
    imgs.full.style.transform = `scale(${sc})`; imgs.full.style.opacity = op; imgs.full.style.filter = blur ? `blur(${blur}px) brightness(${bright})` : 'none';
    await setSrc(imgs.full, reelSrc(Math.min(t, 20.25)));
  }
  // scrim: under the titles, not during the packshot
  let sOp = 0.95;
  if (t >= 2.6 && t < 3.0) sOp = 0.95 - 0.35 * seg(t, 2.6, 3.0);
  if (t >= 19.29) sOp = 0.95 * (1 - seg(t, 19.29, 19.6));
  $('scrim').style.opacity = sOp;
  drawTaps(t, c); drawBurst(t, c); drawTitles(t); drawPack(t);
  // flashes on the drop and back
  const fl = Math.max(0.9 * (1 - seg(t, 9.96, 10.14, E.outCubic)) * (t >= 9.96 ? 1 : 0), 0.55 * (1 - seg(t, 10.58, 10.72, E.outCubic)) * (t >= 10.58 ? 1 : 0));
  $('flash').style.opacity = fl;
  // end fade to black
  $('stage').style.filter = t > 23.0 ? `brightness(${1 - seg(t, 23.0, 23.6)})` : 'none';
};
// motion-blur sub-frames: how many samples this frame needs
window.samplesAt = function (t) {
  const W = [[3.95, 4.27], [5.55, 5.92], [7.5, 7.82], [12.05, 12.37], [14.06, 14.7], [9.96, 10.2], [10.58, 10.78], [2.62, 3.25], [13.45, 13.75]];
  return W.some(([a, b]) => t >= a && t < b) ? 10 : 1;
};
window.ready = document.fonts.ready.then(() => true);
