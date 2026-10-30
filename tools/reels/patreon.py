#!/usr/bin/env python3
"""Patreon pack for one lick, made alongside the Reels video:
  - <name>-card.pdf   printable tab card (A4, white, engraved-style tab)
  - <name>-cover.png  post cover 1920x1080 (frame from the video + type)
  - <name>-post.md    post title and text

  python3 tools/reels/patreon.py --tab lick.tab.txt --timings lick.timings.json \
      --meta lick.lick.json --video lick.mov --out-dir out/ --name blues-lick-01
"""
import argparse, html, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from reels import parse_tab  # noqa: E402

FONTS = f"""
@font-face {{ font-family: 'Inter'; font-weight: 100 900; src: url('file://{REPO}/assets/fonts/inter-latin-opsz-normal.woff2') format('woff2'); }}
@font-face {{ font-family: 'Zen Dots'; src: url('file://{REPO}/assets/fonts/zen-dots-latin-400-normal.woff2') format('woff2'); }}
"""


def bend_amounts(timings):
    amt = {}
    for tk in timings.get('takes', []):
        for at in tk.get('atoms', []):
            if at['kind'] == 'bend':
                amt.setdefault(at['note'], at['amount'])
    return amt


def tab_svg(names, events, amounts, width, ink='#111', soft='#9a9a9a', paper='#fff', gap=15.0,
            parts=None, font=13.0, label_names=True):
    """Engraved-style tab as SVG: TAB clef, six lines, knocked-out numbers, bend curves with
    the amount, release curves, optional part brackets with numbers above."""
    n = len(events)
    left = 46.0 if label_names else 30.0
    right = 10.0
    top = (40.0 if parts else 12.0) + gap * 2.4  # room for part brackets and bend labels
    ys = [top + i * gap for i in range(len(names))]
    h = ys[-1] + 22
    weights = [1.0 + (0.6 if events[i]['bend'] else 0.0) for i in range(n - 1)]
    unit = (width - left - right - 30) / sum(weights)
    xs = [left + 14]
    for w in weights:
        xs.append(xs[-1] + w * unit)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{h}" viewBox="0 0 {width} {h}">']
    # staff
    for y in ys:
        out.append(f'<line x1="{left - 6}" y1="{y}" x2="{width - right}" y2="{y}" stroke="{ink}" stroke-width="0.6"/>')
    out.append(f'<line x1="{left - 6}" y1="{ys[0]}" x2="{left - 6}" y2="{ys[-1]}" stroke="{ink}" stroke-width="1.4"/>')
    out.append(f'<line x1="{width - right}" y1="{ys[0]}" x2="{width - right}" y2="{ys[-1]}" stroke="{ink}" stroke-width="1.4"/>')
    # TAB clef
    mid = (ys[0] + ys[-1]) / 2
    for j, ch in enumerate('TAB'):
        out.append(f'<text x="{left - 22 if label_names else left - 18}" y="{mid - gap * 1.25 + j * gap * 1.25 + 4.5}" '
                   f'font-family="Inter" font-weight="800" font-size="{gap * 0.95:.1f}" fill="{ink}" text-anchor="middle">{ch}</text>')
    if label_names:
        for i, nm in enumerate(names):
            out.append(f'<text x="{left - 40}" y="{ys[i] + 3.5}" font-family="Inter" font-weight="500" font-size="9" '
                       f'fill="{soft}" text-anchor="middle">{nm.upper()}</text>')
    # part brackets
    if parts:
        for p_i, p in enumerate(parts):
            a, b = xs[p['from'] - 1] - 8, xs[p['to'] - 1] + 8
            yb = 12
            out.append(f'<path d="M{a} {yb + 6} V{yb} H{b} V{yb + 6}" fill="none" stroke="{soft}" stroke-width="0.8"/>')
            out.append(f'<text x="{a + 2}" y="{yb - 4}" font-family="Inter" font-weight="600" font-size="8.5" '
                       f'letter-spacing="1.2" fill="{soft}">{p_i + 1} · {html.escape(p["title"].upper())}</text>')
    # bends / releases
    tip_y = ys[0] - gap * 1.6
    tips = {}
    for i, ev in enumerate(events):
        if ev['bend'] and len(ev['notes']) == 1:
            s = ev['notes'][0][0]
            x0, y0 = xs[i] + font * 0.42, ys[s] - 3
            tip = (xs[i] + 0.8 * unit, tip_y)
            tips[i] = tip
            out.append(f'<path d="M{x0} {y0} Q{tip[0]} {y0} {tip[0]} {tip[1] + 4}" fill="none" stroke="{ink}" stroke-width="0.9"/>')
            out.append(f'<path d="M{tip[0]} {tip[1]} l-3 5 h6 z" fill="{ink}"/>')
            if amounts.get(i):
                out.append(f'<text x="{tip[0]}" y="{tip[1] - 4}" font-family="Inter" font-weight="500" font-size="9" '
                           f'fill="{ink}" text-anchor="middle">{amounts[i]}</text>')
        elif i - 1 in tips and ev['legato'] and ev['notes'][0][0] == events[i - 1]['notes'][0][0]:
            t0 = tips[i - 1]
            s = ev['notes'][0][0]
            x1, y1 = xs[i] + font * 0.15, ys[s] - font * 0.75
            out.append(f'<path d="M{t0[0] + 2} {t0[1] + 3} Q{x1} {t0[1] + 3} {x1} {y1 - 4}" fill="none" stroke="{ink}" '
                       f'stroke-width="0.9"/>')
            out.append(f'<path d="M{x1} {y1} l-3 -5 h6 z" fill="{ink}"/>')
    # numbers (knocked out of the lines)
    for i, ev in enumerate(events):
        for s, lab in ev['notes']:
            num = re.match(r'\d+', lab).group(0)
            w = font * 0.62 * len(num) + 3
            out.append(f'<rect x="{xs[i] - w / 2}" y="{ys[s] - font * 0.55}" width="{w}" height="{font * 1.1}" fill="{paper}"/>')
            out.append(f'<text x="{xs[i]}" y="{ys[s] + font * 0.36}" font-family="Inter" font-weight="600" '
                       f'font-size="{font}" fill="{ink}" text-anchor="middle" font-feature-settings="\'tnum\'">{num}</text>')
    out.append('</svg>')
    return '\n'.join(out), h


