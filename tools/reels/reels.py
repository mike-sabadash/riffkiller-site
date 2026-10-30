#!/usr/bin/env python3
"""RiffKiller Reels: a guitar video + an ASCII tab -> a 1080x1920 Reels video
with the tab on a glass panel and a cursor that follows the playing.

  python3 tools/reels/reels.py --video lick.mov --tab lick.tab.txt --out lick.mp4

Steps: parse the tab -> split the audio into takes (the phrase played several
times, e.g. fast then slow) -> find every tab note in each take by onsets and
pitch -> write <out>.timings.json -> render. To fix a note by hand, edit the
JSON and run again with --timings <json> (no analysis then).
"""
import argparse, json, math, os, re, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
W, H, FPS = 1080, 1920, 30
OPEN_MIDI = {'e': 64, 'B': 59, 'G': 55, 'D': 50, 'A': 45, 'E': 40}
LIME = (184, 240, 90)          # cursor colour from the practice page (.tab-live-cursor)

# ---------------------------------------------------------------- tab parsing
TOKEN = re.compile(r'(\d{1,2})([bhpr/\\~]*)(\d{0,2})')


def parse_tab(text):
    """Return (string_names, events). Event = {'col', 'notes': [(string, label)], 'midi': [...],
    'legato': bool, 'bend': bool}. Strings are listed top line first (high e first)."""
    lines = [l.rstrip() for l in text.splitlines() if re.match(r'^\s*[a-gA-G]\s*\|', l)]
    if len(lines) < 4:
        sys.exit('tab: need lines like  e|--0--3b--|  (one per string)')
    names, bodies = [], []
    for i, l in enumerate(lines[:6]):
        n, body = l.split('|', 1)
        n = n.strip()
        names.append('e' if (i == 0 and n.upper() == 'E') else n)
        bodies.append(body)
    if len(names) == 6:
        names[-1] = 'E'
    hits = []  # (col, string, label, midi, legato, bend)
    for s, body in enumerate(bodies):
        prev_tech = ''
        for m in TOKEN.finditer(body):
            fret, tech, target = int(m.group(1)), m.group(2), m.group(3)
            legato = any(c in prev_tech for c in 'bhp/\\r') or 'r' in tech[:1]
            label = m.group(0).replace('~', '')
            hits.append((m.start(), s, label, OPEN_MIDI.get(names[s], 40) + fret, legato, 'b' in tech))
            prev_tech = tech
    hits.sort()
    events = []
    for col, s, label, midi, legato, bend in hits:
        if events and col - events[-1]['col'] <= 1 and s not in [n[0] for n in events[-1]['notes']]:
            e = events[-1]
            e['notes'].append((s, label)); e['midi'].append(midi)
            e['legato'] = e['legato'] and legato; e['bend'] = e['bend'] or bend
        else:
            events.append({'col': col, 'notes': [(s, label)], 'midi': [midi], 'legato': legato, 'bend': bend})
    return names, events


# ------------------------------------------------------------- audio analysis
def load_audio(video, sr=22050):
    import librosa
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 'a.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-ac', '1', '-ar', str(sr), wav], check=True)
        y, _ = librosa.load(wav, sr=sr)
    return y, sr


def split_takes(rms_db, times, n_takes=None, min_gap=0.25):
    loud = rms_db[rms_db > -40]
    thr = max(-32.0, float(np.median(loud)) - 18.0) if len(loud) else -32.0
    active = rms_db > thr
    idx = np.where(active)[0]
    if not len(idx):
        sys.exit('audio: silence only')
    start, end = times[idx[0]], times[idx[-1]]
    gaps, run = [], None  # silent runs inside [start, end]
    for i in range(idx[0], idx[-1] + 1):
        if not active[i]:
            run = run if run is not None else i
        elif run is not None:
            gaps.append((times[i] - times[run], times[run], times[i])); run = None
    if n_takes:
        gaps = sorted(sorted(gaps, reverse=True)[:n_takes - 1], key=lambda g: g[1])
    else:
        gaps = [g for g in gaps if g[0] >= min_gap]
    bounds, a = [], start
    for _, g0, g1 in gaps:
        bounds.append((a, g0)); a = g1
    bounds.append((a, end))
    return [(a, b) for a, b in bounds if b - a > 0.4]


