/* The Fin Lab analyst.
   assets/analyst.jpg is her resting pose and assets/analyst-mid.jpg the attentive pose she
   keeps while a conversation is open. Four video clips (assets/clips/: greet, ack, work,
   bye) carry her voice: she says hello and waves when clicked, answers "yes, understood"
   to a question, turns to the screen to look something up, and says goodbye when the
   visitor leaves or falls silent. tools/prepare_clips.py fits the clips to the photographs'
   framing and exposure and writes each clip's first and last frame as a pose
   (assets/frames/<clip>-in.jpg, <clip>-out.jpg); tools/morph_frames.py builds in-between
   strips between every pose the page moves between (assets/frames/morph/, manifest.js).

   So a clip never "starts": the canvas morphs from her current pose into the clip's first
   frame, the clip plays on top, and the canvas takes over again from its last frame and
   morphs on to the next pose. Between clips she blinks and glances at a human pace. If the
   clips cannot play, the keyframe gestures (wave, point, talk, listen) stand in; without
   the strips the poses crossfade; without the frames she still tilts toward the pointer,
   breathes and nods. Lines live in LINES. */
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
      chips: { what: 'What is this room?', board: 'And the Market Board?', rooms: 'The other rooms', bye: 'That is all, thank you', go: 'Take me to the board →' },
      hint: 'Click me and I will say hello.',
      clips: { greet: 'Hello! Welcome to the Fin Lab. I am the analyst on duty.', ack: 'Yes, understood.', work: '(She turns to the screen to look it up.)', bye: 'See you again.' }
    },
    ko: {
      name: '당직 애널리스트',
      greet: ['핀랩에 오신 것을 환영합니다. 당직 애널리스트입니다. 자리는 준비됐고, 데이터 피드는 나중에 연결됩니다.',
              '반갑습니다. 화면에 아직 실시간 자료는 없지만, 시황과 리포트를 받을 준비는 끝났습니다.'],
      what: '이 방에는 시황과 애널리스트 분석자료가 날짜·주제·발행자별로 쌍입니다. 자료 소스와 링크는 정리 중입니다.',
      board: '정문 밖의 Market Board는 여기서 모은 자료에서 시계열과 요약을 뽑아 보여주게 됩니다. DB가 정립되면 연결합니다.',
      rooms: '복도 건너편은 Legal Quarter, 정문 위층은 Maiden Hall, 우리 위 탑은 Library, 밖은 Garden입니다.',
      react: ['네?', '듣고 있어요.', '커피 조심하세요, 뜨거워요.', '피드는 아직이에요. 곧 연결됩니다.', 'Market Board로 안내해 드릴까요?'],
      chips: { what: '이 방은 무엇인가요?', board: 'Market Board는요?', rooms: '다른 방들', bye: '그럼 이만', go: 'Market Board로 →' },
      hint: '저를 클릭하면 인사할게요.',
      clips: { greet: '안녕하세요? 핀랩에 오신 것을 환영합니다. 당직 애널리스트입니다.', ack: '네, 알겠습니다.', work: '(화면을 보며 자료를 찾습니다.)', bye: '또 봐요.' }
    }
  };
  var FRAME_IDS = ['look', 'talk', 'wave', 'point', 'blink', 'listen', 'wave-mid', 'point-mid'];
  var CLIP_NAMES = ['greet', 'ack', 'work', 'bye'];
  var FRAME_DIR = 'assets/frames/';
  var MID_SRC = 'assets/analyst-mid.jpg';
  var MORPH_DIR = FRAME_DIR + 'morph/';
  var MANIFEST = window.LOBBY_MORPH || null;        // written by tools/morph_frames.py

  var figure = document.getElementById('figure');
  var tilt = document.getElementById('figure-tilt');
  var bubbleText = document.getElementById('bubble-text');
  var chips = document.getElementById('chips');
  var nameEl = document.getElementById('fig-name');
  var soundBtn = document.getElementById('fig-sound');
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
  var canvasMode = !!(ctx && MANIFEST && MANIFEST.pairs && !reduced);
  var active = -1;
  var pose = 'base';                                    // where she is when nothing is playing
  var hovering = false, talking = false;
  var holdTimer = null, talkTimer = null, idleTimer = null, waveTimer = null, leaveTimer = null;

  function has(id) { return id === 'base' || !!frames[id]; }
  function ready(id) { var im = frames[id]; return !!im && im.complete && im.naturalWidth > 0; }

  // Fallback display: two crossfading <img> layers over the portrait.
  function setStatic(id) {
    if (id === 'base' || !has(id)) { layers.forEach(function (l) { l.classList.remove('on'); }); return; }
    var next = (active + 1) % layers.length;
    var layer = layers[next];
    layer.src = frames[id].src;
    layer.classList.add('on');
    layers.forEach(function (l, i) { if (i !== next) l.classList.remove('on'); });
    active = next;
  }

  // ---------------------------------------------------------------- canvas
  function fitCanvas() {
    if (!canvasMode) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(tilt.offsetWidth * dpr)), h = Math.max(1, Math.round(tilt.offsetHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    if (!anim) drawPose(pose, 1);
  }
  function drawPose(id, alpha) {
    var im = frames[id] || baseImg;
    if (!im || !im.complete || !im.naturalWidth) return;
    ctx.globalAlpha = alpha; ctx.drawImage(im, 0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1;
  }
  function drawStrip(s, i, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.img, i * MANIFEST.width, 0, MANIFEST.width, MANIFEST.height, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
  var strips = {};                                      // 'a-b' -> { img, ready, waiting }
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
    if (!canvasMode) return;
    var order = ['base-greet-in', 'greet-out-mid', 'mid-blink', 'base-mid', 'mid-ack-in', 'ack-out-work-in', 'work-out-mid', 'mid-bye-in', 'bye-out-base',
                 'look-blink', 'base-look', 'base-blink', 'look-talk', 'look-wave', 'base-wave', 'look-point', 'base-point', 'look-listen', 'base-listen'];
    var queue = order.filter(function (k) { return MANIFEST.pairs.indexOf(k) >= 0; })
      .concat(MANIFEST.pairs.filter(function (k) { return order.indexOf(k) < 0; }));
    (function next() { var k = queue.shift(); if (k) loadStrip(k, next); })();
  }

  /* A track runs from pose a (position 0) to pose b (position K+1) through the K strip
     frames. drawAt blends the two nearest sources, so any position is a picture. */
  function makeTrack(a, b) {
    var s = stripFor(a, b);
    var st = s ? loadStrip(s.key) : null;
    return { a: a, b: b, s: s, st: st, K: MANIFEST.frames, usable: !!(st && st.ready && ready(a === 'base' ? 'base' : a) && ready(b === 'base' ? 'base' : b)) };
  }
  function drawSource(track, j, alpha) {
    if (j <= 0) drawPose(track.a, alpha);
    else if (j >= track.K + 1) drawPose(track.b, alpha);
    else drawStrip(track.st, track.s.reverse ? track.K - j : j - 1, alpha);
  }
  function drawAt(track, f) {
    var end = track.K + 1;
    f = Math.max(0, Math.min(end, f));
    var lo = Math.floor(f), frac = f - lo;
    drawSource(track, lo, 1);
    if (frac > 0.02 && lo < end) drawSource(track, lo + 1, frac);
  }

  // ---------------------------------------------------------------- easing and the animator
  var EASE = {
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    in_: function (t) { return t * t * t; },
    inQ: function (t) { return t * t; },
    outQ: function (t) { return 1 - (1 - t) * (1 - t); },
    sine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    linear: function (t) { return t; }
  };
  var anim = null, pending = null, lastTrack = null;
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  /* Run position from f0 to f1 on a track over ms milliseconds. */
  function runRange(track, f0, f1, ms, ease, then) {
    var t0 = now();
    anim = { cancel: false };
    var me = anim;
    (function frame() {
      if (me.cancel) return;
      var p = Math.min(1, (now() - t0) / Math.max(1, ms));
      drawAt(track, f0 + (f1 - f0) * (ease || EASE.inOut)(p));
      if (p < 1) { requestAnimationFrame(frame); return; }
      anim = null;
      if (then) then();
      flush();
    })();
  }
  function cancelAnim() { if (anim) { anim.cancel = true; anim = null; } pending = null; }
  function flush() { if (pending && !anim) { var p = pending; pending = null; goTo(p.id, p.ms, p.ease, p.then); } }

  /* A raised hand passes through its mid-rise keyframe when that exists (manifest.via), so
     the move is two legs: accelerating into the first, easing out of the second. Returns the
     list of poses to visit. */
  function route(from, to) {
    var via = (MANIFEST && MANIFEST.via) || {};
    var mid = via[to];
    if (mid && has(mid) && from !== mid && stripFor(from, mid) && stripFor(mid, to)) return [mid, to];
    mid = via[from];
    if (mid && has(mid) && to !== mid && stripFor(from, mid) && stripFor(mid, to)) return [mid, to];
    return [to];
  }
  /* Move from the current pose to `id` over `ms` milliseconds. Uses the strip between them
     when it is loaded, a canvas crossfade otherwise; the layer fallback outside canvas mode. */
  function goTo(id, ms, ease, then) {
    if (!has(id)) id = 'base';
    if (id === pose && !anim) { if (then) then(); return; }
    if (anim) { pending = { id: id, ms: ms, ease: ease, then: then }; return; }
    if (!canvasMode) { setStatic(id); pose = id; if (then) then(); return; }
    var legs = route(pose, id);
    if (legs.length === 2) {
      var total = ms || 800;
      leg(legs[0], total * 0.55, EASE.inQ, function () { leg(legs[1], total * 0.45, EASE.outQ, then); });
      return;
    }
    leg(id, ms, ease, then);
  }
  function leg(id, ms, ease, then) {
    var track = makeTrack(pose, id);
    var from = pose;
    pose = id;
    if (track.usable) {
      lastTrack = track;
      runRange(track, 0, track.K + 1, ms || 600, ease, then);
    } else {
      // plain dissolve between the two photographs
      lastTrack = null;
      var t0 = now(); anim = { cancel: false }; var me = anim;
      (function frame() {
        if (me.cancel) return;
        var p = Math.min(1, (now() - t0) / Math.max(1, ms || 400));
        drawPose(from, 1); drawPose(id, EASE.sine(p));
        if (p < 1) { requestAnimationFrame(frame); return; }
        anim = null; if (then) then(); flush();
      })();
    }
  }
  /* From the current pose part-way along the strip toward `id` and back: a syllable, a nod
     of the head. `depth` is 0..1 of the way there. */
  function playPartial(id, depth, msOut, msBack, then) {
    if (!canvasMode || anim) { if (then) then(); return; }
    var track = makeTrack(pose, id);
    if (!track.usable) { if (then) then(); return; }
    var target = Math.max(1, Math.min(track.K + 1, depth * (track.K + 1)));
    runRange(track, 0, target, msOut, EASE.out, function () {
      runRange(track, target, 0, msBack, EASE.inOut, then);
    });
  }
  /* A small wave of the raised hand: dip along the last part of the track and back. */
  function waveHand(times, then) {
    var track = lastTrack;
    if (!canvasMode || !track || track.b !== pose || anim) { if (then) then(); return; }
    var end = track.K + 1, dip = end - 1.2, n = 0;
    (function once() {
      runRange(track, end, dip, 190, EASE.sine, function () {
        runRange(track, dip, end, 210, EASE.sine, function () { if (++n < times) once(); else if (then) then(); });
      });
    })();
  }
  function restingPose() { return mode === 'engaged' ? 'mid' : (hovering ? 'look' : 'base'); }
  function blink(then) {
    if (!has('blink')) { if (then) then(); return; }
    goTo('blink', 120, EASE.in_, function () {
      holdTimer = setTimeout(function () { goTo(restingPose(), 190, EASE.out, then); }, 60);
    });
  }
  function preloadFrames() {
    var wanted = FRAME_IDS.map(function (id) { return [id, FRAME_DIR + id + '.jpg']; });
    wanted.push(['mid', MID_SRC]);
    CLIP_NAMES.forEach(function (c) { wanted.push([c + '-in', FRAME_DIR + c + '-in.jpg'], [c + '-out', FRAME_DIR + c + '-out.jpg']); });
    var left = wanted.length;
    wanted.forEach(function (pair) {
      var img = new Image();
      img.onload = function () { frames[pair[0]] = img; if (--left <= 0) scheduleIdle(); };
      img.onerror = function () { if (--left <= 0) scheduleIdle(); };
      img.src = pair[1];
    });
  }

  // ---------------------------------------------------------------- idling
  function scheduleIdle() {
    if (reduced) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(idle, 3500 + Math.random() * 4500);
  }
  function idle() {
    if (busy || talking || anim) { scheduleIdle(); return; }
    if (mode === 'engaged' && pose === 'mid') {
      var q = Math.random();
      if (q < 0.7) blink();
      else if (has('listen') && stripFor('mid', 'listen')) playPartial('listen', 0.25 + Math.random() * 0.25, 900, 1100);
    } else if (!hovering && pose === 'base') {
      var r = Math.random();
      if (r < 0.5) blink();
      else if (r < 0.78 && has('look')) {
        goTo('look', 700, EASE.inOut, function () {
          holdTimer = setTimeout(function () { if (!talking && !hovering && !busy) goTo('base', 850, EASE.inOut); }, 1400 + Math.random() * 1200);
        });
      } else if (has('listen')) playPartial('listen', 0.3 + Math.random() * 0.3, 900, 1100);
    }
    scheduleIdle();
  }

  // ---------------------------------------------------------------- speech
  var typing = null;
  function talkLoop() {
    if (!talking) return;
    if (!canvasMode) {
      var open = pose !== 'talk' && has('talk');
      setStatic(open ? 'talk' : 'look'); pose = open ? 'talk' : 'look';
      talkTimer = setTimeout(talkLoop, 150 + Math.random() * 130);
      return;
    }
    if (pose !== 'look') { goTo('look', 500, EASE.inOut, talkLoop); return; }
    var depth = 0.45 + Math.random() * 0.55;                   // how far the mouth opens
    playPartial('talk', depth, 90 + Math.random() * 60, 120 + Math.random() * 70, function () {
      talkTimer = setTimeout(talkLoop, 40 + Math.random() * 150);
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
      holdTimer = setTimeout(function () { goTo(restingPose(), 850, EASE.inOut); }, 1500);
    };
    if (anim) pending = { id: 'look', ms: 300, ease: EASE.out, then: settle }; else goTo('look', 300, EASE.out, settle);
  }
  function say(text, gesture) {
    if (busy) return;
    if (typing) { clearInterval(typing); typing = null; }
    clearTimeout(talkTimer); clearTimeout(holdTimer); talking = false; figure.classList.remove('talking');
    bubbleText.textContent = '';
    if (reduced) { bubbleText.textContent = text; if (gesture && has(gesture)) { setStatic(gesture); pose = gesture; } return; }
    var i = 0;
    var type = function () {
      typing = setInterval(function () {
        i++;
        bubbleText.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(typing); typing = null; stopTalking(); }
      }, 22);
    };
    if (gesture === 'wave' && has('wave')) {
      // hand up, a couple of waves, then it comes down as she starts to speak
      goTo('wave', 800, EASE.inOut, function () {
        waveHand(2, function () {
          holdTimer = setTimeout(function () { startTalking(); type(); }, 250);
        });
      });
    } else if (gesture && has(gesture)) {
      // point or listen: she takes the pose, begins speaking, and lets it go a moment later
      goTo(gesture, 850, EASE.inOut, function () {
        type();
        holdTimer = setTimeout(startTalking, 1300);
      });
    } else {
      startTalking(); type();
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
      b.addEventListener('click', function () { touch(); if (clipMode) answerWithClips(L[pair[0]]); else say(L[pair[0]], pair[1]); });
      chips.appendChild(b);
    });
    if (clipMode) {
      var bye = document.createElement('button');
      bye.type = 'button'; bye.textContent = L.chips.bye; bye.className = 'bye';
      bye.addEventListener('click', function () { if (mode === 'engaged') leave(); else caption(L.clips.bye); });
      chips.appendChild(bye);
    }
    var a = document.createElement('a');
    a.href = '../market-board-facade/'; a.textContent = L.chips.go;
    a.addEventListener('click', function (e) {
      if (!clipMode || mode !== 'engaged' || busy) return;
      e.preventDefault();
      var href = a.href, gone = false;
      var go = function () { if (!gone) { gone = true; window.location.href = href; } };
      leave(go);
      setTimeout(go, 4500);
    });
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
    if (clipMode) { if (!busy) caption(mode === 'engaged' ? pick(LINES[lang].react) : LINES[lang].hint); }
    else say(pick(LINES[lang].greet));
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
    if (mode === 'rest' && !busy && !talking && has('look')) { clearTimeout(holdTimer); goTo('look', 650, EASE.inOut); }
  });
  guide.addEventListener('pointerleave', function () {
    hovering = false;
    if (mode === 'rest' && !busy && !talking) { clearTimeout(holdTimer); leaveTimer = setTimeout(function () { if (!talking && !hovering && !busy && mode === 'rest') goTo('base', 800, EASE.inOut); }, 600); }
  });

  // ---------------------------------------------------------------- the clips
  var videos = {};
  Array.prototype.forEach.call(figure.querySelectorAll('video.clip'), function (v) { videos[v.getAttribute('data-clip')] = v; });
  var probe = videos.greet;
  var clipMode = !!(canvasMode && probe && probe.canPlayType && MANIFEST.pairs.indexOf('base-greet-in') >= 0 &&
    (probe.canPlayType('video/webm; codecs="vp9, opus"') || probe.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"')));
  var mode = 'rest';          // 'rest' (portrait) or 'engaged' (attentive pose, conversation open)
  var busy = false;           // a clip or a scripted sequence is running
  var sound = true;
  try { sound = localStorage.getItem('lobby-sound') !== 'off'; } catch (e) { /* ignore */ }
  var quietTimer = null, byeAfterQuiet = 45000;

  function setSound(on) {
    sound = !!on;
    try { localStorage.setItem('lobby-sound', sound ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (soundBtn) { soundBtn.setAttribute('aria-pressed', String(sound)); soundBtn.textContent = sound ? '\uD83D\uDD0A' : '\uD83D\uDD07'; }
    Object.keys(videos).forEach(function (k) { videos[k].muted = !sound; });
  }
  if (soundBtn) soundBtn.addEventListener('click', function () { setSound(!sound); });
  setSound(sound);
  if (!clipMode) { Object.keys(videos).forEach(function (k) { videos[k].removeAttribute('preload'); videos[k].preload = 'none'; }); if (soundBtn) soundBtn.hidden = true; }

  function warmClips() {
    ['ack', 'work', 'bye'].forEach(function (k) { var v = videos[k]; if (v && v.preload !== 'auto') { v.preload = 'auto'; try { v.load(); } catch (e) { /* ignore */ } } });
  }
  /* Morph into the clip's first frame, play it over the canvas, hand the last frame back to
     the canvas. `then(ok)` runs at the end; ok is false when the clip could not play. */
  function playClip(name, then) {
    var v = videos[name];
    if (!clipMode || !v || !has(name + '-in') || !has(name + '-out')) { if (then) then(false); return; }
    goTo(name + '-in', 380, EASE.inOut, function () {
      var done = false;
      var finish = function (ok) {
        if (done) return; done = true;
        v.removeEventListener('ended', onEnded); v.removeEventListener('error', onError); v.removeEventListener('playing', onPlaying);
        if (ok) { pose = name + '-out'; drawPose(pose, 1); }
        v.classList.remove('on');
        try { v.pause(); } catch (e) { /* ignore */ }
        if (then) then(ok);
      };
      var onPlaying = function () { v.classList.add('on'); };
      var onEnded = function () { finish(true); };
      var onError = function () { finish(false); };
      v.addEventListener('playing', onPlaying); v.addEventListener('ended', onEnded); v.addEventListener('error', onError);
      v.muted = !sound;
      try { v.currentTime = 0; } catch (e) { /* ignore */ }
      var p = v.play();
      if (p && p.catch) {
        p.catch(function () {
          // autoplay with sound refused: try muted once, else give up on the clip
          v.muted = true;
          var q = v.play();
          if (q && q.catch) q.catch(function () { finish(false); });
        });
      }
      // a clip that never starts should not hang the figure
      setTimeout(function () { if (!done && v.paused && v.currentTime === 0) finish(false); }, 4000);
    });
  }
  function caption(text) {
    if (typing) { clearInterval(typing); typing = null; }
    bubbleText.textContent = text;
  }
  function touch() {
    clearTimeout(quietTimer);
    if (mode === 'engaged') quietTimer = setTimeout(function () { if (mode === 'engaged' && !busy && !talking) leave(); }, byeAfterQuiet);
  }
  function engage(then) {
    mode = 'engaged'; warmClips(); touch();
    if (pose === 'mid') { if (then) then(); return; }
    goTo('mid', 700, EASE.inOut, then);
  }
  /* Hello: from rest she looks up, waves and speaks, then settles into the attentive pose. */
  function greetWithClip() {
    if (busy) return;
    busy = true; clearTimeout(holdTimer); clearTimeout(idleTimer);
    caption(LINES[lang].clips.greet);
    playClip('greet', function (ok) {
      if (!ok) { busy = false; wave(); say(pick(LINES[lang].greet), has('wave') ? 'wave' : null); return; }
      goTo('mid', 600, EASE.inOut, function () { busy = false; mode = 'engaged'; warmClips(); touch(); scheduleIdle(); });
    });
  }
  /* A question: "yes, understood", then she turns to the screen while the answer appears. */
  function answerWithClips(text) {
    if (busy) return;
    busy = true; clearTimeout(holdTimer); clearTimeout(idleTimer);
    engage(function () {
      caption(LINES[lang].clips.ack);
      playClip('ack', function (ok) {
        if (!ok) { busy = false; say(text); return; }
        // the answer types while she looks it up
        var i = 0; bubbleText.textContent = '';
        typing = setInterval(function () { i++; bubbleText.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typing); typing = null; } }, 22);
        playClip('work', function () {
          goTo('mid', 650, EASE.inOut, function () { busy = false; touch(); scheduleIdle(); });
        });
      });
    });
  }
  /* Goodbye: she says so and goes back to work. `after` runs when she has settled. */
  function leave(after) {
    if (busy && !after) return;
    busy = true; clearTimeout(holdTimer); clearTimeout(idleTimer); clearTimeout(quietTimer);
    var finish = function () { goTo('base', 800, EASE.inOut, function () { mode = 'rest'; busy = false; scheduleIdle(); setTimeout(function () { if (mode === 'rest' && !busy) caption(LINES[lang].hint); }, 2500); if (after) after(); }); };
    engage(function () {
      caption(LINES[lang].clips.bye);
      playClip('bye', function (ok) { if (!ok) caption(LINES[lang].clips.bye); finish(); });
    });
  }

  function greetClick() {
    touch();
    if (clipMode) {
      if (mode === 'rest') { greetWithClip(); return; }
      if (busy) return;
      // already talking to her: a small acknowledgement
      caption(pick(LINES[lang].react));
      if (has('listen') && stripFor('mid', 'listen')) playPartial('listen', 0.5, 500, 600); else blink();
      return;
    }
    wave(); say(pick(LINES[lang].react), has('wave') ? 'wave' : null);
  }
  figure.addEventListener('click', greetClick);
  figure.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); greetClick(); } });

  // ---------------------------------------------------------------- start
  if (canvasMode) {
    canvas.classList.add('on');
    var paint = function () { fitCanvas(); drawPose('base', 1); };
    if (baseImg.complete && baseImg.naturalWidth) paint(); else baseImg.addEventListener('load', paint);
    window.addEventListener('resize', fitCanvas);
  }
  preloadFrames();
  renderChips();
  var greeted = false;
  function greet() {
    if (greeted) return; greeted = true;
    wave(); say(pick(LINES[lang].greet), has('wave') ? 'wave' : null);
  }
  if (clipMode) {
    // Her voice needs a click first (browsers only allow sound after a gesture), so she
    // glances at the visitor and the bubble invites the click.
    caption(LINES[lang].hint);
    setTimeout(function () {
      if (mode === 'rest' && !busy && !hovering && has('look')) {
        goTo('look', 700, EASE.inOut, function () { holdTimer = setTimeout(function () { if (mode === 'rest' && !busy && !hovering) goTo('base', 850, EASE.inOut); }, 1800); });
      }
    }, 1600);
  } else {
    // Greet once the wave frame and its strip are in, so the first movement is already smooth.
    var waveStrip = canvasMode ? stripFor('base', 'wave') : null;
    if (waveStrip) loadStrip(waveStrip.key, function () { var w = function () { if (ready('wave')) setTimeout(greet, 400); else setTimeout(w, 100); }; w(); });
    setTimeout(greet, waveStrip ? 3000 : 600);
  }
  setTimeout(preloadStrips, 700);
})();
