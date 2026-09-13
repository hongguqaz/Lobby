/* The Fin Lab analyst.
   assets/analyst.jpg is her resting pose. tools/gen_images.py derives keyframes from
   it (assets/frames/{look,talk,wave,point,blink,listen}.jpg): the same woman at the
   same desk, only the pose changed. This script crossfades between them so she blinks,
   glances up, turns to you when you come near, talks while the text types, waves when
   clicked and points when asked about the board. Without the frames she still tilts
   toward the pointer, breathes and nods. Lines live in LINES. */
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

  // ---------------------------------------------------------------- keyframes
  var frames = {};                   // id -> preloaded Image, only those that exist
  var layers = Array.prototype.slice.call(figure.querySelectorAll('.figure-photo.frame'));
  var active = -1, shown = null, holdTimer = null, talkTimer = null, idleTimer = null, hovering = false, talking = false;
  function has(id) { return !!frames[id]; }
  function show(id, fast) {
    if (id === shown) return;
    if (!id || !has(id)) {
      layers.forEach(function (l) { l.classList.remove('on'); });
      shown = null; return;
    }
    var next = (active + 1) % layers.length;
    var layer = layers[next];
    layer.classList.toggle('fast', !!fast);
    layer.src = frames[id].src;
    layer.classList.add('on');
    layers.forEach(function (l, i) { if (i !== next) l.classList.remove('on'); });
    active = next; shown = id;
  }
  function restingPose() { return hovering ? 'look' : null; }
  function hold(id, ms, then) {
    clearTimeout(holdTimer);
    show(id);
    holdTimer = setTimeout(function () { show(then === undefined ? restingPose() : then); }, ms);
  }
  function preload() {
    if (!layers.length) return;
    FRAME_IDS.forEach(function (id) {
      var img = new Image();
      img.onload = function () { frames[id] = img; if (id === 'blink' || id === 'look') scheduleIdle(); };
      img.src = FRAME_DIR + id + '.jpg';
    });
  }
  function scheduleIdle() {
    if (reduced) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(idle, 3500 + Math.random() * 4000);
  }
  function idle() {
    if (!talking && !hovering && shown === null) {
      if (has('blink') && Math.random() < 0.6) hold('blink', 160, null);
      else if (has('look')) hold('look', 1600 + Math.random() * 800, null);
    }
    scheduleIdle();
  }

  // ---------------------------------------------------------------- speech
  var typing = null, waveTimer = null;
  function startTalking() {
    talking = true;
    figure.classList.add('talking');
    if (!has('talk')) return;
    clearTimeout(talkTimer);
    var open = false;
    (function tick() {
      open = !open;
      show(open ? 'talk' : (has('look') ? 'look' : null), true);
      talkTimer = setTimeout(tick, 150 + Math.random() * 130);
    })();
  }
  function stopTalking() {
    talking = false;
    figure.classList.remove('talking');
    clearTimeout(talkTimer);
    if (has('look')) hold('look', 1500);
    else show(restingPose());
  }
  function say(text, gesture) {
    if (typing) { clearInterval(typing); typing = null; }
    bubbleText.textContent = '';
    if (reduced) { bubbleText.textContent = text; if (gesture && has(gesture)) show(gesture); return; }
    var i = 0;
    var begin = function () {
      startTalking();
      typing = setInterval(function () {
        i++;
        bubbleText.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(typing); typing = null; stopTalking(); }
      }, 22);
    };
    if (gesture && has(gesture)) { clearTimeout(holdTimer); clearTimeout(talkTimer); show(gesture); setTimeout(begin, 900); }
    else begin();
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
  guide.addEventListener('pointerenter', function () { hovering = true; if (!talking && has('look')) { clearTimeout(holdTimer); show('look'); } });
  guide.addEventListener('pointerleave', function () { hovering = false; if (!talking) { clearTimeout(holdTimer); holdTimer = setTimeout(function () { show(null); }, 700); } });

  function greetClick() { wave(); say(pick(LINES[lang].react), has('wave') ? 'wave' : null); }
  figure.addEventListener('click', greetClick);
  figure.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); greetClick(); } });

  preload();
  renderChips();
  setTimeout(function () { wave(); say(pick(LINES[lang].greet), has('wave') ? 'wave' : null); }, 600);
})();
