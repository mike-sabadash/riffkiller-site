const { open } = require('./rec.cjs');
const fs = require('fs');
const which = process.argv[2];
(async () => {
  const r = await open({ init: () => { try { localStorage.setItem('rkPracticeTourSeen2', '1'); localStorage.setItem('rkSpeedTrainerIntroSeen', '1'); } catch (e) {} } });
  const p = r.page; let taps = [];
  const tap = async (sel, label) => {
    const el = p.locator(sel).first();
    const b = await el.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
    taps.push({ t: Date.now() / 1000, x, y, w: b.width, h: b.height, label }); await p.touchscreen.tap(x, y);
  };
  const W = ms => p.waitForTimeout(ms);
  const save = name => fs.writeFileSync(`raw/${name}/taps.json`, JSON.stringify(taps));
  await p.goto('https://riffkiller.fun/practice.html?riff=9', { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => /cameras ready/i.test(document.body.innerText), null, { timeout: 120000 });
  await p.evaluate(() => window.scrollTo(0, 0)); await W(1000);
  // warm up Split so it does not show "Preparing" on camera
  await tap('text=Split >> nth=0', 'warm'); await p.waitForFunction(() => !/Preparing Split/i.test(document.body.innerText), null, { timeout: 90000 }); await W(500);
  await tap('text=Left >> nth=0', 'warm'); await W(800);
  if (which === 'm3' || which === 'm2') {
    await r.start(which); taps = []; await W(1200);
    await tap('.segment-btn:not(.all-riff) >> nth=0', 'part1'); await W(5500);
    await tap('text=×0.5 >> nth=0', 'x05'); await W(5000);
    await tap('text=Split >> nth=0', 'split'); await W(5000);
    await tap('#toggleTabs', 'tabs'); await W(150);
    await p.evaluate(() => window.scrollTo(0, 0)); await W(6500);
    // also all elements' boxes for camera targeting
    await r.stop(); save(which);
    const boxes = await p.evaluate(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; };
      return { video: q('.video-container') || q('video'), tabs: q('#tabStrip') || q('.tab-strip'), speed: q('.speed-controls'), parts: q('.practice-parts'), hand: q('.hand-controls') }; });
    fs.writeFileSync('raw/' + which + '/boxes.json', JSON.stringify(boxes)); console.log(boxes);
  }
  if (which === 't3') {
    await tap('text=Split >> nth=0', 'warm'); await W(500);
    await p.evaluate(() => window.scrollTo(0, 190)); await W(800);
    await r.start('t3'); taps = []; await W(1000);
    await tap('.segment-btn:not(.all-riff) >> nth=0', 'part1'); await W(700);
    await tap('#modeSpeedBtn', 'trainer');
    await p.waitForSelector('#progressCleanYes', { timeout: 120000 }); await W(1800);
    await tap('#progressCleanYes', 'yes'); await W(4000);
    await r.stop(); save('t3');
  }
  await r.browser.close();
})();
