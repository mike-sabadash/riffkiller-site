// Riff Killer promo v4 — riff full screen first, app shown edge-to-edge (no phone mockup), black + yellow.
// Timeline TL comes from tl.js (cut points snapped to the voice-over words). renderFrame(t) draws output time t.
const $ = id => document.getElementById(id);
const FPS = 30;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  lin: x => x,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inCubic: x => x * x * x,
  inOutQuart: x => x < .5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  inOutExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  outElastic: x => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (2 * Math.PI) / 3) + 1,
};
const seg = (t, a, b, ease = E.lin) => ease(clamp((t - a) / (b - a)));
const pad = n => String(n).padStart(4, '0');
const T = window.TL;

// ---------- app camera (screen css point (cx,cy) -> output (540, Y0), zoom z) ----------
const WIDE = { cx: 196.5, cy: 426, z: 1.55, Y0: 880, ry: -8, rx: 3 };
const P = {
  wide: WIDE,
  parts: { cx: 196.5, cy: 742, z: 2.75, Y0: 760, ry: 0, rx: 0 },
  speed: { cx: 250, cy: 560, z: 2.95, Y0: 700, ry: 0, rx: 0 },
  tab: { cx: 196.5, cy: 440, z: 2.42, Y0: 680, ry: 0, rx: 0 },
  dive: { cx: 196.5, cy: 365, z: 9, Y0: 900, ry: 0, rx: 0 },
};
const FLY = 0.34;
const KEYS = [
  [T.app, P.wide, E.lin], [T.app + 0.5, P.wide, E.lin], [T.app + 0.5 + FLY, P.parts, E.inOutExpo],
  [T.slow, P.parts, E.lin], [T.slow + FLY, P.speed, E.inOutExpo],
  [T.tab, P.speed, E.lin], [T.tab + FLY, P.tab, E.inOutExpo],
  [T.full - 0.32, P.tab, E.lin], [T.full + 0.02, P.dive, E.inExpo],
];
function cam(t) {
  if (t <= KEYS[0][0]) return KEYS[0][1];
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, p1, ease] = KEYS[i], [t0, p0] = KEYS[i - 1];
    if (t <= t1) { const k = ease((t - t0) / (t1 - t0)); return { cx: lerp(p0.cx, p1.cx, k), cy: lerp(p0.cy, p1.cy, k), z: Math.exp(lerp(Math.log(p0.z), Math.log(p1.z), k)), Y0: lerp(p0.Y0, p1.Y0, k), ry: lerp(p0.ry, p1.ry, k), rx: lerp(p0.rx, p1.rx, k) }; }
  }
  return KEYS[KEYS.length - 1][1];
}
const toOut = (c, x, y) => [540 + (x - c.cx) * c.z, c.Y0 + (y - c.cy) * c.z];

// ---------- which capture is on screen, and the smooth 60 fps video over it ----------
const tapLoop = T.app + 0.5 + FLY + 0.2, tapSlow = T.slow + FLY + 0.15, tapTab = T.tab + FLY + 0.12;
function screenSrc(t) {
  if (t < T.slow + 0.17) return `fr/m3/${pad(clamp(Math.round((1.1 - (tapLoop - T.app) + t - T.app) * FPS), 0, 269))}.jpg`;
  if (t < T.tab + 0.17) return `fr/m3/${pad(clamp(Math.round((6.67 - (tapSlow - T.slow) + t - T.slow) * FPS), 0, 269))}.jpg`;
  return `fr/m2/${pad(clamp(Math.round((16.91 - (tapTab - T.tab) + t - T.tab) * FPS), 0, 709))}.jpg`;
}
const loopR = x => 0.1 + (((x - 0.1) % 2.96) + 2.96) % 2.96;
function vidState(t) {
  if (t < tapLoop) return null;
  const r = loopR(0.1 + (Math.min(t, tapSlow) - tapLoop) + Math.max(0, t - tapSlow) * 0.5);
  return { top: 262.6, split: t >= T.tab + 0.17, r };
}
const TAPS = [[tapLoop, 104, 758], [tapSlow, 350, 523], [tapTab, 304, 227]];