def card_html(meta, svg):
    tech = ' · '.join(meta.get('techniques', []))
    parts = ''.join(f'<li><b>{i + 1} · {html.escape(p["title"])}</b><span class="rng">notes {p["from"]}–{p["to"]}</span>'
                    f'<p>{html.escape(p["text"])}</p></li>' for i, p in enumerate(meta.get('parts', [])))
    tips = ''.join(f'<li>{html.escape(t)}</li>' for t in meta.get('practice', []))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{FONTS}
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 210mm; height: 297mm; background: #fff; color: #111; font-family: 'Inter', sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.page {{ position: relative; height: 297mm; padding: 18mm 20mm 16mm; display: flex; flex-direction: column; }}
.top {{ display: flex; justify-content: space-between; align-items: center; }}
.logo {{ font-family: 'Zen Dots'; font-size: 11pt; letter-spacing: .06em; }}
.logo i {{ font-style: normal; color: #9a9a9a; }}
.no {{ font-size: 8pt; letter-spacing: .28em; text-transform: uppercase; color: #777; font-weight: 600; }}
.series {{ margin-top: 22mm; font-size: 8.5pt; letter-spacing: .34em; text-transform: uppercase; color: #777; font-weight: 600; }}
h1 {{ margin-top: 20mm; font-size: 46pt; line-height: .98; font-weight: 700; letter-spacing: -.03em; max-width: 140mm; }}
.sub {{ margin-top: 5mm; font-size: 15pt; color: #444; letter-spacing: -.005em; }}
.sub b {{ font-weight: 600; color: #111; }}
.meta {{ margin-top: 7mm; display: flex; gap: 9mm; font-size: 8.5pt; color: #555; }}
.meta b {{ display: block; font-size: 7pt; letter-spacing: .22em; text-transform: uppercase; color: #9a9a9a; font-weight: 600; margin-bottom: 1.2mm; }}
.rule {{ margin-top: 10mm; height: 0; border-top: .6pt solid #111; }}
.tab {{ margin-top: 9mm; }}
.cols {{ margin-top: 11mm; display: grid; grid-template-columns: 1.15fr 1fr; gap: 12mm; }}
h2 {{ font-size: 7pt; letter-spacing: .3em; text-transform: uppercase; color: #9a9a9a; font-weight: 600; margin-bottom: 4mm; }}
ol.parts {{ list-style: none; }}
ol.parts li {{ padding: 3mm 0; border-top: .4pt solid #ddd; }}
ol.parts li:first-child {{ border-top: 0; padding-top: 0; }}
ol.parts b {{ font-size: 9.5pt; font-weight: 600; }}
.rng {{ float: right; font-size: 7.5pt; color: #9a9a9a; letter-spacing: .06em; }}
ol.parts p {{ margin-top: 1.2mm; font-size: 8.5pt; line-height: 1.45; color: #444; }}
ol.tips {{ padding-left: 4.2mm; font-size: 8.5pt; line-height: 1.45; color: #444; }}
ol.tips li {{ margin-bottom: 2.2mm; padding-left: 1mm; }}
ol.tips li::marker {{ color: #9a9a9a; font-weight: 600; }}
.foot {{ margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; font-size: 7.5pt; color: #9a9a9a; letter-spacing: .04em; }}
.foot .logo {{ font-size: 9pt; color: #111; }}
</style></head><body><div class="page">
<div class="top"><div class="logo">RIFF <i>DNA</i></div><div class="no">{meta.get('tagline_short', 'Understand its DNA')}</div></div>
<h1>{html.escape(meta['series'])}</h1>
<div class="sub">{html.escape(meta['name'])}</div>
<div class="meta"><div><b>Key</b>{html.escape(meta.get('key', ''))}</div><div><b>Position</b>{html.escape(meta.get('position', ''))}</div><div><b>Techniques</b>{html.escape(tech)}</div></div>
<div class="rule"></div>
<div class="tab">{svg}</div>
<div class="cols"><div><h2>Split</h2><ol class="parts">{parts}</ol></div><div><h2>Practice</h2><ol class="tips">{tips}</ol></div></div>
<div class="foot"><div>Watch it played: full speed, then slow — in the post video.</div><div>riffkiller.fun</div></div>
</div></body></html>"""


def cover_html(meta, frame_path, svg, style='paper'):
    """Post cover 1920x1080. Clean split, no gradients: the photo is a crisp block, type sits on a
    flat colour. style: 'paper' (white, like the PDF card), 'ink' (black), 'mono' (black, b/w photo)."""
    dark = style != 'paper'
    bg = '#0b0b0d' if dark else '#ffffff'
    fg = '#ffffff' if dark else '#111111'
    soft = 'rgba(255,255,255,.55)' if dark else '#8a8a8a'
    accent = '#b8f05a' if dark else '#111111'
    photo_filter = 'grayscale(1) contrast(1.08) brightness(.95)' if style == 'mono' else 'saturate(.9) contrast(1.04)'
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{FONTS}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 1920px; height: 1080px; background: {bg}; color: {fg}; font-family: 'Inter', sans-serif; overflow: hidden; }}
.wrap {{ width: 1920px; height: 1080px; display: grid; grid-template-columns: 820px 1fr; }}
.shot {{ background: url('file://{frame_path}') 38% 46% / 175% auto no-repeat; filter: {photo_filter}; }}
.txt {{ padding: 96px 110px 100px 100px; display: flex; flex-direction: column; }}
.row {{ display: flex; justify-content: space-between; align-items: baseline; }}
.tag {{ position: absolute; top: 0; right: 0; width: 560px; height: 300px; background: #b8f05a; color: #0b0b0d;
  padding: 0 56px 46px; display: flex; align-items: flex-end; font-size: 38px; line-height: 1.08;
  font-weight: 600; letter-spacing: -.02em; }}
.wrap {{ position: relative; }}
.logo {{ font-family: 'Zen Dots'; font-size: 28px; letter-spacing: .06em; }}
.logo i {{ font-style: normal; color: {soft}; }}
.no {{ font-size: 20px; letter-spacing: .32em; text-transform: uppercase; color: {soft}; font-weight: 600; }}
h1 {{ margin-top: auto; font-size: 118px; line-height: .93; font-weight: 700; letter-spacing: -.04em; }}
.name {{ margin-top: 30px; font-size: 34px; letter-spacing: -.01em; color: {soft}; }}
.name b {{ color: {accent}; font-weight: 600; }}
.tab {{ margin-top: 64px; }}
</style></head><body><div class="wrap"><div class="shot"></div><div class="txt">
<div class="row"><div class="logo">RIFF <i>DNA</i></div></div>
<div class="tag">{meta.get('tagline', 'Don’t just learn the riff.<br>Understand its DNA.')}</div>
<h1>{html.escape(meta['series'])}</h1>
<div class="name">{html.escape(meta['name'])}</div>
<div class="tab">{svg}</div>
</div></div></body></html>"""


def best_frame(video, timings, events, out_png):
    """A frame from the slow take, at its first bend (hand on the neck, something happening)."""
    takes = timings['takes']
    slow = max(takes, key=lambda tk: tk['end'] - tk['start'])
    t = slow['times'][0]
    for i, ev in enumerate(events):
        if ev['bend']:
            t = slow['times'][i] + 0.25
            break
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', video, '-frames:v', '1', out_png], check=True)


def render(html_text, out, kind):
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(html_text)
        page_path = f.name
    js = f"""
const {{chromium}} = require('playwright');
(async () => {{
  const b = await chromium.launch();
  const p = await b.newPage({{viewport: {{width: {1920 if kind == 'png' else 794}, height: {1080 if kind == 'png' else 1123}}}}});
  await p.goto('file://{page_path}');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(200);
  {"await p.screenshot({path: '" + out + "'});" if kind == 'png' else "await p.pdf({path: '" + out + "', format: 'A4', printBackground: true});"}
  await b.close();
}})();"""
    subprocess.run(['node', '-e', js], check=True)
    os.unlink(page_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--tab', required=True)
    ap.add_argument('--timings', required=True, help='timings JSON from reels.py (bend amounts come from it)')
    ap.add_argument('--meta', required=True, help='lick JSON: series, number, name, key, parts, practice, post')
    ap.add_argument('--video', required=True)
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--cover-style', default='paper', choices=['paper', 'ink', 'mono'])
    ap.add_argument('--name', required=True, help='file name prefix, e.g. blues-lick-01')
    a = ap.parse_args()

    names, events = parse_tab(open(a.tab, encoding='utf-8').read())
    timings = json.load(open(a.timings))
    meta = json.load(open(a.meta, encoding='utf-8'))
    amounts = bend_amounts(timings)
    os.makedirs(a.out_dir, exist_ok=True)
    base = os.path.join(os.path.abspath(a.out_dir), a.name)

    svg, _ = tab_svg(names, events, amounts, 643, parts=meta.get('parts'), gap=17, font=14, label_names=False)
    render(card_html(meta, svg), base + '-card.pdf', 'pdf')

    frame = base + '-frame.png'
    best_frame(a.video, timings, events, frame)
    dark = a.cover_style != 'paper'
    svg_c, _ = tab_svg(names, events, amounts, 890, ink='#fff' if dark else '#111', soft='#888',
                       paper='#0b0b0d' if dark else '#fff', gap=22, font=19, label_names=False)
    svg_c = svg_c.replace('font-size="9"', 'font-size="15"').replace('stroke-width="0.6"', 'stroke-width="1"') \
                 .replace('stroke-width="0.9"', 'stroke-width="1.5"').replace('l-3 5 h6 z', 'l-4.5 7 h9 z') \
                 .replace('l-3 -5 h6 z', 'l-4.5 -7 h9 z')
    render(cover_html(meta, frame, svg_c, a.cover_style), base + '-cover.png', 'png')
    os.unlink(frame)

    post = meta.get('post', {})
    with open(base + '-post.md', 'w', encoding='utf-8') as f:
        f.write(post.get('title', '') + '\n\n' + '\n\n'.join(post.get('body', [])) + '\n')
    print('\n'.join([base + '-card.pdf', base + '-cover.png', base + '-post.md']))


if __name__ == '__main__':
    main()
