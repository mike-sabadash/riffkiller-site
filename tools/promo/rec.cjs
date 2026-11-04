// Records a page: CDP screencast frames (JPEG, wall-clock timestamps) + PulseAudio monitor to WAV.
const DPR = Number(process.env.DPR || 3);
const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
async function open(opts = {}) {
  const browser = await chromium.launch({ headless: !!process.env.HL, channel: process.env.HL ? 'chromium' : undefined, args: ['--autoplay-policy=no-user-gesture-required', '--window-size=500,1000', '--force-device-scale-factor=' + DPR], env: { ...process.env, DISPLAY: ':99', PULSE_SINK: 'rec' } });
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 }, deviceScaleFactor: DPR });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 160)); });
  page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 160)));
  const cdp = await ctx.newCDPSession(page);
  let dir = null, frames = [], ff = null, t0 = 0;
  cdp.on('Page.screencastFrame', async f => {
    if (dir) { const i = frames.length; const fn = path.join(dir, `f${String(i).padStart(6, '0')}.jpg`); fs.writeFileSync(fn, Buffer.from(f.data, 'base64')); frames.push({ fn, ts: f.metadata.timestamp }); }
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {}
  });
  async function start(name) {
    dir = path.join(__dirname, 'raw', name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); frames = [];
    ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'pulse', '-i', 'rec.monitor', '-ac', '2', '-ar', '48000', path.join(dir, 'audio.wav')]);
    t0 = Date.now() / 1000;
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1, maxWidth: 393 * DPR, maxHeight: 852 * DPR });
  }
  async function stop() {
    await cdp.send('Page.stopScreencast'); const d = dir; dir = null;
    ff.kill('SIGINT'); await new Promise(r => ff.on('close', r));
    fs.writeFileSync(path.join(d, 'frames.json'), JSON.stringify({ t0, frames }));
    console.log('recorded', d, frames.length, 'frames', frames.length ? (frames.at(-1).ts - frames[0].ts).toFixed(1) + 's' : '');
  }
  return { browser, ctx, page, start, stop };
}
module.exports = { open };