// ---------- titles ----------
const TITLES = [
  { in: -0.28, out: T.app - 0.22, y: 1480, size: 128, lines: [{ text: 'Want to play' }, { text: 'this riff?', hl: true }] },
  { in: T.app + 0.5, out: T.slow - 0.1, y: 1400, size: 128, lines: [{ text: 'Loop' }, { text: 'any part', hl: true }] },
  { in: T.slow + 0.1, out: T.tab - 0.1, y: 1400, size: 128, lines: [{ text: 'Slow it' }, { text: 'down', hl: true }] },
  { in: T.tab + 0.1, out: T.full - 0.32, y: 1400, size: 128, lines: [{ text: 'Follow' }, { text: 'the tab', hl: true }] },
  { in: T.full + 0.12, out: T.kill - 0.12, y: 1600, size: 128, lines: [{ text: 'At full speed' }], ladder: true, stars: true },
  { in: T.kill, out: T.pack - 0.08, y: 1330, size: 168, lines: [{ text: 'Kill', hl: true, size: 210 }, { text: 'every riff' }] },
];
const titleEls = TITLES.map(Ti => {
  const root = document.createElement('div'); root.className = 'abs'; $('titles').appendChild(root);
  const els = []; const sizes = Ti.lines.map(l => l.size || Ti.size); const lh = sizes.map(s => s * 1.0);
  const total = lh.reduce((a, b) => a + b, 0) + (Ti.lines.length - 1) * 4; let top = Ti.y - total / 2;
  Ti.lines.forEach((L, i) => {
    const line = document.createElement('div'); line.className = 'line'; line.style.top = top + 'px'; line.style.height = (lh[i] + 8) + 'px';
    const sp = document.createElement('span'); sp.style.fontSize = sizes[i] + 'px'; if (L.sub) sp.classList.add('sub'); sp.textContent = L.text;
    let hl = null; if (L.hl) { hl = document.createElement('i'); hl.className = 'hl'; sp.style.color = '#0a0a0a'; sp.appendChild(hl); }
    line.appendChild(sp); root.appendChild(line); els.push({ sp, hl, L, i }); top += lh[i] + 4;
  });
  const extra = {};
  if (Ti.ladder) {
    const row = document.createElement('div'); row.style.cssText = `position:absolute;left:0;width:1080px;top:${Ti.y - 250}px;display:flex;justify-content:center;gap:22px`;
    extra.chips = ['×0.5', '×0.75', '×1'].map(s => { const c = document.createElement('div'); c.textContent = s;
      c.style.cssText = 'font-weight:900;font-size:84px;padding:12px 30px;background:rgba(20,20,20,.75);color:#9a9a9a;letter-spacing:-.02em'; row.appendChild(c); return c; });
    root.appendChild(row);
  }
  if (Ti.stars) {
    const s = document.createElement('div'); s.textContent = '★★★'; s.style.cssText = `position:absolute;left:0;width:1080px;text-align:center;top:${Ti.y + 70}px;font-size:150px;color:#FFD400;font-family:DejaVu Sans,sans-serif;text-shadow:0 0 40px rgba(255,212,0,.5)`;
    root.appendChild(s); extra.stars = s;
  }
  return { Ti, root, els, extra };
});
function drawTitles(t) {
  for (const { Ti, root, els, extra } of titleEls) {
    const vis = t >= Ti.in - 0.01 && t < Ti.out + 0.25;
    root.style.display = vis ? 'block' : 'none'; if (!vis) continue;
    const outK = seg(t, Ti.out, Ti.out + 0.18, E.inCubic);
    els.forEach(({ sp, hl, L, i }) => {
      const tin = Ti.in + i * 0.07, k = seg(t, tin, tin + 0.5, E.outExpo);
      sp.style.transform = `translateY(${(1 - k) * 140 - outK * 145}%)`;
      if (hl) hl.style.transform = `scaleX(${seg(t, tin + 0.12, tin + 0.5, E.outExpo)})`;
    });
    if (extra.chips) {
      const beats = [Ti.in, Ti.in + 0.28, Ti.in + 0.56];
      extra.chips.forEach((c, j) => {
        const ap = seg(t, Ti.in - 0.1 + j * 0.05, Ti.in + 0.3 + j * 0.05, E.outBack);
        const on = t >= beats[j] && (j === 2 || t < beats[j + 1]);
        const pop = t >= beats[j] ? 1 + 0.2 * (1 - seg(t, beats[j], beats[j] + 0.3, E.outCubic)) : 1;
        c.style.transform = `translateY(${(1 - ap) * 60 - outK * 80}px) scale(${pop})`; c.style.opacity = ap * (1 - outK);
        c.style.background = on ? '#FFD400' : 'rgba(20,20,20,.75)'; c.style.color = on ? '#0a0a0a' : '#9a9a9a';
      });
    }
    if (extra.stars) { const k = seg(t, Ti.in + 0.62, Ti.in + 1.2, E.outElastic); extra.stars.style.transform = `scale(${0.2 + 0.8 * k})`; extra.stars.style.opacity = clamp(k * 1.5) * (1 - outK); }
  }
}

