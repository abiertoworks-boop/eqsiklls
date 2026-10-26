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
  // （前半の宇宙の球体は、スキルのパネルの球体に置き換えたので読み込まない）

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
  var NS = 8, TF = 5, TP = 120;              // 筋の数・1本の束の線の数（＋ぼかし1本）・1本の点の数
  var TS = TF + 1;
  var SPAN = Math.PI * 2 * 0.84;             // 1本の長さ：ほぼ一周（端と端が近づく）
  // 2本ずつの組（オレンジ＋青）。組の「くっつき具合」が時間で満ち引きし、重なったり離れたりする
  var NG = 4, gDefs = [];
  for (var gi = 0; gi < NG; gi++) {
    gDefs.push({
      n: new V3(rand(gi + 700) - 0.5, rand(gi + 710) - 0.5, rand(gi + 720) - 0.5).normalize(),
      axis: new V3(rand(gi + 730) - 0.5, rand(gi + 740) - 0.5, rand(gi + 750) - 0.5).normalize(),
      rot: 0.12 + rand(gi + 760) * 0.18, th: rand(gi + 770) * 6.28, rr: 1.25 + rand(gi + 780) * 0.12,
      pace: 0.22 + rand(gi + 790) * 0.18, ph: rand(gi + 795) * 6.28, stick: 0
    });
  }
  var sDefs = [];
  for (var si = 0; si < NS; si++) {
    var nn = new V3(rand(si + 900) - 0.5, rand(si + 910) - 0.5, rand(si + 920) - 0.5).normalize();
    var tt = Math.abs(nn.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    sDefs.push({
      n0: nn, e1: new V3().crossVectors(nn, tt).normalize(), e2: new V3(), n: new V3(),
      th: rand(si + 930) * 6.28,
      w: (0.5 + rand(si + 940) * 0.45) * (rand(si + 945) > 0.35 ? 1 : -1),
      rr: 1.18 + rand(si + 950) * 0.24,
      axis: new V3(rand(si + 960) - 0.5, rand(si + 970) - 0.5, rand(si + 980) - 0.5).normalize(),
      rot: 0.1 + rand(si + 990) * 0.25,
      g: si >> 1, off: (si % 2) ? 1 : -1,
      sw: 7 + rand(si + 1010) * 9, swPh: rand(si + 1020) * 6.28, wob: rand(si + 1030) * 6.28,   // ひとりでに大きく広がる周期／揺らぎ
      col: si % 2 === 0 ? ORANGE : BLUE,
      hist: []
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
  // 先端の丸い光（筋の先に、丸みと厚みを持たせる）
  var tipPos = new Float32Array(NS * 3), tipCol = new Float32Array(NS * 3);
  for (var ti = 0; ti < NS; ti++) tipCol.set(ti % 2 === 0 ? ORANGE_HI : BLUE_HI, ti * 3);
  var tipGeo = new THREE.BufferGeometry();
  tipGeo.setAttribute('position', new THREE.BufferAttribute(tipPos, 3).setUsage(THREE.DynamicDrawUsage));
  tipGeo.setAttribute('color', new THREE.BufferAttribute(tipCol, 3));
  var tipMat = new THREE.PointsMaterial({ map: TEX_DOT, size: 0.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 });
  var tips = new THREE.Points(tipGeo, tipMat);
  tips.frustumCulled = false; tips.renderOrder = 4;
  scene.add(tips);

  var qTmp = new THREE.Quaternion(), hTmp = new V3(), nTmp = new V3();
  var strandsFresh = true;
  // 球の中心の、少し前までの位置（弧の後ろ側ほど少し遅れてついてくる＝動いた時のほのかな残像）
  var CH = 14, cHist = []; for (var ch = 0; ch < CH; ch++) cHist.push(new V3());
  function wrapPi(a) { return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2)); }
  // 光の筋を進めて、ほぼ一周の弧を作る（center＝球の中心、r＝球の半径、radius＝周回半径の倍率）
  var RUSH = 0, rushC = new V3(), rushO = [];
  for (var ro = 0; ro < 8; ro++) { var ra = ro * 2.4 + 0.7; rushO.push(new V3(Math.cos(ra), Math.sin(ra) * 0.75, 0.2)); }
  function stepStrands(dt, center, r, radius, boost) {
    var i, k;
    if (strandsFresh) { for (k = 0; k < CH; k++) cHist[k].copy(center); strandsFresh = false; }
    var v0 = cHist.shift(); v0.copy(center); cHist.push(v0);
    // 組：向きがゆっくりランダムに回り、くっつき具合が満ち引きする
    for (i = 0; i < NG; i++) {
      var g = gDefs[i];
      qTmp.setFromAxisAngle(g.axis, dt * g.rot); g.n.applyQuaternion(qTmp);
      g.axis.applyQuaternion(qTmp.setFromAxisAngle(nTmp.set(0.3, 1, 0.2).normalize(), dt * 0.05));
      g.th += dt * 0.7 * (1 + boost);
      g.stick = smooth(0.15, 0.85, 0.5 + 0.5 * Math.sin(time * g.pace + g.ph));
    }
    for (i = 0; i < NS; i++) {
      var d = sDefs[i], gg = gDefs[d.g], s = gg.stick;
      // 自分の向き（ランダムにゆっくり回る）と、組の向きを、くっつき具合で混ぜる
      d.n0.applyQuaternion(qTmp.setFromAxisAngle(d.axis, dt * d.rot));
      d.n.copy(d.n0).lerp(gg.n, s).normalize();
      // 円の基準の向きは、前の向きを新しい面へ投影して保つ（急に裏返らない）
      d.e1.addScaledVector(d.n, -d.e1.dot(d.n)); if (d.e1.lengthSq() < 1e-6) d.e1.set(1, 0, 0).addScaledVector(d.n, -d.n.x);
      d.e1.normalize(); d.e2.crossVectors(d.n, d.e1);
      d.th += dt * d.w * (1 + boost);
      var th = d.th + s * wrapPi(gg.th + d.off * 0.25 - d.th);           // くっつく時は、組の位置へ寄っていく
      // 1本ずつ、ばらばらの間隔でふくらむ（全部が同時に広がらない）
      var swell = RM ? 0 : Math.pow(Math.max(0, Math.sin(time * Math.PI * 2 / d.sw + d.swPh)), 8) * 0.55;
      var R = r * radius * lerp(d.rr, gg.rr + d.off * 0.035, s) * (1 + swell);
      // ホワイトアウトの前：1本ずつ球体から離れ、手前へ広がる。0番の筋だけが真正面に迫って画面いっぱいに
      var rs = i === 0 ? Math.pow(RUSH, 1.25) : smooth(0.05 * i, 0.55 + 0.05 * i, RUSH);
      if (rs > 0) {
        rushC.copy(camera.position).sub(center).multiplyScalar(i === 0 ? 0.96 * rs : 0.55 * rs);
        if (i !== 0) rushC.addScaledVector(rushO[i], rs * r * 7);
        R *= 1 + rs * (i === 0 ? 2.6 : 1.4);
      }
      for (k = 0; k < TP; k++) {
        var u = k / (TP - 1);
        var a = th - (1 - u) * SPAN * Math.sign(d.w || 1);
        var c = cHist[Math.max(0, CH - 1 - Math.round((1 - u) * (CH - 1)))];
        // きれいな円ではなく、半径と面の高さが上下左右に少しずつずれながら回る
        var tw = RM ? 0 : time;
        var Rk = R * (1 + 0.035 * Math.sin(a * 2 + tw * 0.5 + d.wob) + 0.015 * Math.sin(a * 3 - tw * 0.35 + d.wob * 2));
        var lift = R * (0.05 * Math.sin(a + tw * 0.4 + d.wob) + 0.018 * Math.sin(a * 3 + tw * 0.7 + d.wob * 3));
        d.hist[k].copy(c).add(rs > 0 ? rushC : V0).addScaledVector(d.e1, Math.cos(a) * Rk).addScaledVector(d.e2, Math.sin(a) * Rk).addScaledVector(d.n, lift);
      }
    }
  }
  /* ---------- ホワイトアウト前：光の筋が1本ずつ球体から外れ、それぞれの軌道で画面へ飛んでくる ----------
     回る → 外れる → こちらへ進む → 近づくほど大きくなる → 0番の筋が画面いっぱいに広がる（ホワイトアウト）
     道筋は3次ベジェ：外れた点 → 接線方向へ → 横へふくらむ → カメラの手前（0番は真正面、他は画面の外） */
  var FLY = [];
  for (var fy = 0; fy < 8; fy++) {
    var fa = fy * 2.39 + 0.4;
    FLY.push({
      st: fy === 0 ? 0.30 : 0.02 + fy * 0.045,                 // 外れはじめる時（rush の値）
      len: fy === 0 ? 0.70 : 0.42,                             // 飛んでくるのにかかる幅
      end: fy === 0 ? new V3(0, 0, -0.7) : new V3(Math.cos(fa) * 0.1, Math.sin(fa) * 0.07, -0.9 - fy * 0.12),   // すべて画面の中央へ
      side: new V3(Math.cos(fa + 1.6), Math.sin(fa + 1.6) * 0.8, 0.4).normalize(),
      p0: new V3(), tan: new V3(), on: false
    });
  }
  var fb = [new V3(), new V3(), new V3(), new V3()], fTmp = new V3();
  function flyStrands(rush, r) {
    var cam = camera.position;
    for (var i = 0; i < NS; i++) {
      var F = FLY[i], d = sDefs[i], hs = d.hist;
      var u = clamp((rush - F.st) / F.len, 0, 1);
      if (u <= 0) { F.on = false; continue; }
      if (!F.on) {   // 外れた瞬間の、先端の位置と向きを覚える
        F.on = true; F.p0.copy(hs[TP - 1]); F.tan.subVectors(hs[TP - 1], hs[TP - 4]).normalize();
      }
      var ue = u * u * (3 - 2 * u);
      fb[0].copy(F.p0);
      fb[1].copy(F.p0).addScaledVector(F.tan, r * 3.2);
      fb[3].copy(cam).add(F.end);
      fb[2].copy(fb[0]).lerp(fb[3], 0.45).addScaledVector(F.side, r * 2.6);
      // 尾は、元の回っていた弧から、飛んでいく道筋へつながる
      var L = 0.55;
      for (var k = 0; k < TP; k++) {
        var s = ue - (1 - k / (TP - 1)) * L;
        if (s >= 0) bez(fb, s, hs[k]);
        else {
          var back = Math.round(-s / L * (TP - 1) * 0.6);
          hs[k].copy(F.p0).addScaledVector(F.tan, -back * r * 0.05);
        }
      }
    }
  }

  var V0 = new V3();
  var STRAND_W = [1, 1, 1, 1, 1, 1, 1, 1];   // 筋ごとの太さの倍率（追いかけっこでは先頭を太く）
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
          var th = NOTWIST ? i * 0.9 : u * 7 + i;   // 追いかける光では、筋をねじらない
          var ct = Math.cos(th), st = Math.sin(th);
          Pt2.set(
            c.x + (Sv2.x * ct + Uv2.x * st) * fc.c * spread + Uv2.x * fc.d * spread * 0.3,
            c.y + (Sv2.y * ct + Uv2.y * st) * fc.c * spread + Uv2.y * fc.d * spread * 0.3,
            c.z + (Sv2.z * ct + Uv2.z * st) * fc.c * spread + Uv2.z * fc.d * spread * 0.3);
          if (Pt2.z > camPos.z - 0.6) Pt2.z = camPos.z - 0.6;
          // 先端に向かって太くなり、最後は丸く閉じる
          var bulge = 1 + 1.3 * smooth(0.72, 0.96, u);
          var cap = u < 0.975 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.975) / 0.025, 2)));
          var w = fc.w * r * (0.25 + 0.75 * Math.pow(u, 0.7)) * bulge * (0.35 + 0.65 * cap);
          w *= STRAND_W[i];
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
      ' float a=uOpacity;',
      ' gl_FragColor=vec4(min(col,vec3(1.0))*a,a);',   // 中心まで白く光る、透けない球（明るさを掛けた色で出す）
      '}'
    ].join('\n'),
    transparent: true, depthWrite: true, premultipliedAlpha: true, blending: THREE.NormalBlending
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
  if (DEBUG) window.__lights = lights;
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
     絡み合いながら右奥へ進む光の束（「身につけていく力」以降。参考：020452）
       左手前から右奥へのびる1本の道筋のまわりを、オレンジと青の束がねじれながら進む。
       束どうしの間隔は場所と時間で変わり、近づいて絡み、また離れる。スクロールでねじれが進む。
     ========================================================= */
  var BP = new V3(), BT = new V3(), BN = new V3(), BB = new V3(), UP = new V3(0, 1, 0);
  function braidPath(s, out) {
    return out.set(-2.6 + 42.6 * Math.pow(s, 1.6), -1.15 + 26 * Math.pow(s, 1.5) + 0.5 * Math.sin(s * Math.PI * 1.5), 4 - 154 * Math.pow(s, 1.25));
  }
  function braidPoint(bi, s, phase, out) {
    braidPath(s, BP);
    braidPath(Math.min(1, s + 0.004), BT); BT.sub(BP).normalize();
    BN.crossVectors(BT, UP).normalize(); BB.crossVectors(BN, BT);
    var th = bi * Math.PI / 2 + s * 14 + phase;
    var rho = (0.95 - 0.55 * s) * (0.3 + 0.7 * Math.abs(Math.sin(s * 5 + phase * 0.45 + bi * 0.8)));
    return out.copy(BP).addScaledVector(BN, Math.cos(th) * rho).addScaledVector(BB, Math.sin(th) * rho);
  }
  function buildBraid(phase, camPos) {
    var o = 0;
    for (var bi = 0; bi < FB; bi++) {
      for (var fi = 0; fi < FS; fi++) {
        var fc = fiberCoef[bi * FS + fi], q;
        for (q = 0; q < FP; q++) braidPoint(bi, 0.02 + 0.98 * (q / (FP - 1)) - fc.lag * 0.3, phase, cpts[q]);
        for (q = 0; q < FP; q++) {
          var c = cpts[q], nx = cpts[Math.min(q + 1, FP - 1)], pv = cpts[Math.max(q - 1, 0)];
          Tv.subVectors(nx, pv); if (Tv.lengthSq() < 1e-10) Tv.set(1, 0, 0); Tv.normalize();
          Vv.subVectors(c, camPos).normalize();
          Sv.crossVectors(Tv, Vv); if (Sv.lengthSq() < 1e-8) Sv.set(0, 1, 0); Sv.normalize();
          Uv.crossVectors(Sv, Tv).normalize();
          var u = q / (FP - 1);
          var fan = 0.32 * (1 - u * 0.5);
          var th = u * 9 + phase + bi;
          var ct = Math.cos(th), st = Math.sin(th);
          Pt.set(c.x + (Sv.x * ct + Uv.x * st) * fc.c * fan, c.y + (Sv.y * ct + Uv.y * st) * fc.c * fan, c.z + (Sv.z * ct + Uv.z * st) * fc.c * fan);
          if (Pt.z > camPos.z - 0.6) Pt.z = camPos.z - 0.6;
          var wq = fc.w * (fc.glow ? 1.2 : 1.6) * (0.6 + 0.4 * Math.abs(ct));
          var oo = o * 3;
          fPos[oo] = Pt.x - Sv.x * wq; fPos[oo + 1] = Pt.y - Sv.y * wq; fPos[oo + 2] = Pt.z - Sv.z * wq;
          fPos[oo + 3] = Pt.x + Sv.x * wq; fPos[oo + 4] = Pt.y + Sv.y * wq; fPos[oo + 5] = Pt.z + Sv.z * wq;
          o += 2;
        }
      }
    }
    flightGeo.attributes.position.needsUpdate = true;
  }

  /* =========================================================
     光の球体を追いかける光の筋（「身につけていく力」以降）
       ・板野サーカスのように、1本1本がミサイルのように球体へ向かって曲がりながら飛ぶ（筋自体は回転しない）
       ・ホワイトアウトが晴れると、光は左上から右下へ流れ込み、球体を追う
       ・01〜08 の番号に来ると、球体が左側で大きくなり、光の筋はその周りを回る
       ・スクロールすると球体が奥へ逃げ（番号ごとに違う道筋）、筋が追いかけ、次の番号でまた大きくなる
     ========================================================= */
  var CHX = 1, CHY = 1, NOTWIST = false;
  var msP = [], msV = [], msDef = [], msT = 0, msAcc = 0, chaseFresh = true;
  for (var ci = 0; ci < NS; ci++) {
    msP.push(new V3()); msV.push(new V3());
    var oa = new V3(rand(ci + 1200) - 0.5, rand(ci + 1210) - 0.5, rand(ci + 1220) - 0.5).normalize();
    msDef.push({
      speed: 11 + rand(ci + 1230) * 6,            // 飛ぶ速さ
      steer: 2.6 + rand(ci + 1240) * 2.4,         // 曲がりやすさ（小さいほど大回り）
      wig: 0.6 + rand(ci + 1250) * 1.4, wph: rand(ci + 1260) * 6.28,   // 進みながらの小さなぶれ
      axis: oa, orbR: 1.35 + rand(ci + 1270) * 0.6, orbW: (1.6 + rand(ci + 1280) * 1.2) * (ci % 2 ? 1 : -1),
      ph: rand(ci + 1290) * 6.28
    });
  }
  // 番号ごとの、球体が奥へ逃げる道筋（球体の位置からのずれ。x, y は画面の横・縦、z は奥）
  var ESC = [
    [[7, 4, -12], [10, 1, -42], [-3, 6, -26]],     // 01→02：右上へ大きく弧を描いて奥へ、上から戻る
    [[-6, -4, -10], [-9, -2, -38], [6, -5, -22]],  // 02→03：左下へ潜り、右下から戻る
    [[2, 7, -16], [0, 8, -46], [-7, 0, -20]],      // 03→04：真上へ昇って遠ざかり、左から戻る
    [[9, -2, -8], [14, -6, -30], [5, 6, -18]],     // 04→05：右へ鋭く切り返し、右上から戻る
    [[-3, 5, -20], [4, 3, -50], [0, -7, -24]],     // 05→06：ほぼ真っ直ぐ奥へ、下から戻る
    [[-8, 1, -6], [-12, 6, -34], [8, 2, -16]],     // 06→07：左へ大回り、右から戻る
    [[5, -6, -14], [-6, -8, -40], [-4, 7, -22]]    // 07→08：右下から左下へ回り込み、上から戻る
  ];
  var sphA = new V3(), sphP = new V3(), sphTmp = new V3(), bzS = [new V3(), new V3(), new V3(), new V3()];
  var sphR = 1, sphBig = 1;
  // 球体の位置と大きさを、スクロールの位置（kk）から決める
  function spherePose(kk, pi, mobile) {
    var a = anchorRect('.powers__orb'); var aw = toWorld(a.x, a.y);
    sphA.set(aw[0], aw[1], 0); sphBig = pxToWorld(a.s) / 2 * 0.62;
    var s, near;
    if (kk < 0) {
      // ホワイトアウトの後：左上の奥から右下へ流れ、01 の位置へ
      var u = clamp(0.6 * smooth(0.4, 1, pi) + 0.4 * clamp((kk + 0.8) / 0.8, 0, 1), 0, 1);
      bzS[0].set(-11 * CHX, 6.5 * CHY, -14); bzS[1].set(-2 * CHX, 2 * CHY, -10);
      bzS[2].copy(sphA).add(sphTmp.set(4 * CHX, -3.5 * CHY, -3)); bzS[3].copy(sphA);
      bez(bzS, u * u * (3 - 2 * u), sphP);
      near = smooth(0.7, 1, u);
    } else {
      var j = Math.min(6, Math.floor(kk)), f = Math.min(1, kk - j);
      if (kk >= 7) { j = 6; f = 1; }
      var E = ESC[j];
      if (f < 0.5) {
        s = f * 2; s = s * s;
        bzS[0].copy(sphA); bzS[1].copy(sphA).add(sphTmp.set(E[0][0] * CHX, E[0][1] * CHY, E[0][2] * 0.3));
        bzS[2].copy(sphA).add(sphTmp.set(E[0][0] * CHX, E[0][1] * CHY, E[0][2]));
        bzS[3].copy(sphA).add(sphTmp.set(E[1][0] * CHX, E[1][1] * CHY, E[1][2]));
      } else {
        s = (f - 0.5) * 2; s = 1 - (1 - s) * (1 - s);
        bzS[0].copy(sphA).add(sphTmp.set(E[1][0] * CHX, E[1][1] * CHY, E[1][2]));
        bzS[1].copy(sphA).add(sphTmp.set(E[2][0] * CHX, E[2][1] * CHY, E[2][2]));
        bzS[2].copy(sphA).add(sphTmp.set(E[2][0] * CHX * 0.4, E[2][1] * CHY * 0.4, 3));
        bzS[3].copy(sphA);
      }
      bez(bzS, s, sphP);
      near = Math.max(1 - smooth(0.0, 0.22, f), smooth(0.8, 1.0, f));
    }
    // 番号に来ると大きくなる（少し行き過ぎてから落ち着く）
    var pop = 1 + 0.12 * Math.sin(Math.PI * clamp((near - 0.6) / 0.4, 0, 1));
    sphR = sphBig * lerp(0.42, 1, near) * pop;
    return near;
  }
  function stepMissiles(dt, near) {
    var i, d;
    if (chaseFresh) {
      for (i = 0; i < NS; i++) {
        msP[i].set((-13 - i * 1.3) * CHX, (7.5 + rand(i + 1300) * 3) * CHY, -16 + i * 1.2);
        msV[i].set(9, -5, 4);
        for (var k = 0; k < TP; k++) sDefs[i].hist[k].copy(msP[i]).addScaledVector(msV[i], -(TP - 1 - k) / 60);
      }
      chaseFresh = false;
      msAcc = 1.4;   // 現れた時にはもう飛び込んでくる途中になるよう、先に少し進めておく
    }
    msAcc += dt;
    var n = 0;
    while (msAcc >= 1 / 60 && n < 100) {
      msAcc -= 1 / 60; n++; msT += 1 / 60;
      for (i = 0; i < NS; i++) {
        d = msDef[i];
        // 狙う点：球体の周りを回る点（近づくと、そのまま周回になる）
        var w = msT * d.orbW + d.ph;
        qTmp.setFromAxisAngle(d.axis, w);
        sphTmp.set(1, 0, 0).applyQuaternion(qTmp).addScaledVector(d.axis, -sphTmp.dot(d.axis)).normalize();
        Tv.copy(sphP).addScaledVector(sphTmp, sphR * d.orbR * lerp(1.6, 1, near));
        Tv.sub(msP[i]);
        var dist = Tv.length();
        var sp = Math.min(d.speed, 3 + dist * 2.2);
        Tv.multiplyScalar(sp / Math.max(dist, 1e-4));
        // 進む向きに対して横へ、少しぶれる（まっすぐ飛ばない）
        Uv.crossVectors(msV[i], UP).normalize().multiplyScalar(Math.sin(msT * 3.1 * d.wig + d.wph) * 2.2);
        Tv.add(Uv);
        msV[i].addScaledVector(Tv.sub(msV[i]), d.steer / 60);
        msP[i].addScaledVector(msV[i], 1 / 60);
        var hs = sDefs[i].hist; var v = hs.shift(); v.copy(msP[i]); hs.push(v);
      }
    }
    if (msAcc > 1 / 60) msAcc = 0;
  }
  function showChase(op, kk, dt, mobile, pi) {
    if (op <= 0.003) { strands.visible = tips.visible = false; lights[0].visible = false; return; }
    CHX = mobile ? 0.45 : 1; CHY = mobile ? 1.2 : 1;
    var near = spherePose(kk, pi == null ? 1 : pi, mobile);
    stepMissiles(RM ? 0 : dt * (1 + Math.min(spinBoost * 0.3, 1.5)), near);
    setLight(lights[0], sphP, sphR, op, 0.18 * op * (0.6 + 0.4 * near));
    if (DEBUG === 'p') { var dbg = document.getElementById('dbg') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'dbg', style: 'position:fixed;left:8px;top:80px;z-index:999;color:#0f0;background:#000;font:13px monospace' })); var mm = lights[0].userData.mesh; dbg.textContent = [lights[0].visible, mm.visible, mm.material.uniforms.uOpacity.value.toFixed(2), sphR.toFixed(2), sphP.toArray().map(function (v) { return v.toFixed(1); }).join(','), !!renderer.properties.get(mm.material).program].join(' | '); }
    for (var w = 0; w < NS; w++) STRAND_W[w] = 0.9 + 0.5 * rand(w + 1400);
    NOTWIST = true;
    buildStrands(camera.position, mobile ? 0.55 : 0.75);
    NOTWIST = false;
    strands.visible = true;
    strands.material.uniforms.uOpacity.value = op;
    strands.material.uniforms.uTime.value = time;
    for (var t = 0; t < NS; t++) { var hp = sDefs[t].hist[TP - 1]; tipPos[t * 3] = hp.x; tipPos[t * 3 + 1] = hp.y; tipPos[t * 3 + 2] = hp.z; }
    tipGeo.attributes.position.needsUpdate = true;
    tipMat.size = 0.24; tipMat.opacity = op; tips.visible = true;
  }


  /* =========================================================
     スキルのパネル（前半：トップ〜「なぜ必要なのか」）
       ・灰色のスタジオの中を、青いSFパネルがばらばらに舞う（参考動画：176368）
       ・やがて集まって、パネルでできた球体になる（参考画像：青いパネルの球）
       ・パネルには EQ Skills で身につける力・学びの名前を書く（学びの場であることを伝える）
       ・ホワイトアウトの前に、パネルが一斉に手前へ飛び込む
     ========================================================= */
  var PANEL_WORDS = [
    '感情を知る力', '心の動きを知る', '自分と関わる', '思考を整理する', '感情を整理する', '感情を調整する',
    '他者と関わる', '良好な関係', '行動・成果へ', 'EQコアカード®', 'EQセルフコーチ', 'EQコアカードsession',
    '公式ナビゲーター', 'インストラクター', 'トレーナー', '感情に気づく', '言葉にする', '違いを理解する',
    '伝え方を選ぶ', '実践する', '', '', '', ''
  ];
  var PCOLS = 4, PROWS = 6, PCW = 256, PCH = 192;
  var panelCanvas = document.createElement('canvas'); panelCanvas.width = PCOLS * PCW; panelCanvas.height = PROWS * PCH;
  // テクスチャは「形」だけを持つ：R＝面、G＝縁の線、B＝文字。色はパネルごとに、下の濃さ（薄い・中・濃い）で付ける
  function drawPanels() {
    var x = panelCanvas.getContext('2d'); x.clearRect(0, 0, panelCanvas.width, panelCanvas.height);
    x.fillStyle = '#000'; x.fillRect(0, 0, panelCanvas.width, panelCanvas.height);
    x.globalCompositeOperation = 'lighter';
    PANEL_WORDS.forEach(function (w, i) {
      var ox = (i % PCOLS) * PCW, oy = Math.floor(i / PCOLS) * PCH, pad = 6;
      x.fillStyle = '#f00'; x.fillRect(ox + pad, oy + pad, PCW - pad * 2, PCH - pad * 2);                 // 面
      x.strokeStyle = '#0f0'; x.lineWidth = 3; x.strokeRect(ox + pad + 1.5, oy + pad + 1.5, PCW - pad * 2 - 3, PCH - pad * 2 - 3);   // 細い縁
      x.strokeStyle = 'rgba(0,110,0,1)'; x.lineWidth = 1.5; x.strokeRect(ox + pad + 14, oy + pad + 14, PCW - pad * 2 - 28, PCH - pad * 2 - 28);
      if (w) {
        x.fillStyle = '#00f';
        var fs = w.length > 8 ? 26 : 32;
        x.font = '600 ' + fs + 'px "Noto Sans JP","Hiragino Kaku Gothic ProN",Meiryo,sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(w, ox + PCW / 2, oy + PCH / 2 + 2);
        x.fillStyle = 'rgba(0,0,150,1)'; x.font = '500 13px "Space Grotesk",sans-serif'; x.textAlign = 'left';
        x.fillText('EQ SKILLS', ox + pad + 22, oy + pad + 28);
      }
    });
    x.globalCompositeOperation = 'source-over';
  }
  drawPanels();
  var panelTex = new THREE.CanvasTexture(panelCanvas); panelTex.anisotropy = 4;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawPanels(); panelTex.needsUpdate = true; });   // 書体が届いたら描き直す

  // パネルの濃さ：薄い3・中ぐらい4・濃い3（参考画像）
  var TONES = [
    { c: [0.84, 0.93, 1.00], a: 0.34, t: [0.16, 0.36, 0.70] },   // 薄い：白に近い水色、文字は青
    { c: [0.55, 0.76, 0.96], a: 0.48, t: [0.97, 0.99, 1.00] },   // 中ぐらい：空色
    { c: [0.20, 0.47, 0.86], a: 0.64, t: [0.97, 0.99, 1.00] }    // 濃い：青
  ];
  var NP = 84;
  var pGeo = new THREE.PlaneGeometry(1, 0.75);
  var pCell = new Float32Array(NP * 2), pTone = new Float32Array(NP * 4), pText = new Float32Array(NP * 3), pAlpha = new Float32Array(NP);
  for (var pi0 = 0; pi0 < NP; pi0++) {
    var cell = pi0 < 36 ? pi0 % 20 : 20 + Math.floor(rand(pi0 + 60) * 4);   // 文字のあるパネルと、無地のパネル
    pCell[pi0 * 2] = cell % PCOLS; pCell[pi0 * 2 + 1] = Math.floor(cell / PCOLS);
    var tr = rand(pi0 + 70), T = TONES[tr < 0.3 ? 0 : tr < 0.7 ? 1 : 2];
    pTone.set([T.c[0], T.c[1], T.c[2], T.a * (0.85 + 0.3 * rand(pi0 + 75))], pi0 * 4);
    pText.set(T.t, pi0 * 3);
    pAlpha[pi0] = 1;
  }
  pGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(pCell, 2));
  var pGlow = new Float32Array(NP * 2);   // 発光：周期と、ずらし（パネルごとにばらばら）
  for (var pg = 0; pg < NP; pg++) pGlow.set([3.5 + rand(pg + 80) * 7, rand(pg + 85) * 30], pg * 2);
  pGeo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(pGlow, 2));
  pGeo.setAttribute('aTone', new THREE.InstancedBufferAttribute(pTone, 4));
  pGeo.setAttribute('aText', new THREE.InstancedBufferAttribute(pText, 3));
  pGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  var panelMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: panelTex }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: [
      'attribute vec2 aCell;attribute vec4 aTone;attribute vec3 aText;attribute float aAlpha;attribute vec2 aGlow;uniform float uTime;varying float vGlow;',
      'varying vec2 vUv;varying vec4 vTone;varying vec3 vText;varying float vA;varying float vFace;varying vec2 vLoc;varying vec2 vCell;',
      'void main(){',
      ' vCell=aCell;',
      ' float ph=fract((uTime+aGlow.y)/aGlow.x);',
      ' vGlow=smoothstep(0.0,0.12,ph)*(1.0-smoothstep(0.12,0.42,ph));',   // ふっと光って、ゆっくり消える
      ' vUv=(vec2(aCell.x,' + (PROWS - 1) + '.0-aCell.y)+uv)/vec2(' + PCOLS + '.0,' + PROWS + '.0);',
      ' vLoc=uv; vTone=aTone; vText=aText; vA=aAlpha;',
      ' vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.0);',
      ' vec3 n=normalize(normalMatrix*mat3(instanceMatrix)*vec3(0.0,0.0,1.0));',
      ' vFace=abs(dot(n,normalize(-mv.xyz)));',
      ' gl_Position=projectionMatrix*mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;uniform sampler2D uTex;uniform float uOpacity;',
      'varying vec2 vUv;varying vec4 vTone;varying vec3 vText;varying float vA;varying float vFace;varying vec2 vLoc;varying vec2 vCell;',
      'varying float vGlow;',
      'void main(){',
      ' vec2 lc=vec2(gl_FrontFacing?vLoc.x:1.0-vLoc.x,vLoc.y);',             // 裏から見ても文字が反転しない
      ' vec3 m=texture2D(uTex,(vec2(vCell.x,' + (PROWS - 1) + '.0-vCell.y)+lc)/vec2(' + PCOLS + '.0,' + PROWS + '.0)).rgb;',
      ' if(!gl_FrontFacing) m.b*=0.35;',
      ' float sheen=0.88+0.24*(1.0-vLoc.y)*(0.6+0.4*vLoc.x);',             // ガラスの面に、ほのかなつや
      ' vec3 col=vTone.rgb*sheen*(0.82+0.22*vFace);',
      ' col=mix(col,vec3(1.0),m.g*0.75);',                                   // 縁は白く細く
      ' col=mix(col,vText,m.b);',
      ' col=mix(col,vec3(0.86,0.96,1.0),vGlow*0.75*m.r);',                        // 発光：面が白く明るくなり、縁が強く光る
      ' col+=vec3(0.35,0.7,1.0)*vGlow*m.g;',
      ' float a=(m.r*mix(vTone.a,0.9,vGlow)+m.g*(0.45+0.55*vGlow)+m.b*0.85)*vA*uOpacity;',
      ' gl_FragColor=vec4(col,clamp(a,0.0,1.0));',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  var panels = new THREE.InstancedMesh(pGeo, panelMat, NP);
  panels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  panels.frustumCulled = false; panels.renderOrder = 2;
  scene.add(panels);

  // 床に落ちる影（参考動画のように、パネルの下にぼんやり）
  var TEX_SHADOW = glowTexture([[0, 'rgba(20,24,34,0.32)'], [0.5, 'rgba(20,24,34,0.12)'], [1, 'rgba(20,24,34,0)']]);
  var shGeo = new THREE.PlaneGeometry(1, 1);
  var shMat = new THREE.MeshBasicMaterial({ map: TEX_SHADOW, transparent: true, depthWrite: false, opacity: 0.8 });
  var shadows = new THREE.InstancedMesh(shGeo, shMat, NP);
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.frustumCulled = false; shadows.renderOrder = 1;
  scene.add(shadows);
  // 球体の後ろの、青い淡い光
  var panelGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_COOL, transparent: true, depthWrite: false, opacity: 0.5 }));
  panelGlow.renderOrder = 0;
  scene.add(panelGlow);

  // パネルごとの「球体の上の場所」と「舞っている時の動き」
  var PD = [];
  var GA = Math.PI * (3 - Math.sqrt(5));
  for (var q = 0; q < NP; q++) {
    var yy = 1 - (q + 0.5) / NP * 2, rr0 = Math.sqrt(1 - yy * yy), th0 = q * GA;
    var dir = new V3(Math.cos(th0) * rr0, yy, Math.sin(th0) * rr0);
    dir.add(new V3(rand(q + 300) - 0.5, rand(q + 310) - 0.5, rand(q + 320) - 0.5).multiplyScalar(0.28)).normalize();   // 少し寄せたり離したりして、重なりをつくる
    var big = rand(q + 330), lay = rand(q + 340);
    PD.push({
      dir: dir,
      depth: lay < 0.12 ? 1.18 + rand(q + 100) * 0.18 : 0.84 + rand(q + 100) * 0.3,        // 何層にも重ねる。少しだけ外へ浮いたパネルも
      size: 0.16 + Math.pow(big, 2.2) * 0.62,                                              // 小さいパネルが多く、大きいパネルがところどころ
      asp: 0.65 + rand(q + 350) * 0.9, roll: (rand(q + 120) - 0.5) * 0.12,
      sx: 2.2 + (rand(q + 130) - 0.5) * 11, sy: -1.8 + rand(q + 140) * 6, sz: -10 + rand(q + 150) * 10,       // 舞う場所
      ax: new V3(rand(q + 160) - 0.5, rand(q + 170) - 0.5, rand(q + 180) - 0.5).normalize(),
      tw: (0.5 + rand(q + 190) * 1.3) * (rand(q + 195) > 0.5 ? 1 : -1), bob: rand(q + 200) * 6.28,
      ssize: 0.55 + rand(q + 210) * 0.7, stagger: rand(q + 220),
      fly: new V3((rand(q + 230) - 0.5) * 3.2, (rand(q + 240) - 0.5) * 2.2, 0)
    });
  }
  var pM = new THREE.Matrix4(), pQ = new THREE.Quaternion(), pQ2 = new THREE.Quaternion(), pS = new V3(), pP = new V3(), pP2 = new V3();
  var pN = new V3(), pUp = new V3(), pRight = new V3(), pBasis = new THREE.Matrix4(), pZ = new V3(0, 0, 1);
  var panelT0 = -1, FLOOR_Y = -3.7;
  // assemble：0＝ばらばら、1＝球体／rush：0〜1 で手前へ飛び込む
  function updatePanels(center, R, assemble, rush, op, spinQ) {
    panels.visible = shadows.visible = op > 0.003;
    panelGlow.visible = panels.visible;
    if (!panels.visible) return;
    if (panelT0 < 0) panelT0 = time;
    var since = time - panelT0;
    // 読み込み直後：中央の小さなかたまりから、ふわっと広がる（参考動画の最初）
    var spread = RM ? 1 : 0.15 + 0.85 * (1 - Math.pow(1 - clamp(since / 3.2, 0, 1), 3));
    var cam = camera.position;
    for (var i = 0; i < NP; i++) {
      var d = PD[i];
      // 球体の上の位置と向き
      pN.copy(d.dir).applyQuaternion(spinQ);
      pP.copy(pN).multiplyScalar(R * d.depth).add(center);
      pRight.crossVectors(UP, pN); if (pRight.lengthSq() < 1e-4) pRight.set(1, 0, 0); pRight.normalize();
      pUp.crossVectors(pN, pRight);
      pBasis.makeBasis(pRight, pUp, pN); pQ.setFromRotationMatrix(pBasis);
      pQ.multiply(pQ2.setFromAxisAngle(pZ, d.roll));
      // 舞っている時の位置と向き
      var tt = RM ? 0 : time;
      pP2.set(d.sx * spread * CHX2, (d.sy + (CHX2 < 1 ? 3.2 : 0)) * spread + Math.sin(tt * 0.7 + d.bob) * 0.35 + 0.5, d.sz * spread - 1 - (CHX2 < 1 ? 4 : 0));
      pQ2.setFromAxisAngle(d.ax, tt * d.tw + d.bob);
      // 集まる時は1枚ずつ時間差で
      var a = clamp((assemble * 1.35 - d.stagger * 0.35), 0, 1); a = a * a * (3 - 2 * a);
      pP2.lerp(pP, a);
      pQ2.slerp(pQ, a);
      var size = lerp(d.ssize * (CHX2 < 1 ? 0.6 : 1), R * d.size, a);
      // 飛び込み：パネルが1枚ずつ、画面の中央へ向かって大きくなりながら迫る
      if (rush > 0) {
        var f = clamp((rush - d.stagger * 0.45) / 0.55, 0, 1); f = f * f;
        if (f > 0) {
          pP.copy(cam).add(d.fly).setZ(cam.z - 0.9);
          pP2.lerp(pP, f);
          size *= 1 + f * 2.5;
        }
      }
      pS.set(size * lerp(1, d.asp, a), size / lerp(1, Math.sqrt(d.asp), a), size);
      pM.compose(pP2, pQ2, pS);
      panels.setMatrixAt(i, pM);
      pAlpha[i] = 1;
      // 床の影
      var h = Math.max(0, pP2.y - FLOOR_Y);
      var ss = size * (0.9 + h * 0.12);
      pQ.setFromAxisAngle(pRight.set(1, 0, 0), -Math.PI / 2);
      pS.set(ss, ss * 0.6, 1);
      pP.set(pP2.x + h * 0.15, FLOOR_Y, pP2.z);
      pM.compose(pP, pQ, pS);
      shadows.setMatrixAt(i, pM);
    }
    panels.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
    panelMat.uniforms.uOpacity.value = op;
    panelMat.uniforms.uTime.value = RM ? 0 : time;
    shMat.opacity = op * 0.7 * (1 - rush);
    panelGlow.position.copy(center).setZ(center.z - R * 0.6);
    panelGlow.scale.setScalar(R * 4.2);
    panelGlow.material.opacity = op * 0.55 * smooth(0.5, 1, assemble) * (1 - rush);
  }
  var CHX2 = 1;

  /* =========================================================
     後半（「身につけていく力」以降）：暗い空間を横切る光の流れ ＋ 浮遊するスキルのパネル（参考動画：155538）
       ・画面の中ほどを、細い光の線とデータの粒が左右に流れる（動画の横に走る帯）
       ・前半の球体と同じ青いパネルが、帯のまわりをゆっくり浮遊する
       ・スクロールで 01〜08 に来ると、その番号のパネルが前へ出てきて、説明文が表示される
     ========================================================= */
  var STREAM = new THREE.Group();
  scene.add(STREAM);
  STREAM.visible = false;

  // 光の線：x 方向にのびる線。形（うねり）と、流れる光はシェーダーで
  var SL = 30, SPL = 140, SX0 = -26, SX1 = 46;
  var slPos = new Float32Array(SL * (SPL - 1) * 2 * 3), slPar = new Float32Array(SL * (SPL - 1) * 2 * 4), slv = 0;
  for (var li = 0; li < SL; li++) {
    var ly = (rand(li + 1500) - 0.5) * (li < 20 ? 0.9 : 2.6), lz = -16 + rand(li + 1510) * 16, ls = rand(li + 1520);
    for (var lp = 0; lp < SPL - 1; lp++) {
      for (var e = 0; e < 2; e++) {
        var lx = SX0 + (SX1 - SX0) * (lp + e) / (SPL - 1);
        slPos.set([lx, ly, lz], slv * 3);
        slPar.set([ls, li < 20 ? 1 : 0.45, rand(li + 1530) > 0.5 ? 1 : 0, rand(li + 1540)], slv * 4);
        slv++;
      }
    }
  }
  var slGeo = new THREE.BufferGeometry();
  slGeo.setAttribute('position', new THREE.BufferAttribute(slPos, 3));
  slGeo.setAttribute('aPar', new THREE.BufferAttribute(slPar, 4));
  var WAVE = 'vec3 wave(vec3 p,float s,float t){return vec3(p.x,p.y+sin(p.x*0.18+s*12.0+t*0.35)*0.22*(0.4+s)+sin(p.x*0.05+s*5.0)*0.35,p.z+sin(p.x*0.11+s*7.0+t*0.2)*0.4);}';
  var slMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: ['attribute vec4 aPar;uniform float uTime;varying float vB;varying vec4 vPar;varying float vX;', WAVE,
      'void main(){vec3 p=wave(position,aPar.x,uTime);vPar=aPar;vX=p.x;',
      ' vec4 mv=modelViewMatrix*vec4(p,1.0);vB=clamp(1.0+mv.z/40.0,0.15,1.0);gl_Position=projectionMatrix*mv;}'].join('\n'),
    fragmentShader: ['precision highp float;uniform float uTime,uOpacity;varying float vB;varying vec4 vPar;varying float vX;',
      'void main(){',
      ' float pulse=pow(0.5+0.5*sin(vX*0.6-uTime*(2.0+vPar.w*3.0)+vPar.x*40.0),12.0);',     // 線の上を走る光
      ' vec3 c=mix(vec3(0.30,0.52,1.0),vec3(0.62,0.42,1.0),vPar.z);',                        // 青と、ほんのり紫
      ' float a=(0.30+0.9*pulse)*vPar.y*vB*uOpacity;',
      ' gl_FragColor=vec4(mix(c,vec3(1.0),pulse*0.5)*a,a);}'].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  var slLines = new THREE.LineSegments(slGeo, slMat);
  slLines.frustumCulled = false;
  STREAM.add(slLines);

  // データの粒：線に沿って流れる
  var SD = 520;
  var sdPos = new Float32Array(SD * 3), sdPar = new Float32Array(SD * 4);
  for (var di = 0; di < SD; di++) {
    var dl = Math.floor(rand(di + 1600) * SL);
    sdPos.set([SX0 + rand(di + 1610) * (SX1 - SX0), slPos[(dl * (SPL - 1) * 2) * 3 + 1], slPos[(dl * (SPL - 1) * 2) * 3 + 2]], di * 3);
    sdPar.set([slPar[(dl * (SPL - 1) * 2) * 4], 0.6 + rand(di + 1620) * 2.4, rand(di + 1630), rand(di + 1640) > 0.85 ? 1 : 0], di * 4);
  }
  var sdGeo = new THREE.BufferGeometry();
  sdGeo.setAttribute('position', new THREE.BufferAttribute(sdPos, 3));
  sdGeo.setAttribute('aPar', new THREE.BufferAttribute(sdPar, 4));
  var sdMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uTex: { value: TEX_DOT }, uPx: { value: 1 } },
    vertexShader: ['attribute vec4 aPar;uniform float uTime,uPx;varying float vA;varying float vBig;', WAVE,
      'void main(){vec3 p=position;float span=' + (SX1 - SX0).toFixed(1) + ';',
      ' p.x=' + SX0.toFixed(1) + '+mod(p.x-' + SX0.toFixed(1) + '+uTime*aPar.y,span);',
      ' p=wave(p,aPar.x,uTime);vec4 mv=modelViewMatrix*vec4(p,1.0);',
      ' vBig=aPar.w;gl_PointSize=uPx*(aPar.w>0.5?3.6:1.4)*(0.7+aPar.z)/max(1.0,-mv.z)*12.0;',
      ' vA=clamp(1.0+mv.z/40.0,0.2,1.0);gl_Position=projectionMatrix*mv;}'].join('\n'),
    fragmentShader: ['precision highp float;uniform sampler2D uTex;uniform float uOpacity;varying float vA;varying float vBig;',
      'void main(){float t=texture2D(uTex,gl_PointCoord).a;',
      ' if(vBig>0.5){float r=length(gl_PointCoord-0.5)*2.0;t=smoothstep(0.62,0.72,r)*(1.0-smoothstep(0.82,0.95,r))+t*0.5;}',   // 大きい粒は、輪の形（動画の丸い目印）
      ' vec3 c=vec3(0.62,0.80,1.0);float a=t*vA*uOpacity;gl_FragColor=vec4(c*a,a);}'].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  var sdPts = new THREE.Points(sdGeo, sdMat);
  sdPts.frustumCulled = false;
  STREAM.add(sdPts);

  // 縦に立つ細い光の線（ところどころ）
  var SVN = 26, svPos = new Float32Array(SVN * 6);
  for (var vi = 0; vi < SVN; vi++) {
    var vx = SX0 + rand(vi + 1700) * (SX1 - SX0), vz = -14 + rand(vi + 1710) * 12, vh = 0.6 + rand(vi + 1720) * 3.5;
    svPos.set([vx, -0.2, vz, vx, -0.2 + vh, vz], vi * 6);
  }
  var svGeo = new THREE.BufferGeometry();
  svGeo.setAttribute('position', new THREE.BufferAttribute(svPos, 3));
  var svMat = new THREE.LineBasicMaterial({ color: 0x5a7fff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  STREAM.add(new THREE.LineSegments(svGeo, svMat));

  // 浮遊するスクリーン：SF映画のようなホログラムの画面。先頭の8枚は 01〜08 のスキル
  //  ・ごく薄く透ける青緑のガラスに、細い枠・角のかぎ・見出しの帯・データの行・小さなグラフ
  //  ・走査線、ゆっくり下りる光の帯、かすかなちらつき、斜めから見ると縁が光る
  //  ・遠くの画面は暗く小さく（奥行き）、床にはうっすら映り込む（リアリティ）
  var SKILL_NAME = ['感情を知る力', '心の動きを知る', '自分と関わる', '思考と感情の整理', '感情を調整する', '他者と関わる', '良好な関係を築く', '行動・成果へ'];
  var HUD_TITLE = ['EMOTION', 'MIND', 'SELF', 'THINK', 'REGULATE', 'OTHERS', 'RELATION', 'ACTION'];
  var HC = 4, HR = 4, HW = 512, HH2 = 384;
  var hudCanvas = document.createElement('canvas'); hudCanvas.width = HC * HW; hudCanvas.height = HR * HH2;
  function drawHud() {
    var x = hudCanvas.getContext('2d');
    x.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    var CY = 'rgba(120,235,255,', WH = 'rgba(225,250,255,';
    for (var i = 0; i < HC * HR; i++) {
      var ox = (i % HC) * HW, oy = Math.floor(i / HC) * HH2, p = 14, w = HW - p * 2, h = HH2 - p * 2, L = ox + p, T = oy + p;
      var skill = i < 8;
      // ガラスの面：上がわずかに明るい
      var g = x.createLinearGradient(0, T, 0, T + h);
      g.addColorStop(0, CY + '0.34)'); g.addColorStop(0.5, 'rgba(40,150,215,0.18)'); g.addColorStop(1, 'rgba(25,100,190,0.26)');
      x.fillStyle = g; x.fillRect(L, T, w, h);
      // 細い枠
      x.strokeStyle = CY + '0.85)'; x.lineWidth = 2; x.strokeRect(L + 0.5, T + 0.5, w - 1, h - 1);
      // 角のかぎ
      x.strokeStyle = WH + '0.95)'; x.lineWidth = 4; var c = 34;
      [[L, T, 1, 1], [L + w, T, -1, 1], [L, T + h, 1, -1], [L + w, T + h, -1, -1]].forEach(function (k) {
        x.beginPath(); x.moveTo(k[0] + k[2] * c, k[1]); x.lineTo(k[0], k[1]); x.lineTo(k[0], k[1] + k[3] * c); x.stroke();
      });
      // 見出しの帯
      x.fillStyle = CY + '0.22)'; x.fillRect(L + 18, T + 18, w - 36, 34);
      x.fillStyle = WH + '0.95)'; x.font = '600 18px "Space Grotesk",Arial,sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillText(skill ? 'EQ SKILLS // ' + ('0' + (i + 1)).slice(-2) + '  ' + HUD_TITLE[i] : 'EQ SKILLS // DATA ' + ('0' + (i - 7)).slice(-2), L + 30, T + 36);
      x.textAlign = 'right'; x.fillStyle = CY + '0.8)'; x.fillText('● LIVE', L + w - 30, T + 36);
      if (skill) {
        // スキル名（大きく）と、下の細い線
        x.textAlign = 'center'; x.fillStyle = WH + '1)';
        x.shadowColor = CY + '0.9)'; x.shadowBlur = 16;
        x.font = '700 ' + (SKILL_NAME[i].length > 7 ? 46 : 54) + 'px "Noto Sans JP","Hiragino Kaku Gothic ProN",Meiryo,sans-serif';
        x.fillText(SKILL_NAME[i], L + w / 2, T + h * 0.47);
        x.shadowBlur = 0;
        x.fillStyle = CY + '0.6)'; x.fillRect(L + w * 0.2, T + h * 0.62, w * 0.6, 1.5);
        // 進み具合の帯（番号ぶんだけ点灯）
        for (var s = 0; s < 8; s++) { x.fillStyle = s <= i ? CY + '0.95)' : CY + '0.18)'; x.fillRect(L + w * 0.2 + s * (w * 0.6 / 8) + 3, T + h * 0.68, w * 0.6 / 8 - 6, 8); }
      } else {
        // データの画面：横棒・小さな波形・文字の行
        for (var r = 0; r < 6; r++) {
          var bw = (0.25 + 0.7 * rand(i * 20 + r)) * (w * 0.45);
          x.fillStyle = CY + (0.25 + 0.5 * rand(i * 30 + r)) + ')'; x.fillRect(L + 30, T + 76 + r * 26, bw, 9);
        }
        x.strokeStyle = WH + '0.85)'; x.lineWidth = 2; x.beginPath();
        for (var q = 0; q <= 60; q++) {
          var px = L + w * 0.55 + q * (w * 0.38 / 60), py = T + 150 + Math.sin(q * 0.35 + i) * 26 * (0.4 + rand(i + q * 0.1)) + Math.sin(q * 1.3 + i * 2) * 8;
          if (q) x.lineTo(px, py); else x.moveTo(px, py);
        }
        x.stroke();
        x.beginPath(); x.arc(L + w * 0.74, T + h - 78, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.3 + 0.6 * rand(i + 7))); x.strokeStyle = CY + '0.9)'; x.lineWidth = 5; x.stroke();
        x.fillStyle = WH + '0.7)'; x.font = '500 14px "Space Grotesk",monospace'; x.textAlign = 'left';
        for (var t = 0; t < 3; t++) x.fillText('0x' + Math.floor(rand(i * 9 + t) * 1e8).toString(16).toUpperCase() + '  ' + (rand(i + t * 3) * 100).toFixed(1) + '%', L + 30, T + h - 104 + t * 22);
      }
      // 目盛り
      x.fillStyle = CY + '0.5)'; for (var m2 = 0; m2 < 24; m2++) x.fillRect(L + 30 + m2 * ((w - 60) / 24), T + h - 22, 1.5, m2 % 4 ? 6 : 12);
    }
  }
  drawHud();
  var hudTex = new THREE.CanvasTexture(hudCanvas); hudTex.anisotropy = 8;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawHud(); hudTex.needsUpdate = true; });

  var NF = 40;
  var fGeo = new THREE.PlaneGeometry(1, 0.75);
  var fCell = new Float32Array(NF * 2), fSeed = new Float32Array(NF), fAct = new Float32Array(NF);
  var FD = [];
  for (var fi = 0; fi < NF; fi++) {
    var skill = fi < 8, cl = skill ? fi : 8 + (fi % 8);
    fCell.set([cl % HC, Math.floor(cl / HC)], fi * 2);
    fSeed[fi] = rand(fi + 1805);
    FD.push({
      home: skill ? new V3(fi * 2.6 - 1 + (rand(fi + 1840) - 0.5) * 1.5, (fi % 2 ? 1.6 : -1.9) + (rand(fi + 1850) - 0.5), -8 - rand(fi + 1860) * 5)
                  : new V3(SX0 + 4 + rand(fi + 1840) * (SX1 - SX0 - 8), (rand(fi + 1850) - 0.5) * 6, -20 + rand(fi + 1860) * 18),
      size: skill ? 1.4 : 0.5 + Math.pow(rand(fi + 1870), 2) * 1.5, asp: 1,
      ax: new V3(rand(fi + 1890) - 0.5, (rand(fi + 1900) - 0.5) * 0.4, rand(fi + 1910) - 0.5).normalize(),
      yaw: (rand(fi + 1920) - 0.5) * 1.4, tw: 0.08 + rand(fi + 1925) * 0.12, bob: rand(fi + 1930) * 6.28,
      drift: 0.05 + rand(fi + 1940) * 0.2, act: 0
    });
  }
  fGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(fCell, 2));
  fGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(fSeed, 1));
  fGeo.setAttribute('aAct', new THREE.InstancedBufferAttribute(fAct, 1).setUsage(THREE.DynamicDrawUsage));
  var floatMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: hudTex }, uOpacity: { value: 1 }, uTime: { value: 0 }, uRefl: { value: 0 } },
    vertexShader: [
      'attribute vec2 aCell;attribute float aSeed;attribute float aAct;uniform float uRefl;',
      'varying vec2 vUv;varying vec2 vLoc;varying float vSeed;varying float vAct;varying float vFace;varying float vDepth;varying float vWy;',
      'void main(){',
      ' vLoc=uv; vSeed=aSeed; vAct=aAct;',
      ' vUv=(vec2(aCell.x,' + (HR - 1) + '.0-aCell.y)+uv)/vec2(' + HC + '.0,' + HR + '.0);',
      ' vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);',
      ' vWy=wp.y;',
      ' if(uRefl>0.5){wp.y=2.0*(' + (-3.2).toFixed(1) + ')-wp.y;}',                          // 床への映り込み
      ' vec4 mv=viewMatrix*wp;',
      ' vec3 n=normalize(mat3(viewMatrix)*mat3(modelMatrix)*mat3(instanceMatrix)*vec3(0.0,0.0,1.0));',
      ' vFace=abs(dot(n,normalize(-mv.xyz)));',
      ' vDepth=clamp(1.0-(-mv.z-10.0)/40.0,0.35,1.0);',
      ' gl_Position=projectionMatrix*mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;uniform sampler2D uTex;uniform float uOpacity,uTime,uRefl;',
      'varying vec2 vUv;varying vec2 vLoc;varying float vSeed;varying float vAct;varying float vFace;varying float vDepth;varying float vWy;',
      'void main(){',
      ' vec2 lc=vec2(gl_FrontFacing?vLoc.x:1.0-vLoc.x,vLoc.y);',
      ' vec4 t=texture2D(uTex,(vec2(floor(vUv.x*' + HC + '.0),floor(vUv.y*' + HR + '.0))+lc)/vec2(' + HC + '.0,' + HR + '.0));',
      ' float scan=0.86+0.14*sin(lc.y*520.0+uTime*3.0);',                                    // 走査線
      ' float band=exp(-pow((lc.y-(1.0-fract(uTime*0.18+vSeed)))*9.0,2.0));',                  // ゆっくり下りる光の帯
      ' float flick=0.93+0.07*sin(uTime*37.0+vSeed*80.0)*sin(uTime*13.0+vSeed*20.0);',      // かすかなちらつき
      ' float rev=smoothstep(lc.y-0.04,lc.y,1.0-vAct*1.08+0.04);',                             // 前へ出る時：上から映像が立ち上がる
      ' float revEdge=exp(-pow((lc.y-(1.0-vAct*1.08+0.04))*60.0,2.0))*step(0.01,vAct)*step(vAct,0.98);',
      ' float on=mix(0.55,1.0,1.0-rev*step(0.01,vAct));',
      ' vec3 col=t.rgb*scan*flick*on;',
      ' col+=vec3(0.45,0.9,1.0)*band*0.22*t.a;',
      ' col+=vec3(0.6,0.95,1.0)*pow(1.0-vFace,3.0)*0.35;',                                    // 斜めから見ると縁が光る
      ' col+=vec3(0.8,1.0,1.0)*revEdge*0.9;',
      ' float a=(t.a*(1.25+0.35*band)+revEdge*0.6)*uOpacity*vDepth*mix(1.0,1.2,vAct);',
      ' col*=mix(vec3(0.75,0.85,1.0),vec3(1.0),vDepth);',                                     // 遠くはわずかに青く沈む
      ' if(uRefl>0.5){a*=0.16*smoothstep(-3.2,1.0,vWy);}',
      ' gl_FragColor=vec4(col*a,a);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
  var floaters = new THREE.InstancedMesh(fGeo, floatMat, NF);
  floaters.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  floaters.frustumCulled = false; floaters.renderOrder = 3;
  STREAM.add(floaters);
  var reflMat = floatMat.clone(); reflMat.uniforms.uTex.value = hudTex; reflMat.uniforms.uRefl.value = 1;
  var reflections = new THREE.InstancedMesh(fGeo, reflMat, NF);
  reflections.instanceMatrix = floaters.instanceMatrix;      // 同じ位置を使い、床に映す
  reflections.frustumCulled = false; reflections.renderOrder = 2;
  STREAM.add(reflections);
  // 前に出たスクリーンの後ろの光
  var frontGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_COOL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  STREAM.add(frontGlow);

  var fM = new THREE.Matrix4(), fQ = new THREE.Quaternion(), fQ2 = new THREE.Quaternion(), fS = new V3(), fP = new V3(), fP2 = new V3(), fE = new THREE.Euler();
  function showStream(op, kk, dt, mobile) {
    STREAM.visible = op > 0.003;
    if (!STREAM.visible) return;
    var tt = RM ? 0 : time;
    var s = Math.max(0, kk + 1);
    // カメラは、スクロールに合わせて帯に沿って右へ進む
    camera.position.set(s * 2.6 - 1.5 + (RM ? 0 : Math.sin(time * 0.13) * 0.2), 0.3 + (RM ? 0 : Math.sin(time * 0.1) * 0.12), CAM_Z);
    camera.rotation.set(-0.03, 0, 0); camera.updateMatrixWorld();
    slMat.uniforms.uTime.value = sdMat.uniforms.uTime.value = tt;
    slMat.uniforms.uOpacity.value = sdMat.uniforms.uOpacity.value = op;
    sdMat.uniforms.uPx.value = bufSize.y * 0.004;
    svMat.opacity = 0.25 * op;
    floatMat.uniforms.uOpacity.value = reflMat.uniforms.uOpacity.value = op;
    floatMat.uniforms.uTime.value = reflMat.uniforms.uTime.value = tt;
    // 前に出る位置：左の舞台（.powers__orb）。カメラから見た位置に置く
    var a = anchorRect('.powers__orb'), aw = toWorld(a.x, a.y);
    var DZ = 4.2, scl = (CAM_Z - DZ) / CAM_Z;
    var frontX = camera.position.x + aw[0] * scl, frontY = camera.position.y + aw[1] * scl;
    var frontSize = pxToWorld(a.s) * scl * (mobile ? 1.15 : 1.25);
    var best = 0;
    for (var i = 0; i < NF; i++) {
      var d = FD[i];
      // 浮遊：宙に浮かぶモニターのように、こちらを向いたまま、ゆっくり漂って揺れる
      fP.copy(d.home);
      fP.x += Math.sin(tt * d.drift + d.bob) * 0.8; fP.y += Math.sin(tt * 0.5 + d.bob) * 0.22;
      fE.set(Math.sin(tt * 0.31 + d.bob) * 0.06, d.yaw + Math.sin(tt * d.tw + d.bob) * 0.18, Math.sin(tt * 0.23 + d.bob) * 0.04); fQ.setFromEuler(fE);
      var size = d.size;
      // 01〜08：その番号のパネルが前へ出てくる
      if (i < 8) {
        var act = RM ? (Math.round(kk) === i ? 1 : 0) : 1 - smooth(0.32, 0.8, Math.abs(kk - i));
        if (kk < -0.5) act = 0;
        d.act = act; fAct[i] = act;
        if (act > 0) {
          fP2.set(frontX, frontY, DZ);
          var e2 = act * act * (3 - 2 * act);
          fP.lerp(fP2, e2);
          fE.set(Math.sin(tt * 0.4 + i) * 0.08, -0.22 + Math.sin(tt * 0.3 + i) * 0.06, 0.02); fQ2.setFromEuler(fE);
          fQ.slerp(fQ2, e2);
          size = lerp(size, frontSize, e2);
          if (act > best) best = act;
        }
      }
      fS.set(size * d.asp, size / Math.sqrt(d.asp), size);
      fM.compose(fP, fQ, fS);
      floaters.setMatrixAt(i, fM);
    }
    floaters.instanceMatrix.needsUpdate = true;
    fGeo.attributes.aAct.needsUpdate = true;
    frontGlow.position.set(frontX, frontY, DZ - 0.6);
    frontGlow.scale.setScalar(frontSize * 2.6);
    frontGlow.material.opacity = 0.55 * best * op;
  }


  /* =========================================================
     トップ〜「身につけていく力」までの球体の振り付け
       各セクションで球体が止まる位置（POSE）と、セクションの間で通る大きな寄り道（SWOOP）を、
       スクロール位置に並べた「キーフレーム」にする。間はなめらかな曲線でつなぐ。
       z は奥行き（マイナス＝奥へ遠ざかる、プラス＝手前へ迫る）。
     ========================================================= */
  //            [x(画面比), y(画面比), z, 大きさ(画面の短辺比), 明るさ]
  // 流れ：トップ → 定義で手前にアップ → こんな方へで左へ回り込みながら縮小 → 感情で奥へ遠ざかる
  //       → なぜで左手前へ大きく → さらに進むと手前に迫って画面いっぱい（ホワイトアウト）
  var POSE_PC = {
    hero:    [0.72, 0.50, 0.0, 0.30, 1],
    about:   ['R', 0.50, 0.0, 0.9, 1],     // 手前に大きくアップ。右の枠外に1/3はみ出し、2/3が見える
    for:     [0.22, 0.50, -3.2, 0.30, 1],    // 左へ回り込んで縮小
    emotion: [0.80, 0.24, -14.0, 0.30, 0.9], // 奥へ縮小（見出しを避けて右上の奥）
    why:     [0.22, 0.52, 3.4, 0.30, 1],     // 左手前へ大きく
    powers:  [0.45, 0.48, 1.5, 0.30, 1]      // ここから手前へ迫ってホワイトアウト
  };
  var SWOOP_PC = [
    [0.80, 0.49, 1.2, 0.55, 1],     // トップ → 定義：右へ寄りながら手前へ大きくなる
    [0.55, 0.40, -7.5, 0.45, 1],    // 定義 → こんな方へ：奥を回り込みながら左へ
    [0.50, 0.30, -9.0, 0.30, 0.95], // こんな方へ → 感情：さらに奥へ遠ざかる
    [0.50, 0.42, -4.0, 0.30, 1],    // 感情 → なぜ：奥から左手前へ大きく戻ってくる
    [0.30, 0.50, 2.8, 0.30, 1]      // なぜ → 導入：左手前から中央へ
  ];
  var POSE_SP = {
    hero:    [0.50, 0.17, 0.0, 0.36, 1],
    about:   ['R', 0.16, 0.0, 0.62, 0.55],
    for:     [0.22, 0.14, -3.0, 0.30, 0.75],
    emotion: [0.50, 0.12, -12.0, 0.30, 0.7],
    why:     [0.26, 0.13, 1.2, 0.30, 0.55],
    powers:  [0.50, 0.34, 1.0, 0.42, 1]
  };
  var SWOOP_SP = [
    [0.56, 0.17, 1.5, 0.36, 0.9], [0.44, 0.18, -7, 0.32, 0.75], [0.38, 0.13, -9, 0.30, 0.7],
    [0.36, 0.15, -4, 0.32, 0.75], [0.40, 0.26, 1.8, 0.38, 0.9]
  ];
  var ORDER = ['hero', 'about', 'for', 'emotion', 'why'];
  var KF = [], kfKey = '';
  function buildKeyframes() {
    var mobile = W < 900, vh = EQS.viewport ? EQS.viewport() : window.innerHeight;
    var span = EQS.docSpan || function (el) { var r = el.getBoundingClientRect(); return [r.top + window.scrollY, r.height]; };
    var P = mobile ? POSE_SP : POSE_PC, SW = mobile ? SWOOP_SP : SWOOP_PC;
    // 'R' ＝ 右の枠外に球の1/3がはみ出す位置（直径 D のとき、中心は右端から D/6 内側）
    var P2 = {};
    Object.keys(P).forEach(function (k) {
      var p = P[k].slice();
      if (p[0] === 'R') p[0] = 1 - (p[3] * Math.min(W * 1.15, H)) / (6 * W);
      P2[k] = p;
    });
    P = P2;
    // 横スクロールの時、感情のセクションは2列なので、球体は列のあいだ（上側の奥）へ
    if (EQS.hmode) { P.emotion = P.emotion.slice(); P.emotion[0] = 0.9; P.emotion[1] = 0.22; }
    // 横スクロールでは、トップ→定義の間に球体がいったん右の画面外へ出て、定義の文章と一緒に右から入ってくる（文章に重ならない）
    if (EQS.hmode && !mobile) { SW = SW.slice(); SW[0] = [1.45, 0.48, 1.0, 0.72, 1]; }
    var spans = ORDER.map(function (name) {
      var el = document.querySelector('[data-orb="' + name + '"]');
      var sp = span(el), top = sp[0];
      var a = name === 'hero' ? -1e5 : top - vh * 0.25, b = top + sp[1] - vh * 0.8;
      if (b < a + vh * 0.3) { if (EQS.hmode) { a = top - vh * 0.04; b = top + vh * 0.14; } else { var mid = (a + b) / 2; a = mid - vh * 0.18; b = mid + vh * 0.12; } }   // 狭いセクションでも、その位置で少しとどまる
      return [a, b];
    });
    KF = [];
    ORDER.forEach(function (name, i) {
      KF.push({ y: spans[i][0], p: P[name] });
      KF.push({ y: spans[i][1], p: P[name] });
      var nextA = i < ORDER.length - 1 ? spans[i + 1][0] : span(document.getElementById('powers'))[0] - vh * 0.15;
      if (!RM) KF.push({ y: (spans[i][1] + nextA) / 2, p: SW[i] });
    });
    KF.push({ y: span(document.getElementById('powers'))[0] - vh * 0.15, p: P.powers });
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

  // 絡み合う光の束を表示する（op＝明るさ、kk＝01〜08の進み具合。スクロールでねじれが進む）
  var braidMatReady = false;
  function showBraid(op, kk, dt) {
    if (!braidMatReady) {   // 手前が明るく太く、奥へ行くほど細く消えていく見え方に切り替える
      braidMatReady = true;
      flight.material = flightMat.clone();
      flight.material.fragmentShader = [
        'precision highp float;varying vec2 vUV;varying vec4 vCol;varying vec2 vMeta;uniform float uTime,uOpacity;',
        'void main(){',
        ' float prof=exp(-vUV.y*vUV.y*vMeta.x);',
        ' float u=vUV.x;',
        ' float flow=pow(0.5+0.5*sin(u*34.0-uTime*5.0+vMeta.y*30.0),4.0);',
        ' vec3 c=mix(vCol.rgb,vec3(1.0),pow(prof,6.0)*0.55+flow*0.25);',
        ' float a=prof*smoothstep(0.0,0.05,u)*(1.0-smoothstep(0.55,1.0,u))*(0.55+0.7*flow)*vCol.a*uOpacity;',
        ' gl_FragColor=vec4(c*a,a);',
        '}'].join('\n');
    }
    flight.visible = op > 0.003;
    if (!flight.visible) return;
    buildBraid((RM ? 0 : time * 0.35) + kk * 1.6, camera.position);
    flight.material.uniforms.uTime.value = RM ? 0 : time + kk * 2;
    flight.material.uniforms.uOpacity.value = op;
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
    var white = 0, zBase = 0, rush = 0;
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
          // 導入の前半：球体はその場にとどまり、周りの光の筋だけが手前へ飛び込んでホワイトアウト
          rush = RM ? 0 : smooth(0.02, 0.27, pi);
          white = RM ? 0 : smooth(0.17, 0.28, pi);
        }
      } else {
        T.ovis = 0;
        T.lvis = 0;   // 「身につけていく力」以降は光の球体を使わない
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
      var amp = RM ? 0 : calm * (mobile ? 0.5 : 1) * lerp(1, 0.3, smooth(0.5, 0.95, S.r));   // 大きく寄っている時は漂いを小さく
      var sx = S.x + Math.sin(time * 0.21) * 0.015 * amp;
      var syy = S.y + Math.sin(time * 0.29 + 1.0) * 0.014 * amp;
      var z = Math.min(9.35, S.z + zBase + (Math.sin(time * 0.17) * 1.3 + Math.sin(time * 0.09 + 2.0) * 0.6 - 0.6) * amp);
      var dist = CAM_Z - z;
      var rWorld = pxToWorld(S.r * Math.min(W * 1.15, H)) / 2;
      orb.position.set((sx * 2 - 1) * TAN * dist * ASPECT, -(syy * 2 - 1) * TAN * dist, z);
      orb.scale.setScalar(rWorld);
      var ov = S.ovis;
      orb.visible = false;   // 前半はスキルのパネルの球体（旧：宇宙の球体と周回する光の筋は使わない）
      strands.visible = false; tips.visible = false; heroSparks.visible = false;
      if (!RM) {
        spin.rotation.y += dt * (0.18 + spinBoost * 0.35);
        spin.rotation.x = Math.sin(time * 0.17) * 0.18;
      }
      spin.updateMatrixWorld();
      // 集まり具合：読み込み後しばらく舞ってから集まる。スクロールを始めたらすぐ集まる。
      // セクションの間を移動する時は、少しほどけて、着いたらまた球体に戻る
      var heroAsm = RM ? 1 : Math.max(smooth(2.8, 5.6, time - (panelT0 < 0 ? time : panelT0)), smooth(0, window.innerHeight * 0.35, scrollS));
      var travel = Math.min(1, Math.abs(SV.x) * 2.2 + Math.abs(SV.z) * 0.05);
      var asm = heroAsm * (1 - 0.35 * (RM ? 0 : travel));
      CHX2 = mobile ? 0.45 : 1;
      updatePanels(orb.position, rWorld, asm, rush, m.after ? 0 : 1, spin.quaternion);

      // CTA の白い光の球体
      lights[1].visible = lights[2].visible = false;
      lPos.set(S.lx, S.ly, 0);
      setLight(lights[0], lPos, S.lr, S.lvis, 0);
      lightRig.position.copy(lPos); lightRig.scale.setScalar(Math.max(0.001, S.lr));
      lightRig.visible = S.lvis > 0.003;
      spinOrbit(lightOrbit, dt, spinBoost);
      setOrbit(lightOrbit, lightSparks, S.lvis, burst, reform, 1.1);

      flightSparks.visible = false;
      rays.visible = false;
      dust.visible = false;
      flight.visible = false;
      chaseFresh = true;
      // 文章を読む区間と最後の CTA：光の流れを、静かに背景に
      if (m.after) showStream(mode === 'cta' ? 0.75 : 0.45, 8 + Math.min(4, (scrollS - (EQS.docSpan ? EQS.docSpan(document.getElementById('features'))[0] : 0)) / Math.max(1, window.innerWidth) * 1.2), dt, mobile); else STREAM.visible = false;
    } else {
      /* ---------- 「身につけていく力」以降：絡み合いながら右奥へ進む光の束（球体は使わない） ---------- */
      first = true; wasVisible = false;
      white = RM ? 0 : 1 - smooth(0.40, 0.56, pi);
      heroSparks.visible = false;
      panels.visible = shadows.visible = panelGlow.visible = false;
      orb.visible = false; strands.visible = false; tips.visible = false;
      lights.forEach(function (L) { L.visible = false; });
      lightRig.visible = false; rays.visible = false; flightSparks.visible = false;
      var kk = m.k;
      camera.position.set(RM ? 0 : Math.sin(time * 0.13) * 0.25, RM ? 0 : Math.sin(time * 0.1) * 0.15, CAM_Z);
      camera.rotation.set(0, 0, 0); camera.updateMatrixWorld();
      var braidOp = (RM ? 1 : smooth(0.3, 0.52, pi)) * (1 - smooth(7.05, 7.4, kk));
      flight.visible = false; strands.visible = tips.visible = false;
      showStream(braidOp, kk, dt, mobile);   // 暗い空間の光の流れと、浮遊するパネル（光の球体と追いかける光の筋はやめた）
      dust.visible = false;   // 背景の星空写真があるので、手前の粒は出さない（球体に重なって見えるため）
      bgX = clamp(-Math.max(0, kk + 1) * 4, -40, 0); bgZ = 1 + Math.max(0, kk + 1) * 0.01;
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
