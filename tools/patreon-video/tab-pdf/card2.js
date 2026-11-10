(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function page(inner, n) {
    var p = document.createElement('div'); p.className = 'page';
    p.innerHTML = '<div class="top"><img src="logo-dark.svg"><div class="kick">Iron Man · Black Sabbath</div></div>' + inner +
      '<div class="foot"><div>Loop every part at your speed — <b style="color:#111">riffkiller.fun</b></div><div>' + n + ' / 2</div></div>';
    $('#pages').appendChild(p); return p;
  }
  function render(el, tex, start, count) {
    return new Promise(function (res) {
      var api = new alphaTab.AlphaTabApi(el, {
        core: { engine: 'svg', useWorkers: false, enableLazyLoading: false, fontDirectory: 'font/', tex: true },
        display: { layoutMode: alphaTab.LayoutMode.Page, staveProfile: alphaTab.StaveProfile.Tab, scale: 0.95, barsPerRow: 2, justifyLastSystem: true, startBar: start, barCount: count, padding: [0, 0],
          resources: { mainGlyphColor: '#111', secondaryGlyphColor: '#666', staffLineColor: '#b9b9b9', barSeparatorColor: '#777', barNumberColor: '#9a9a9a',
            tablatureFont: '600 13px IN', effectFont: 'italic 500 11px IN', barNumberFont: '600 9px IN', markerFont: '700 11px IN' } },
        notation: { rhythmMode: alphaTab.TabRhythmMode.Hidden, elements: { scoreTitle: false, scoreSubTitle: false, scoreArtist: false, scoreAlbum: false, scoreWords: false, scoreMusic: false, scoreWordsAndMusic: false, scoreCopyright: false, guitarTuning: false, trackNames: false } },
        player: { enablePlayer: false }
      });
      var once = false;
      api.renderFinished.on(function () { if (once) return; once = true; setTimeout(function () {
        el.querySelectorAll('text').forEach(function (t) { if (/rendered by alphaTab/i.test(t.textContent)) t.remove(); });
        res(el.querySelector('.at-surface').offsetHeight); }, 50); });
      api.tex(tex);
    });
  }
  window.ready = Promise.all([fetch('tab.tex').then(function (r) { return r.text(); }), document.fonts.load('600 13px IN'), document.fonts.load('800 20px IN'), document.fonts.load('500 10px IN'), document.fonts.load('700 10px IN')])
  .then(function (r) {
    var tex = r[0];
    var p1 = page('<div class="hero2"><h1>Iron Man</h1><div class="meta"><div><b>Band</b>Black Sabbath</div><div><b>Tuning</b>E standard</div><div><b>Tempo</b>65 → 76 bpm</div><div><b>Legend</b>/ \\ slide · h hammer-on · p pull-off · x muted · P.M. palm mute</div></div></div><div class="tab"></div>', 1);
    var p2 = page('<div class="tab" style="margin-top:22px"></div>', 2);
    return Promise.all([render($('.tab', p1), tex, 1, 10), render($('.tab', p2), tex, 11, 16)]);
  });
})();