// ---------- taps ----------
const tapEls = TAPS.map(() => { const d = document.createElement('div'); d.className = 'abs'; d.innerHTML = '<div class="tap"></div><div class="tap"></div>'; $('taps').appendChild(d); return d; });
function drawTaps(t, c, appOn) {
  TAPS.forEach(([tt, x, y], i) => {
    const d = tapEls[i]; const dt = t - tt;
    if (!appOn || dt < -0.18 || dt > 0.6) { d.style.display = 'none'; return; }
    d.style.display = 'block'; const [ox, oy] = toOut(c, x, y); const [dot, ring] = d.children;
    const pre = seg(t, tt - 0.18, tt, E.outCubic), post = seg(t, tt, tt + 0.5, E.outCubic);
    const r = 46 * (1 - 0.18 * seg(t, tt - 0.06, tt) + 0.18 * seg(t, tt, tt + 0.12, E.outCubic)); const a = pre * (1 - seg(t, tt + 0.22, tt + 0.55));
    Object.assign(dot.style, { left: ox - r + 'px', top: oy - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px', background: `rgba(255,255,255,${0.45 * a})`, boxShadow: `0 0 0 3px rgba(255,255,255,${0.9 * a}), 0 6px 24px rgba(0,0,0,${0.35 * a})` });
    const rr = 46 + 90 * post, ra = dt > 0 ? (1 - post) * 0.95 : 0;
    Object.assign(ring.style, { left: ox - rr + 'px', top: oy - rr + 'px', width: 2 * rr + 'px', height: 2 * rr + 'px', boxShadow: `0 0 0 ${3 + 4 * (1 - post)}px rgba(255,212,0,${ra})` });
  });
}

// ---------- packshot (Mike's Figma layout), over the blurred band clip, never black ----------
const PK = $('pack');
PK.innerHTML = `
 <div class="card" id="cBD" style="left:72px;top:204px;width:413px;height:266px"><img src="assets/bd.png"><span class="free">FREE</span></div>
 <div class="card" id="cPA" style="left:606px;top:203px;width:414px;height:268px"><img src="assets/par.png"><span class="free">FREE</span></div>
 <img id="pLogo" src="assets/logo_big.png" style="position:absolute;left:125px;top:692px;width:845px">
 <div id="pTitle" class="line" style="top:866px;height:84px"><span style="font-size:58px;font-weight:700;letter-spacing:0;white-space:nowrap">Paranoid &amp; Black Dog</span></div>
 <div id="pFree" style="position:absolute;left:184px;top:1164px;width:712px;height:132px;background:#FFD400;display:flex;align-items:center;justify-content:center;color:#0a0a0a;font-weight:900;font-size:62px">FREE TO PRACTICE</div>
 <div id="pLink" style="position:absolute;left:0;width:1080px;top:1362px;text-align:center;font-weight:800;font-size:62px;color:#fff">Link in bio</div>`;
function drawPack(t) {
  const on = t >= T.pack; PK.style.display = on ? 'block' : 'none'; if (!on) return;
  const card = (el, t0, dir, rot) => { const k = seg(t, t0, t0 + 0.6, E.outBack); el.style.transform = `translateX(${(1 - k) * 700 * dir}px) rotate(${rot * k}deg)`; el.style.opacity = clamp(k * 2); };
  card($('cBD'), T.pack + 0.05, -1, -4); card($('cPA'), T.pack + 0.13, 1, 4);
  const lk = seg(t, T.pack, T.pack + 0.6, E.outExpo); $('pLogo').style.clipPath = `inset(0 ${100 - lk * 100}% 0 0)`; $('pLogo').style.transform = `translateY(${(1 - lk) * 30}px) scale(${1.06 - 0.06 * lk})`;
  const tk = seg(t, T.pack + 0.3, T.pack + 0.85, E.outExpo); $('pTitle').firstChild.style.transform = `translateY(${(1 - tk) * 140}%)`;
  const fk = seg(t, T.pack + 0.55, T.pack + 1.35, E.outElastic); $('pFree').style.transform = `scale(${0.6 + 0.4 * fk})`; $('pFree').style.opacity = clamp(fk * 2);
  const lnk = seg(t, T.pack + 0.85, T.pack + 1.3, E.outExpo); $('pLink').style.opacity = lnk; $('pLink').style.transform = `translateY(${(1 - lnk) * 40}px)`;
}

// ---------- main ----------
async function setSrc(img, src) { if (img.getAttribute('src') !== src) { img.src = src; try { await img.decode(); } catch (e) {} } }
window.renderFrame = async function (t) {
  $('grain').style.backgroundPosition = `${(t * 997) % 512}px ${(t * 613) % 512}px`;
  // reel (the band section of Mike's reel, real time = audio time)
  const reelOn = t < T.app + 0.2 || t >= T.full - 0.06;
  $('reel').style.display = reelOn ? 'block' : 'none';
  if (reelOn) {
    let sc, op = 1, blur = 0, br = 1;
    if (t < T.full - 0.25) { // hook: slow push, then zoom-through into the app
      const out = seg(t, T.app - 0.22, T.app + 0.2, E.inExpo);
      sc = 1.0 + 0.06 * seg(t, 0, T.app, E.outCubic) + 0.9 * out; blur = 28 * out; op = 1 - seg(t, T.app - 0.05, T.app + 0.2);
    } else { // back from the app: arrives from a push, then slow drift; packshot blurs it but keeps it bright
      const inn = seg(t, T.full - 0.06, T.full + 0.5, E.outExpo);
      sc = 1.3 - 0.3 * inn + 0.05 * seg(t, T.full + 0.5, T.end, E.lin); blur = 10 * (1 - inn); op = seg(t, T.full - 0.06, T.full + 0.04);
      const kick = t >= T.kill ? 0.06 * (1 - seg(t, T.kill, T.kill + 0.35, E.outCubic)) : 0; sc += kick;
      const pk = seg(t, T.pack - 0.05, T.pack + 0.45, E.outCubic); blur = Math.max(blur, 22 * pk); br = 1 - 0.4 * pk;
    }
    const im = $('reelImg'); im.style.transform = `scale(${sc})`; im.style.opacity = op; im.style.filter = (blur > 0.3 || br < 1) ? `blur(${blur}px) brightness(${br})` : 'none';
    await setSrc(im, `fr/rd/${pad(clamp(Math.round(t * FPS), 0, 524))}.jpg`);
  }
  // app, edge to edge
  const appOn = t >= T.app - 0.22 && t < T.full + 0.02;
  $('app').style.display = appOn ? 'block' : 'none';
  const c = cam(t);
  if (appOn) {
    const inn = seg(t, T.app - 0.22, T.app + 0.32, E.outExpo);
    const z = c.z * (1.35 - 0.35 * inn);
    $('cam').style.transform = `translate(${540 - c.cx * z}px, ${c.Y0 - c.cy * z}px) scale(${z})`;
    $('phone').style.transform = `perspective(1600px) rotateY(${c.ry}deg) rotateX(${c.rx}deg)`;
    const bl = 22 * (1 - inn); $('app').style.filter = bl > 0.3 ? `blur(${bl}px)` : 'none';
    $('app').style.opacity = seg(t, T.app - 0.22, T.app + 0.02);
    const ss = screenSrc(t); await setSrc($('scr'), ss);
    const v = vidState(t);
    $('vid').style.display = $('strip').style.display = v ? 'block' : 'none';
    if (v) {
      $('vid').style.top = v.top + 'px';
      await setSrc($('vidImg'), `fr/${v.split ? 'vs' : 'vl'}/${pad(clamp(Math.round(v.r * 60), 0, 191))}.jpg`);
      const bot = v.top + 204.2;
      Object.assign($('strip').style, { left: '15px', top: (bot - 24) + 'px', width: '363px', height: '24px' });
      Object.assign($('stripImg').style, { left: '-15px', top: -(bot - 24) + 'px' });
      await setSrc($('stripImg'), ss);
    }
  }
  $('topscrim').style.opacity = 0;
  $('botscrim').style.opacity = t < T.app ? 0.95 : (t < T.full ? 0.95 * seg(t, T.app + 0.4, T.app + 0.7) : (t < T.pack ? 0.95 : 0));
  drawTaps(t, c, appOn); drawTitles(t); drawPack(t);
  const fl = Math.max(0.6 * (1 - seg(t, T.kill, T.kill + 0.16, E.outCubic)) * (t >= T.kill ? 1 : 0), 0.5 * (1 - seg(t, T.full, T.full + 0.16, E.outCubic)) * (t >= T.full ? 1 : 0));
  $('flash').style.opacity = fl;
};
window.samplesAt = function (t) {
  const W = [[T.app - 0.25, T.app + 0.32], [T.app + 0.5, T.app + 0.5 + FLY], [T.slow, T.slow + FLY], [T.tab, T.tab + FLY], [T.full - 0.3, T.full + 0.2]];
  return W.some(([a, b]) => t >= a && t < b) ? 8 : 1;
};
window.ready = document.fonts.ready.then(() => true);
