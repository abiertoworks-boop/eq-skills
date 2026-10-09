/* =========================================================
   EQ Skills — scene.js（光の演出 / Three.js r128）

   登場するもの
   ・背景 ……………………… 添付の星空の写真2枚（css の .sky）。この中では、旅の動きに合わせて位置と寄りを変えるだけ。
   ・宇宙の球体（トップ）… 添付の「銀河の球」と「エネルギーの球」の2枚を掛け合わせた球。左上にオレンジの光芒。
   ・周回する光の筋 ……… オレンジと青の束が球体の周りを回り、通った跡を残像として残す。
                            球体が大きく動くほど、周回の半径が広がる。定期的に外へほとばしる。
   ・白い光の球体 ………… 「身につけていく力」以降の主役（使い回す3つ）。
   ・飛ぶ光の束 ………………… 白い球体から飛び出し、手前に迫ってから奥へ曲がって進み、
                            次の地点でぶつかって白い球体になる（参考：020452）。

   スクロールとの対応（main.js の measure() の値）
     トップ〜「なぜ」 … 宇宙の球体が、セクションごとの位置へ大胆に移動（奥へ潜る・手前に迫る）
     導入 pi 0→.28    … 球体が中央で手前に迫り、画面が白く満ちる
     導入 pi .28→1    … 白が晴れると大きな白い光の球体。そこから光がほとばしる
     01〜08（k）      … 光の束が飛び出して奥へ進み、ぶつかって次の白い球体になる
     特徴〜目指すもの … 背景の星空だけ（文章を読む区間）
     最後の CTA        … 白い光の球体と、オレンジと青の光がもう一度
   ========================================================= */
