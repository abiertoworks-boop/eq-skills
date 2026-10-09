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
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
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

  /* 毎フレーム呼ばれても軽いように、読むのは getBoundingClientRect だけ */
  function measure() {
    var vh = window.innerHeight, vw = window.innerWidth, mid = vh * 0.5;
    var active = null, activeEl = null;
    for (var i = 0; i < orbSecs.length; i++) {
      var r = orbSecs[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) { active = orbSecs[i].dataset.orb; activeEl = orbSecs[i]; break; }
    }
    var pr = powers.getBoundingClientRect();
    var ir = intro.getBoundingClientRect();
    var pi = clamp(-ir.top / Math.max(1, ir.height - vh), 0, 1);
    var pre = clamp(1 - pr.top / vh, 0, 1);

    // k：01〜08 のどこにいるか（整数＝その項目が画面の中央）
    // スマホでは光の玉が画面の上にあるので、「項目の書き出しが画面のやや下に来た時」をその項目の位置とする
    var narrow = vw < 900;
    var c = panels.map(function (p) {
      var r = p.getBoundingClientRect();
      return narrow ? r.top + Math.min(r.height / 2, vh * 0.12) - vh * 0.12 : r.top + r.height / 2;
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
      pre: pre, pi: pi, k: k, powersTop: pr.top, powersBottom: pr.bottom,
      after: pr.bottom < mid, before: pr.top > mid
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
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; updateStage(measure()); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { sizeFlow(); onScroll(); });
  sizeFlow();
  updateStage(measure());
  if (CAPTURE) items.forEach(function (it) { it.classList.add('is-active'); });

  /* 確認用：?go=pi:0.4 / ?go=k:1.3 / ?go=px:1200 でその位置から表示（撮影のため） */
  var go = (location.search.match(/[?&]go=(\w+):([-\d.]+)/) || []);
  if (go[1]) {
    var gv = parseFloat(go[2]);
    var toY = function () {
      if (go[1] === 'px') return gv;
      if (go[1] === 'f') return gv * (window.scrollY + powers.getBoundingClientRect().top);
      if (go[1] === 'at') return window.scrollY + orbSecs[gv].getBoundingClientRect().top + 60;
      if (go[1] === 'pi') { var ir = intro.getBoundingClientRect(); return window.scrollY + ir.top + gv * (ir.height - window.innerHeight); }
      var p0 = panels[0].getBoundingClientRect();
      var y = window.scrollY + p0.top + p0.height / 2 - window.innerHeight / 2 + gv * window.innerHeight;
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
  window.EQS = { measure: measure, update: function () { updateStage(measure()); }, clamp: clamp, smooth: smooth, capture: CAPTURE, reducedMotion: RM };
})();
