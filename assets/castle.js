/* Lobby landing: draws the hotspot overlay over the painting (or the photo in
   assets/img/castle.jpg), wires it to the gate, and renders the room cards. */
(function () {
  'use strict';
  var ROOMS = window.LOBBY_ROOMS || [], Gate = window.LobbyGate;
  var SVG = 'http://www.w3.org/2000/svg';
  var byId = {};
  ROOMS.forEach(function (r) { byId[r.id] = r; });

  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'onclick') e.addEventListener('click', attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function s(tag, attrs, parent) {
    var e = document.createElementNS(SVG, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  var ctx = document.createElement('canvas').getContext('2d');
  function textWidth(str) { ctx.font = '600 13px Georgia, "Times New Roman", serif'; return ctx.measureText(str).width; }

  function state(room) {
    if (!room.locked) return 'open';
    return Gate && Gate.isOpen(room.id) ? 'unlocked' : 'locked';
  }
  function enter(room) {
    if (!room.locked || (Gate && Gate.isOpen(room.id))) { window.location.href = room.folder; return; }
    Gate.prompt(room.id, { name: room.name, onOpen: function () { refresh(); window.location.href = room.folder; } });
  }

  function buildOverlay() {
    var svg = document.getElementById('hotspot-layer');
    if (!svg) return;
    svg.replaceChildren();
    var defs = s('defs', null, svg);
    var bloom = s('filter', { id: 'bloomO', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    s('feGaussianBlur', { stdDeviation: 10 }, bloom);
    var sym = s('symbol', { id: 'lockO', viewBox: '0 0 12 12' }, defs);
    s('path', { d: 'M3,5 V3.5 a3,3 0 0 1 6,0 V5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, sym);
    s('rect', { x: 2, y: 5, width: 8, height: 6, rx: 1.2, fill: 'currentColor' }, sym);
    ROOMS.forEach(function (room) {
      var hs = room.hotspot;
      if (!hs) return;
      var st = state(room);
      var a = s('a', { 'class': 'hotspot ' + st, href: room.folder, 'data-room': room.id, role: 'link', tabindex: 0,
        'aria-label': room.name + (room.locked ? ', locked' : ', open to all') }, svg);
      var title = s('title', null, a); title.textContent = room.name + ' · ' + room.place;
      s('rect', { 'class': 'area', x: hs.x, y: hs.y, width: hs.w, height: hs.h, rx: 10 }, a);
      s('rect', { 'class': 'edge', x: hs.x, y: hs.y, width: hs.w, height: hs.h, rx: 10 }, a);
      s('rect', { 'class': 'hit', x: hs.x - 6, y: hs.y - 6, width: hs.w + 12, height: hs.h + 12, rx: 12 }, a);
      var pl = room.plate || { x: hs.x + hs.w / 2, y: hs.y - 14 };
      var w = Math.ceil(textWidth(room.name)) + 24 + (room.locked ? 16 : 0);
      var g = s('g', { 'class': 'plate', transform: 'translate(' + pl.x + ',' + pl.y + ')' }, a);
      s('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 4 }, g);
      var t = s('text', { x: -w / 2 + 12, y: 4.5 }, g); t.textContent = room.name;
      if (room.locked) s('use', { href: '#lockO', x: w / 2 - 18, y: -6, width: 12, height: 12 }, g);
      a.addEventListener('click', function (e) { e.preventDefault(); enter(room); });
      a.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(room); } });
    });
  }
  function refresh() {
    Array.prototype.forEach.call(document.querySelectorAll('#hotspot-layer .hotspot'), function (a) {
      var room = byId[a.getAttribute('data-room')];
      if (!room) return;
      var st = state(room);
      a.classList.remove('open', 'locked', 'unlocked'); a.classList.add(st);
    });
    renderCards();
  }
  function renderCards() {
    var list = document.getElementById('room-list');
    if (!list) return;
    list.replaceChildren();
    ROOMS.forEach(function (room) {
      var st = state(room);
      var label = st === 'open' ? 'Open to all' : st === 'unlocked' ? 'Unlocked' : 'Locked';
      list.appendChild(h('li', { class: 'r-card' + (st === 'open' ? ' gate-card' : '') }, [
        h('div', { class: 'r-head' }, [h('h3', { text: room.name }), h('span', { class: 'badge ' + st, text: label })]),
        h('p', { class: 'r-place', text: room.place }),
        h('p', { text: room.summary }),
        h('p', { class: 'why', text: room.why }),
        st === 'locked'
          ? h('button', { class: 'enter', type: 'button', text: 'Enter with key →', onclick: function () { enter(room); } })
          : h('a', { class: 'enter', href: room.folder, text: 'Enter →' })
      ]));
    });
  }
  function initTheme() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    function current() {
      var t = document.documentElement.getAttribute('data-theme');
      if (t === 'light' || t === 'dark') return t;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function label() { btn.textContent = current() === 'dark' ? '☀ Light' : '☾ Dark'; }
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('lobby-theme', next); } catch (e) { /* storage unavailable */ }
      label();
    });
    label();
  }
  document.addEventListener('DOMContentLoaded', function () { initTheme(); buildOverlay(); renderCards(); });
})();
