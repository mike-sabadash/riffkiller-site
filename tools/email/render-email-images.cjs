/**
 * Builds the pictures every Riff Killer email uses (config/email-layout.php) from assets/logo.svg:
 *   assets/email/header-2.png  600×132 at 2× (header.png: first version, violet dot): black band, rounded top corners, the wordmark, technique callouts
 *   assets/email/logo.png    the wordmark, white, 112 px wide at 3×
 * Run after changing the logo or the look: node tools/email/render-email-images.cjs, then raise RK_EMAIL_V.
 */
const path=require('path');const fs=require('fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const logo='data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'assets/logo.svg')).toString('base64');
const inter=fs.readFileSync(path.join(root,'assets/fonts/inter-latin-opsz-normal.woff2')).toString('base64');
const font=`@font-face{font-family:Inter;src:url(data:font/woff2;base64,${inter}) format('woff2');font-weight:100 900}`;
// Strings 1–6 across the right half, frets fading in from the logo side; three callouts like Mike's Patreon banner.
const strings=[0,1,2,3,4,5].map(i=>`<div class="s" style="top:${30+i*14.4}px;opacity:${0.16+i*0.03}"></div>`).join('');
const frets=[0,1,2,3,4,5,6].map(i=>`<div class="f" style="left:${300+i*46}px"></div>`).join('');
const call=(x,y,lx,ly,label,accent)=>`<svg class="ln" width="600" height="132"><line x1="${x}" y1="${y}" x2="${lx}" y2="${ly}" stroke="rgba(255,255,255,.55)" stroke-width="1"/></svg>`+
  `<div class="dot${accent?' a':''}" style="left:${x-5}px;top:${y-5}px"></div><div class="lab${accent?' a':''}" style="left:${lx}px;top:${ly-11}px">${label}</div>`;
const header=`<!doctype html><html><head><style>${font}
html,body{margin:0;background:transparent}
.h{position:relative;width:600px;height:132px;background:#0B0B0E;border-radius:18px 18px 0 0;overflow:hidden;font-family:Inter,sans-serif}
.board{position:absolute;inset:0;-webkit-mask-image:linear-gradient(90deg,transparent 0,transparent 270px,#000 420px);mask-image:linear-gradient(90deg,transparent 0,transparent 270px,#000 420px)}
.s{position:absolute;left:0;right:0;height:1px;background:#fff}
.f{position:absolute;top:24px;height:86px;width:2px;background:rgba(255,255,255,.09)}
.logo{position:absolute;left:48px;top:55px;width:176px;height:auto}
.ln{position:absolute;left:0;top:0}
.dot{position:absolute;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px #0B0B0E}
.dot.a{background:#FFD23F}
.lab.a{background:#FFD23F}
.lab{position:absolute;height:22px;padding:0 8px;line-height:22px;background:#fff;color:#0B0B0E;font-size:11px;font-weight:700;letter-spacing:.2px;white-space:nowrap;border-radius:2px}
</style></head><body><div class="h"><div class="board">${strings}${frets}</div>
${call(392,44,330,14+9,'Palm mute')}${call(486,87,410,118-9,'Slide down',true)}${call(546,58,500,20+9,'Hammer-on')}
<img class="logo" src="${logo}"></div></body></html>`;
(async()=>{
    const b=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||undefined,args:['--no-sandbox']});
    const p=await b.newPage({viewport:{width:600,height:132},deviceScaleFactor:2});
    await p.setContent(header);await p.evaluate(()=>document.fonts.ready);
    await p.locator('.h').screenshot({path:path.join(root,'assets/email/header-2.png'),omitBackground:true});
    const q=await b.newPage({viewport:{width:112,height:14},deviceScaleFactor:3});
    await q.setContent(`<html><body style="margin:0;background:transparent"><img src="${logo}" style="display:block;width:112px"></body></html>`);
    await q.locator('img').screenshot({path:path.join(root,'assets/email/logo.png'),omitBackground:true});
    await b.close();console.log('assets/email/header-2.png, assets/email/logo.png');
})();
