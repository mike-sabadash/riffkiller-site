/* Iron Man — Patreon horizontal breakdown overlay. window.frame(mode, t) draws one frame deterministically. */
(function () {
  'use strict';
  var LINES_Y = 118, QUARTER = 960, CURSOR_X = 330, TAB_SCALE = 1.8;
  var riff, segs, atoms, dna, layout = [], barStart = [], strip, linesTop = 0, linesH = 0, stripW = 0;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var eo = function (x) { x = clamp(x, 0, 1); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
  var ec = function (x) { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };

  var SECTIONS = [[0, 2, 'Intro'], [3, 6, 'Main riff'], [7, 10, 'Verse 1'], [11, 12, 'Riff returns'], [13, 16, 'Verse 2'], [17, 22, 'Bridge']];
  function sectionOf(i) { for (var k = 0; k < SECTIONS.length; k++) if (i >= SECTIONS[k][0] && i <= SECTIONS[k][1]) return SECTIONS[k][2]; return ''; }

  // ---- what the hint column shows in every part (0-based part index) ----
  function hints() {
    var lawS = dna.law.split(/(?<=\.)\s+/);
    var H = {};
    H[0] = { atoms: [0, 1] };
    H[1] = { eb: 'Riff DNA · Keep', big: 'The behind-the-nut groan', body: 'It is the sound of the whole intro. A little less bend this time — about 1¼ tones — and let both strings ring.' };
    H[2] = { eb: 'Riff DNA · The rule', big: dna.rule, body: 'The main riff comes in right after this last groan.' };
    H[3] = { atoms: [2, 3, 4] };
    H[4] = { atoms: [5, 6] };
    H[5] = { recap: [2, 3, 4], from: 4 };
    H[6] = { eb: 'Riff DNA · What breaks it', body: dna.failure };
    H[7] = { atoms: [7, 8] };
    H[8] = { atoms: [9] };
    H[9] = { eb: 'Riff DNA · The law', body: lawS[0] + ' ' + lawS[1] };
    H[10] = { eb: 'Riff DNA · The law', big: lawS[2] };
    H[11] = { eb: 'Riff DNA · Keep', list: dna.preserve };
    H[12] = { eb: 'Riff DNA · Free to change', list: dna.change };
    H[13] = { atoms: [10, 11] };
    H[14] = { recap: [9], from: 9 };
    H[15] = { recap: [11], from: 14, note: 'Two muted clicks this time before the hammer-on.' };
    H[16] = { eb: 'Role · Land', big: 'The phrase comes home.', body: 'The last answer of the theme lands on E before the bridge — make it sound final.' };
    H[17] = { atoms: [12, 13] };
    H[18] = { atoms: [14] };
    H[19] = { recap: [12, 13], from: 18 };
    H[20] = { eb: 'Riff DNA · Mutate', big: dna.mutation.description };
    H[21] = { recap: [12, 13], from: 18 };
    H[22] = { eb: 'Role · Hang', big: 'Three A notes and stop.', body: 'The phrase is left hanging — no way home.' };
    return H;
  }
  var HINTS;

  // ---- timing: copied from js/tab-live.js (positionAt / beatAt) ----
  function positionAt(anchors, from, lay, segStart, segEnd, t) {
    var startOf = [], acc = 0;
    lay.forEach(function (b) { startOf.push(acc); acc += b.ticks; });
    var pos = function (a) { var i = a[0] - from; return i >= 0 && i < lay.length ? startOf[i] + a[1] : null; };
    var pts = [];
    (anchors || []).forEach(function (a) {
      var p = pos(a), last = pts[pts.length - 1];
      if (p == null || (last && (a[2] <= last[0] || p < last[1]))) return;
      pts.push([a[2], p]);
    });
    if (!pts.length || pts[0][0] > segStart) pts.unshift([segStart, 0]);
    if (segEnd > pts[pts.length - 1][0]) pts.push([segEnd, acc]);
    var at;
    if (t <= pts[0][0]) at = pts[0][1];
    else if (t >= pts[pts.length - 1][0]) at = pts[pts.length - 1][1];
    else {
      var k = 0;
      while (k < pts.length - 2 && pts[k + 1][0] <= t) k++;
      var p0 = pts[k], p1 = pts[k + 1];
      at = p0[1] + (p1[1] - p0[1]) * (t - p0[0]) / (p1[0] - p0[0]);
    }
    at = Math.min(acc, Math.max(0, at));
    var bar = 0;
    while (bar < lay.length - 1 && at >= startOf[bar + 1]) bar++;
    return { bar: bar, tick: at - startOf[bar] };
  }
  function beatAt(bar, tick) {
    var beats = bar.beats || [];
    if (!beats.length) return { k: -1, x: bar.x0 + (bar.x1 - bar.x0) * tick / (bar.ticks || 1) };
    var k = 0;
    while (k < beats.length - 1 && beats[k + 1].start <= tick) k++;
    var from = beats[k], nextStart = k + 1 < beats.length ? beats[k + 1].start : bar.ticks;
    var nextX = k + 1 < beats.length ? beats[k + 1].x : bar.x1;
    if (tick < from.start) return { k: -1, x: bar.x0 + (from.x - bar.x0) * tick / (from.start || 1) };
    var f = nextStart > from.start ? (tick - from.start) / (nextStart - from.start) : 0;
    return { k: k, x: from.x + (nextX - from.x) * f };
  }
  function segAt(t) {
    for (var i = 0; i < segs.length; i++) if (t < segs[i].end || i === segs.length - 1) return i;
  }
  function where(t) {
    var i = segAt(t), s = segs[i];
    var from = s.tabBars[0], to = s.tabBars[1];
    var lay = layout.slice(from - 1, to);
    var p = positionAt(s.tabSync, from, lay, s.start, s.end, t);
    var bar = layout[from - 1 + p.bar], b = beatAt(bar, p.tick);
    return { seg: i, barIdx: from - 1 + p.bar, tick: p.tick, k: b.k, x: b.x };
  }

  // ---- alphaTab ----
  function makeApi(el, color, lines) {
    var res = {
      mainGlyphColor: color, secondaryGlyphColor: lines ? 'rgba(244,244,246,0.55)' : 'rgba(0,0,0,0)',
      staffLineColor: lines ? 'rgba(244,244,246,0.30)' : 'rgba(0,0,0,0)',
      barSeparatorColor: lines ? 'rgba(244,244,246,0.40)' : 'rgba(0,0,0,0)',
      barNumberColor: lines ? 'rgba(244,244,246,0.40)' : 'rgba(0,0,0,0)', scoreInfoColor: color,
      tablatureFont: '600 13px IN', effectFont: 'italic 500 12px IN', barNumberFont: '500 11px IN'
    };
    var api = new alphaTab.AlphaTabApi(el, {
      core: { engine: 'svg', useWorkers: false, enableLazyLoading: false, fontDirectory: 'font/', tex: true },
      display: { layoutMode: alphaTab.LayoutMode.Horizontal, staveProfile: alphaTab.StaveProfile.TabMixed, scale: TAB_SCALE,
        padding: [10, 40], stretchForce: 1.25, resources: res },
      notation: { elements: { scoreTitle: false, scoreSubTitle: false, scoreArtist: false, scoreAlbum: false, scoreWords: false, scoreMusic: false, scoreWordsAndMusic: false, scoreCopyright: false, guitarTuning: false, trackNames: false, effectTempo: false } },
      player: { enablePlayer: false }
    });
    return api;
  }
  function renderBoth(tex) {
    return new Promise(function (res) {
      var n = 0, done = function () { if (++n === 2) res(); };
      apiW = makeApi($('atW'), '#F4F4F6', true);
      var once = false;
      apiW.renderFinished.on(function () {
        if (once) return; once = true; done();
        apiY = makeApi($('atY'), '#B8F05A', false);
        apiY.renderFinished.on(done);
        apiY.tex(tex);
      });
      apiW.tex(tex);
    });
  }
  var apiW, apiY;

  function measure() {
    var score = apiW.score, bpm = score.tempo, lookup = apiW.renderer.boundsLookup;
    var staff = score.tracks[0].staves[0], acc = 0;
    score.masterBars.forEach(function (mb, i) {
      var auto = mb.tempoAutomations && mb.tempoAutomations.length ? mb.tempoAutomations[0] : mb.tempoAutomation;
      if (auto && auto.value > 0) bpm = auto.value;
      var ticks = mb.calculateDuration();
      var mbb = lookup.findMasterBarByIndex(i), bar = staff.bars[i], beats = [];
      bar.voices[0].beats.forEach(function (beat) {
        var b = lookup.findBeat(beat);
        if (b) {
          var nb = null;
          (b.notes || []).forEach(function (n) { var r = n.noteHeadBounds; if (!r) return;
            if (!nb) nb = { x: r.x, y: r.y, x2: r.x + r.w, y2: r.y + r.h };
            else { nb.x = Math.min(nb.x, r.x); nb.y = Math.min(nb.y, r.y); nb.x2 = Math.max(nb.x2, r.x + r.w); nb.y2 = Math.max(nb.y2, r.y + r.h); } });
          var vb = nb ? { x: nb.x, y: nb.y, w: nb.x2 - nb.x, h: nb.y2 - nb.y } : b.visualBounds;
          beats.push({ start: beat.playbackStart, x: b.onNotesX || b.visualBounds.x, rest: beat.isRest || !beat.notes.length, vb: vb, rb: b.realBounds });
        }
      });
      layout.push({ ticks: ticks, beats: beats, x0: mbb.realBounds.x, x1: mbb.realBounds.x + mbb.realBounds.w });
      if (i === 0) { var lb = mbb.bars[0].visualBounds; linesTop = lb.y; linesH = lb.h; }
    });
    $('yWrap').style.width = '20000px';
    var svgs = $('atW').querySelectorAll('svg');
    stripW = 0; svgs.forEach(function (s) { stripW = Math.max(stripW, s.getBoundingClientRect().right - $('atW').getBoundingClientRect().left); });
  }

  // ---- build static DOM ----
  function buildTimeline() {
    var tl = $('tl'), T = segs[segs.length - 1].end, W = 1824, gap = 4, html = '';
    segs.forEach(function (s, i) {
      var x = s.start / T * W, w = (s.end - s.start) / T * W - gap;
      html += '<div class="tlp" id="tl' + i + '" style="left:' + x.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;--c:' + s.color + '"><i></i></div>';
    });
    tl.innerHTML = html;
  }
  function buildMarkers() {
    var html = '', prevX = -999, stack = 0;
    atoms.forEach(function (a, n) {
      var w = where(a.time + 0.02);
      var x = w.x;
      if (Math.abs(x - prevX) < 34) { stack++; } else stack = 0;
      prevX = x;
      a._x = x + stack * 34; a._n = n + 1;
      html += '<div class="mk fut" id="mk' + n + '" style="left:' + (a._x - 15).toFixed(1) + 'px;top:' + (linesTop - LINES_Y + 6).toFixed(1) + 'px">' + (n + 1) + '</div>';
    });
    $('mks').innerHTML = html;
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- per-frame ----
  var lastSeg = -1, lastHintKey = '';
  function drawMain(t) {
    var w = where(t), i = w.seg, s = segs[i];
    // header
    if (i !== lastSeg) {
      $('partNo').innerHTML = String(i + 1).padStart(2, '0') + '<small>/ ' + segs.length + '</small>';
      $('role').textContent = s.role; $('role').style.background = s.color;
      $('section').textContent = sectionOf(i);
      $('func').textContent = s.function;
      lastSeg = i;
    }
    var e = eo((t - s.start) / 0.45);
    $('partRow').style.opacity = 0.0 + e; $('partRow').style.transform = 'translateY(' + (10 * (1 - e)) + 'px)';
    var e2 = eo((t - s.start - 0.08) / 0.5);
    $('func').style.opacity = e2; $('func').style.transform = 'translateY(' + (12 * (1 - e2)) + 'px)';
    // timeline
    segs.forEach(function (g, k) {
      var f = t >= g.end ? 1 : t <= g.start ? 0 : (t - g.start) / (g.end - g.start);
      var el = document.querySelector('#tl' + k + ' i');
      el.style.width = (f * 100).toFixed(2) + '%';
      el.style.opacity = k === i ? 1 : 0.55;
    });
    // tab strip scroll + cursor
    var maxShift = Math.max(0, stripW - 1104 + 40);
    var shift = clamp(w.x - CURSOR_X, 0, maxShift);
    $('strip').style.transform = 'translate(' + (-shift).toFixed(2) + 'px,' + (LINES_Y - linesTop).toFixed(1) + 'px)';
    var pad = Math.round(linesH / 5 * 0.55);
    var cur = $('cursor');
    cur.style.left = (w.x - 8).toFixed(2) + 'px'; cur.style.top = (linesTop - pad) + 'px'; cur.style.height = (linesH + 2 * pad) + 'px';
    // current notes in yellow
    var bar = layout[w.barIdx], beat = w.k >= 0 ? bar.beats[w.k] : null;
    var Y = $('yWrap');
    if (beat && !beat.rest) {
      var vb = beat.vb, H = Y.offsetHeight, Wd = Y.offsetWidth;
      Y.style.clipPath = 'inset(' + Math.max(0, vb.y - 6) + 'px ' + Math.max(0, Wd - (vb.x + vb.w + 6)) + 'px ' + Math.max(0, H - (vb.y + vb.h + 6)) + 'px ' + Math.max(0, vb.x - 6) + 'px)';
      Y.style.opacity = 1;
    } else Y.style.opacity = 0;
    // atom markers
    atoms.forEach(function (a, n) {
      var m = $('mk' + n), dt = t - a.time;
      m.className = 'mk ' + (dt < -0.05 ? 'fut' : (a.segmentIndex === i ? '' : 'past'));
      var pop = dt >= -0.05 && dt < 0.35 ? 1 + 0.35 * Math.sin(clamp((dt + 0.05) / 0.4, 0, 1) * Math.PI) : 1;
      m.style.transform = 'scale(' + pop.toFixed(3) + ')';
    });
    // picking-hand window lights up while a right-hand tip is on
    drawHint(i, t, s);
  }

  function activeAtom(ids, t) {
    var act = ids[0];
    ids.forEach(function (id) { if (t >= atoms[id].time - 0.05) act = id; });
    return act;
  }
  function drawHint(i, t, s) {
    var h = HINTS[i], html = '', key;
    if (h.atoms) {
      var act = activeAtom(h.atoms, t);
      key = i + ':' + act;
      if (key !== lastHintKey) {
        html = '<div class="eb">Technique <span>· ' + h.atoms.length + (h.atoms.length > 1 ? ' tips' : ' tip') + '</span></div>';
        h.atoms.forEach(function (id) {
          var a = atoms[id], on = id === act;
          html += '<div class="item ' + (on ? 'on' : 'off') + '"><div class="num">' + (id + 1) + '</div><div class="it"><div class="ty">' + esc(a.type) + (a.view === 'right' ? '<em>PICKING HAND</em>' : '') + ' <b>· ' + esc(a.label) + '</b></div>' +
            (on ? '<div class="tip" id="tipTxt">' + esc(a.tip) + '</div>' : '') + '</div></div>';
        });
        $('hint').innerHTML = html; lastHintKey = key;
      }
      var tStart = Math.max(s.start, atoms[act].time - 0.05);
      var f = eo((t - tStart) / 0.4), tip = $('tipTxt');
      if (tip) { tip.style.opacity = f; tip.style.transform = 'translateY(' + (6 * (1 - f)) + 'px)'; }
    } else {
      key = i + ':x';
      if (key !== lastHintKey) {
        if (h.recap) {
          html = '<div class="eb">Same moves as part ' + h.from + '</div>';
          h.recap.forEach(function (id) {
            var a = atoms[id];
            html += '<div class="item on"><div class="num">' + (id + 1) + '</div><div class="it"><div class="ty">' + esc(a.type) + ' <b>· ' + esc(a.label) + '</b></div>' +
              (h.recap.length === 1 ? '<div class="tip">' + esc(a.tip) + '</div>' : '') + '</div></div>';
          });
          if (h.note) html += '<div class="body" style="margin-top:14px">' + esc(h.note) + '</div>';
        } else {
          html = '<div class="eb">' + esc(h.eb) + '</div>';
          if (h.big) html += '<div class="big">' + esc(h.big) + '</div>';
          if (h.body) html += '<div class="body">' + esc(h.body) + '</div>';
          if (h.list) h.list.forEach(function (x) { html += '<div class="li">' + esc(x) + '</div>'; });
        }
        $('hint').innerHTML = html; lastHintKey = key;
      }
    }
    var fe = eo((t - s.start - 0.05) / 0.45);
    $('hint').style.opacity = fe; $('hint').style.transform = 'translateY(' + (10 * (1 - fe)) + 'px)';
  }

  function rise(el, t, at, dist, dur) {
    var e = eo((t - at) / (dur || 0.9));
    el.style.opacity = e; el.style.transform = 'translateY(' + ((dist || 40) * (1 - e)).toFixed(2) + 'px)';
  }
  function wipe(el, t, at, dur, dir) {
    var e = eo((t - at) / (dur || 0.7)), r = (100 * (1 - e)).toFixed(2) + '%';
    el.style.clipPath = dir === 'down' ? 'inset(0 0 ' + r + ' 0)' : dir === 'left' ? 'inset(0 0 0 ' + r + ')' : 'inset(0 ' + r + ' 0 0)';
  }
  function drawIntro(t) {
    wipe($('iMain'), t, 0.0, 0.8, 'down');
    wipe($('iDark'), t, 0.12, 0.7, 'right');
    wipe($('iLime'), t, 0.24, 0.7, 'right');
    rise($('iLogo'), t, 0.45, 14, 0.8);
    rise($('iTag'), t, 0.6, 18, 0.9);
    rise($('iEb'), t, 0.35, 20);
    var tt = $('iTitle'), e = eo((t - 0.45) / 1.0);
    tt.style.opacity = e; tt.style.transform = 'translateY(' + (60 * (1 - e)).toFixed(2) + 'px)';
    rise($('iBand'), t, 0.7, 24);
    document.querySelectorAll('#iChips .chip').forEach(function (c, k) { rise(c, t, 1.0 + k * 0.09, 18, 0.8); });
  }
  function drawOutro(t) {
    wipe($('oLime'), t, 0.0, 0.8, 'right');
    rise($('oEb'), t, 0.3, 18); rise($('oRule'), t, 0.42, 36, 1.0); rise($('oLaw'), t, 0.7, 20); rise($('oTag'), t, 0.9, 18);
    var m = $('oMut');
    rise(m.querySelector('.t'), t, 0.6, 18); rise(m.querySelector('.h'), t, 0.7, 24); rise(m.querySelector('.d'), t, 0.85, 24);
    m.querySelectorAll('.step').forEach(function (st, k) { rise(st, t, 1.1 + k * 0.16, 20, 0.8); });
    rise($('oFoot'), t, 2.0, 14);
  }

  var lastSect = '';
  function setSect(o) {
    var key = JSON.stringify(o); if (key === lastSect) return; lastSect = key;
    $('sTitle').innerHTML = o.title; $('sParts').textContent = 'PARTS ' + o.from + '–' + o.to; $('sNote').textContent = o.note;
    var ids = []; for (var k = o.from - 1; k < o.to; k++) ids.push(k);
    $('sRoles').innerHTML = ids.map(function (k, n) { return (n ? '<div class="ar rv">→</div>' : '') + '<div class="r rv" style="background:' + segs[k].color + '">' + segs[k].role + '</div>'; }).join('');
  }
  function drawSect(t, o) {
    setSect(o);
    wipe($('sLime'), t, 0.0, 0.7, 'right');
    rise($('sEb'), t, 0.2, 16); rise($('sTitle'), t, 0.25, 40, 1.0);
    rise($('sParts'), t, 0.35, 16);
    document.querySelectorAll('#sRoles > *').forEach(function (c, k) { rise(c, t, 0.45 + k * 0.07, 16, 0.7); });
    rise($('sNote'), t, 0.8, 18);
  }
  function drawPack(t, o) {
    var yt = !(o && o.yt === false);
    $('pkYT').style.display = yt ? '' : 'none'; $('pkPat').style.display = yt ? 'none' : '';
    if (!yt) { wipe($('pkLime'), t, 0.0, 0.8, 'left'); rise(document.querySelector('#pkPat .rv'), t, 0.5, 18); }
    rise($('pkLogo'), t, 0.1, 14); rise($('pkHead'), t, 0.25, 36, 1.0); rise($('pkUrl'), t, 0.6, 20); rise($('pkSub'), t, 0.8, 16);
    document.querySelectorAll('#pkYT .rv').forEach(function (c, k) { rise(c, t, 0.9 + k * 0.08, 12); });
  }

  window.frame = function (mode, t, o) {
    $('chip').textContent = (o && o.chip) || '';
    $('main').style.display = mode === 'main' ? '' : 'none';
    ['intro', 'outro', 'sect', 'pack'].forEach(function (m) { $(m).style.display = mode === m ? 'block' : 'none'; });
    document.body.style.background = 'transparent';
    if (mode === 'main') drawMain(t); else if (mode === 'intro') drawIntro(t); else if (mode === 'sect') drawSect(t, o); else if (mode === 'pack') drawPack(t, o); else drawOutro(t);
    return true;
  };

  window.ready = Promise.all([fetch('riff.json').then(function (r) { return r.json(); }), fetch('tab.tex').then(function (r) { return r.text(); }), document.fonts.load('600 13px IN'), document.fonts.load('900 40px IN'), document.fonts.load('500 20px IN'), document.fonts.load('700 20px IN'), document.fonts.load('800 20px IN'), document.fonts.load('400 20px IN')])
    .then(function (r) {
      riff = r[0].riff; segs = riff.segments; dna = riff.dna; atoms = dna.atoms; HINTS = hints();
      $('oRule').textContent = dna.rule; $('oLaw').textContent = dna.law;
      var mu = dna.mutation;
      $('oMut').innerHTML = '<div class="t rv">Riff DNA · Mutate</div><div class="h rv">' + esc(mu.title) + '</div><div class="d rv">' + esc(mu.description) + '</div>' +
        mu.steps.map(function (s, k) { return '<div class="step rv"><i>' + (k + 1) + '</i><div>' + esc(s) + '</div></div>'; }).join('');
      return renderBoth(r[1]);
    })
    .then(function () { measure(); buildTimeline(); buildMarkers(); return { bars: layout.length, stripW: stripW, linesTop: linesTop, linesH: linesH }; });
})();
