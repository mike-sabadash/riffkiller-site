"""Find and follow the six guitar strings in the video, so an open string can be lit up
on the real guitar while it sounds.

Lines are found once with a Hough transform on thin bright ridges (white top-hat), then
followed frame by frame: each string is re-fitted from ridge points near its last position.
The nut (where the open string stops) is followed by template matching.
"""
import cv2
import numpy as np

KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))


def ridges(gray):
    return cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, KERNEL)


class Line:
    """y = a*x + b (strings run across the frame, never vertical here)."""
    def __init__(self, a, b, x0, x1):
        self.a, self.b, self.x0, self.x1 = float(a), float(b), float(x0), float(x1)

    def y(self, x):
        return self.a * x + self.b

    def copy(self):
        return Line(self.a, self.b, self.x0, self.x1)


def detect(gray):
    """Six string lines, top of the frame first, or None."""
    th = ridges(gray)
    _, bw = cv2.threshold(th, 25, 255, cv2.THRESH_BINARY)
    segs = cv2.HoughLinesP(bw, 1, np.pi / 720, threshold=120, minLineLength=220, maxLineGap=25)
    if segs is None:
        return None
    segs = segs.reshape(-1, 4).astype(float)
    ang = np.degrees(np.arctan2(segs[:, 3] - segs[:, 1], segs[:, 2] - segs[:, 0]))
    ln = np.hypot(segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1])
    keep = np.abs(ang) < 50
    if keep.sum() < 6:
        return None
    dom = np.median(np.repeat(ang[keep], (ln[keep] / 50).astype(int) + 1))
    keep &= np.abs(ang - dom) < 7
    segs, ln = segs[keep], ln[keep]
    xr = float(np.median((segs[:, 0] + segs[:, 2]) / 2))
    a_dom = np.tan(np.radians(dom))
    yr = segs[:, 1] + (segs[:, 3] - segs[:, 1]) * (xr - segs[:, 0]) / (segs[:, 2] - segs[:, 0] + 1e-9)
    order = np.argsort(yr)
    clusters = []
    for i in order:
        if clusters and yr[i] - clusters[-1]['y'][-1] < 9:
            clusters[-1]['i'].append(i); clusters[-1]['y'].append(yr[i])
        else:
            clusters.append({'i': [i], 'y': [yr[i]]})
    lines = []
    for c in clusters:
        pts = np.concatenate([segs[c['i']][:, :2], segs[c['i']][:, 2:]])
        if sum(ln[c['i']]) < 300:
            continue
        a, b = np.polyfit(pts[:, 0], pts[:, 1], 1)
        lines.append((a * xr + b, Line(a, b, pts[:, 0].min(), pts[:, 0].max())))
    if len(lines) < 6:
        return None
    ys = np.array([y for y, _ in lines])
    w = np.array([1.0] * len(lines))
    # six strings = an evenly spaced comb; extra lines (binding, inlay edges) fall off it
    best = None
    for i in range(len(ys)):
        for j in range(i + 1, len(ys)):
            d = ys[j] - ys[i]
            for div in (1, 2):
                step = d / div
                if step < 18:
                    continue
                for k0 in range(0, 6):  # line i is string k0 of the comb
                    origin = ys[i] - k0 * step
                    hit, err = [], 0.0
                    for k in range(6):
                        target = origin + k * step
                        m = int(np.argmin(np.abs(ys - target)))
                        e = abs(ys[m] - target)
                        if e < 0.14 * step:
                            hit.append((k, m)); err += e / step
                    if len(hit) < 5:
                        continue
                    score = len(hit) * 10 - err
                    if best is None or score > best[0]:
                        best = (score, origin, step, dict(hit))
    if best is None:
        return None
    _, origin, step, hit = best
    out = []
    for k in range(6):
        if k in hit:
            out.append(lines[hit[k]][1])
    if len(out) < 6:  # one string hidden: put it where the comb says, slope from its neighbours
        a = float(np.mean([l.a for l in out]))
        res = []
        for k in range(6):
            if k in hit:
                res.append(lines[hit[k]][1])
            else:
                y = origin + k * step
                res.append(Line(a, y - a * xr, 0, xr * 2))
        out = res
    return out


def refine(th, line, x_max, search=7, thr=12):
    """Re-fit one string from ridge points near its previous position."""
    h, w = th.shape
    xs = np.arange(4, min(w - 4, int(x_max) - 6), 6)
    px, py = [], []
    for x in xs:
        yc = line.y(x)
        y0, y1 = int(round(yc - search)), int(round(yc + search))
        if y0 < 0 or y1 >= h:
            continue
        col = th[y0:y1 + 1, x - 1:x + 2].mean(axis=1)
        k = int(np.argmax(col))
        if col[k] < thr or k in (0, len(col) - 1):
            continue
        # sub-pixel peak
        l, c, r = col[k - 1], col[k], col[k + 1]
        dk = 0.5 * (l - r) / (l - 2 * c + r + 1e-9)
        px.append(x); py.append(y0 + k + dk)
    if len(px) < 12:
        return None, 0
    px, py = np.array(px), np.array(py)
    a, b = line.a, line.b
    for _ in range(3):
        a, b = np.polyfit(px, py, 1)
        res = np.abs(py - (a * px + b))
        keep = res < max(1.5, 2.5 * np.median(res))
        px, py = px[keep], py[keep]
        if len(px) < 12:
            return None, 0
    return Line(a, b, px.min(), px.max()), len(px)


