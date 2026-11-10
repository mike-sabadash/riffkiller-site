// node render2.cjs <scale> <dir> '<json [[mode, n0, n1, opts]]>'  — frame n -> t = n/30, file n.png
const { chromium } = require('playwright');
const [scale, dir, jobs] = [+process.argv[2], process.argv[3], JSON.parse(process.argv[4])];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8765/comp.html'); await p.evaluate(() => window.ready);
  for (const [mode, n0, n1, o] of jobs) for (let n = n0; n < n1; n++) {
    await p.evaluate(([m, t, o]) => window.frame(m, t, o), [mode, n / 30, o]);
    await p.screenshot({ path: `${dir}/${String(n).padStart(5, '0')}.png`, omitBackground: true });
    if (n % 300 === 0) console.log(dir, n);
  }
  await b.close();
})();
