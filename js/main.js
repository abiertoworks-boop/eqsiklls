/* =========================================================
   EQ Skills — main.js
   ・リンク先の一括差し替え
   ・文字の立ち上がり（.reveal）
   ・スクロール位置の計測（js/scene.js の光の演出と、01〜08 の番号表示が共有する）
   WebGL が無くても、このファイルだけでページは成立する。
   ========================================================= */
(function () {
  'use strict';

  /* ✎ CTA のリンク先。差し替える時はここだけ変える */
  var LINKS = {
    course: 'https://abiertoworks-boop.github.io/EQ2/reserve.html',
    contact: 'mailto:info@brifu.co.jp'
  };
  document.querySelectorAll('.js-course').forEach(function (a) { a.href = LINKS.course; });
  document.querySelectorAll('.js-contact').forEach(function (a) { a.href = LINKS.contact; });

  var doc = document.documentElement;
  var CAPTURE = doc.classList.contains('is-capture');
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- 立ち上がり ---------- */
  document.querySelectorAll('.steps').forEach(function (ol) {
    ol.querySelectorAll('li').forEach(function (li, i) { li.style.setProperty('--n', i); });
  });
  var revealTargets = document.querySelectorAll('.reveal, .feature, .growth__col');
  if (CAPTURE || !('IntersectionObserver' in window)) {
    revealTargets.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: /[?&]vertical=1/.test(location.search) || !window.matchMedia('(min-width: 1024px) and (min-height: 620px)').matches ? '0px 0px -12% 0px' : '0px -8% 0px 0px', threshold: 0.08 });
    revealTargets.forEach(function (el) { io.observe(el); });
  }

  /* 流れの線の長さを CSS に渡す（光の点がちょうど端まで流れるように） */
  function sizeFlow() {
    document.querySelectorAll('.flow').forEach(function (f) {
      f.style.setProperty('--flow-w', Math.max(0, f.scrollWidth - 8) + 'px');
      f.style.setProperty('--flow-h', Math.max(0, f.offsetHeight - 28) + 'px');
    });
  }

  /* ---------- スクロール位置の計測 ---------- */
  var header = document.getElementById('siteHeader');
  var orbSecs = Array.prototype.slice.call(document.querySelectorAll('[data-orb]'));
  var powers = document.getElementById('powers');
  var intro = document.getElementById('powersIntro');
  var stage = powers.querySelector('.powers__stage');
  var items = Array.prototype.slice.call(powers.querySelectorAll('.power'));
  var panels = items.map(function (li) { return li.querySelector('.power__panel'); });
  var numEl = document.getElementById('powersNum');
  var ticks = Array.prototype.slice.call(powers.querySelectorAll('.powers__ticks i'));
  var introInner = intro.querySelector('.powers__introInner');

  /* ---------- 横スクロール（PC：幅1024px以上・高さ620px以上） ----------
     縦のスクロール量を、そのまま横の移動量にする。ページの高さ＝横に並べた全体の幅。
     ホイールの縦回転・トラックパッドの横スワイプ・キーボードの←→どれでも進める。
     スマホ・小さな画面は縦スクロールのまま（長い文章を横移動で読むのはつらいため）。 */
  var main = document.getElementById('main');
  var footer = document.querySelector('.site-footer');
  var HQ = window.matchMedia('(min-width: 1024px) and (min-height: 620px)');
  var HM = HQ.matches && !/[?&]vertical=1/.test(location.search);
  var lineSvg = null, SVGNS = 'http://www.w3.org/2000/svg';
  if (HM) {
    doc.classList.add('hscroll');
    document.body.appendChild(stage);     // 01〜08 の番号は、動く帯の外で画面に固定
    main.appendChild(footer);             // フッターは帯の最後に
  }
  if (HQ.addEventListener) HQ.addEventListener('change', function () { if (!CAPTURE) location.reload(); });

  // 要素の「スクロール量で見た始まりの位置」と長さ
  function docSpan(el) {
    var r = el.getBoundingClientRect();
    return HM ? [r.left + window.scrollY, r.width] : [r.top + window.scrollY, r.height];
  }
  function viewport() { return HM ? window.innerWidth : window.innerHeight; }

  // 日本ケミコンを参考にした、セクションをつなぐ1本の細い線と丸い目印
  function buildLine() {
    if (!HM) return;
    if (!lineSvg) {
      lineSvg = document.createElementNS(SVGNS, 'svg');
      lineSvg.setAttribute('class', 'hline'); lineSvg.setAttribute('aria-hidden', 'true');
      main.insertBefore(lineSvg, main.firstChild);
    }
    var w = main.scrollWidth, h = window.innerHeight, base = window.scrollY;
    lineSvg.setAttribute('width', w); lineSvg.setAttribute('height', h);
    lineSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    var xs = orbSecs.map(function (s) { return s.getBoundingClientRect().left + base; });
    xs.push(w);
    var ys = xs.map(function (x, i) { return h * (i % 2 ? 0.93 : 0.86); });
    var d = 'M0 ' + ys[0];
    for (var i = 1; i < xs.length; i++) {
      var mx = (xs[i - 1] + xs[i]) / 2;
      d += ' C' + mx + ' ' + ys[i - 1] + ' ' + mx + ' ' + ys[i] + ' ' + xs[i] + ' ' + ys[i];
    }
    var html = '<path d="' + d + '"/>';
    for (i = 1; i < xs.length - 1; i++) html += '<circle cx="' + (xs[i] + 0.5) + '" cy="' + ys[i] + '" r="4"/>';
    lineSvg.innerHTML = html;
  }
  function layoutH() {
    if (!HM) return;
    document.body.style.height = (main.scrollWidth - window.innerWidth + window.innerHeight) + 'px';
    buildLine();
    applyH();
  }
  function applyH() {
    if (!HM) return;
    var x = window.scrollY;
    main.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
    // 「身につけていく力」の導入の見出しは、導入の区間のあいだ画面にとどまる
    var il = powers.offsetLeft + intro.offsetLeft;
    var pin = clamp(x - il, 0, Math.max(0, intro.offsetWidth - window.innerWidth));
    introInner.style.transform = 'translate3d(' + pin + 'px,0,0)';
  }
  if (HM) {
    // トラックパッドの横スワイプも、横の移動に使う
    window.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) window.scrollBy(0, e.deltaX);
    }, { passive: true });
    // キーボードの ← → でも進める
    window.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') { window.scrollBy({ top: window.innerWidth * 0.6, behavior: RM.matches ? 'auto' : 'smooth' }); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { window.scrollBy({ top: -window.innerWidth * 0.6, behavior: RM.matches ? 'auto' : 'smooth' }); e.preventDefault(); }
    });
    // ページ内リンク：横の位置へ移動する
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var el = id === 'top' ? null : document.getElementById(id);
      if (id !== 'top' && !el) return;
      e.preventDefault();
      window.scrollTo({ top: el ? docSpan(el)[0] : 0, behavior: RM.matches ? 'auto' : 'smooth' });
    });
    // Tab キーで画面外のボタンやリンクに移った時は、そこまで横に送る
    document.addEventListener('focusin', function (e) {
      if (!main.contains(e.target)) return;
      var r = e.target.getBoundingClientRect();
      if (r.left < 0 || r.right > window.innerWidth) window.scrollTo({ top: window.scrollY + r.left - window.innerWidth * 0.3, behavior: 'auto' });
    });
  }

  /* 毎フレーム呼ばれても軽いように、読むのは getBoundingClientRect だけ */
  function measure() {
    applyH();
    var vh = window.innerHeight, vw = window.innerWidth, vp = HM ? vw : vh, mid = vp * 0.5;
    // 縦スクロールなら上下、横スクロールなら左右で測る
    var A = HM ? function (r) { return r.left; } : function (r) { return r.top; };
    var B = HM ? function (r) { return r.right; } : function (r) { return r.bottom; };
    var L = HM ? function (r) { return r.width; } : function (r) { return r.height; };
    var active = null, activeEl = null;
    for (var i = 0; i < orbSecs.length; i++) {
      var r = orbSecs[i].getBoundingClientRect();
      if (A(r) <= mid && B(r) > mid) { active = orbSecs[i].dataset.orb; activeEl = orbSecs[i]; break; }
    }
    var pr = powers.getBoundingClientRect();
    var ir = intro.getBoundingClientRect();
    var pi = clamp(-A(ir) / Math.max(1, L(ir) - vp), 0, 1);
    var pre = clamp(1 - A(pr) / vp, 0, 1);

    // k：01〜08 のどこにいるか（整数＝その項目が画面の中央）
    // スマホでは光の玉が画面の上にあるので、「項目の書き出しが画面のやや下に来た時」をその項目の位置とする
    var narrow = !HM && vw < 900;
    // 横スクロールでは、説明文ではなく「1画面ぶんの項目」の中心を基準にする（説明文は画面の右側にあるため）
    var c = (HM ? items : panels).map(function (p) {
      var r = p.getBoundingClientRect();
      return narrow ? r.top + Math.min(r.height / 2, vh * 0.12) - vh * 0.12 : A(r) + L(r) / 2;
    });
    var k;
    if (mid < c[0]) k = Math.max(-1, (mid - c[0]) / Math.max(1, c[1] - c[0]));
    else if (mid >= c[c.length - 1]) k = Math.min(8, c.length - 1 + (mid - c[c.length - 1]) / Math.max(1, c[c.length - 1] - c[c.length - 2]));
    else {
      for (var j = 0; j < c.length - 1; j++) {
        if (mid >= c[j] && mid < c[j + 1]) { k = j + (mid - c[j]) / (c[j + 1] - c[j]); break; }
      }
    }
    return {
      vw: vw, vh: vh, active: active, activeEl: activeEl,
      pre: pre, pi: pi, k: k, powersTop: A(pr), powersBottom: B(pr), hmode: HM,
      after: B(pr) < mid, before: A(pr) > mid
    };
  }

  /* ---------- 01〜08 の番号・目盛り・舞台の明るさ ---------- */
  var shownIdx = -1, swapTimer = 0;
  function updateStage(m) {
    var idx = clamp(Math.round(m.k), 0, 7);
    // 舞台（番号）は、光が集まって 01 の球体になる頃から 08 の後まで
    var on = smooth(-0.25, -0.05, m.k) * (1 - smooth(7.02, 7.22, m.k));
    stage.style.setProperty('--stage', on.toFixed(3));
    // 導入の見出しは、ホワイトアウトが晴れてから現れる（光の演出が無い時・動きを減らす設定では最初から）
    var lit = doc.classList.contains('has-webgl') && !RM.matches;
    var inOp = (lit ? smooth(0.46, 0.62, m.pi) : smooth(0.02, 0.18, m.pi)) * (1 - smooth(0.9, 1.0, m.pi));
    introInner.style.opacity = (inOp * (1 - smooth(-0.7, -0.45, m.k))).toFixed(3);
    if (idx !== shownIdx) {
      shownIdx = idx;
      ticks.forEach(function (t, i) { t.classList.toggle('is-on', i === idx); });
      items.forEach(function (it, i) { it.classList.toggle('is-active', i === idx); });
      var label = ('0' + (idx + 1)).slice(-2);
      if (RM.matches || CAPTURE) { numEl.textContent = label; }
      else {
        numEl.classList.add('is-swap');
        clearTimeout(swapTimer);
        swapTimer = setTimeout(function () { numEl.textContent = label; numEl.classList.remove('is-swap'); }, 260);
      }
    }
    header.classList.toggle('is-scrolled', window.scrollY > 40);

    // 背景の星空：「身につけていく力」で星雲へ切り替え、読む区間では少し暗く
    var skyB = lit ? smooth(0.22, 0.4, m.pi) : smooth(0.3, 1, m.pre);
    if (m.after) skyB = 1;
    doc.style.setProperty('--sky-b', skyB.toFixed(3));
    var dims = { hero: 0.45, about: 0.58, for: 0.58, emotion: 0.58, why: 0.58, powers: 0.42, none: 0.72, cta: 0.55 };
    doc.style.setProperty('--sky-dim', String(dims[m.active] != null ? dims[m.active] : 0.3));
    var frac = window.scrollY / Math.max(1, document.documentElement.scrollHeight - m.vh);
    doc.style.setProperty('--bg-y', (14 - frac * 28).toFixed(1) + 'px');

    // 下部の表示：いまのセクションと進み具合（プリズムパートナー・プラポートを参考に）
    if (HM && m.activeEl) {
      var si = allSecs.indexOf(m.activeEl);
      if (si !== hbarIdx) {
        hbarIdx = si;
        hbarNum.textContent = ('0' + (si + 1)).slice(-2);
        hbarName.textContent = m.activeEl.dataset.en + ' — ' + m.activeEl.dataset.ja;
        hbarLinks.forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('href') === '#' + m.activeEl.id); });
        if (lineSvg) lineSvg.querySelectorAll('circle').forEach(function (c, i) { c.classList.toggle('is-on', i === si - 1); });
      }
      hbarProg.style.transform = 'scaleX(' + clamp(frac, 0, 1).toFixed(4) + ')';
    }
  }

  var allSecs = orbSecs.slice(), hbarIdx = -1;
  var hbarNum = document.getElementById('hbarNum'), hbarName = document.getElementById('hbarName'), hbarProg = document.getElementById('hbarProg');
  var hbarLinks = Array.prototype.slice.call(document.querySelectorAll('.hbar__nav a'));

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; updateStage(measure()); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { sizeFlow(); layoutH(); onScroll(); });
  sizeFlow();
  layoutH();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sizeFlow(); layoutH(); onScroll(); });
  window.addEventListener('load', function () { layoutH(); onScroll(); });
  updateStage(measure());
  if (CAPTURE) items.forEach(function (it) { it.classList.add('is-active'); });

  /* 確認用：?go=pi:0.4 / ?go=k:1.3 / ?go=px:1200 でその位置から表示（撮影のため） */
  var go = (location.search.match(/[?&]go=(\w+):([-\d.]+)/) || []);
  if (go[1]) {
    var gv = parseFloat(go[2]);
    var toY = function () {
      if (go[1] === 'px') return gv;
      if (go[1] === 'f') return gv * docSpan(powers)[0];
      if (go[1] === 'at') return docSpan(orbSecs[gv])[0] + (HM ? 0 : 60);
      if (go[1] === 'pi') { var is = docSpan(intro); return is[0] + gv * (is[1] - viewport()); }
      var p0 = docSpan(HM ? items[0] : panels[0]);
      var y = p0[0] + p0[1] / 2 - viewport() / 2 + gv * viewport();
      for (var it = 0; it < 12; it++) {
        window.scrollTo({ top: y, behavior: 'instant' }); var k1 = measure().k;
        window.scrollTo({ top: y + 50, behavior: 'instant' }); var k2 = measure().k;
        var slope = (k2 - k1) / 50 || 0.001;
        y = y + (gv - k1) / slope;
      }
      return y;
    };
    window.scrollTo({ top: toY(), behavior: 'instant' });
    updateStage(measure());
  }

  /* scene.js と共有 */
  window.EQS = { measure: measure, hmode: HM, docSpan: docSpan, viewport: viewport, update: function () { updateStage(measure()); }, clamp: clamp, smooth: smooth, capture: CAPTURE, reducedMotion: RM };
})();
