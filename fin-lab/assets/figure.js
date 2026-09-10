/* The Fin Lab analyst: an illustrated guide that talks, blinks, follows the
   pointer with her eyes, and waves when clicked. Lines live in LINES below. */
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
  var figure = document.getElementById('figure');
  var bubbleText = document.getElementById('bubble-text');
  var chips = document.getElementById('chips');
  var nameEl = document.getElementById('fig-name');
  if (!figure || !bubbleText) return;
  var lang = 'en';
  try { lang = localStorage.getItem('lobby-lang') || ((navigator.language || '').slice(0, 2) === 'ko' ? 'ko' : 'en'); } catch (e) { /* ignore */ }
  if (!LINES[lang]) lang = 'en';
  var typing = null, waveTimer = null;

  function say(text) {
    if (typing) { clearInterval(typing); typing = null; }
    bubbleText.textContent = '';
    figure.classList.add('talking');
    var i = 0;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { bubbleText.textContent = text; figure.classList.remove('talking'); return; }
    typing = setInterval(function () {
      i++;
      bubbleText.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(typing); typing = null; figure.classList.remove('talking'); }
    }, 22);
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function wave() {
    figure.classList.remove('waving'); void figure.getBoundingClientRect(); figure.classList.add('waving');
    clearTimeout(waveTimer);
    waveTimer = setTimeout(function () { figure.classList.remove('waving'); }, 1700);
  }
  function renderChips() {
    var L = LINES[lang];
    chips.replaceChildren();
    ['what', 'board', 'rooms'].forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = L.chips[key];
      b.addEventListener('click', function () { say(L[key]); });
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
  });

  // eyes follow the pointer
  var pupils = figure.querySelectorAll('.pupil');
  var eyeCenters = [{ x: 129, y: 106 }, { x: 173, y: 106 }];
  function lookAt(clientX, clientY) {
    var r = figure.getBoundingClientRect();
    var sx = 300 / r.width, sy = 330 / r.height;
    var px = (clientX - r.left) * sx, py = (clientY - r.top) * sy;
    Array.prototype.forEach.call(pupils, function (p, i) {
      var dx = px - eyeCenters[i].x, dy = py - eyeCenters[i].y, d = Math.hypot(dx, dy) || 1;
      var k = Math.min(3.2, d / 40);
      p.setAttribute('transform', 'translate(' + (dx / d * k).toFixed(2) + ',' + (dy / d * k).toFixed(2) + ')');
    });
  }
  function lookAhead() { Array.prototype.forEach.call(pupils, function (p) { p.removeAttribute('transform'); }); }
  document.addEventListener('pointermove', function (e) { lookAt(e.clientX, e.clientY); });
  document.addEventListener('pointerleave', lookAhead);

  figure.addEventListener('click', function () { wave(); say(pick(LINES[lang].react)); });
  figure.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wave(); say(pick(LINES[lang].react)); } });

  Array.prototype.forEach.call(document.querySelectorAll('.nameplate button'), function (b) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
  });
  renderChips();
  setTimeout(function () { say(pick(LINES[lang].greet)); wave(); }, 500);
})();