(function () {
  'use strict';
  var EQS = window.EQS;
  var doc = document.documentElement;
  var canvas = document.getElementById('world');
  var whiteEl = document.getElementById('whiteout');

  function fail() { doc.classList.add('no-webgl'); doc.classList.remove('has-webgl'); }
  if (!EQS || !canvas) return;
  if (!window.THREE) { fail(); return; }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  } catch (e) { fail(); return; }
  if (!renderer.getContext()) { fail(); return; }
  doc.classList.add('has-webgl');

  var clamp = EQS.clamp, smooth = EQS.smooth;
  var CAPTURE = EQS.capture;
  var rmQuery = EQS.reducedMotion;
  var RM = rmQuery.matches;
  if (rmQuery.addEventListener) rmQuery.addEventListener('change', function (e) { RM = e.matches; });
  var DEBUG = (location.search.match(/[?&]debug=(\w+)/) || [])[1] || '';

  var V3 = THREE.Vector3;
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(seed) { var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* ---------- 基本 ---------- */
  var scene = new THREE.Scene();
  var FOV = 35, CAM_Z = 10;
  var TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  var camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 600);
  camera.rotation.order = 'YXZ';
  var HH = CAM_Z * TAN;              // 既定のカメラで z=0 の画面の半分の高さ
  var W = 1, H = 1, ASPECT = 1;
  var bufSize = new THREE.Vector2();
  renderer.setClearColor(0x000000, 0);

  function toWorld(px, py) { return [(px / W * 2 - 1) * HH * ASPECT, -(py / H * 2 - 1) * HH]; }
  function pxToWorld(px) { return px / H * 2 * HH; }

  /* ---------- GLSL 部品 ---------- */
  var NOISE = [
    'float hash(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
    'float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);',
    ' return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
    '            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}',
    'float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<6;i++){v+=a*noise(p);p*=2.03;a*=0.5;}return v;}',
    'float billow(vec3 p){float v=0.0,a=0.5;for(int i=0;i<6;i++){v+=a*(1.0-abs(noise(p)*2.0-1.0));p*=2.07;a*=0.5;}return v;}'
  ].join('\n');

  function glowTexture(stops) {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d'); var gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  var TEX_HALO = glowTexture([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.75)'], [0.32, 'rgba(200,220,255,0.22)'], [0.62, 'rgba(140,170,255,0.06)'], [1, 'rgba(120,150,255,0)']]);
  var TEX_WARM = glowTexture([[0, 'rgba(255,214,160,0.9)'], [0.25, 'rgba(255,160,80,0.32)'], [0.6, 'rgba(255,120,40,0.06)'], [1, 'rgba(255,120,40,0)']]);
  var TEX_COOL = glowTexture([[0, 'rgba(190,220,255,0.9)'], [0.25, 'rgba(90,150,255,0.32)'], [0.6, 'rgba(60,110,255,0.06)'], [1, 'rgba(60,110,255,0)']]);
  var TEX_DOT = glowTexture([[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);

  var ORANGE = [1.0, 0.58, 0.22], ORANGE_HI = [1.0, 0.86, 0.6];
  var BLUE = [0.22, 0.52, 1.0], BLUE_HI = [0.68, 0.86, 1.0];

  /* =========================================================
     宇宙の球体（トップ）— 添付の2枚を掛け合わせる
       ・images/orb-galaxy.webp … 銀河が詰まった青い球（球と一緒に回る模様）
       ・images/orb-energy.webp … 縁が渦巻いて光る青いエネルギー球（輪郭に貼りつく光）
     2枚を「スクリーン合成」で重ね、縁の青い光と中心の輝きを足す。左上にオレンジの光芒。
     画像が読めない間は、ノイズで描いた代わりの模様を使う。
     ========================================================= */
  var IMG_GAL = { c: [0.5, 0.4894], r: [0.3225, 0.4562] };   // 画像の中の球の中心と半径（UV）
  var IMG_EN = { c: [0.524, 0.553], r: [0.216, 0.3055] };
  var loader = new THREE.TextureLoader();
  var orbU = {
    uGal: { value: null }, uEn: { value: null }, uReady: { value: 0 },
    uTime: { value: 0 }, uOpacity: { value: 1 }, uRot: { value: 0 }, uBeat: { value: 0 }
  };
  var texCount = 0;
  function texLoaded(t) { t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; if (++texCount === 2) orbU.uReady.value = 1; }
  loader.load('images/orb-galaxy.webp', function (t) { orbU.uGal.value = t; texLoaded(t); });
  loader.load('images/orb-energy.webp', function (t) { orbU.uEn.value = t; texLoaded(t); });

  var orb = new THREE.Group();
  scene.add(orb);
  var spin = new THREE.Group();
  orb.add(spin);
  var orbMat = new THREE.ShaderMaterial({
    uniforms: orbU,
    vertexShader: [
      'varying vec3 vN;varying vec3 vV;varying vec3 vO;',
      'void main(){vO=normalize(position);vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;varying vec3 vN;varying vec3 vV;varying vec3 vO;',
      'uniform sampler2D uGal,uEn;uniform float uReady,uTime,uOpacity,uRot,uBeat;', NOISE,
      'void main(){',
      ' vec3 N=normalize(vN);float ndv=clamp(dot(N,normalize(vV)),0.0,1.0);',
      ' vec3 o=normalize(vO);',
      // 銀河：球と一緒に回る（物体の向きで画像の円の中を読む。裏側は鏡写し）
      ' vec2 gp=o.xy;',                                              // 裏側は前側を鏡写し（xy をそのまま使うと赤道でつながる）
      ' vec2 guv=vec2(' + IMG_GAL.c[0] + ',' + IMG_GAL.c[1] + ')+gp*vec2(' + IMG_GAL.r[0] + ',' + IMG_GAL.r[1] + ')*0.94;',
      // エネルギー：輪郭に貼りつき、画面の奥行き方向の軸でゆっくり回る
      ' float c=cos(uRot),s=sin(uRot);',
      ' vec2 ep=vec2(c*N.x-s*N.y,s*N.x+c*N.y);',
      ' vec2 euv=vec2(' + IMG_EN.c[0] + ',' + IMG_EN.c[1] + ')+ep*vec2(' + IMG_EN.r[0] + ',' + IMG_EN.r[1] + ')*0.985;',
      ' float sw=fbm(o*3.2+vec3(0.0,uTime*0.05,0.0));',
      ' vec3 procG=vec3(0.05,0.16,0.45)*sw*1.6+vec3(0.6,0.8,1.0)*smoothstep(0.78,0.95,noise(o*40.0));',
      ' vec3 procE=vec3(0.15,0.45,1.0)*pow(1.0-ndv,1.6)*(0.6+0.8*sw);',
      ' vec3 gal=uReady>0.5?texture2D(uGal,guv).rgb:procG;',
      // 画像の円の縁（球の赤道付近）は模様が引き伸ばされるので、ノイズの模様へなじませて境目を消す
      ' float seam=smoothstep(0.0,0.45,abs(o.z));',
      ' vec3 edgeCol=vec3(0.06,0.20,0.55)*(0.55+0.9*sw)+vec3(0.55,0.75,1.0)*smoothstep(0.8,0.96,noise(o*36.0))*0.7;',
      ' gal=mix(edgeCol,gal,seam);',
      ' vec3 en=uReady>0.5?texture2D(uEn,euv).rgb:procE;',
      // 銀河の画像の、赤い光芒が写り込んだ部分は青寄りに戻す（光芒は別に描く）
      ' float warm=smoothstep(0.0,0.35,gal.r-gal.b);',
      ' gal=mix(gal,vec3(dot(gal,vec3(0.3,0.59,0.11)))*vec3(0.75,0.9,1.25),warm*0.8);',
      // スクリーン合成で「掛け合わせる」
      ' vec3 col=1.0-(1.0-gal*1.05)*(1.0-en*1.25);',
      ' col+=vec3(0.22,0.52,1.0)*pow(1.0-ndv,2.6)*0.9;',          // 縁の青い光
      ' col+=vec3(0.75,0.88,1.0)*pow(ndv,9.0)*(0.3+0.25*uBeat);',  // 中心の輝き（心の、ゆっくりした呼吸）
      ' gl_FragColor=vec4(col,uOpacity);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: true
  });
  var core = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), orbMat);
  core.renderOrder = 1;
  spin.add(core);
  // 青い後光
  function orbSprite(tex, op, sx, sy, x, y) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op }));
    s.scale.set(sx, sy, 1); s.position.set(x || 0, y || 0, -0.2); s.userData.op = op; orb.add(s); return s;
  }
  // オレンジの光芒（3枚目の画像の左上の光）：放射する筋を canvas で描く
  var TEX_FLARE = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 512;
    var x = c.getContext('2d'); x.translate(256, 256);
    for (var i = 0; i < 46; i++) {
      var a = rand(i + 8000) * Math.PI * 2, len = 120 + rand(i + 8100) * 140, w = 0.012 + rand(i + 8200) * 0.03;
      var g = x.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,230,180,0.55)'); g.addColorStop(0.35, 'rgba(255,140,50,0.22)'); g.addColorStop(1, 'rgba(200,40,40,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, len, a - w, a + w); x.closePath(); x.fill();
    }
    var r = x.createRadialGradient(0, 0, 0, 0, 0, 120);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(255,236,200,0.85)'); r.addColorStop(0.5, 'rgba(255,150,60,0.18)'); r.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = r; x.beginPath(); x.arc(0, 0, 120, 0, Math.PI * 2); x.fill();
    return new THREE.CanvasTexture(c);
  })();
  var halo1 = orbSprite(TEX_COOL, 0.75, 3.3, 3.3);
  var halo2 = orbSprite(TEX_COOL, 0.25, 7, 7);
  var flare = orbSprite(TEX_FLARE, 0.85, 3.2, 3.2, -0.68, 0.62);
  flare.position.z = 0.6; flare.material.depthTest = false; flare.renderOrder = 5;

  /* =========================================================
     球体を周回する光の筋（オレンジと青）— 残像を引く
       意味：球体＝心、周りを回る8本の光＝身につけていく8つのSkill（01〜08）。
       頭の位置を毎フレーム記録し、その履歴を帯にする。球体が動くと、
       周回の半径が大きくなり、通った跡が光の残像として残る。
     ========================================================= */
  var NS = 8, TF = 5, TP = 90;               // 筋の数・1本の束の線の数（＋ぼかし1本）・残像の長さ
  var TS = TF + 1;
  var sDefs = [];
  for (var si = 0; si < NS; si++) {
    var nn = new V3(rand(si + 900) - 0.5, rand(si + 910) * 0.8 - 0.4, rand(si + 920) - 0.5).normalize();
    var tt = Math.abs(nn.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    var a1 = new V3().crossVectors(nn, tt).normalize(), a2 = new V3().crossVectors(nn, a1).normalize();
    sDefs.push({
      e1: a1, e2: a2, th: rand(si + 930) * 6.28,
      w: (0.55 + rand(si + 940) * 0.5) * (si % 3 === 0 ? -1 : 1),
      rr: 1.22 + rand(si + 950) * 0.28,
      axis: new V3(rand(si + 960) - 0.5, rand(si + 970) - 0.5, rand(si + 980) - 0.5).normalize(),
      prec: 0.06 + rand(si + 990) * 0.1,
      col: si % 2 === 0 ? ORANGE : BLUE,
      hist: [], head: new V3()
    });
    for (var hh = 0; hh < TP; hh++) sDefs[si].hist.push(new V3());
  }
  var stVerts = NS * TS * TP * 2;
  var stPos = new Float32Array(stVerts * 3), stUV = new Float32Array(stVerts * 2), stCol = new Float32Array(stVerts * 4), stMeta = new Float32Array(stVerts * 2), stIdx = [], sv = 0;
  var stCoef = [];
  for (si = 0; si < NS; si++) {
    for (var fj = 0; fj < TS; fj++) {
      var glw = fj === TF, sdr = rand(si * 20 + fj + 9000);
      stCoef.push({ c: glw ? 0 : (fj / (TF - 1)) * 2 - 1, d: rand(si * 20 + fj + 9100) - 0.5, w: glw ? 0.3 : 0.024 + sdr * 0.016, glow: glw });
      for (var pk = 0; pk < TP; pk++) {
        for (var s2 = 0; s2 < 2; s2++) {
          stUV.set([pk / (TP - 1), s2 ? 1 : -1], sv * 2);
          stCol.set([sDefs[si].col[0], sDefs[si].col[1], sDefs[si].col[2], glw ? 0.22 : 1.0 + sdr * 0.5], sv * 4);
          stMeta.set([glw ? 1.3 : 3.2, sdr], sv * 2);
          sv++;
        }
        if (pk < TP - 1) { var qq = sv - 2; stIdx.push(qq, qq + 1, qq + 2, qq + 1, qq + 3, qq + 2); }
      }
    }
  }
  var strandGeo = new THREE.BufferGeometry();
  strandGeo.setAttribute('position', new THREE.BufferAttribute(stPos, 3).setUsage(THREE.DynamicDrawUsage));
  strandGeo.setAttribute('aUV', new THREE.BufferAttribute(stUV, 2));
  strandGeo.setAttribute('aCol', new THREE.BufferAttribute(stCol, 4));
  strandGeo.setAttribute('aMeta', new THREE.BufferAttribute(stMeta, 2));
  strandGeo.setIndex(stIdx);
  // 材質は「飛ぶ束」と同じ見た目（下で flightMat を作った後に差し込む）
  var strands = new THREE.Mesh(strandGeo, null);
  strands.frustumCulled = false; strands.renderOrder = 3;
  scene.add(strands);

  var qTmp = new THREE.Quaternion(), hTmp = new V3();
  var strandAcc = 0, strandsFresh = true;
  // 頭の位置を進める（center＝球の中心、r＝球の半径、radius＝周回半径の倍率）
  var prevCenter = new V3(), prevR = 0;
  function headAt(d, th, center, R, out) {
    return out.copy(center).addScaledVector(d.e1, Math.cos(th) * R).addScaledVector(d.e2, Math.sin(th) * R);
  }
  function stepStrands(dt, center, r, radius, boost) {
    if (strandsFresh) { prevCenter.copy(center); prevR = r * radius; }
    strandAcc += dt;
    var n = 0; while (strandAcc >= 1 / 60 && n < 8) { strandAcc -= 1 / 60; n++; }
    if (strandAcc > 1 / 60) strandAcc = 0;
    for (var i = 0; i < NS; i++) {
      var d = sDefs[i];
      var dth = dt * d.w * (1 + boost);
      qTmp.setFromAxisAngle(d.axis, dt * d.prec); d.e1.applyQuaternion(qTmp); d.e2.applyQuaternion(qTmp);
      // 1コマの間の動きを補間して記録する（同じ点が重なると帯がはしご状に崩れるため）
      for (var s = 1; s <= n; s++) {
        var fr = s / n;
        hTmp.copy(prevCenter).lerp(center, fr);
        var hs = d.hist; var v = hs.shift();
        headAt(d, d.th + dth * fr, hTmp, lerp(prevR, r * radius, fr) * d.rr, v); hs.push(v);
      }
      d.th += dth;
      headAt(d, d.th, center, r * radius * d.rr, d.head);
    }
    prevCenter.copy(center); prevR = r * radius;
    if (strandsFresh) {   // 現れた直後は、今の位置で履歴を埋める（遠くから線が伸びないように）
      for (i = 0; i < NS; i++) {
        var dd = sDefs[i], R2 = r * dd.rr * radius;
        for (var k = 0; k < TP; k++) {
          var th2 = dd.th - (TP - 1 - k) / 60 * dd.w;
          dd.hist[k].copy(center).addScaledVector(dd.e1, Math.cos(th2) * R2).addScaledVector(dd.e2, Math.sin(th2) * R2);
        }
      }
      strandsFresh = false;
    }
  }
  var Sv2 = new V3(), Uv2 = new V3(), Tv2 = new V3(), Vv2 = new V3(), Pt2 = new V3();
  function buildStrands(camPos, r) {
    var o = 0;
    for (var i = 0; i < NS; i++) {
      var hs = sDefs[i].hist;
      for (var fj = 0; fj < TS; fj++) {
        var fc = stCoef[i * TS + fj];
        for (var q = 0; q < TP; q++) {
          var c = hs[q], nx = hs[Math.min(q + 1, TP - 1)], pv = hs[Math.max(q - 1, 0)];
          Tv2.subVectors(nx, pv); if (Tv2.lengthSq() < 1e-10) Tv2.set(1, 0, 0); Tv2.normalize();
          Vv2.subVectors(c, camPos).normalize();
          Sv2.crossVectors(Tv2, Vv2); if (Sv2.lengthSq() < 1e-8) Sv2.set(0, 1, 0); Sv2.normalize();
          Uv2.crossVectors(Sv2, Tv2).normalize();
          var u = q / (TP - 1);
          var spread = r * (0.015 + 0.05 * (1 - u));          // 尾に向かってほどける
          var th = u * 7 + i;
          var ct = Math.cos(th), st = Math.sin(th);
          Pt2.set(
            c.x + (Sv2.x * ct + Uv2.x * st) * fc.c * spread + Uv2.x * fc.d * spread * 0.3,
            c.y + (Sv2.y * ct + Uv2.y * st) * fc.c * spread + Uv2.y * fc.d * spread * 0.3,
            c.z + (Sv2.z * ct + Uv2.z * st) * fc.c * spread + Uv2.z * fc.d * spread * 0.3);
          if (Pt2.z > camPos.z - 0.6) Pt2.z = camPos.z - 0.6;
          var w = fc.w * r * (0.25 + 0.75 * Math.pow(u, 0.7));
          var oo = o * 3;
          stPos[oo] = Pt2.x - Sv2.x * w; stPos[oo + 1] = Pt2.y - Sv2.y * w; stPos[oo + 2] = Pt2.z - Sv2.z * w;
          stPos[oo + 3] = Pt2.x + Sv2.x * w; stPos[oo + 4] = Pt2.y + Sv2.y * w; stPos[oo + 5] = Pt2.z + Sv2.z * w;
          o += 2;
        }
      }
    }
    strandGeo.attributes.position.needsUpdate = true;
  }
  /* =========================================================
     白い光の球体（「身につけていく力」以降）— 使い回す3つ
     ========================================================= */
  var lightMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: 'varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader: [
      'precision highp float;varying vec3 vN;varying vec3 vV;varying vec3 vP;uniform float uTime,uOpacity;', NOISE,
      'void main(){',
      ' vec3 N=normalize(vN);float ndv=clamp(dot(N,normalize(vV)),0.0,1.0);',
      ' float sh=fbm(vP*2.4+vec3(uTime*0.12,0.0,uTime*0.05));',
      ' vec3 col=vec3(1.0)*(1.0+0.15*pow(ndv,2.0))+(sh-0.5)*0.05;',
      ' vec3 rim=mix(vec3(0.62,0.80,1.0),vec3(1.0,0.80,0.58),smoothstep(-0.6,0.6,N.y));',
      ' col=mix(col,rim,pow(1.0-ndv,2.2)*0.55);',
      ' gl_FragColor=vec4(col,uOpacity*(0.35+0.65*smoothstep(0.0,0.55,ndv)));',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: true, blending: THREE.AdditiveBlending
  });
  var lightGeo = new THREE.SphereGeometry(1, 64, 40);
  function makeLight() {
    var g = new THREE.Group();
    var m = new THREE.Mesh(lightGeo, lightMat.clone());
    m.renderOrder = 1;
    g.add(m);
    function spr(tex, op, sx, sy, y) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: op }));
      s.renderOrder = 2;
      s.scale.set(sx, sy, 1); s.position.set(0, y || 0, y ? -0.4 : 0); g.add(s); return s;
    }
    var h1 = spr(TEX_HALO, 0.9, 3.6, 3.6), h2 = spr(TEX_HALO, 0.3, 8.5, 8.5);
    var hw = spr(TEX_WARM, 0.4, 5.5, 2.8, 1.0), hc = spr(TEX_COOL, 0.4, 5.5, 2.8, -1.0);
    var flash = spr(TEX_HALO, 0, 16, 16);
    g.userData = { mesh: m, h1: h1, h2: h2, hw: hw, hc: hc, flash: flash };
    g.visible = false;
    scene.add(g);
    return g;
  }
  var lights = [makeLight(), makeLight(), makeLight()];
  function setLight(L, pos, radius, op, flashA) {
    L.visible = op > 0.003 || flashA > 0.003;
    if (!L.visible) return;
    L.position.copy(pos);
    L.scale.setScalar(Math.max(0.001, radius));
    var u = L.userData;
    u.mesh.material.uniforms.uOpacity.value = op;
    u.mesh.material.uniforms.uTime.value = time;
    u.mesh.visible = op > 0.003;
    u.h1.material.opacity = 1.0 * op; u.h2.material.opacity = 0.55 * op;
    u.hw.material.opacity = 0.42 * op; u.hc.material.opacity = 0.42 * op;
    u.flash.material.opacity = flashA || 0;
  }

  /* =========================================================
     周回する光の束（オレンジと青）— 定期的に外側へほとばしる
     ========================================================= */
  var OB = 6, OF = 9, OP = 110;   // 束の数・1束の線の数（最後の1本はぼかしの光）・点の数
  var oE1 = [], oE2 = [], oSpeed = [];
  var b, f, p, s, i, k, q0;
  for (b = 0; b < OB; b++) {
    var nrm = new V3(rand(b + 900) - 0.5, rand(b + 910) - 0.5, rand(b + 920) - 0.5).normalize();
    var tmp = Math.abs(nrm.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    var e1 = new V3().crossVectors(nrm, tmp).normalize();
    var e2 = new V3().crossVectors(nrm, e1).normalize();
    oE1.push(e1); oE2.push(e2);
    oSpeed.push((0.25 + rand(b + 930) * 0.35) * (rand(b + 940) > 0.5 ? 1 : -1));
  }
  var oVerts = OB * OF * OP * 2;
  var oA = new Float32Array(oVerts * 4), oB = new Float32Array(oVerts * 4), oC = new Float32Array(oVerts * 3);
  var oIdx = [], ov = 0;
  for (b = 0; b < OB; b++) {
    var rad = 1.32 + rand(b + 950) * 0.75;
    var span = Math.PI * (0.9 + rand(b + 960) * 0.8);
    var a0 = rand(b + 970) * Math.PI * 2;
    var colr = b % 2 === 0 ? ORANGE : BLUE;
    for (f = 0; f < OF; f++) {
      var glow = f === OF - 1;
      var rr = rad + (glow ? 0 : (rand(b * 50 + f) - 0.5) * 0.16);
      var seed = rand(b * 50 + f + 7);
      var w = glow ? 0.2 : 0.014 + seed * 0.012;
      var alpha = glow ? 0.16 : 0.8 + seed * 0.5;
      var lag = glow ? 0 : seed * 0.12;
      for (p = 0; p < OP; p++) {
        var ul = p / (OP - 1);
        var th = a0 + (ul - lag) * span;
        for (s = 0; s < 2; s++) {
          oA.set([th, rr, b, s ? 1 : -1], ov * 4);
          oB.set([seed, ul, w, alpha], ov * 4);
          oC.set(colr, ov * 3);
          ov++;
        }
        if (p < OP - 1) { q0 = ov - 2; oIdx.push(q0, q0 + 1, q0 + 2, q0 + 1, q0 + 3, q0 + 2); }
      }
    }
  }
  var orbitGeo = new THREE.BufferGeometry();
  orbitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(oVerts * 3), 3));
  orbitGeo.setAttribute('aA', new THREE.BufferAttribute(oA, 4));
  orbitGeo.setAttribute('aB', new THREE.BufferAttribute(oB, 4));
  orbitGeo.setAttribute('aC', new THREE.BufferAttribute(oC, 3));
  orbitGeo.setIndex(oIdx);
  function makeOrbitMat() {
    var spins = []; for (var i = 0; i < OB; i++) spins.push(0);
    return new THREE.ShaderMaterial({
      uniforms: {
        uE1: { value: oE1 }, uE2: { value: oE2 }, uSpin: { value: spins },
        uTime: { value: 0 }, uBurst: { value: 0 }, uScale: { value: 1 }, uOpacity: { value: 1 }
      },
      vertexShader: [
        'attribute vec4 aA;attribute vec4 aB;attribute vec3 aC;',
        'uniform vec3 uE1[6];uniform vec3 uE2[6];uniform float uSpin[6];uniform float uTime,uBurst,uScale;',
        'varying vec2 vUV;varying vec3 vC;varying float vSeed,vAlpha,vSharp;',
        'void main(){',
        ' int bi=int(aA.z+0.5);',
        ' vec3 e1=uE1[0],e2=uE2[0];float sp=uSpin[0];',
        ' for(int i=1;i<6;i++){ if(i==bi){e1=uE1[i];e2=uE2[i];sp=uSpin[i];} }',
        ' float th=aA.x+sp;',
        ' float r=aA.y*(1.0+0.03*sin(th*3.0+aB.x*20.0+uTime*0.7))*uScale*(1.0+uBurst*(1.1+aB.x*1.8));',
        ' vec3 d=e1*cos(th)+e2*sin(th);',
        ' vec3 n=normalize(cross(e1,e2));',
        ' vec3 p=d*r+(d*0.6+n*0.8)*aA.w*aB.z*(1.0+uBurst*2.0);',
        ' vUV=vec2(aB.y,aA.w);vC=aC;vSeed=aB.x;vAlpha=aB.w;vSharp=aB.z>0.1?1.4:3.2;',
        ' gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;varying vec2 vUV;varying vec3 vC;varying float vSeed,vAlpha,vSharp;uniform float uTime,uBurst,uOpacity;',
        'void main(){',
        ' float prof=exp(-vUV.y*vUV.y*vSharp);',
        ' float u=vUV.x;',
        ' float ends=smoothstep(0.0,0.22,u)*smoothstep(1.0,0.86,u);',
        ' float flow=pow(0.5+0.5*sin(u*26.0-uTime*(2.4+vSeed*2.0)+vSeed*30.0),5.0);',
        ' vec3 c=mix(vC,vec3(1.0),pow(prof,6.0)*0.55+flow*0.25);',
        ' float a=prof*ends*(0.30+0.70*pow(u,1.3))*(0.55+0.65*flow)*vAlpha*uOpacity*pow(1.0-uBurst,1.4);',
        ' gl_FragColor=vec4(c*a,a);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
  }
  function makeOrbit(parent) {
    var base = new THREE.Mesh(orbitGeo, makeOrbitMat());
    var burst = new THREE.Mesh(orbitGeo, makeOrbitMat());
    base.frustumCulled = burst.frustumCulled = false;
    base.renderOrder = burst.renderOrder = 3;
    parent.add(base); parent.add(burst);
    return { base: base, burst: burst };
  }

  // ほとばしる時の光の粒（球の表面から外へ）
  var SPK = 120;
  var spkDir = new Float32Array(SPK * 3), spkMeta = new Float32Array(SPK * 2);
  for (i = 0; i < SPK; i++) {
    var dv = new V3(rand(i + 1200) - 0.5, rand(i + 1300) - 0.5, rand(i + 1400) - 0.5).normalize();
    spkDir.set([dv.x, dv.y, dv.z], i * 3);
    spkMeta.set([0.5 + rand(i + 1500), rand(i + 1600)], i * 2);
  }
  var spkGeo = new THREE.BufferGeometry();
  spkGeo.setAttribute('position', new THREE.BufferAttribute(spkDir, 3));
  spkGeo.setAttribute('aMeta', new THREE.BufferAttribute(spkMeta, 2));
  function makeSparkMat() {
    return new THREE.ShaderMaterial({
      uniforms: { uB: { value: 0 }, uOpacity: { value: 1 }, uTex: { value: TEX_DOT }, uPx: { value: 1 } },
      vertexShader: [
        'attribute vec2 aMeta;uniform float uB,uPx;varying float vA;varying float vW;',
        'void main(){',
        ' float e=1.0-pow(1.0-uB,2.5);',
        ' vec3 p=position*(1.05+e*aMeta.x*2.6);',
        ' vec4 mv=modelViewMatrix*vec4(p,1.0);',
        ' gl_PointSize=uPx*(1.0+aMeta.y*2.0)*(1.0-uB*0.5)/max(0.5,-mv.z);',
        ' vA=(1.0-uB)*step(0.001,uB);vW=aMeta.y;',
        ' gl_Position=projectionMatrix*mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;uniform sampler2D uTex;uniform float uOpacity;varying float vA;varying float vW;',
        'void main(){vec4 t=texture2D(uTex,gl_PointCoord);vec3 c=vW>0.5?vec3(1.0,0.72,0.4):vec3(0.55,0.78,1.0);',
        ' float a=t.a*vA*uOpacity;gl_FragColor=vec4(c*a,a);}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
  }
  function makeSparks(parent) { var pt = new THREE.Points(spkGeo, makeSparkMat()); pt.frustumCulled = false; pt.renderOrder = 4; parent.add(pt); return pt; }

  var heroSparks = makeSparks(orb);
  var lightRig = new THREE.Group();             // 白い光の球体の周り（使う球体に付け替える）
  scene.add(lightRig);
  var lightOrbit = makeOrbit(lightRig);
  var lightSparks = makeSparks(lightRig);

  /* =========================================================
     飛ぶ光の束（020452 のトレース）— 球体から飛び出し、手前に迫り、奥へ曲がって進む
     ========================================================= */
  var FB = 4, FF = 12, FG = 2, FP = 72;     // 束の数・線の数・ぼかしの数・点の数
  var FS = FF + FG;
  var fVerts = FB * FS * FP * 2;
  var fPos = new Float32Array(fVerts * 3), fUV = new Float32Array(fVerts * 2), fCol = new Float32Array(fVerts * 4), fMeta = new Float32Array(fVerts * 2);
  var fIdx = [], fv = 0;
  var fiberCoef = [];
  for (b = 0; b < FB; b++) {
    var cAcol = b % 2 === 0 ? ORANGE : BLUE;
    for (f = 0; f < FS; f++) {
      var gl = f >= FF;
      var sd2 = rand(b * 40 + f + 3000);
      fiberCoef.push({ c: gl ? 0 : (f / (FF - 1)) * 2 - 1 + (sd2 - 0.5) * 0.15, d: (rand(b * 40 + f + 3100) - 0.5), lag: gl ? 0 : sd2 * 0.035, w: gl ? 0.6 : 0.04 + sd2 * 0.035, glow: gl });
      for (p = 0; p < FP; p++) {
        for (s = 0; s < 2; s++) {
          fUV.set([p / (FP - 1), s ? 1 : -1], fv * 2);
          fCol.set([cAcol[0], cAcol[1], cAcol[2], gl ? 0.13 : 0.75 + sd2 * 0.5], fv * 4);
          fMeta.set([gl ? 1.3 : 3.2, sd2], fv * 2);
          fv++;
        }
        if (p < FP - 1) { q0 = fv - 2; fIdx.push(q0, q0 + 1, q0 + 2, q0 + 1, q0 + 3, q0 + 2); }
      }
    }
  }
  var flightGeo = new THREE.BufferGeometry();
  flightGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3).setUsage(THREE.DynamicDrawUsage));
  flightGeo.setAttribute('aUV', new THREE.BufferAttribute(fUV, 2));
  flightGeo.setAttribute('aCol', new THREE.BufferAttribute(fCol, 4));
  flightGeo.setAttribute('aMeta', new THREE.BufferAttribute(fMeta, 2));
  flightGeo.setIndex(fIdx);
  var flightMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: 'attribute vec2 aUV;attribute vec4 aCol;attribute vec2 aMeta;varying vec2 vUV;varying vec4 vCol;varying vec2 vMeta;void main(){vUV=aUV;vCol=aCol;vMeta=aMeta;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: [
      'precision highp float;varying vec2 vUV;varying vec4 vCol;varying vec2 vMeta;uniform float uTime,uOpacity;',
      'void main(){',
      ' float prof=exp(-vUV.y*vUV.y*vMeta.x);',
      ' float u=vUV.x;',
      ' float flow=pow(0.5+0.5*sin(u*22.0-uTime*7.0+vMeta.y*30.0),4.0);',
      ' vec3 c=mix(vCol.rgb,vec3(1.0),pow(prof,6.0)*0.6*u+flow*0.2);',
      ' float a=prof*pow(u,1.25)*smoothstep(0.0,0.06,u)*(0.6+0.6*flow)*vCol.a*uOpacity;',
      ' gl_FragColor=vec4(c*a,a);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  var flight = new THREE.Mesh(flightGeo, flightMat);
  flight.frustumCulled = false; flight.renderOrder = 3;
  scene.add(flight);
  // 先端の火花
  var FSP = FB * 14;
  var fspPos = new Float32Array(FSP * 3), fspCol = new Float32Array(FSP * 3);
  var fspGeo = new THREE.BufferGeometry();
  fspGeo.setAttribute('position', new THREE.BufferAttribute(fspPos, 3).setUsage(THREE.DynamicDrawUsage));
  fspGeo.setAttribute('color', new THREE.BufferAttribute(fspCol, 3));
  for (i = 0; i < FSP; i++) fspCol.set(Math.floor(i / 14) % 2 === 0 ? ORANGE_HI : BLUE_HI, i * 3);
  var fspMat = new THREE.PointsMaterial({ map: TEX_DOT, size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 });
  var flightSparks = new THREE.Points(fspGeo, fspMat);
  flightSparks.frustumCulled = false;
  scene.add(flightSparks);

  /* ---------- 放射状にほとばしる光（白い球体の誕生・ぶつかった瞬間） ---------- */
  var RS = 84, RP = 20;
  var rVerts = RS * RP * 2;
  var rDir = new Float32Array(rVerts * 3), rPerp = new Float32Array(rVerts * 3), rWv = new Float32Array(rVerts * 3), rMeta = new Float32Array(rVerts * 4), rIdx = [], rv = 0;
  for (i = 0; i < RS; i++) {
    var d0 = new V3(rand(i + 4000) - 0.5, rand(i + 4100) - 0.5, (rand(i + 4200) - 0.3) * 1.1).normalize();
    var t0 = Math.abs(d0.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    var pp = new V3().crossVectors(d0, t0).normalize();
    var wv = new V3().crossVectors(d0, pp).normalize();
    var spd = 0.45 + rand(i + 4300) * 0.75;
    for (p = 0; p < RP; p++) {
      for (s = 0; s < 2; s++) {
        rDir.set([d0.x, d0.y, d0.z], rv * 3); rPerp.set([pp.x, pp.y, pp.z], rv * 3); rWv.set([wv.x, wv.y, wv.z], rv * 3);
        rMeta.set([p / (RP - 1), s ? 1 : -1, spd, rand(i + 4400)], rv * 4);
        rv++;
      }
      if (p < RP - 1) { q0 = rv - 2; rIdx.push(q0, q0 + 1, q0 + 2, q0 + 1, q0 + 3, q0 + 2); }
    }
  }
  var rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.BufferAttribute(rDir, 3));
  rayGeo.setAttribute('aPerp', new THREE.BufferAttribute(rPerp, 3));
  rayGeo.setAttribute('aWv', new THREE.BufferAttribute(rWv, 3));
  rayGeo.setAttribute('aMeta', new THREE.BufferAttribute(rMeta, 4));
  rayGeo.setIndex(rIdx);
  var rayMat = new THREE.ShaderMaterial({
    uniforms: { uB: { value: 0 }, uOpacity: { value: 1 }, uReach: { value: 9 } },
    vertexShader: [
      'attribute vec3 aPerp;attribute vec3 aWv;attribute vec4 aMeta;uniform float uB,uReach;varying vec2 vUV;varying float vSeed;',
      'void main(){',
      ' float e=1.0-pow(1.0-uB,3.0);',
      ' float head=1.0+e*aMeta.z*uReach;',
      ' float len=(0.8+aMeta.z*2.6)*(0.25+e);',
      ' float r=max(0.98,head-(1.0-aMeta.x)*len);',
      ' vec3 p=position*r+aPerp*sin(r*0.45+aMeta.w*6.0)*(r-1.0)*0.12;',
      ' p+=aWv*aMeta.y*(0.035+0.03*aMeta.x)*(1.0+r*0.06);',
      ' vUV=vec2(aMeta.x,aMeta.y);vSeed=aMeta.w;',
      ' gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;varying vec2 vUV;varying float vSeed;uniform float uB,uOpacity;',
      'void main(){',
      ' float prof=exp(-vUV.y*vUV.y*3.0);',
      ' vec3 c=vSeed>0.5?vec3(1.0,0.6,0.25):vec3(0.3,0.58,1.0);',
      ' c=mix(c,vec3(1.0),pow(prof,5.0)*0.6);',
      ' float a=prof*pow(vUV.x,1.4)*pow(1.0-uB,1.3)*step(0.0005,uB)*uOpacity;',
      ' gl_FragColor=vec4(c*a,a);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  var rays = new THREE.Mesh(rayGeo, rayMat);
  rays.frustumCulled = false; rays.renderOrder = 4;
  scene.add(rays);

  /* ---------- 旅の空間に漂う光の粒（奥行きの手がかり） ---------- */
  var DUST = 900;
  var dustPos = new Float32Array(DUST * 3);
  for (i = 0; i < DUST; i++) {
    dustPos[i * 3] = (rand(i + 5000) - 0.5) * 90;
    dustPos[i * 3 + 1] = (rand(i + 5100) - 0.5) * 40;
    dustPos[i * 3 + 2] = 20 - rand(i + 5200) * 420;
  }
  var dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  var dustMat = new THREE.PointsMaterial({ map: TEX_DOT, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xd8e6ff });
  var dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  /* =========================================================
     旅の道筋：白い球体の地点（0＝導入、1〜8＝01〜08）
     ========================================================= */
  var DEPTH = 46, DD = 14;
  var XS = [-14, 16, -12, 18, -16, 12, -18, 14], YS = [3, -2, 2.5, -3, 1.5, -2, 3, -1.5];
  var NODES = [new V3(0, 0, 0)];
  for (i = 0; i < 8; i++) NODES.push(NODES[i].clone().add(new V3(XS[i], YS[i], -DEPTH)));

  function anchorRect(sel) {
    var el = document.querySelector(sel); if (!el) return null;
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width };
  }
  // 地点 i を画面のどこに・どの大きさで見せるか
  function nodeScreen(i) {
    var mobile = W < 900;
    if (i === 0) return { x: W * 0.5, y: H * (mobile ? 0.34 : 0.36), s: Math.min(W, H) * (mobile ? 0.5 : 0.34) };
    var st = anchorRect('.powers__orb');
    return st ? st : { x: W * 0.3, y: H * 0.5, s: H * 0.4 };
  }
  function nodeCam(i, out) {
    var sc = nodeScreen(i);
    var sx = sc.x / W * 2 - 1, sy = -(sc.y / H * 2 - 1);
    return out.set(NODES[i].x - sx * DD * TAN * ASPECT, NODES[i].y - sy * DD * TAN, NODES[i].z + DD);
  }
  function nodeRadius(i) { return nodeScreen(i).s / H * DD * TAN; }
  var cA0 = new V3(), cA1 = new V3(), cA2 = new V3(), cA3 = new V3();
  function catmull(p0, p1, p2, p3, t, out) {
    var t2 = t * t, t3 = t2 * t;
    out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
    out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
    out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
    return out;
  }
  function journeyCamera(seg, fe, out) {
    nodeCam(Math.max(0, seg - 1), cA0); nodeCam(seg, cA1); nodeCam(Math.min(8, seg + 1), cA2); nodeCam(Math.min(8, seg + 2), cA3);
    if (seg === 0) cA0.copy(cA1).add(new V3(0, 0, 20));
    return catmull(cA0, cA1, cA2, cA3, fe, out);
  }

  // 束の道筋（3次ベジェ）：地点 seg から 地点 seg+1 へ
  var bz = [new V3(), new V3(), new V3(), new V3()];
  function bundleCurve(seg, bi, out4) {
    var A = NODES[seg], B = NODES[seg + 1];
    var rb = rand(seg * 10 + bi + 6000);
    var sideB = bi % 2 === 0 ? -1 : 1, up = bi < 2 ? 1 : -1;
    var rA = nodeRadius(seg);
    out4[0].set(A.x + sideB * rA * 0.4, A.y + up * rA * 0.4, A.z + rA * 0.3);
    out4[1].set(A.x + sideB * (5 + 3 * rb), A.y + up * (2.2 + 2 * rb), A.z + DD * 0.8);    // 手前へ飛び出す
    out4[2].set(B.x - sideB * (9 + 4 * rb) + (B.x - A.x) * 0.15, B.y - up * (2.5 + 2 * rb), B.z + DEPTH * 0.42); // 交差して回り込む
    out4[3].copy(B);
  }
  function bez(c, t, out) {
    var it = 1 - t, a = it * it * it, b = 3 * it * it * t, cc = 3 * it * t * t, d = t * t * t;
    out.x = c[0].x * a + c[1].x * b + c[2].x * cc + c[3].x * d;
    out.y = c[0].y * a + c[1].y * b + c[2].y * cc + c[3].y * d;
    out.z = c[0].z * a + c[1].z * b + c[2].z * cc + c[3].z * d;
    return out;
  }

  var cpts = []; for (i = 0; i < FP; i++) cpts.push(new V3());
  var Sv = new V3(), Uv = new V3(), Tv = new V3(), Vv = new V3(), Pt = new V3();
  function buildFlight(seg, hu, tu, camPos) {
    var any = false;
    var o = 0;
    var tick = Math.floor(time * 9);
    for (var bi = 0; bi < FB; bi++) {
      bundleCurve(seg, bi, bz);
      for (var fi = 0; fi < FS; fi++) {
        var fc = fiberCoef[bi * FS + fi];
        var h = Math.max(0, hu - fc.lag * (1 - tu)), t = Math.min(h, tu);
        var q;
        for (q = 0; q < FP; q++) bez(bz, t + (h - t) * (q / (FP - 1)), cpts[q]);
        for (q = 0; q < FP; q++) {
          var c = cpts[q];
          var nx = cpts[Math.min(q + 1, FP - 1)], pv = cpts[Math.max(q - 1, 0)];
          Tv.subVectors(nx, pv); if (Tv.lengthSq() < 1e-10) Tv.set(0, 0, -1);
          Tv.normalize();
          Vv.subVectors(c, camPos).normalize();
          Sv.crossVectors(Tv, Vv); if (Sv.lengthSq() < 1e-8) Sv.set(1, 0, 0); Sv.normalize();
          Uv.crossVectors(Sv, Tv).normalize();
          var ul2 = q / (FP - 1);
          var ug = t + (h - t) * ul2;
          // 束の幅：出発と到着では細く、途中で広がる。先端はとがる
          var fan = Math.pow(Math.sin(Math.PI * clamp(ug, 0, 1)), 0.8) * 1.25 * (0.35 + 0.65 * (1 - ul2));
          // ねじれ：束が帯のようにねじれながら進む
          var th = ug * 9 + time * 0.9 + bi * 1.7;
          var ct = Math.cos(th), st = Math.sin(th);
          var ox = (Sv.x * ct + Uv.x * st) * fc.c * fan + (Uv.x * ct - Sv.x * st) * fc.d * fan * 0.25;
          var oy = (Sv.y * ct + Uv.y * st) * fc.c * fan + (Uv.y * ct - Sv.y * st) * fc.d * fan * 0.25;
          var oz = (Sv.z * ct + Uv.z * st) * fc.c * fan + (Uv.z * ct - Sv.z * st) * fc.d * fan * 0.25;
          Pt.set(c.x + ox, c.y + oy, c.z + oz);
          if (Pt.z > camPos.z - 0.6) Pt.z = camPos.z - 0.6;     // カメラを突き抜けない
          var wq = fc.w * (0.25 + 0.75 * Math.pow(ul2, 0.6)) * (fc.glow ? 1 : (0.7 + 0.3 * Math.abs(ct)));
          var oo = o * 3;
          fPos[oo] = Pt.x - Sv.x * wq; fPos[oo + 1] = Pt.y - Sv.y * wq; fPos[oo + 2] = Pt.z - Sv.z * wq;
          fPos[oo + 3] = Pt.x + Sv.x * wq; fPos[oo + 4] = Pt.y + Sv.y * wq; fPos[oo + 5] = Pt.z + Sv.z * wq;
          o += 2;
        }
        if (h - t > 0.002) any = true;
        if (fi === 0) {    // 先端の火花
          for (var sp = 0; sp < 14; sp++) {
            var su = Math.max(t, h - rand(sp + bi * 20 + 7000) * 0.07);
            bez(bz, su, Pt);
            var jit = 0.5 * (1 + rand(sp + bi * 30 + tick));
            var ii = (bi * 14 + sp) * 3;
            fspPos[ii] = Pt.x + (rand(sp * 3 + bi + tick) - 0.5) * jit;
            fspPos[ii + 1] = Pt.y + (rand(sp * 5 + bi + tick) - 0.5) * jit;
            fspPos[ii + 2] = Math.min(Pt.z + (rand(sp * 7 + bi + tick) - 0.5) * jit, camPos.z - 0.6);
          }
        }
      }
    }
    flightGeo.attributes.position.needsUpdate = true;
    fspGeo.attributes.position.needsUpdate = true;
    return any;
  }


  strands.material = flightMat.clone();

  /* =========================================================
     トップ〜「身につけていく力」までの球体の振り付け
       各セクションで球体が止まる位置（POSE）と、セクションの間で通る大きな寄り道（SWOOP）を、
       スクロール位置に並べた「キーフレーム」にする。間はなめらかな曲線でつなぐ。
       z は奥行き（マイナス＝奥へ遠ざかる、プラス＝手前へ迫る）。
     ========================================================= */
  //            [x(画面比), y(画面比), z, 大きさ(画面の短辺比), 明るさ]
  var POSE_PC = {
    hero:    [0.72, 0.50, 0.0, 0.32, 1],
    about:   [0.79, 0.48, 0.6, 0.30, 1],
    for:     [0.22, 0.50, 0.4, 0.30, 1],
    emotion: [0.50, 0.18, -8.0, 0.30, 0.9],
    why:     [0.22, 0.52, 0.6, 0.30, 1],
    powers:  [0.50, 0.45, 0.0, 0.30, 1]
  };
  var SWOOP_PC = [
    [0.74, 0.40, -6, 0.32, 1],    // トップ → 定義：少し奥へ沈んでから、右で浮かび上がる
    [0.50, 0.24, -8, 0.30, 1],    // 定義 → こんな方へ：奥へ遠ざかりながら、上側をゆっくり横切る
    [0.32, 0.20, -8, 0.30, 0.95], // こんな方へ → 感情：遠くのまま中央の上へ
    [0.30, 0.38, -5, 0.30, 1],    // 感情 → なぜ：ゆっくり手前へ戻りながら左へ
    [0.38, 0.42, -3, 0.31, 1]     // なぜ → 導入：中央へ寄っていく
  ];
  var POSE_SP = {
    hero:    [0.50, 0.17, 0.0, 0.36, 1],
    about:   [0.80, 0.13, -2.5, 0.30, 0.75],
    for:     [0.20, 0.13, -2.5, 0.30, 0.75],
    emotion: [0.50, 0.11, -9.0, 0.30, 0.7],
    why:     [0.80, 0.13, -2.5, 0.30, 0.75],
    powers:  [0.50, 0.36, 0.0, 0.42, 1]
  };
  var SWOOP_SP = [
    [0.62, 0.18, -5, 0.34, 0.8], [0.50, 0.14, -6, 0.30, 0.7], [0.40, 0.12, -7, 0.30, 0.7],
    [0.62, 0.13, -5, 0.30, 0.7], [0.50, 0.26, -3, 0.38, 0.8]
  ];
  var ORDER = ['hero', 'about', 'for', 'emotion', 'why'];
  var KF = [], kfKey = '';
  function buildKeyframes() {
    var mobile = W < 900, vh = window.innerHeight, sy = window.scrollY;
    var P = mobile ? POSE_SP : POSE_PC, SW = mobile ? SWOOP_SP : SWOOP_PC;
    var spans = ORDER.map(function (name) {
      var el = document.querySelector('[data-orb="' + name + '"]');
      var r = el.getBoundingClientRect(), top = r.top + sy;
      var a = name === 'hero' ? -1e5 : top - vh * 0.25, b = top + r.height - vh * 0.8;
      if (b < a) { var mid = (a + b) / 2; a = b = mid; }
      return [a, b];
    });
    KF = [];
    ORDER.forEach(function (name, i) {
      KF.push({ y: spans[i][0], p: P[name] });
      KF.push({ y: spans[i][1], p: P[name] });
      var nextA = i < ORDER.length - 1 ? spans[i + 1][0] : document.getElementById('powers').getBoundingClientRect().top + sy - vh * 0.15;
      if (!RM) KF.push({ y: (spans[i][1] + nextA) / 2, p: SW[i] });
    });
    KF.push({ y: document.getElementById('powers').getBoundingClientRect().top + sy - vh * 0.15, p: P.powers });
    KF.push({ y: 1e7, p: P.powers });
  }
  function cr1(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  var poseOut = [0, 0, 0, 0, 0];
  function poseAt(y) {
    var j = 0;
    while (j < KF.length - 2 && y >= KF[j + 1].y) j++;
    var a = KF[j], b = KF[j + 1];
    var t = b.y > a.y ? clamp((y - a.y) / (b.y - a.y), 0, 1) : 1;
    t = t * t * (3 - 2 * t);
    var p0 = KF[Math.max(0, j - 1)].p, p1 = a.p, p2 = b.p, p3 = KF[Math.min(KF.length - 1, j + 2)].p;
    for (var n = 0; n < 3; n++) poseOut[n] = cr1(p0[n], p1[n], p2[n], p3[n], t);
    poseOut[3] = lerp(p1[3], p2[3], t); poseOut[4] = lerp(p1[4], p2[4], t);
    return poseOut;
  }

  /* =========================================================
     毎フレーム
     ========================================================= */
  var time = CAPTURE ? 6 : 0, last = performance.now();
  var scrollS = window.scrollY, lastScroll = window.scrollY, spinBoost = 0, running = true;
  var S = { x: 0.7, y: 0.5, z: 0, r: 0.4, ovis: 1, lx: 0, ly: 0, lr: 1, lvis: 0 };
  var T = {}, SV = {}, key;
  for (key in S) { T[key] = S[key]; SV[key] = 0; }
  var SPRING = { x: 1, y: 1, z: 1, r: 1 };
  var first = true;
  var camPos = new V3(), lPos = new V3(), prevOrb = new V3(), orbVel = 0, wasVisible = false;
  var bgX = 0, bgZ = 1, bgXs = '', bgZs = '';

  function spinOrbit(rig, dt, boost) {
    var mb = rig.base.material, mu = rig.burst.material;
    for (var bb = 0; bb < OB; bb++) {
      mb.uniforms.uSpin.value[bb] += RM ? 0 : dt * oSpeed[bb] * (1 + boost * 1.5);
      mu.uniforms.uSpin.value[bb] = mb.uniforms.uSpin.value[bb];
    }
    mb.uniforms.uTime.value = mu.uniforms.uTime.value = time;
  }
  function setOrbit(rig, sparks, op, burst, reform, scale) {
    var mb = rig.base.material, mu = rig.burst.material;
    mb.uniforms.uScale.value = scale * (0.84 + 0.16 * reform);
    mb.uniforms.uOpacity.value = op * (0.35 + 0.65 * reform);
    mu.uniforms.uScale.value = scale;
    mu.uniforms.uBurst.value = burst;
    mu.uniforms.uOpacity.value = burst > 0 ? op : 0;
    rig.burst.visible = burst > 0 && op > 0.003;
    rig.base.visible = op > 0.003;
    sparks.visible = burst > 0 && op > 0.003;
    sparks.material.uniforms.uB.value = burst;
    sparks.material.uniforms.uOpacity.value = op;
    sparks.material.uniforms.uPx.value = bufSize.y * 0.006;
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!RM && !CAPTURE) time += dt;
    var m = EQS.measure();
    var mobile = W < 900;

    // レイアウトが変わったら（文字の読み込み・画面サイズ）キーフレームを作り直す
    var kk2 = W + 'x' + H + ':' + document.documentElement.scrollHeight;
    if (kk2 !== kfKey) { kfKey = kk2; buildKeyframes(); }

    // スクロールの速さ → 球体と光の筋の回転を速める
    var sy = window.scrollY;
    var vel = Math.abs(sy - lastScroll) / Math.max(dt, 0.001); lastScroll = sy;
    var want = Math.min(vel * 0.0035, 5);
    spinBoost += (want - spinBoost) * (1 - Math.exp(-dt * (want > spinBoost ? 6 : 1.6)));
    scrollS += (sy - scrollS) * (RM ? 1 : 1 - Math.exp(-dt * 8));

    // 定期的なほとばしり（5.2秒ごと）
    var ph = ((time + 1.5) % 5.2) / 5.2;
    var burst = RM ? 0 : (ph < 0.34 ? smooth(0.0, 0.32, ph) : 0);
    var reform = RM ? 1 : smooth(0.06, 0.5, ph);
    var pulse = burst > 0 ? Math.sin(Math.PI * burst) : 0;

    var mode = m.active;
    var pi = m.pi;
    var inPowers = mode === 'powers';
    var journey = inPowers && (RM ? pi > 0.02 : pi >= 0.28) && m.k < 7.6;
    var white = 0, zBase = 0;
    bgX = 0; bgZ = 1;

    if (!journey) {
      camera.position.set(0, 0, CAM_Z); camera.rotation.set(0, 0, 0);
      camera.updateMatrixWorld();

      if (!m.after) {
        /* ---------- トップ〜導入：振り付けに沿って動く宇宙の球体 ---------- */
        var p = poseAt(scrollS);
        T.x = p[0]; T.y = p[1]; T.z = p[2]; T.r = p[3]; T.ovis = RM && mode !== 'hero' ? 0 : p[4];
        T.lvis = 0;
        if (inPowers) {
          // 導入の前半：中央で手前へ迫り、ホワイトアウト
          zBase = RM ? 0 : Math.pow(smooth(0.04, 0.28, pi), 2.2) * 9.3;
          white = RM ? 0 : smooth(0.14, 0.28, pi);
        }
      } else {
        T.ovis = 0;
        if (mode === 'cta') {
          var cr = anchorRect('.cta__orb'); var cw = toWorld(cr.x, cr.y);
          T.lx = cw[0]; T.ly = cw[1]; T.lr = pxToWorld(cr.s) / 2; T.lvis = 1;
        } else T.lvis = 0;
      }

      // 位置・奥行き・大きさは「ばね」で追いかける（速さがなめらかに変わり、止まる時もふわりと止まる）
      var rate = RM || first || CAPTURE ? 1 : 1 - Math.exp(-dt * 4.2);
      for (key in S) {
        if (SPRING[key] && rate < 1) {
          var kS = 5.0, cS = 2 * Math.sqrt(kS);
          SV[key] += ((T[key] - S[key]) * kS - SV[key] * cS) * dt;
          S[key] += SV[key] * dt;
        } else { S[key] += (T[key] - S[key]) * rate; SV[key] = 0; }
      }
      first = false;

      // 漂い：左右・上下・奥行きをゆっくり大きく（迫る演出の間は止める）
      var calm = inPowers ? 1 - smooth(0.0, 0.1, pi) : 1;
      var amp = RM ? 0 : calm * (mobile ? 0.5 : 1);
      var sx = S.x + Math.sin(time * 0.21) * 0.015 * amp;
      var syy = S.y + Math.sin(time * 0.29 + 1.0) * 0.014 * amp;
      var z = Math.min(9.35, S.z + zBase + (Math.sin(time * 0.17) * 1.3 + Math.sin(time * 0.09 + 2.0) * 0.6 - 0.6) * amp);
      var dist = CAM_Z - z;
      var rWorld = pxToWorld(S.r * Math.min(W * 1.15, H)) / 2;
      orb.position.set((sx * 2 - 1) * TAN * dist * ASPECT, -(syy * 2 - 1) * TAN * dist, z);
      orb.scale.setScalar(rWorld);
      var ov = S.ovis;
      orb.visible = ov > 0.003;

      // 球体の速さ（移動の大きさ）→ 光の筋の周回半径
      var spd = dt > 0 ? orb.position.distanceTo(prevOrb) / dt : 0; prevOrb.copy(orb.position);
      orbVel += (Math.min(spd, 30) - orbVel) * (1 - Math.exp(-dt * 3));
      if (!RM) {
        spin.rotation.y += dt * (0.3 + spinBoost * 0.5 + (inPowers ? smooth(0.0, 0.28, pi) * 4 : 0));
        spin.rotation.x = Math.sin(time * 0.17) * 0.3;
      }
      orbU.uTime.value = time; orbU.uOpacity.value = ov;
      orbU.uRot.value += RM ? 0 : dt * (0.12 + spinBoost * 0.3);
      // 球体＝心。ゆっくり呼吸するように光が満ち引きする（約5秒）
      var beat = RM ? 0.5 : 0.5 + 0.5 * Math.sin(time * Math.PI * 2 / 5.2);
      orbU.uBeat.value = beat;
      halo1.material.opacity = (0.6 + 0.25 * beat) * ov; halo2.material.opacity = (0.18 + 0.12 * beat) * ov;
      flare.material.opacity = 0.85 * ov * (0.85 + 0.15 * Math.sin(time * 1.7)) * (1 - smooth(0.05, 0.2, inPowers ? pi : 0));

      // 周回する光の筋（残像つき）
      if (ov > 0.01) {
        if (!wasVisible) strandsFresh = true;
        var radius = 1 + Math.min(orbVel * 0.02, 0.25) + pulse * 0.35 + (inPowers ? smooth(0.0, 0.25, pi) * 1.5 : 0);
        stepStrands(RM ? 0 : dt, orb.position, rWorld, radius, Math.min(spinBoost * 0.25, 0.6));
        buildStrands(camera.position, rWorld);
        strands.visible = true;
        strands.material.uniforms.uOpacity.value = ov * (mobile ? 0.85 : 1);
        strands.material.uniforms.uTime.value = time;
      } else strands.visible = false;
      wasVisible = ov > 0.01;
      heroSparks.visible = burst > 0 && ov > 0.01;
      heroSparks.material.uniforms.uB.value = burst;
      heroSparks.material.uniforms.uOpacity.value = ov;
      heroSparks.material.uniforms.uPx.value = bufSize.y * 0.006;

      // CTA の白い光の球体
      lights[1].visible = lights[2].visible = false;
      lPos.set(S.lx, S.ly, 0);
      setLight(lights[0], lPos, S.lr, S.lvis, 0);
      lightRig.position.copy(lPos); lightRig.scale.setScalar(Math.max(0.001, S.lr));
      lightRig.visible = S.lvis > 0.003;
      spinOrbit(lightOrbit, dt, spinBoost);
      setOrbit(lightOrbit, lightSparks, S.lvis, burst, reform, 1.1);

      flight.visible = flightSparks.visible = false;
      rays.visible = false;
      dust.visible = false;
    } else {
      first = true; wasVisible = false;
      white = RM ? 0 : 1 - smooth(0.40, 0.56, pi);
      heroSparks.visible = false;
      /* ---------- 旅：白い球体 → 光の束 → 次の白い球体 ---------- */
      orb.visible = false; strands.visible = false;
      var kk = m.k, seg, f;
      if (kk < 0) { seg = 0; f = clamp((kk + 0.8) / 0.8, 0, 1); }
      else if (kk >= 7) { seg = 8; f = 0; }
      else { seg = Math.floor(kk) + 1; f = kk - Math.floor(kk); }
      var endFade = 1 - smooth(7.05, 7.4, kk);     // 08 の後、文章を読む区間へ静かに戻る
      if (pi < 1 && kk < -0.79) { seg = 0; f = 0; }
      var fe = RM ? (f > 0.5 ? 1 : 0) : easeInOut(smooth(0.06, 0.94, f));
      if (seg >= 8) nodeCam(8, camPos);
      else journeyCamera(seg, fe, camPos);
      if (!RM) { camPos.x += Math.sin(time * 0.31) * 0.12; camPos.y += Math.sin(time * 0.23) * 0.08; }
      camera.position.copy(camPos);
      var dirX = seg < 8 ? Math.sign(NODES[seg + 1].x - NODES[seg].x) : 0;
      var turn = RM ? 0 : Math.sin(Math.PI * fe);
      camera.rotation.set(0, -dirX * 0.2 * turn, dirX * 0.07 * turn);
      camera.updateMatrixWorld();

      // 白い球体：出発地点と到着地点
      var form = RM ? (f > 0.5 ? 1 : 0) : smooth(0.70, 0.86, f);
      var flashA = RM ? 0 : Math.max(0, 1 - Math.abs(f - 0.8) / 0.09) * 0.7;
      var depart = 1 - (RM ? (f > 0.5 ? 1 : 0) : smooth(0.55, 0.85, f));
      var intro0 = seg === 0 ? (RM ? 1 : smooth(0.28, 0.42, pi)) : 1;
      if (seg < 8) {
        setLight(lights[0], NODES[seg], nodeRadius(seg) * (seg === 0 ? lerp(0.6, 1, intro0) : 1), depart * intro0, 0);
        var overshoot = 1 + 0.18 * Math.sin(Math.PI * clamp((f - 0.72) / 0.28, 0, 1));
        setLight(lights[1], NODES[seg + 1], nodeRadius(seg + 1) * Math.max(0.05, form) * overshoot, form, flashA);
      } else {
        setLight(lights[0], NODES[8], nodeRadius(8), endFade, 0);
        lights[1].visible = false;
      }
      lights[2].visible = false;

      // 周回する束：いま見えている球体に付ける
      var cur = (seg < 8 && f > 0.5) ? seg + 1 : seg;
      var curOp = (cur === seg ? depart * intro0 : form) * (seg >= 8 ? endFade : 1);
      lightRig.position.copy(NODES[cur]); lightRig.scale.setScalar(nodeRadius(cur));
      lightRig.visible = curOp > 0.003;
      spinOrbit(lightOrbit, dt, spinBoost);
      setOrbit(lightOrbit, lightSparks, curOp, burst, reform, 1.1);

      // 飛ぶ束
      if (seg < 8 && !RM) {
        var hu = 1 - Math.pow(1 - clamp(f / 0.8, 0, 1), 1.7);
        var tail = Math.max(0, hu - 0.4 * (1 - smooth(0.8, 0.96, f)));
        var any = buildFlight(seg, hu, tail, camPos);
        flight.visible = any; flightSparks.visible = any;
        flightMat.uniforms.uTime.value = time;
        fspMat.opacity = 0.9 * smooth(0.0, 0.08, f) * (1 - smooth(0.82, 0.95, f));
      } else { flight.visible = flightSparks.visible = false; }

      // 放射状のほとばしり：導入で白い球体が現れた時／束がぶつかった瞬間
      var rayB = 0, rayNode = seg, rayR = nodeRadius(seg);
      if (seg === 0 && f < 0.05) { rayB = smooth(0.3, 0.7, pi); rayNode = 0; }
      else if (seg < 8 && f >= 0.76) { rayB = smooth(0.76, 1.0, f); rayNode = seg + 1; rayR = nodeRadius(seg + 1); }
      rays.visible = !RM && rayB > 0.001 && rayB < 0.999;
      rays.position.copy(NODES[rayNode]); rays.scale.setScalar(rayR);
      rayMat.uniforms.uB.value = rayB;
      rayMat.uniforms.uReach.value = rayNode === 0 ? 10 : 6;

      dust.visible = true;
      dustMat.opacity = 0.55;
      // 背景の星空：旅の向きに合わせて少しずれ、奥へ進むほど少し寄る
      var nodeF = seg + fe;
      bgX = clamp(-camPos.x * 1.6 + camera.rotation.y * 120, -40, 40); bgZ = 1 + nodeF * 0.012;
    }

    var bx = bgX.toFixed(1) + 'px', bz = bgZ.toFixed(4);
    if (bx !== bgXs) { doc.style.setProperty('--bg-x', bx); bgXs = bx; }
    if (bz !== bgZs) { doc.style.setProperty('--bg-z', bz); bgZs = bz; }
    if (whiteEl) whiteEl.style.opacity = white.toFixed(3);
    renderer.render(scene, camera);
  }

  function resize() {
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight; ASPECT = W / H;
    var dpr = Math.min(window.devicePixelRatio || 1, W < 760 ? 1.75 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    renderer.getDrawingBufferSize(bufSize);
    camera.aspect = ASPECT; camera.updateProjectionMatrix();
    kfKey = '';
  }
  resize();
  var lastW = W, lastH = H;
  window.addEventListener('resize', function () {
    if (window.innerWidth !== lastW || Math.abs(window.innerHeight - lastH) > 140) {
      lastW = window.innerWidth; lastH = window.innerHeight; resize();
    }
  });
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); running = false; fail(); canvas.style.display = 'none'; if (whiteEl) whiteEl.style.opacity = 0; });

  if (EQS.update) EQS.update();
  requestAnimationFrame(function (t) { last = t; frame(t); canvas.classList.add('is-ready'); });
})();