def find_nut(th, lines, start=None):
    """x where the strings leave a straight line (they fan out to the tuners past the nut)."""
    ends = []
    for ln in lines:
        x = max(3, int(start if start is not None else ln.x1))
        ok = x
        while x < th.shape[1] - 3:
            y = int(round(ln.y(x)))
            if not (3 <= y < th.shape[0] - 3):
                break
            if th[y - 2:y + 3, x - 1:x + 2].max() >= 25:
                ok = x
            elif x - ok > 18:
                break
            x += 2
        ends.append(ok)
    return float(np.median(ends))


def comb_lines(p):
    """Six strings as one comb: top string y = a*x + b, the gap between neighbours = da*x + db
    (the gap narrows towards the nut)."""
    a, b, da, db = p
    return [Line(a + k * da, b + k * db, 0, 0) for k in range(6)]


def comb_score(p, img, xs):
    h, w = img.shape
    tot, n = 0.0, 0
    for ln in comb_lines(p):
        ys = ln.y(xs)
        ok = (ys >= 1) & (ys < h - 2)
        if not ok.any():
            return 0.0
        x, y = xs[ok], ys[ok]
        y0 = np.floor(y).astype(int); f = y - y0
        xi = x.astype(int)
        v = img[y0, xi] * (1 - f) + img[y0 + 1, xi] * f
        tot += np.sum(np.minimum(v, 60)); n += len(xs)
    return tot / max(1, n)


class Tracker:
    """Follows the six strings as one comb fitted to thin bright ridges; robust to the hand
    hiding some strings, to frets and inlay edges (they do not form an even comb)."""
    def __init__(self):
        self.lines = None
        self.p = None
        self.nut = None
        self.top_is_low = True
        self.n = 0

    def _fit(self, th, p0, steps=((3.0, 6), (1.2, 3))):
        from scipy.optimize import minimize
        x_end = max(200.0, (self.nut or th.shape[1]) - 12)
        xs = np.arange(2.0, x_end, 3.0)
        p = np.array(p0, float)
        # scale of each parameter so the optimiser moves them evenly
        sc = np.array([1e-3, 1.0, 1e-4, 0.3])
        for sigma, _ in steps:
            img = cv2.GaussianBlur(th.astype(np.float32), (0, 0), sigma)
            f = lambda q: -comb_score(q * sc, img, xs)
            r = minimize(f, p / sc, method='Powell', options={'xtol': 0.05, 'ftol': 1e-4, 'maxfev': 600})
            p = r.x * sc
        return p, comb_score(p, cv2.GaussianBlur(th.astype(np.float32), (0, 0), 1.2), xs)

    def init(self, frame_rgb):
        g = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)
        lines = detect(g)
        if lines is None:
            return False
        th = ridges(g)
        self.nut = find_nut(th, lines)
        xr = 300.0
        ys = np.array([l.y(xr) for l in lines]); a_s = np.array([l.a for l in lines])
        k = np.arange(6)
        da, a0 = np.polyfit(k, a_s, 1)
        gap = np.polyfit(k, ys, 1)[0]
        b0 = ys[0] - a0 * xr
        db = gap - da * xr
        self.p, sc = self._fit(th, [a0, b0, da, db])
        self.lines = comb_lines(self.p)
        # wound strings (low E, A, D) look wider than the plain ones
        widths = []
        for ln in self.lines:
            wv = []
            for x in np.linspace(20, self.nut - 20, 25):
                y = int(round(ln.y(x)))
                if 8 <= y < g.shape[0] - 8:
                    col = th[y - 7:y + 8, int(x)].astype(float)
                    if col.max() > 20:
                        wv.append((col > col.max() * 0.5).sum())
            widths.append(np.median(wv) if wv else 0)
        self.top_is_low = np.mean(widths[:3]) >= np.mean(widths[3:])
        self.ends = []
        self._vote_nut(th)
        return True

    def _vote_nut(self, th):
        """Where each string leaves its straight line, over the first frames; the hand cuts
        strings short at random places, the nut stops them at the same place."""
        for ln in self.lines:
            e = find_nut(th, [ln], 150)
            if e < th.shape[1] - 12:
                self.ends.append(e)
        if self.ends:
            hist, edges = np.histogram(self.ends, bins=np.arange(0, th.shape[1] + 12, 12))
            j = int(np.argmax(hist))
            near = [e for e in self.ends if edges[j] - 12 <= e <= edges[j + 1] + 12]
            self.nut = float(np.median(near))

    def _nut_xy(self):
        return self.nut, self.lines[2].y(self.nut) * 0.5 + self.lines[3].y(self.nut) * 0.5

    def _grab(self, g, r=64):
        x, y = (int(v) for v in self._nut_xy())
        if r <= x < g.shape[1] - r and r <= y < g.shape[0] - r:
            self.tmpl = g[y - r:y + r, x - r:x + r].copy()

    def _follow_nut(self, g, s=28):
        """The nut sits on the rigid headstock: follow it by template matching (the hand
        often hides the strings right before it, so the strings alone cannot place it)."""
        if getattr(self, 'tmpl', None) is None:
            return
        r = self.tmpl.shape[0] // 2
        x, y = (int(v) for v in self._nut_xy())
        x0, y0 = x - r - s, y - r - s
        if x0 < 0 or y0 < 0 or x0 + 2 * (r + s) > g.shape[1] or y0 + 2 * (r + s) > g.shape[0]:
            return
        res = cv2.matchTemplate(g[y0:y0 + 2 * (r + s), x0:x0 + 2 * (r + s)], self.tmpl, cv2.TM_CCOEFF_NORMED)
        _, mv, _, ml = cv2.minMaxLoc(res)
        if mv > 0.55:
            self.nut += ml[0] - s
            if mv > 0.8 and self.n % 10 == 0:
                self._grab(g)

    def _p_from_lines(self, lines, xr=300.0):
        ys = np.array([l.y(xr) for l in lines]); a_s = np.array([l.a for l in lines])
        k = np.arange(6)
        da, a0 = np.polyfit(k, a_s, 1)
        gap = np.polyfit(k, ys, 1)[0]
        return np.array([a0, ys[0] - a0 * xr, da, gap - da * xr])

    def update(self, frame_rgb):
        g = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)
        th = ridges(g)
        self.n += 1
        # the comb can slip one string (onto the binding): re-anchor on a fresh detection
        if self.n % 4 == 0:
            det = detect(g)
            if det is not None:
                q = self._p_from_lines(det)
                gap = self.p[3] + self.p[2] * 300
                off = (q[1] + q[0] * 300) - (self.p[1] + self.p[0] * 300)
                if abs(off) > 0.5 * gap:
                    self.slip = getattr(self, 'slip', 0) + 1
                    if self.slip >= 2:
                        self.p = q; self.slip = 0
                else:
                    self.slip = 0
        p, sc = self._fit(th, self.p, steps=((2.0, 0), (1.0, 0)))
        if sc > 6:  # comb still sits on strings
            self.p = 0.5 * p + 0.5 * self.p if self.n > 1 else p
        self.lines = comb_lines(self.p)
        if self.n <= 20:
            self._vote_nut(th)
            if self.n == 20:
                self._grab(g)
        else:
            self._follow_nut(g)
        return th

    def string_line(self, tab_string):
        """tab_string: 0 = high e ... 5 = low E."""
        idx = (5 - tab_string) if self.top_is_low else tab_string
        return self.lines[idx]


