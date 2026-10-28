/* =========================================================
   Vision：人生・組織・社会のホログラムの投影（css/style.css の .holo と対で動く）
     ・ホログラムが画面の75%の位置まで来たら .is-on を付けて再生する（横スクロールでは右から、縦スクロールでは下から）
     ・画面の外に出たら .is-on を外し、文字も消して初期状態に戻す（戻ってきたら、もう一度再生する）
     ・枠の上下の文字（M.I.A.D00 など）は、少し遅れて1文字ずつタイピングする
   ========================================================= */
(function () {
  var holo = document.querySelector('.holo');
  if (!holo) return;
  var codes = Array.prototype.slice.call(holo.querySelectorAll('.holo__code'));
  var CAPTURE = /[?&]capture=1/.test(location.search);
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HM = window.EQS ? window.EQS.hmode : false;
  var GLYPHS = '01#/:._<>[]=+ABCDEFXYZ';
  var timers = [];

  function fillAll() { codes.forEach(function (c) { c.textContent = c.getAttribute('data-text'); }); }
  function clearAll() {
    timers.forEach(clearTimeout); timers = [];
    codes.forEach(function (c) { c.textContent = ''; });
  }
  // 1文字ずつ打ち出す。打っている最中の文字の後ろに、ちらつく記号を1つ付ける
  function typeOut(el, delay) {
    var text = el.getAttribute('data-text'), n = 0;
    function step() {
      n++;
      el.textContent = text.slice(0, n) + (n < text.length ? GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)) : '');
      if (n < text.length) timers.push(setTimeout(step, 38));
    }
    timers.push(setTimeout(step, delay));
  }
  function play() {
    clearAll();
    holo.classList.remove('is-on');
    void holo.offsetWidth;                       // いったん初期状態に戻してから再生する
    holo.classList.add('is-on');
    codes.forEach(function (c) {
      var i = +c.closest('.holo__item').style.getPropertyValue('--i') || 0;
      var bottom = c.classList.contains('holo__code--bot');
      typeOut(c, 1250 + i * 150 + (bottom ? 120 : 0));   // 枠が描かれた少しあと（CSS の時間と合わせる）
    });
  }
  function reset() { clearAll(); holo.classList.remove('is-on'); }

  if (CAPTURE || RM || !('IntersectionObserver' in window)) {   // 撮影・動きを減らす設定では、完成した状態で見せる
    holo.classList.add('is-on'); fillAll(); return;
  }
  var playing = false;
  // 再生：画面の右（縦スクロールでは下）から25%の内側に入った瞬間（＝画面の75%の位置に到達）
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting && !playing) { playing = true; play(); } });
  }, { rootMargin: HM ? '0px -25% 0px 0px' : '0px 0px -25% 0px', threshold: 0 }).observe(holo);
  // 初期化：画面から完全に出たら、元に戻す
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (!e.isIntersecting && playing) { playing = false; reset(); } });
  }, { threshold: 0 }).observe(holo);
})();