def analyse(y, sr, events, n_takes=None):
    import librosa
    hop = 256
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    t_env = librosa.times_like(env, sr=sr, hop_length=hop)
    env_n = np.clip(env / (np.percentile(env, 98) + 1e-9), 0, 1)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_db = 20 * np.log10(rms / (rms.max() + 1e-9) + 1e-9)
    f0, _, _ = librosa.pyin(y, fmin=70, fmax=1000, sr=sr, hop_length=hop, frame_length=2048)
    midi = librosa.hz_to_midi(f0)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    n = min(len(env), len(midi), chroma.shape[1], len(rms_db))
    env_n, midi, chroma, rms_db, t = env_n[:n], midi[:n], chroma[:, :n], rms_db[:n], t_env[:n]
    fr = lambda sec: int(np.clip(round(sec * sr / hop), 0, n - 1))

    onsets = librosa.onset.onset_detect(onset_envelope=env[:n], sr=sr, hop_length=hop, delta=0.03, wait=2)
    # pitch-change points (bend releases, hammer-ons and pull-offs have no pick attack)
    rm = np.where(np.isnan(midi), -1, np.round(midi)).astype(int)
    changes = [i for i in range(3, n - 3) if rm[i] > 0 and rm[i] != rm[i - 1] and len(set(rm[i:i + 3])) == 1]
    takes = split_takes(rms_db, t, n_takes)

    def window_pitch(c, nxt):
        end = t[c] + 0.13 if nxt is None else min(t[c] + 0.13, max(t[c] + 0.045, t[nxt] - 0.005))
        a, b = fr(t[c] + 0.015), fr(end)
        v = midi[a:b + 1]; v = v[~np.isnan(v)]
        cm = chroma[:, a:b + 1].mean(axis=1)
        return (float(np.median(v)) if len(v) >= 2 else None), cm / (np.linalg.norm(cm) + 1e-9)

    def pitch_score(ev, c, nxt):
        p, cm = window_pitch(c, nxt)
        tmpl = np.zeros(12)
        for m in ev['midi']:
            tmpl[m % 12] += 1; tmpl[(m + 7) % 12] += 0.25
        tmpl /= np.linalg.norm(tmpl)
        chroma_s = float(cm @ tmpl)
        if len(ev['midi']) > 1:
            return chroma_s
        s = 0.0
        if p is not None:
            d = min(abs(((p - m + 6) % 12) - 6) for m in ev['midi'])
            s = 1.0 if d < 0.5 else (0.5 if d < 1.5 and (ev['bend'] or ev['legato']) else 0.0)
            if any(abs(p - m) < 0.5 for m in ev['midi']):
                s += 0.15
        return 0.6 * s + 0.4 * chroma_s

    def align(a, b, gaps=None):
        ons = [c for c in onsets if a - 0.08 <= t[c] <= b]
        # a pitch change right after a pick attack is the same note settling, not a new one
        # (unless the jump is a real interval: fast pull-offs / hammer-ons land within 70 ms)
        chg = [c for c in changes if a <= t[c] <= b and
               (abs(rm[c] - rm[c - 1]) >= 2 or not any(0 <= t[c] - t[o] < 0.07 for o in ons))]
        cand = sorted(set(ons) | set(chg))
        merged = []
        for c in cand:
            if merged and t[c] - t[merged[-1]] < 0.025:
                if env_n[c] > env_n[merged[-1]]: merged[-1] = c
            else:
                merged.append(c)
        C = merged
        m = len(C)
        if m < len(events):
            print(f'warning: take at {a:.1f}s: {m} candidate times for {len(events)} notes', file=sys.stderr)
        strong = np.array([env_n[c] if c in set(onsets) else 0.0 for c in C])
        csum = np.concatenate([[0], np.cumsum(strong)])
        LAM, MU = 0.45, 0.6
        NEG = -1e9
        # a pitch change shortly after a pick attack inherits that attack (pitch trackers lag ~30-60 ms)
        att = [max(env_n[fr(t[c] - 0.07):c + 1]) for c in C]
        local = np.zeros((len(events), m))
        for i, ev in enumerate(events):
            w_on = 0.35 if ev['legato'] else 1.0
            for j, c in enumerate(C):
                local[i, j] = w_on * att[j] + 1.2 * pitch_score(ev, c, C[j + 1] if j + 1 < m else None)
        S = np.full((len(events), m), NEG); P = np.zeros((len(events), m), int)
        for j in range(m):
            S[0, j] = local[0, j] - LAM * csum[j]
        for i in range(1, len(events)):
            for j in range(i, m):
                best, arg = NEG, -1
                for k in range(i - 1, j):
                    if S[i - 1, k] <= NEG / 2 or t[C[j]] - t[C[k]] < 0.035:
                        continue
                    v = S[i - 1, k] - LAM * (csum[j] - csum[k + 1])
                    if gaps is not None and gaps[i - 1] > 0:
                        v -= MU * min(1.5, abs(math.log((t[C[j]] - t[C[k]]) / gaps[i - 1])))
                    if v > best: best, arg = v, k
                if arg >= 0:
                    S[i, j] = best + local[i, j]; P[i, j] = arg
        last = len(events) - 1
        j = int(np.argmax(S[last] - 0.15 * LAM * (csum[m] - csum[np.arange(m) + 1])))
        path = [j]
        for i in range(last, 0, -1):
            j = P[i, j]; path.append(j)
        path.reverse()
        times = [float(t[C[j]]) for j in path]
        ons_t = [t[o] for o in ons]
        for i, j in enumerate(path):  # pitch-change hit -> move back to its pick attack when that attack is free
            prev = times[i - 1] if i else -1
            near = [x for x in ons_t if 0 < times[i] - x < 0.07 and x > prev + 0.035]
            if near and C[j] not in ons:
                times[i] = float(max(near))
        times = [round(x, 3) for x in times]
        conf = [round(float(local[i, j]), 2) for i, j in enumerate(path)]
        return {'start': round(float(a), 3), 'end': round(float(b), 3), 'times': times, 'confidence': conf}

    # pass 1: each take on its own; pass 2: the clearest take lends its rhythm to the others
    result = [align(a, b) for a, b in takes]
    if len(result) > 1 and len(events) > 2:
        best = max(range(len(result)), key=lambda i: float(np.mean(result[i]['confidence'])))
        ref = result[best]['times']; ref_gaps = np.diff(ref)
        for ti, (a, b) in enumerate(takes):
            if ti == best: continue
            first = align(a, b)
            span = first['times'][-1] - first['times'][0]
            scale = span / (ref[-1] - ref[0]) if ref[-1] > ref[0] else 1.0
            result[ti] = align(a, b, list(ref_gaps * scale))
    return result


