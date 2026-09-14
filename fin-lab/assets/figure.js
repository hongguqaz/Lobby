/* The Fin Lab analyst.
   assets/analyst.jpg is her resting pose. tools/gen_images.py derives keyframes from it
   (assets/frames/{look,talk,wave,point,blink,listen}.jpg): the same woman at the same desk,
   only the pose changed. tools/morph_frames.py then builds in-between strips
   (assets/frames/morph/<a>-<b>.webp, listed in manifest.js) so a move from one pose to the
   next is a short run of frames on a canvas rather than a crossfade: the head turns, the
   eyes close and open, the hand rises into view. Without the strips the poses crossfade;
   without the frames she still tilts toward the pointer, breathes and nods. Lines live in
   LINES. */
(function () {
  'use strict';
  var LINES = {
    en: {
      name: 'Analyst on duty',
      greet: ['Welcome to the Fin Lab. I am the analyst on duty. The desks are set up; the data feeds arrive later.',
              'Good to see you. Nothing is live on the screens yet, but the room is ready for the commentary and reports.'],
      what: 'This room will hold market commentary and analyst reports, filed by date, theme and issuer. Sources and links are being arranged.',
      board: 'The Market Board outside the gate will draw on what we gather here: series, snapshots and summaries, once the database is established.',
      rooms: 'Across the hall is the Legal Quarter. Maiden Hall is upstairs over the door, the Library is in the tower above us, and the Garden is outside.',
      react: ['Yes?', 'I am listening.', 'Careful, the coffee is hot.', 'The feeds are not in yet. Soon.', 'Shall I walk you to the board?'],
      chips: { what: 'What is this room?', board: 'And the Market Board?', rooms: 'The other rooms', go: 'Take me to the board →' }
    },
    ko: {
      name: '당직 애널리스트',
      greet: ['핀랩에 오신 것을 환영합니다. 당직 애널리스트입니다. 자리는 준비됐고, 데이터 피드는 나중에 연결됩니다.',
              '반갑습니다. 화면에 아직 실시간 자료는 없지만, 시황과 리포트를 받을 준비는 끝났습니다.'],
      what: '이 방에는 시황과 애널리스트 분석자료가 날짜·주제·발행자별로 쌍입니다. 자료 소스와 링크는 정리 중입니다.',
      board: '정문 밖의 Market Board는 여기서 모은 자료에서 시계열과 요약을 뽑아 보여주게 됩니다. DB가 정립되면 연결합니다.',
      rooms: '복도 건너편은 Legal Quarter, 정문 위층은 Maiden Hall, 우리 위 탑은 Library, 밖은 Garden입니다.',
      react: ['네?', '듣고 있어요.', '커피 조심하세요, 뜨거워요.', '피드는 아직이에요. 곷 연결됩니다.', 'Market Board로 안내해 드릴까요?'],
      chips: { what: '이 방은 무엇인가요?', board: 'Market Board는요?', rooms: '다른 방들', go: 'Market Board로 →' }
    }
  };
  var FRAME_IDS = ['look', 'talk', 'wave', 'point', 'blink', 'listen'];
  var FRAME_DIR = 'assets/frames/';
  var MORPH_DIR = FRAME_DIR + 'morph/';
  var MANIFEST = window.LOBBY_MORPH || null;       // written by tools/morph_frames.py

  var figure = document.getElementById('figure');
  var tilt = document.getElementById('figure-tilt');
  var bubbleText = document.getElementById('bubble-text');
  var chips = document.getElementById('chips');
  var nameEl = document.getElementById('fig-name');
  if (!figure || !tilt || !bubbleText) return;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var lang = 'en';
  try { lang = localStorage.getItem('lobby-lang') || ((navigator.language || '').slice(0, 2) === 'ko' ? 'ko' : 'en'); } catch (e) { /* ignore */ }
  if (!LINES[lang]) lang = 'en';

  // ---------------------------------------------------------------- poses
  var baseImg = figure.querySelector('.figure-photo.base');
  var frames = { base: baseImg };                       // id -> Image, only those that exist
  var layers = Array.prototype.slice.call(figure.querySelectorAll('.figure-photo.frame'));
  var canvas = figure.querySelector('canvas.morph');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var active = -1;
  var pose = 'base';                                    // what is on screen when nothing is playing
  var hovering = false, talking = false;
  var holdTimer = null, talkTimer = null, idleTimer = null, waveTimer = null, leaveTimer = null;

  function has(id) { return id === 'base' || !!frames[id]; }
  function loaded(id) { var im = frames[id]; return !!im && im.complete && im.naturalWidth > 0; }
  function instantAll() {
    layers.forEach(function (l) { l.classList.add('instant'); });
    setTimeout(function () { layers.forEach(function (l) { l.classList.remove('instant'); }); }, 60);
  }
  function setStatic(id, instant) {
    if (instant) instantAll();
    if (id === 'base' || !has(id)) {
      layers.forEach(function (l) { l.classList.remove('on'); });
      return;
    }
    var next = (active + 1) % layers.length;
    var layer = layers[next];
    layer.src = frames[id].src;
    layer.classList.add('on');
    layers.forEach(function (l, i) { if (i !== next) l.classList.remove('on'); });
    active = next;
  }

  // ---------------------------------------------------------------- in-between strips
  var strips = {};                                      // 'a-b' -> { img, ready }
  function stripFor(a, b) {
    if (!MANIFEST || !MANIFEST.pairs) return null;
    if (MANIFEST.pairs.indexOf(a + '-' + b) >= 0) return { key: a + '-' + b, reverse: false };
    if (MANIFEST.pairs.indexOf(b + '-' + a) >= 0) return { key: b + '-' + a, reverse: true };
    return null;
  }
  function loadStrip(key, then) {
    var s = strips[key];
    if (!s) {
      var img = new Image();
      s = strips[key] = { img: img, ready: false, waiting: [] };
      img.onload = function () { s.ready = true; s.waiting.forEach(function (f) { f(); }); s.waiting = []; };
      img.src = MORPH_DIR + key + '.webp';
    }
    if (then) { if (s.ready) then(); else s.waiting.push(then); }
    return s;
  }
  function preloadStrips() {
    if (!MANIFEST || !ctx || reduced) return;
    var order = ['look-blink', 'base-look', 'base-blink', 'look-talk', 'look-wave', 'base-wave', 'look-point', 'base-point', 'look-listen', 'base-listen'];
    var rest = MANIFEST.pairs.filter(function (k) { return order.indexOf(k) < 0; });
    var queue = order.filter(function (k) { return MANIFEST.pairs.indexOf(k) >= 0; }).concat(rest);
    (function next() { var k = queue.shift(); if (k) loadStrip(k, next); })();
  }
  function drawEndpoint(id) {
    var im = frames[id] || baseImg;
    if (im && im.complete) ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
  }
  function drawStripFrame(s, i) {
    ctx.drawImage(s.img, i * MANIFEST.width, 0, MANIFEST.width, MANIFEST.height, 0, 0, canvas.width, canvas.height);
  }

  // A playback owns the canvas; new requests wait for it or cut it short.
  var playing = null, pending = null;
  function stopPlaying() {
    if (playing) { clearTimeout(playing.timer); playing = null; }
    pending = null;
    if (canvas) canvas.classList.remove('on');
  }
  function flush() {
    if (pending && !playing) { var p = pending; pending = null; goTo(p.id, p.ms, p.then); }
  }
  /* Move from the current pose to `id`, playing the strip between them when there is one
     (`ms` per frame), otherwise crossfading. `then` runs once she has arrived. */
  function goTo(id, ms, then) {
    if (!has(id)) id = 'base';
    if (id === pose && !playing) { if (then) then(); return; }
    if (playing) { pending = { id: id, ms: ms, then: then }; return; }
    var s = (!reduced && ctx) ? stripFor(pose, id) : null;
    var st = s ? loadStrip(s.key) : null;
    if (!st || !st.ready || !loaded(id === 'base' ? 'base' : id)) {
      setStatic(id, false); pose = id;
      if (then) then();
      return;
    }
    var K = MANIFEST.frames, order = [], i;
    for (i = 0; i < K; i++) order.push(s.reverse ? K - 1 - i : i);
    var step = 0;
    playing = { timer: 0 };
    canvas.classList.add('on');
    (function tick() {
      if (step < order.length) {
        drawStripFrame(st, order[step]); step++;
        playing.timer = setTimeout(tick, ms || 40);
        return;
      }
      drawEndpoint(id);
      setStatic(id, true); pose = id;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        if (playing) { canvas.classList.remove('on'); playing = null; }
        if (then) then();
        flush();
      }); });
    })();
  }
  /* Part of a strip out and back again, from the current pose: a half-open mouth, a small
     tilt of the head. Leaves the pose unchanged. */
  function playPartial(id, depth, ms, then) {
    var s = (!reduced && ctx) ? stripFor(pose, id) : null;
    var st = s ? loadStrip(s.key) : null;
    if (!st || !st.ready || playing) { if (then) then(); return; }
    var K = MANIFEST.frames, seq = [], i;
    depth = Math.max(1, Math.min(K, depth));
    for (i = 0; i < depth; i++) seq.push(s.reverse ? K - 1 - i : i);
    for (i = depth - 2; i >= 0; i--) seq.push(s.reverse ? K - 1 - i : i);
    var step = 0;
    playing = { timer: 0 };
    canvas.classList.add('on');
    (function tick() {
      if (step < seq.length) { drawStripFrame(st, seq[step]); step++; playing.timer = setTimeout(tick, ms); return; }
      drawEndpoint(pose);
      requestAnimationFrame(function () {
        if (playing) { canvas.classList.remove('on'); playing = null; }
        if (then) then();
        flush();
      });
    })();
  }
  function restingPose() { return hovering ? 'look' : 'base'; }
  function hold(id, ms, then) {
    clearTimeout(holdTimer);
    goTo(id, 40, function () {
      holdTimer = setTimeout(function () { goTo(then === undefined ? restingPose() : then, 40); }, ms);
    });
  }
  function blink(then) {
    goTo('blink', 26, function () {
      holdTimer = setTimeout(function () { goTo(restingPose(), 30, then); }, 70);
    });
  }
  function preloadFrames() {
    if (!layers.length) return;
    var left = FRAME_IDS.length;
    FRAME_IDS.forEach(function (id) {
      var img = new Image();
      img.onload = function () { frames[id] = img; if (--left <= 0 || id === 'blink') scheduleIdle(); };
      img.onerror = function () { if (--left <= 0) scheduleIdle(); };
      img.src = FRAME_DIR + id + '.jpg';
    });
  }

  // ---------------------------------------------------------------- idling
  function scheduleIdle() {
    if (reduced) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(idle, 3200 + Math.random() * 4200);
  }
  function idle() {
    if (!talking && !hovering && !playing && pose === 'base') {
      var r = Math.random();
      if (r < 0.55 && has('blink')) blink();
      else if (r < 0.8 && has('look')) hold('look', 1400 + Math.random() * 900, 'base');
      else if (has('listen')) playPartial('listen', 2 + Math.floor(Math.random() * 2), 46);
    }
    scheduleIdle();
  }

  // ---------------------------------------------------------------- speech
  var typing = null;
  function talkLoop() {
    if (!talking) return;
    var s = stripFor('look', 'talk');
    if (!s || !loadStrip(s.key).ready || reduced || !ctx) {
      // no strip: flick between the two mouths
      var open = pose !== 'talk';
      setStatic(open && has('talk') ? 'talk' : 'look', false); pose = open && has('talk') ? 'talk' : 'look';
      talkTimer = setTimeout(talkLoop, 150 + Math.random() * 130);
      return;
    }
    if (pose !== 'look') { goTo('look', 26, talkLoop); return; }
    var depth = 3 + Math.floor(Math.random() * (MANIFEST.frames - 2));      // how far the mouth opens
    playPartial('talk', depth, 24 + Math.random() * 10, function () {
      talkTimer = setTimeout(talkLoop, 40 + Math.random() * 170);
    });
  }
  function startTalking() {
    talking = true;
    figure.classList.add('talking');
    clearTimeout(talkTimer);
    if (has('talk')) talkLoop();
  }
  function stopTalking() {
    talking = false;
    figure.classList.remove('talking');
    clearTimeout(talkTimer);
    var settle = function () {
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () { goTo(restingPose(), 40); }, 1400);
    };
    if (playing) pending = { id: 'look', ms: 26, then: settle }; else goTo('look', 26, settle);
  }
  function say(text, gesture) {
    if (typing) { clearInterval(typing); typing = null; }
    clearTimeout(talkTimer); clearTimeout(holdTimer); talking = false; figure.classList.remove('talking');
    stopPlaying();
    bubbleText.textContent = '';
    if (reduced) { bubbleText.textContent = text; if (gesture && has(gesture)) { setStatic(gesture, false); pose = gesture; } return; }
    var i = 0;
    var begin = function () {
      startTalking();
      typing = setInterval(function () {
        i++;
        bubbleText.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(typing); typing = null; stopTalking(); }
      }, 22);
    };
    if (gesture && has(gesture)) {
      goTo(gesture, 55, function () { holdTimer = setTimeout(begin, 700); });
    } else {
      begin();
    }
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function wave() {
    figure.classList.remove('waving'); void figure.offsetWidth; figure.classList.add('waving');
    clearTimeout(waveTimer);
    waveTimer = setTimeout(function () { figure.classList.remove('waving'); }, 1300);
  }
  function renderChips() {
    var L = LINES[lang];
    chips.replaceChildren();
    [['what', null], ['board', 'point'], ['rooms', 'listen']].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = L.chips[pair[0]];
      b.addEventListener('click', function () { say(L[pair[0]], pair[1]); });
      chips.appendChild(b);
    });
    var a = document.createElement('a');
    a.href = '../market-board-facade/'; a.textContent = L.chips.go;
    chips.appendChild(a);
    nameEl.textContent = L.name;
  }
  function setLang(next) {
    lang = LINES[next] ? next : 'en';
    try { localStorage.setItem('lobby-lang', lang); } catch (e) { /* ignore */ }
    Array.prototype.forEach.call(document.querySelectorAll('.nameplate button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    renderChips();
    say(pick(LINES[lang].greet));
  }
  Array.prototype.forEach.call(document.querySelectorAll('.nameplate button'), function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
  });

  // ---------------------------------------------------------------- she turns toward the pointer
  var current = { x: 0, y: 0 }, target = { x: 0, y: 0 }, raf = null;
  function animate() {
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y - current.y) * 0.12;
    tilt.style.transform = 'rotateY(' + current.x.toFixed(2) + 'deg) rotateX(' + current.y.toFixed(2) + 'deg)';
    if (Math.abs(target.x - current.x) > 0.05 || Math.abs(target.y - current.y) > 0.05) raf = requestAnimationFrame(animate);
    else raf = null;
  }
  function lookAt(clientX, clientY) {
    var r = figure.getBoundingClientRect();
    var px = (clientX - (r.left + r.width / 2)) / Math.max(r.width, 1);
    var py = (clientY - (r.top + r.height / 2)) / Math.max(r.height, 1);
    var dist = Math.min(1, Math.hypot(px, py) / 1.6);
    target.x = Math.max(-9, Math.min(9, px * 14)) * (1 - dist * 0.35);
    target.y = Math.max(-7, Math.min(7, -py * 10)) * (1 - dist * 0.35);
    if (!raf) raf = requestAnimationFrame(animate);
  }
  if (!reduced) {
    document.addEventListener('pointermove', function (e) { lookAt(e.clientX, e.clientY); });
    document.addEventListener('pointerleave', function () { target.x = 0; target.y = 0; if (!raf) raf = requestAnimationFrame(animate); });
  }
  var guide = figure.closest('.guide') || figure;
  guide.addEventListener('pointerenter', function () {
    hovering = true; clearTimeout(leaveTimer);
    if (!talking && has('look')) { clearTimeout(holdTimer); goTo('look', 40); }
  });
  guide.addEventListener('pointerleave', function () {
    hovering = false;
    if (!talking) { clearTimeout(holdTimer); leaveTimer = setTimeout(function () { if (!talking && !hovering) goTo('base', 40); }, 500); }
  });

  function greetClick() { wave(); say(pick(LINES[lang].react), has('wave') ? 'wave' : null); }
  figure.addEventListener('click', greetClick);
  figure.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); greetClick(); } });

  preloadFrames();
  renderChips();
  var greeted = false;
  function greet() {
    if (greeted) return; greeted = true;
    wave(); say(pick(LINES[lang].greet), has('wave') ? 'wave' : null);
  }
  // Greet once the wave strip is in, so the first thing she does is already smooth (or after a moment anyway).
  var waveStrip = stripFor('base', 'wave');
  if (waveStrip && ctx && !reduced) loadStrip(waveStrip.key, function () { setTimeout(greet, 350); });
  setTimeout(greet, waveStrip ? 2600 : 600);
  setTimeout(preloadStrips, 800);
})();
