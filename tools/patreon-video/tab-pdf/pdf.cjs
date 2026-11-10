const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 794, height: 1123 } });
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type()==='error') console.log('CERR', m.text()); });
  await p.goto('http://localhost:8766/card2.html'); console.log(JSON.stringify(await p.evaluate(() => window.ready)));
  await p.pdf({ path: 'iron-man-tab.pdf', width: '210mm', height: '297mm', printBackground: true });
  const n = await p.evaluate(() => document.querySelectorAll('.page').length);
  for (let i = 0; i < n; i++) { const el = (await p.$$('.page'))[i]; await el.screenshot({ path: `pg${i+1}.png` }); }
  await b.close();
})();
