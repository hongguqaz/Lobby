/* Lobby landing page.
   Renders the feature network, the detail panel and the feature cards from
   window.__LOBBY_FEATURES__ (assets/features.js). Plain JavaScript and SVG. */
(function () {
  'use strict';

  var CFG = window.__LOBBY_FEATURES__;
  var SVG = 'http://www.w3.org/2000/svg';
  var svg = document.getElementById('network');
  var wrap = document.getElementById('net-wrap');
  var panel = document.getElementById('panel');
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var STATUS = {
    core: { label: 'Private', r: 36 },
    live: { label: 'Live', r: 27 },
    planned: { label: 'Planned', r: 24 },
    empty: { label: 'Open slot', r: 16 }
  };
  // Small line icons, drawn in a 24x24 box centred on the node.
  var GLYPHS = {
    chart: 'M-9,9 H9 M-6,5 V-2 M-1,5 V-8 M4,5 V0 M9,5 V-5',
    search: 'M-2,-2 m-7,0 a7,7 0 1,0 14,0 a7,7 0 1,0 -14,0 M3,3 L10,10',
    lock: 'M-8,-1 h16 v11 h-16 z M-4.5,-1 v-4.5 a4.5,4.5 0 0,1 9,0 v4.5 M0,4 v3',
    plus: 'M-5,0 h10 M0,-5 v10'
  };

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    });
    if (children) [].concat(children).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function s(tag, attrs, parent) {
    var el = document.createElementNS(SVG, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }
  function text(parent, x, y, str, cls, anchor) {
    var t = s('text', { x: x, y: y, 'class': cls, 'text-anchor': anchor || 'middle' }, parent);
    t.textContent = str;
    return t;
  }

  if (!CFG || !svg) return;

  var all = [CFG.core].concat(CFG.features);
  var byId = {};
  all.forEach(function (n) { byId[n.id] = n; });

  var pos = {}, base = {}, nodeEls = {}, edgeEls = [];
  var cx = 0, cy = 0, R = 0, hover = null, pinned = null, raf = null;

  // ------------------------------------------------------------ geometry
  function layout() {
    var W = Math.max(320, wrap.clientWidth || 900);
    var side = W >= 900;
    var gw = side ? W - 340 : W;
    var H = Math.max(440, Math.min(600, Math.round(gw * 0.7)));
    cx = Math.round(gw / 2) + (side ? 24 : 0);
    cy = Math.round(H / 2) + 6;
    R = Math.round(Math.min(gw, H) * 0.35);
    base = {};
    base[CFG.core.id] = { x: cx, y: cy };
    CFG.features.forEach(function (f) {
      var a = f.angle * Math.PI / 180;
      base[f.id] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
    });
    Object.keys(base).forEach(function (id) { pos[id] = { x: base[id].x, y: base[id].y }; });
    return { W: W, H: H };
  }
  function nodeR(id) { return STATUS[byId[id].status].r; }
  function toward(p, q, dist) {
    var dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / len * dist, y: p.y + dy / len * dist };
  }
  function f1(v) { return v.toFixed(1); }
  function edgeGeom(l) {
    var a = pos[l.from], b = pos[l.to], ra = nodeR(l.from) + 5, rb = nodeR(l.to) + 5;
    if (l.kind === 'concept') {
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, vx = mx - cx, vy = my - cy, len = Math.hypot(vx, vy) || 1;
      var q = { x: mx + vx / len * R * 0.55, y: my + vy / len * R * 0.55 };
      var a2 = toward(a, q, ra), b2 = toward(b, q, rb);
      var apex = { x: (a2.x + 2 * q.x + b2.x) / 4, y: (a2.y + 2 * q.y + b2.y) / 4 };
      return {
        d: 'M' + f1(a2.x) + ',' + f1(a2.y) + ' Q' + f1(q.x) + ',' + f1(q.y) + ' ' + f1(b2.x) + ',' + f1(b2.y),
        label: { x: apex.x + vx / len * 16, y: apex.y + vy / len * 16 + 4 }
      };
    }
    var a1 = toward(a, b, ra), b1 = toward(b, a, rb);
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    var nx = -dy / L, ny = dx / L;
    if (nx < 0 || (nx === 0 && ny < 0)) { nx = -nx; ny = -ny; }
    return {
      d: 'M' + f1(a1.x) + ',' + f1(a1.y) + ' L' + f1(b1.x) + ',' + f1(b1.y),
      label: { x: (a1.x + b1.x) / 2 + nx * 12, y: (a1.y + b1.y) / 2 + ny * 12 + 4 }
    };
  }
  function labelSpec(n) {
    var a = n.angle * Math.PI / 180, r = STATUS[n.status].r, c = Math.cos(a), sn = Math.sin(a);
    var spec = { anchor: Math.abs(c) > 0.35 ? (c > 0 ? 'start' : 'end') : 'middle', x: Math.abs(c) > 0.35 ? c * (r + 12) : 0 };
    if (sn < -0.35) { spec.nameY = -(r + 30); spec.capY = -(r + 15); }
    else if (sn > 0.35) { spec.nameY = r + 24; spec.capY = r + 39; }
    else { spec.nameY = -2; spec.capY = 13; }
    return spec;
  }
  function neighbors(id) {
    var set = {};
    set[id] = true;
    CFG.links.forEach(function (l) { if (l.from === id) set[l.to] = true; if (l.to === id) set[l.from] = true; });
    return set;
  }

  // ------------------------------------------------------------ rendering
  function build() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    var dims = layout();
    svg.replaceChildren();
    svg.setAttribute('viewBox', '0 0 ' + dims.W + ' ' + dims.H);
    svg.setAttribute('width', dims.W);
    svg.setAttribute('height', dims.H);

    var defs = s('defs', null, svg);
    var grad = s('radialGradient', { id: 'glow' }, defs);
    s('stop', { offset: '0%', 'class': 'glow-stop-a' }, grad);
    s('stop', { offset: '100%', 'class': 'glow-stop-b' }, grad);
    s('circle', { cx: cx, cy: cy, r: R * 1.35, fill: 'url(#glow)', 'class': 'glow' }, svg);
    s('circle', { cx: cx, cy: cy, r: R, 'class': 'orbit' }, svg);

    var gEdges = s('g', { 'class': 'edges' }, svg);
    var gLabels = s('g', { 'class': 'edge-labels' }, svg);
    var gNodes = s('g', { 'class': 'nodes' }, svg);

    edgeEls = CFG.links.map(function (l) {
      var geo = edgeGeom(l);
      var path = s('path', { d: geo.d, 'class': 'edge ' + l.kind }, gEdges);
      var label = null;
      if (l.label) label = text(gLabels, geo.label.x, geo.label.y, l.label, 'edge-label', 'middle');
      return { link: l, path: path, label: label };
    });

    nodeEls = {};
    all.forEach(function (n) {
      var st = STATUS[n.status], p = pos[n.id];
      var isStatic = n.status === 'empty' || n.status === 'core';
      var g = s('g', {
        'class': 'node ' + n.status + (isStatic ? ' static' : ''),
        transform: 'translate(' + f1(p.x) + ',' + f1(p.y) + ')',
        tabindex: 0, role: n.url ? 'link' : 'button', 'aria-label': ariaLabel(n)
      }, gNodes);
      s('circle', { r: st.r + 10, 'class': 'hit' }, g);
      if (n.status === 'live') s('circle', { r: st.r, 'class': 'pulse' }, g);
      s('circle', { r: st.r, 'class': 'body' }, g);
      var scale = n.status === 'core' ? 1.25 : n.status === 'empty' ? 0.8 : 1;
      s('path', { d: GLYPHS[n.glyph || 'plus'], 'class': 'glyph', transform: 'scale(' + scale + ')' }, g);
      if (n.status === 'core') {
        text(g, 0, st.r + 20, n.name, 'name', 'middle');
        text(g, 0, st.r + 35, n.caption || st.label, 'cap', 'middle');
      } else if (n.status !== 'empty') {
        var sp = labelSpec(n);
        text(g, sp.x, sp.nameY, n.name, 'name', sp.anchor);
        text(g, sp.x, sp.capY, st.label, 'cap', sp.anchor);
      }
      nodeEls[n.id] = g;

      g.addEventListener('pointerenter', function () { hover = n.id; update(); });
      g.addEventListener('pointerleave', function () { hover = null; update(); });
      g.addEventListener('focus', function () { hover = n.id; update(); });
      g.addEventListener('blur', function () { hover = null; update(); });
      g.addEventListener('click', function (e) { e.stopPropagation(); activate(n); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(n); }
      });
    });

    update();
    if (!reduced) raf = requestAnimationFrame(tick);
  }
  function ariaLabel(n) {
    if (n.status === 'empty') return 'Open slot, reserved for a future feature';
    return n.name + ', ' + STATUS[n.status].label + '. ' + (n.summary || n.caption || '');
  }
  function activate(n) {
    if (n.url) { window.location.href = n.url; return; }
    pinned = pinned === n.id ? null : n.id;
    update();
  }
  function update() {
    var active = hover || pinned;
    var nb = active ? neighbors(active) : null;
    Object.keys(nodeEls).forEach(function (id) {
      nodeEls[id].classList.toggle('dim', !!nb && !nb[id]);
      nodeEls[id].classList.toggle('pinned', id === pinned);
    });
    edgeEls.forEach(function (e) {
      var hot = !!active && (e.link.from === active || e.link.to === active);
      e.path.classList.toggle('hot', hot);
      e.path.classList.toggle('dim', !!active && !hot);
      if (e.label) e.label.classList.toggle('show', hot);
    });
    showPanel(active);
  }
  svg.addEventListener('click', function () { if (pinned) { pinned = null; update(); } });

  // gentle drift so the map feels alive; edges follow the nodes
  var t0 = null;
  function tick(t) {
    if (t0 === null) t0 = t;
    var k = (t - t0) / 1000;
    CFG.features.forEach(function (f, i) {
      var b = base[f.id], ph = i * 1.9;
      pos[f.id] = { x: b.x + Math.sin(k * 0.45 + ph) * 3.5, y: b.y + Math.cos(k * 0.36 + ph * 1.3) * 3.5 };
      nodeEls[f.id].setAttribute('transform', 'translate(' + f1(pos[f.id].x) + ',' + f1(pos[f.id].y) + ')');
    });
    edgeEls.forEach(function (e) {
      var geo = edgeGeom(e.link);
      e.path.setAttribute('d', geo.d);
      if (e.label) { e.label.setAttribute('x', f1(geo.label.x)); e.label.setAttribute('y', f1(geo.label.y)); }
    });
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', function () {
    if (reduced) return;
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; }
    else if (!raf) { t0 = null; raf = requestAnimationFrame(tick); }
  });

  // ------------------------------------------------------------ panel & cards
  function showPanel(id) {
    var n = id ? byId[id] : null;
    panel.replaceChildren();
    if (!n) {
      panel.appendChild(h('div', { 'class': 'panel-head' }, [h('h2', { text: 'Feature map' })]));
      panel.appendChild(h('p', { text: 'Hover or focus a node to see how the features connect. Solid lines carry data out of the private Drive; the dotted line marks a conceptual link between features; dashed lines lead to open slots.' }));
      return;
    }
    var st = STATUS[n.status];
    panel.appendChild(h('div', { 'class': 'panel-head' }, [
      h('h2', { text: n.name || 'Open slot' }),
      h('span', { 'class': 'badge ' + n.status, text: st.label })
    ]));
    panel.appendChild(h('p', { text: n.description || 'Reserved for a future feature. It will hang off the same private data as the others. Add it to assets/features.js and it appears here.' }));
    var rel = h('ul', { 'class': 'rel' });
    CFG.links.forEach(function (l) {
      if (l.from !== n.id && l.to !== n.id) return;
      var other = byId[l.from === n.id ? l.to : l.from];
      var kind = l.kind === 'data' ? (n.status === 'core' ? 'feeds' : 'draws on')
        : l.kind === 'concept' ? 'related' : (n.status === 'core' ? 'reserved' : 'will draw on');
      var what = (other.name || 'an open slot') + (l.detail ? ' · ' + l.detail : l.label && l.kind === 'data' ? ' · ' + l.label : '');
      rel.appendChild(h('li', null, [h('span', { 'class': 'k', text: kind }), h('span', { text: what })]));
    });
    if (rel.childElementCount) panel.appendChild(rel);
    if (n.url) panel.appendChild(h('a', { 'class': 'open', href: n.url, text: (n.status === 'live' ? 'Open ' : 'Placeholder for ') + n.name + ' →' }));
    if (n.folder) panel.appendChild(h('span', { 'class': 'path', text: 'Lobby/' + n.folder + '  ·  Drive/' + n.folder }));
    if (n.status === 'core') panel.appendChild(h('span', { 'class': 'path', text: 'Not published. Only results reach this site.' }));
  }

  function renderCards() {
    var list = document.getElementById('feature-list');
    if (!list) return;
    list.replaceChildren();
    CFG.features.forEach(function (f) {
      var li = h('li', { 'class': 'f-card ' + f.status });
      if (f.status === 'empty') {
        li.appendChild(h('span', { 'class': 'plus', 'aria-hidden': 'true', text: '+' }));
        li.appendChild(h('span', { text: 'Open slot' }));
        list.appendChild(li);
        return;
      }
      li.appendChild(h('div', { 'class': 'f-head' }, [h('h3', { text: f.name }), h('span', { 'class': 'badge ' + f.status, text: STATUS[f.status].label })]));
      li.appendChild(h('p', { text: f.summary }));
      li.appendChild(h('span', { 'class': 'path', text: f.folder }));
      li.appendChild(h('a', { 'class': 'open', href: f.url, text: f.status === 'live' ? 'Open →' : 'Placeholder →' }));
      list.appendChild(li);
    });
  }

  // ------------------------------------------------------------ theme
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

  var resizeTimer = null, lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });

  document.addEventListener('DOMContentLoaded', function () { initTheme(); renderCards(); build(); });
})();
