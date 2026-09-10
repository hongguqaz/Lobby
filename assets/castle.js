/* Lobby landing: wires the painting's hotspots to the gate and renders the room cards. */
(function () {
  'use strict';
  var ROOMS = window.LOBBY_ROOMS || [], Gate = window.LobbyGate;
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
  function state(room) {
    if (!room.locked) return 'open';
    return Gate && Gate.isOpen(room.id) ? 'unlocked' : 'locked';
  }
  function enter(room) {
    if (!room.locked || (Gate && Gate.isOpen(room.id))) { window.location.href = room.folder; return; }
    Gate.prompt(room.id, { name: room.name, onOpen: function () { refresh(); window.location.href = room.folder; } });
  }
  function refresh() {
    Array.prototype.forEach.call(document.querySelectorAll('.hotspot[data-room]'), function (a) {
      var room = byId[a.getAttribute('data-room')];
      if (room) a.classList.toggle('unlocked', state(room) === 'unlocked');
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
      var li = h('li', { class: 'r-card' + (st === 'open' ? ' gate-card' : '') }, [
        h('div', { class: 'r-head' }, [h('h3', { text: room.name }), h('span', { class: 'badge ' + st, text: label })]),
        h('p', { class: 'r-place', text: room.place }),
        h('p', { text: room.summary }),
        h('p', { class: 'why', text: room.why }),
        st === 'locked'
          ? h('button', { class: 'enter', type: 'button', text: 'Enter with key →', onclick: function () { enter(room); } })
          : h('a', { class: 'enter', href: room.folder, text: 'Enter →' })
      ]);
      list.appendChild(li);
    });
  }
  function initHotspots() {
    Array.prototype.forEach.call(document.querySelectorAll('.hotspot[data-room]'), function (a) {
      var room = byId[a.getAttribute('data-room')];
      if (!room) return;
      a.addEventListener('click', function (e) { e.preventDefault(); enter(room); });
      a.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(room); } });
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
  document.addEventListener('DOMContentLoaded', function () { initTheme(); initHotspots(); refresh(); });
})();