def default_labels(takes):
    if len(takes) == 1:
        return ['']
    durs = [tk['end'] - tk['start'] for tk in takes]
    lo = min(durs)
    return [f'Take {i + 1} · ' + ('Fast' if d < lo * 1.25 else 'Slow') for i, d in enumerate(durs)]


# ------------------------------------------------------------------ rendering
class Fonts:
    def __init__(self):
        cache = os.path.join(tempfile.gettempdir(), 'rk-reels-fonts')
        os.makedirs(cache, exist_ok=True)
        self.inter = self._ttf(cache, 'inter-latin-opsz-normal')

    @staticmethod
    def _ttf(cache, name):
        out = os.path.join(cache, name + '.ttf')
        if not os.path.exists(out):
            from fontTools.ttLib import TTFont
            f = TTFont(os.path.join(REPO, 'assets', 'fonts', name + '.woff2')); f.flavor = None; f.save(out)
        return out

    def get(self, size, wght=400):
        f = ImageFont.truetype(self.inter, size)
        try:
            f.set_variation_by_axes([min(32, max(14, size)), wght])
        except Exception:
            pass
        return f


def text_spaced(d, xy, s, font, fill, spacing, anchor='center'):
    widths = [d.textlength(ch, font=font) for ch in s]
    total = sum(widths) + spacing * (len(s) - 1)
    x = xy[0] - total / 2 if anchor == 'center' else xy[0]
    for ch, w in zip(s, widths):
        d.text((x, xy[1]), ch, font=font, fill=fill, anchor='lm')
        x += w + spacing
    return total