def skin_mask(rgb_region):
    """Where the hand covers the string (skin colour in YCrCb), so the paint stays under the fingers."""
    ycc = cv2.cvtColor(np.ascontiguousarray(rgb_region), cv2.COLOR_RGB2YCrCb)
    m = cv2.inRange(ycc, (75, 140, 80), (225, 180, 128))  # dark wood and bright pearl inlays are not skin  # pearl inlays are brighter and less red than skin
    return cv2.dilate(m, np.ones((5, 5), np.uint8))


def paint(frame_rgb, th, line, x_end, strength, color=(200, 48, 48)):
    """Tint one string red from the left edge to the nut, a string-thin line, not over the hand."""
    h, w = th.shape
    x1 = int(min(w - 1, x_end))
    ya, yb = line.y(0), line.y(x1)
    y0 = int(max(0, min(ya, yb) - 6)); y1 = int(min(h, max(ya, yb) + 7))
    if y1 <= y0:
        return frame_rgb
    sub = np.zeros((y1 - y0, w), np.uint8)
    S = 16  # sub-pixel line drawing
    cv2.line(sub, (0, int(round((ya - y0) * S))), (x1 * S, int(round((yb - y0) * S))), 255, 3, cv2.LINE_AA, shift=4)
    a = sub.astype(np.float32) / 255
    ridge = np.clip((th[y0:y1].astype(np.float32) - 6) / 30, 0, 1)
    a = a * (0.7 + 0.3 * ridge)                 # a touch stronger where the string shines
    region = frame_rgb[y0:y1].astype(np.float32)
    a *= 1 - skin_mask(frame_rgb[y0:y1]).astype(np.float32) / 255
    a = a * strength
    lum = region.mean(axis=2, keepdims=True)
    tint = np.array(color, np.float32)[None, None, :] * (0.6 + 0.4 * lum / 255)
    out = frame_rgb.copy()
    out[y0:y1] = (region * (1 - a[..., None]) + tint * a[..., None]).clip(0, 255).astype(np.uint8)
    return out
