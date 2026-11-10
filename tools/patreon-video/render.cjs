const { chromium } = require('playwright');
const [mode, n0, n1, dir] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('http://localhost:8765/comp.html'); await p.evaluate(() => window.ready);
  for (let n = n0; n < n1; n++) {
    await p.evaluate(([m, t]) => window.frame(m, t), [mode, n / 30]);
    await p.screenshot({ path: `${dir}/${String(n).padStart(5, '0')}.png`, omitBackground: true });
    if (n % 200 === 0) console.log(mode, n);
  }
  await b.close();
})();