class Renderer:
    PX0, PX1 = 112, 968          # panel: clear of the Reels icon column on the right
    PY0 = 1384                   # panel top: below the fretboard (--panel-top to move it)

    def __init__(self, names, events, takes, title, subtitle, panel_top=None):
        if panel_top: self.PY0 = panel_top
        self.names, self.events, self.takes = names, events, takes
        self.title, self.subtitle = title, subtitle
        F = Fonts()
        self.f_title = F.get(50, 600); self.f_sub = F.get(22, 500)
        self.f_head = F.get(22, 600); self.f_str = F.get(24, 500)
        self.f_num = F.get(32, 650); self.f_tech = F.get(22, 600)
        self.sdy = 38
        self.ph = 82 + self.sdy * (len(names) - 1) + 40
        self.PY1 = self.PY0 + self.ph
        self.inner0, self.inner1 = self.PX0 + 92, self.PX1 - 40
        span = self.inner1 - self.inner0
        n = len(events)
        self.step = max(40.0, span / max(1, n - 1)) if n > 1 else 0
        self.xs = [self.inner0 + i * self.step for i in range(n)]
        self.content_w = self.xs[-1] - self.inner0 if n else 0
        self.ys = [self.PY0 + 82 + i * self.sdy for i in range(len(names))]
        self.static = self._static()
        mask = Image.new('L', (W, H), 0)
        ImageDraw.Draw(mask).rounded_rectangle([self.PX0, self.PY0, self.PX1, self.PY1], 30, fill=255)
        self.mask = mask

    def _static(self):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        # top shade for the title
        sh = np.linspace(150, 0, 560).astype(np.uint8)
        shade = Image.fromarray(np.repeat(sh[:, None], W, axis=1), 'L')
        im.paste(Image.new('RGBA', (W, 560), (0, 0, 0, 255)), (0, 0), shade)
        d = ImageDraw.Draw(im)
        text_spaced(d, (W / 2, 292), self.title.upper(), self.f_title, (255, 255, 255, 255), 7)
        if self.subtitle:
            text_spaced(d, (W / 2, 350), self.subtitle.upper(), self.f_sub, (255, 255, 255, 150), 9)
        return im

    def cursor_at(self, t):
        """(take index, x position in content coords, index of sounding note)."""
        tk = self.takes
        ti = 0
        for i in range(len(tk)):
            if t >= (tk[i]['start'] - 0.35 if i else -1):
                ti = i
        T = tk[ti]['times']
        if t < T[0]:
            return ti, self.xs[0], -1
        if t >= T[-1]:
            return ti, self.xs[-1], len(T) - 1
        k = int(np.searchsorted(T, t, side='right')) - 1
        f = (t - T[k]) / (T[k + 1] - T[k])
        return ti, self.xs[k] + f * (self.xs[k + 1] - self.xs[k]), k

    def frame(self, video_rgb, t):
        base = Image.fromarray(video_rgb).convert('RGBA')
        # frosted glass under the tab
        box = (self.PX0, self.PY0, self.PX1, self.PY1)
        glass = base.crop(box).filter(ImageFilter.GaussianBlur(22))
        glass = Image.alpha_composite(glass, Image.new('RGBA', glass.size, (6, 7, 10, 196)))
        base.paste(glass, box[:2], self.mask.crop(box))
        base = Image.alpha_composite(base, self.static)
        ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))  # draw on layers: ImageDraw does not blend alpha
        d = ImageDraw.Draw(ov)
        d.rounded_rectangle(box, 30, outline=(255, 255, 255, 30), width=2)

        ti, cx, k = self.cursor_at(t)
        span = self.inner1 - self.inner0
        off = 0.0
        if self.content_w > span:
            off = min(max(0.0, cx - self.inner0 - 0.35 * span), self.content_w - span)
        X = lambda x: x - off

        label = self.takes[ti].get('label', '')
        if label:
            d.text((self.PX0 + 40, self.PY0 + 38), label.upper(), font=self.f_head, fill=(255, 255, 255, 170), anchor='lm')
        dots_x = self.PX1 - 40
        for i in reversed(range(len(self.takes))):
            on = i == ti
            d.ellipse([dots_x - 6, self.PY0 + 32, dots_x + 6, self.PY0 + 44], fill=LIME + (255,) if on else (255, 255, 255, 60))
            dots_x -= 24

        # strings with gaps around the numbers
        gaps = {s: [] for s in range(len(self.names))}
        labels = []
        for i, ev in enumerate(self.events):
            for s, lab in ev['notes']:
                x = X(self.xs[i])
                wnum = self._num_width(d, lab)
                gaps[s].append((x - wnum / 2 - 7, x + wnum / 2 + 7)); labels.append((i, s, lab, x))
        for s, y in enumerate(self.ys):
            d.text((self.PX0 + 46, y), self.names[s], font=self.f_str, fill=(255, 255, 255, 120), anchor='mm')
            x0 = self.inner0 - 26
            for g0, g1 in sorted(gaps[s]):
                if g1 < x0: continue
                if g0 > x0: d.line([x0, y, min(g0, self.PX1 - 24), y], fill=(255, 255, 255, 70), width=2)
                x0 = max(x0, g1)
            if x0 < self.PX1 - 24:
                d.line([x0, y, self.PX1 - 24, y], fill=(255, 255, 255, 70), width=2)
        d.line([self.inner0 - 26, self.ys[0] - 2, self.inner0 - 26, self.ys[-1] + 2], fill=(255, 255, 255, 110), width=3)

        # cursor (same look as the practice page: soft lime band with an even outline)
        x = X(cx)
        band = [x - 19, self.ys[0] - 22, x + 19, self.ys[-1] + 22]
        base = Image.alpha_composite(base, ov)
        ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
        d.rounded_rectangle(band, 11, fill=LIME + (46,), outline=LIME + (190,), width=3)
        base = Image.alpha_composite(base, ov)
        ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
        for i, s, lab, lx in labels:
            if lx < self.inner0 - 30 or lx > self.PX1 - 20: continue
            col = LIME + (255,) if i == k else ((255, 255, 255, 105) if i < k else (255, 255, 255, 245))
            self._num(d, lx, self.ys[s], lab, col)
        base = Image.alpha_composite(base, ov)
        return np.asarray(base.convert('RGB'))

    def _split(self, lab):
        m = re.match(r'(\d+)(.*)', lab)
        return m.group(1), m.group(2)

    def _num_width(self, d, lab):
        a, b = self._split(lab)
        return d.textlength(a, font=self.f_num) + (d.textlength(b, font=self.f_tech) + 1 if b else 0)

    def _num(self, d, x, y, lab, col):
        a, b = self._split(lab)
        w = self._num_width(d, lab)
        x0 = x - w / 2
        d.text((x0, y), a, font=self.f_num, fill=col, anchor='lm')
        if b:
            d.text((x0 + d.textlength(a, font=self.f_num) + 1, y + 3), b, font=self.f_tech, fill=col, anchor='lm')


def video_size(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'format=duration', '-of', 'json', path], capture_output=True, text=True, check=True)
    return float(json.loads(out.stdout)['format']['duration'])


def render(video, out, rend, still=None):
    dur = video_size(video)
    vf = f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}'
    if still is not None:
        args = ['ffmpeg', '-v', 'error', '-ss', str(still), '-i', video, '-frames:v', '1', '-vf', vf,
                '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
        raw = subprocess.run(args, capture_output=True, check=True).stdout
        Image.fromarray(rend.frame(np.frombuffer(raw, np.uint8).reshape(H, W, 3), still)).save(out)
        return
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', video, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                            '-r', str(FPS), '-i', '-', '-i', video, '-map', '0:v', '-map', '1:a?',
                            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
                            '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out],
                           stdin=subprocess.PIPE)
    n, size = 0, W * H * 3
    while True:
        raw = dec.stdout.read(size)
        if len(raw) < size: break
        enc.stdin.write(rend.frame(np.frombuffer(raw, np.uint8).reshape(H, W, 3), n / FPS).tobytes())
        n += 1
        if n % 60 == 0: print(f'\r{n / FPS:5.1f}/{dur:.1f}s', end='', file=sys.stderr)
    enc.stdin.close(); enc.wait(); dec.wait()
    print(f'\rdone: {out}', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--video', required=True)
    ap.add_argument('--tab', required=True, help='ASCII tab file, one line per string, high e on top')
    ap.add_argument('--out', required=True, help='output .mp4')
    ap.add_argument('--title', default='Blues licks series')
    ap.add_argument('--subtitle', default='Riff DNA')
    ap.add_argument('--takes', type=int, help='how many times the phrase is played (default: found from pauses)')
    ap.add_argument('--labels', help='comma-separated take labels, e.g. "Take 1 · Fast,Take 2 · Slow"')
    ap.add_argument('--timings', help='use this timings JSON instead of analysing the audio')
    ap.add_argument('--panel-top', type=int, help='y of the tab panel top in a 1080x1920 frame (default 1384)')
    ap.add_argument('--still', type=float, help='write one PNG frame at this second instead of the video')
    a = ap.parse_args()

    names, events = parse_tab(open(a.tab, encoding='utf-8').read())
    if a.timings:
        takes = json.load(open(a.timings))['takes']
    else:
        y, sr = load_audio(a.video)
        takes = analyse(y, sr, events, a.takes)
        for tk, lab in zip(takes, default_labels(takes)):
            tk['label'] = lab
        tj = os.path.splitext(a.out)[0] + '.timings.json'
        json.dump({'tab': os.path.basename(a.tab), 'takes': takes}, open(tj, 'w'), ensure_ascii=False, indent=1)
        print(f'timings: {tj}', file=sys.stderr)
        for i, tk in enumerate(takes):
            low = [j + 1 for j, c in enumerate(tk['confidence']) if c < 0.9]
            print(f'take {i + 1} {tk["start"]:.2f}-{tk["end"]:.2f}s  notes at: ' + ' '.join(f'{x:.2f}' for x in tk['times'])
                  + (f'   check notes {low}' if low else ''), file=sys.stderr)
    if a.labels:
        for tk, lab in zip(takes, a.labels.split(',')):
            tk['label'] = lab.strip()
    rend = Renderer(names, events, takes, a.title, a.subtitle, a.panel_top)
    render(a.video, a.out, rend, a.still)


if __name__ == '__main__':
    main()
