/* Vendor Dashboard
   Renders the aggregated model in window.__VENDOR_DASHBOARD__ (data/dashboard.js).
   Plain JavaScript and inline SVG - no external dependencies. */
(function () {
  'use strict';

  var MODEL = window.__VENDOR_DASHBOARD__;
  var SVG = 'http://www.w3.org/2000/svg';
  var MAX_SERIES = 7;        // named series use slots 1..7; the tail folds into "Other"
  var TOP_VENDORS = 12;
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  function $(sel, root) { return (root || document).querySelector(sel); }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      });
    }
    if (children) {
      [].concat(children).forEach(function (c) {
        if (c == null) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  }
  function s(tag, attrs, parent) {
    var el = document.createElementNS(SVG, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }
  function text(parent, x, y, str, cls, anchor) {
    var t = s('text', { x: x, y: y, 'class': cls || '', 'text-anchor': anchor || 'start' }, parent);
    t.textContent = str;
    return t;
  }

  // ------------------------------------------------------------------ guard
  if (!MODEL || !MODEL.period || !Array.isArray(MODEL.facts)) {
    document.addEventListener('DOMContentLoaded', function () {
      var main = $('#main');
      main.replaceChildren(h('p', { 'class': 'empty', text: 'No dashboard data found. Expected data/dashboard.js to define window.__VENDOR_DASHBOARD__.' }));
    });
    return;
  }

  // ------------------------------------------------------------------ formatting
  var currency = (MODEL.source && MODEL.source.currency) || 'USD';
  function nf(opts) { try { return new Intl.NumberFormat(undefined, opts); } catch (e) { return null; } }
  var F = {
    moneyFull: nf({ style: 'currency', currency: currency, maximumFractionDigits: 0 }),
    moneyCompact: nf({ style: 'currency', currency: currency, notation: 'compact', maximumFractionDigits: 1 }),
    numFull: nf({ maximumFractionDigits: 0 }),
    numCompact: nf({ notation: 'compact', maximumFractionDigits: 1 })
  };
  function money(v, compact) {
    if (v == null || !isFinite(v)) return '–';
    var f = compact ? F.moneyCompact : F.moneyFull;
    if (f) return f.format(v);
    return (compact ? F.numCompact : F.numFull).format(v) + ' ' + currency;
  }
  function num(v, compact) { return v == null || !isFinite(v) ? '–' : (compact ? F.numCompact : F.numFull).format(v); }
  function pct(v, d) { return v == null || !isFinite(v) ? '–' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
  function rating(v) { return v == null || !isFinite(v) ? '–' : v.toFixed(2); }
  function signed(v, unit, d) {
    if (v == null || !isFinite(v)) return null;
    var n = (v * (unit === '%' || unit === ' pp' ? 100 : 1)).toFixed(d == null ? 1 : d);
    return (v > 0 ? '+' : '') + n + (unit || '');
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var grain = (MODEL.source && MODEL.source.grain) || 'month';
  var GRAIN_NOUN = { month: 'month', quarter: 'quarter', year: 'year' }[grain] || 'period';
  function periodLabel(key, short) {
    if (!key) return '';
    if (grain === 'month') {
      var m = parseInt(key.slice(5, 7), 10) - 1;
      return (MONTHS[m] || key.slice(5, 7)) + ' ' + (short ? key.slice(2, 4) : key.slice(0, 4));
    }
    if (grain === 'quarter') return key.slice(5) + ' ' + (short ? key.slice(2, 4) : key.slice(0, 4));
    return key;
  }

  // ------------------------------------------------------------------ model & state
  var keys = MODEL.period.keys || [];
  var K = keys.length;
  var keyIdx = new Map(keys.map(function (k, i) { return [k, i]; }));
  var dims = MODEL.dimensions || { vendors: [], categories: [], regions: [], statuses: [] };
  var fields = MODEL.fields || {};
  var state = { from: 0, to: K - 1, preset: 'all', category: null, region: null, status: null, vendor: null };

  function presets() {
    var list = [{ id: 'all', label: 'All time' }];
    var counts = grain === 'month' ? [12, 6] : grain === 'quarter' ? [8, 4] : [5, 3];
    counts.forEach(function (c) { list.push({ id: 'last' + c, label: 'Last ' + c + ' ' + GRAIN_NOUN + 's', count: c }); });
    if (grain !== 'year') {
      list.push({ id: 'ytd', label: 'Year to date' });
      list.push({ id: 'prevyear', label: 'Previous year' });
    }
    list.push({ id: 'custom', label: 'Custom range' });
    return list;
  }
  function applyPreset(id) {
    if (!K) return;
    var last = K - 1, lastYear = keys[last].slice(0, 4);
    var from = 0, to = last;
    var p = presets().filter(function (x) { return x.id === id; })[0];
    if (p && p.count) from = Math.max(0, K - p.count);
    else if (id === 'ytd') from = Math.max(0, keys.findIndex(function (k) { return k.slice(0, 4) === lastYear; }));
    else if (id === 'prevyear') {
      var y = String(parseInt(lastYear, 10) - 1);
      var idx = keys.map(function (k, i) { return k.slice(0, 4) === y ? i : -1; }).filter(function (i) { return i >= 0; });
      if (idx.length) { from = idx[0]; to = idx[idx.length - 1]; }
    } else if (id === 'custom') return;
    state.from = from; state.to = to; state.preset = id;
  }

  function zero() { return { amount: 0, count: 0, on_time: 0, on_time_n: 0, rating_sum: 0, rating_n: 0 }; }
  function add(t, f) {
    t.amount += f.amount; t.count += f.count;
    if (f.on_time_n) { t.on_time += f.on_time; t.on_time_n += f.on_time_n; }
    if (f.rating_n) { t.rating_sum += f.rating_sum; t.rating_n += f.rating_n; }
  }
  function bump(map, key, f) { var t = map.get(key); if (!t) { t = zero(); map.set(key, t); } add(t, f); }
  function rate(t) { return t.on_time_n ? t.on_time / t.on_time_n : null; }
  function avgRating(t) { return t.rating_n ? t.rating_sum / t.rating_n : null; }
  function matches(f) {
    return (state.category === null || f.c === state.category) &&
      (state.region === null || f.r === state.region) &&
      (state.status === null || f.s === state.status) &&
      (state.vendor === null || f.v === state.vendor);
  }
  function aggregate(from, to) {
    var len = to - from + 1;
    var A = zero();
    A.from = from; A.to = to; A.len = len;
    A.byPeriod = []; A.periodCategory = [];
    A.byVendor = new Map(); A.byCategory = new Map(); A.byRegion = new Map(); A.byStatus = new Map();
    for (var i = 0; i < len; i++) { A.byPeriod.push(zero()); A.periodCategory.push(new Map()); }
    MODEL.facts.forEach(function (f) {
      var pi = keyIdx.get(f.p);
      if (pi === undefined || pi < from || pi > to || !matches(f)) return;
      add(A, f); add(A.byPeriod[pi - from], f);
      var v = A.byVendor.get(f.v);
      if (!v) {
        v = zero(); v.periods = new Array(len).fill(0); v.categories = new Map(); v.first = pi; v.last = pi;
        A.byVendor.set(f.v, v);
      }
      add(v, f); v.periods[pi - from] += f.amount;
      if (pi < v.first) v.first = pi;
      if (pi > v.last) v.last = pi;
      if (fields.category) {
        v.categories.set(f.c, (v.categories.get(f.c) || 0) + f.amount);
        bump(A.byCategory, f.c, f);
        var pc = A.periodCategory[pi - from];
        pc.set(f.c, (pc.get(f.c) || 0) + f.amount);
      }
      if (fields.region) bump(A.byRegion, f.r, f);
      if (fields.status) bump(A.byStatus, f.s, f);
    });
    return A;
  }
  function sortedByAmount(map) {
    return Array.from(map.entries()).sort(function (a, b) { return b[1].amount - a[1].amount || a[0] - b[0]; });
  }

  // ------------------------------------------------------------------ geometry & text helpers
  var measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(str, size, weight) {
    measureCtx.font = (weight || 400) + ' ' + (size || 12) + 'px ' + FONT;
    return measureCtx.measureText(String(str)).width;
  }
  function truncate(str, maxWidth, size) {
    str = String(str);
    if (textWidth(str, size) <= maxWidth) return str;
    var out = str;
    while (out.length > 1 && textWidth(out + '…', size) > maxWidth) out = out.slice(0, -1);
    return out + '…';
  }
  function linearTicks(min, max, count) {
    if (!(max > min)) max = min + 1;
    var raw = (max - min) / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    var start = Math.floor(min / step + 1e-9) * step, end = Math.ceil(max / step - 1e-9) * step;
    var ticks = [];
    for (var i = 0; start + i * step <= end + step / 2; i++) ticks.push(+(start + i * step).toFixed(10));
    return ticks;
  }
  function roundedTop(x, y, w, hgt, r) {
    if (hgt <= 0 || w <= 0) return '';
    r = Math.min(r, hgt, w / 2);
    return 'M' + x + ',' + (y + hgt) + ' V' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      ' H' + (x + w - r) + ' Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + ' V' + (y + hgt) + ' Z';
  }
  function roundedRight(x, y, w, hgt, r) {
    if (hgt <= 0 || w <= 0) return '';
    r = Math.min(r, w, hgt / 2);
    return 'M' + x + ',' + y + ' H' + (x + w - r) + ' Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      ' V' + (y + hgt - r) + ' Q' + (x + w) + ',' + (y + hgt) + ' ' + (x + w - r) + ',' + (y + hgt) + ' H' + x + ' Z';
  }
  function rectPath(x, y, w, hgt) { return hgt <= 0 || w <= 0 ? '' : 'M' + x + ',' + y + ' h' + w + ' v' + hgt + ' h' + (-w) + ' Z'; }
  function slotClass(slot) { return slot === 'other' ? 'series-other' : 'series-' + slot; }
  var LIGHT_FILLS = { 3: true, 4: true, 5: true };   // aqua, yellow, magenta: ink text inside these fills

  // ------------------------------------------------------------------ tooltip
  var tip = $('#tooltip');
  function placeTip(x, y) {
    var pad = 14, r = tip.getBoundingClientRect();
    var left = x + pad, top = y + pad;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, x - r.width - pad);
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, y - r.height - pad);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function showTip(build, x, y) { tip.replaceChildren(); build(tip); tip.hidden = false; placeTip(x, y); }
  function hideTip() { tip.hidden = true; }
  function tipTitle(box, str) { box.appendChild(h('div', { 'class': 'tip-title', text: str })); }
  function tipRow(box, value, label, slot) {
    box.appendChild(h('div', { 'class': 'tip-row' }, [
      h('i', { 'class': 'tip-key ' + (slot ? slotClass(slot) : 'tip-key-none') }),
      h('strong', { text: value }),
      h('span', { text: label })
    ]));
  }
  function bindHover(target, group, build) {
    function on(x, y) { showTip(build, x, y); if (group) group.classList.add('is-hot'); }
    function off() { hideTip(); if (group) group.classList.remove('is-hot'); }
    target.addEventListener('pointerenter', function (e) { on(e.clientX, e.clientY); });
    target.addEventListener('pointermove', function (e) { if (tip.hidden) on(e.clientX, e.clientY); else placeTip(e.clientX, e.clientY); });
    target.addEventListener('pointerleave', off);
    target.addEventListener('focus', function () { var r = target.getBoundingClientRect(); on(r.left + r.width / 2, r.top); });
    target.addEventListener('blur', off);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, { passive: true });

  // ------------------------------------------------------------------ cards
  function makeCard(parent, id, title, subtitle, span) {
    var fig = h('figure', { 'class': 'card' + (span ? ' span-2' : ''), id: 'card-' + id });
    var btn = h('button', { 'class': 'btn-ghost btn-table', type: 'button', 'aria-pressed': 'false', text: 'Table' });
    var sub = h('p', { 'class': 'card-sub', text: subtitle || '' });
    var head = h('figcaption', { 'class': 'card-head' }, [h('div', null, [h('h2', { text: title }), sub]), btn]);
    var body = h('div', { 'class': 'card-body' });
    var legend = h('div', { 'class': 'legend' });
    var tableBox = h('div', { 'class': 'card-table' });
    legend.hidden = true; tableBox.hidden = true;
    fig.appendChild(head); fig.appendChild(body); fig.appendChild(legend); fig.appendChild(tableBox);
    parent.appendChild(fig);

    var card = { title: title, body: body, spec: null, mode: 'chart' };
    card.setSub = function (str) { sub.textContent = str || ''; };
    card.legend = function (items) {
      legend.replaceChildren();
      items.forEach(function (it) {
        legend.appendChild(h('span', { 'class': 'legend-item' }, [
          h('i', { 'class': 'swatch ' + slotClass(it.slot) }),
          it.name,
          it.note ? h('span', { 'class': 'legend-note', text: it.note }) : null
        ]));
      });
      legend.hidden = card.mode === 'table' || !items.length;
    };
    card.drawTable = function () {
      tableBox.replaceChildren();
      if (!card.spec) { tableBox.appendChild(h('p', { 'class': 'empty', text: 'No data for this selection.' })); return; }
      var spec = card.spec;
      var table = h('table', { 'class': 'data-table' });
      var thead = h('thead'), tr = h('tr');
      spec.columns.forEach(function (c, i) { tr.appendChild(h('th', { 'class': i > 0 ? 'num' : '', scope: 'col', text: c })); });
      thead.appendChild(tr); table.appendChild(thead);
      var tbody = h('tbody');
      spec.rows.forEach(function (row) {
        var r = h('tr');
        row.forEach(function (cell, i) { r.appendChild(h(i === 0 ? 'th' : 'td', { 'class': i > 0 ? 'num' : '', scope: i === 0 ? 'row' : null, text: cell })); });
        tbody.appendChild(r);
      });
      table.appendChild(tbody);
      tableBox.appendChild(table);
    };
    card.table = function (spec) { card.spec = spec; if (card.mode === 'table') card.drawTable(); };
    card.empty = function (msg) {
      body.replaceChildren(h('p', { 'class': 'empty', text: msg || 'No data for this selection.' }));
      card.legend([]); card.spec = null;
      if (card.mode === 'table') card.drawTable();
    };
    btn.addEventListener('click', function () {
      card.mode = card.mode === 'chart' ? 'table' : 'chart';
      var t = card.mode === 'table';
      btn.setAttribute('aria-pressed', String(t));
      body.hidden = t; tableBox.hidden = !t; legend.hidden = t || !legend.childElementCount;
      if (t) card.drawTable();
    });
    return card;
  }

  // ------------------------------------------------------------------ chart: stacked columns
  function columnChart(card, o) {
    var body = card.body; body.replaceChildren();
    var n = o.labels.length;
    var totals = o.labels.map(function (_, i) { return o.series.reduce(function (sum, sr) { return sum + (sr.values[i] || 0); }, 0); });
    var maxTotal = Math.max.apply(null, totals.concat([0]));
    if (!n || !(maxTotal > 0)) return card.empty();
    var W = Math.max(280, body.clientWidth || 600), plotH = 240;
    var ticks = linearTicks(0, maxTotal, 4), yMax = ticks[ticks.length - 1];
    var mL = Math.ceil(Math.max.apply(null, ticks.map(function (t) { return textWidth(money(t, true), 11); }))) + 12;
    var mR = 12, mT = 26, mB = 30, H = mT + plotH + mB, plotW = W - mL - mR;
    var svg = s('svg', { 'class': 'chart', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-label': card.title });
    function y(v) { return mT + plotH - v / yMax * plotH; }
    ticks.forEach(function (t) {
      var yy = y(t);
      s('line', { x1: mL, x2: W - mR, y1: yy, y2: yy, 'class': t === 0 ? 'axis' : 'grid-line' }, svg);
      text(svg, mL - 8, yy + 4, money(t, true), 'tick', 'end');
    });
    var band = plotW / n, bw = Math.min(24, Math.max(3, band * 0.6)), gap = 2;
    var labelStep = Math.max(1, Math.ceil((band < 70 ? 46 : 64) / band));
    var maxIdx = totals.indexOf(maxTotal);
    o.labels.forEach(function (key, i) {
      var x = mL + band * i + (band - bw) / 2;
      var g = s('g', { 'class': 'col' }, svg);
      var cursor = y(0);
      var segs = o.series.map(function (sr) { return { sr: sr, v: sr.values[i] || 0 }; }).filter(function (d) { return d.v > 0; });
      segs.forEach(function (d, k) {
        var hgt = d.v / yMax * plotH, top = k === segs.length - 1, yTop = cursor - hgt;
        var inset = top ? 0 : gap;
        s('path', { d: top ? roundedTop(x, yTop, bw, hgt, 4) : rectPath(x, yTop + inset, bw, Math.max(0, hgt - inset)), 'class': 'fill ' + slotClass(d.sr.slot) }, g);
        cursor = yTop;
      });
      if (i % labelStep === 0) text(svg, x + bw / 2, H - 10, periodLabel(key, band < 70), 'tick', 'middle');
      var lastCollides = i === n - 1 && maxIdx !== i && (n - 1 - maxIdx) * band < 60;
      if (totals[i] > 0 && (i === maxIdx || (i === n - 1 && !lastCollides))) {
        text(svg, x + bw / 2, y(totals[i]) - 8, money(totals[i], true), 'value', 'middle');
      }
      var hit = s('rect', { x: mL + band * i, y: mT, width: band, height: plotH, 'class': 'hit', tabindex: 0, role: 'img',
        'aria-label': periodLabel(key) + ': ' + money(totals[i]) }, g);
      bindHover(hit, g, function (box) {
        tipTitle(box, periodLabel(key));
        tipRow(box, money(totals[i]), 'Total spend', o.series.length > 1 ? null : o.series[0].slot);
        if (o.series.length > 1) o.series.forEach(function (sr) { if (sr.values[i] > 0) tipRow(box, money(sr.values[i]), sr.name, sr.slot); });
        if (o.counts) tipRow(box, num(o.counts[i]), 'Transactions');
      });
    });
    body.appendChild(svg);
    card.legend(o.series.length > 1 ? o.series : []);
    var multi = o.series.length > 1;
    card.table({
      columns: ['Period'].concat(o.series.map(function (x) { return x.name; })).concat(multi ? ['Total'] : []).concat(o.counts ? ['Transactions'] : []),
      rows: o.labels.map(function (k, i) {
        return [periodLabel(k)].concat(o.series.map(function (sr) { return money(sr.values[i] || 0); }))
          .concat(multi ? [money(totals[i])] : []).concat(o.counts ? [num(o.counts[i])] : []);
      })
    });
  }

  // ------------------------------------------------------------------ chart: horizontal bars
  function barChart(card, o) {
    var body = card.body; body.replaceChildren();
    var fmt = o.fmt || money;
    if (!o.items.length) return card.empty();
    var W = Math.max(280, body.clientWidth || 600), rowH = 30, bh = 18, mT = 6, mB = 8;
    var labelW = Math.min(240, Math.round(W * 0.38));
    var valueW = Math.ceil(Math.max.apply(null, o.items.map(function (it) { return textWidth(fmt(it.value), 12, 600); }))) + 12;
    var x0 = labelW + 10, x1 = W - valueW - 6, plotW = Math.max(40, x1 - x0);
    var max = Math.max.apply(null, o.items.map(function (it) { return it.value; }).concat([0]));
    var H = mT + rowH * o.items.length + mB;
    var svg = s('svg', { 'class': 'chart', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-label': card.title });
    s('line', { x1: x0, x2: x0, y1: mT, y2: H - mB, 'class': 'axis' }, svg);
    o.items.forEach(function (it, i) {
      var yc = mT + rowH * i + rowH / 2;
      var g = s('g', { 'class': 'bar' }, svg);
      text(g, x0 - 10, yc + 4, truncate(it.name, labelW, 12), 'label', 'end');
      var w = max > 0 ? Math.max(0, it.value / max * plotW) : 0;
      s('path', { d: roundedRight(x0, yc - bh / 2, w, bh, 4), 'class': 'fill ' + slotClass(it.slot || 1) }, g);
      text(g, x0 + w + 8, yc + 4, fmt(it.value), 'value', 'start');
      var hit = s('rect', { x: 0, y: mT + rowH * i, width: W, height: rowH, 'class': 'hit', tabindex: 0, role: 'img',
        'aria-label': it.name + ': ' + fmt(it.value) }, g);
      bindHover(hit, g, function (box) {
        tipTitle(box, it.name);
        tipRow(box, fmt(it.value), o.valueLabel || 'Spend', it.slot || 1);
        if (it.share != null) tipRow(box, pct(it.share), 'Share');
        if (it.count != null) tipRow(box, num(it.count), 'Transactions');
        (it.extra || []).forEach(function (row) { tipRow(box, row[0], row[1]); });
      });
    });
    body.appendChild(svg);
    card.legend([]);
    card.table({
      columns: [o.nameLabel || 'Name', o.valueLabel || 'Spend', 'Share', 'Transactions'],
      rows: o.items.map(function (it) { return [it.name, fmt(it.value), it.share != null ? pct(it.share) : '', it.count != null ? num(it.count) : '']; })
    });
  }

  // ------------------------------------------------------------------ chart: single 100% stacked bar
  function shareBar(card, o) {
    var body = card.body; body.replaceChildren();
    if (!o.segments.length || !(o.total > 0)) return card.empty();
    var W = Math.max(280, body.clientWidth || 600), bh = 26, gap = 2, H = bh + 6;
    var svg = s('svg', { 'class': 'chart', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-label': card.title });
    var clipId = 'clip-' + card.title.replace(/\W+/g, '-').toLowerCase();
    var clip = s('clipPath', { id: clipId }, s('defs', null, svg));
    s('rect', { x: 0, y: 0, width: W, height: bh, rx: 6, ry: 6 }, clip);
    var bar = s('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
    var x = 0;
    o.segments.forEach(function (sg, i) {
      var w = sg.value / o.total * W, last = i === o.segments.length - 1;
      var drawW = Math.max(0, w - (last ? 0 : gap));
      var g = s('g', { 'class': 'seg' }, bar);
      s('path', { d: rectPath(x, 0, drawW, bh), 'class': 'fill ' + slotClass(sg.slot) }, g);
      var lab = pct(sg.value / o.total, 0);
      if (drawW >= textWidth(lab, 11, 600) + 16) {
        text(g, x + drawW / 2, bh / 2 + 4, lab, 'inlabel ' + (LIGHT_FILLS[sg.slot] ? 'on-light' : 'on-dark'), 'middle');
      }
      var hit = s('rect', { x: x, y: 0, width: Math.max(w, 6), height: bh, 'class': 'hit', tabindex: 0, role: 'img',
        'aria-label': sg.name + ': ' + pct(sg.value / o.total) }, g);
      bindHover(hit, g, function (box) {
        tipTitle(box, sg.name);
        tipRow(box, money(sg.value), 'Spend', sg.slot);
        tipRow(box, pct(sg.value / o.total), 'Share');
        if (sg.count != null) tipRow(box, num(sg.count), 'Transactions');
      });
      x += w;
    });
    body.appendChild(svg);
    card.legend(o.segments.map(function (sg) { return { name: sg.name, slot: sg.slot, note: pct(sg.value / o.total) }; }));
    card.table({
      columns: ['Category', 'Spend', 'Share', 'Transactions'],
      rows: o.segments.map(function (sg) { return [sg.name, money(sg.value), pct(sg.value / o.total), sg.count != null ? num(sg.count) : '']; })
    });
  }

  // ------------------------------------------------------------------ chart: line (crosshair + tooltip)
  function lineChart(card, o) {
    var body = card.body; body.replaceChildren();
    var n = o.xLabels.length;
    var allVals = [];
    o.series.forEach(function (sr) { sr.values.forEach(function (v) { if (v != null && isFinite(v)) allVals.push(v); }); });
    if (!n || !allVals.length) return card.empty();
    var fmt = o.fmt || function (v) { return num(v); };
    var lo = o.yMin != null ? o.yMin : Math.min.apply(null, allVals);
    var hi = o.yMax != null ? o.yMax : Math.max.apply(null, allVals);
    var ticks = linearTicks(Math.min(lo, hi), Math.max(lo, hi), 4);
    var yMin = ticks[0], yMax = ticks[ticks.length - 1];
    var W = Math.max(280, body.clientWidth || 600), plotH = o.height || 190;
    var mL = Math.ceil(Math.max.apply(null, ticks.map(function (t) { return textWidth(fmt(t), 11); }))) + 12;
    var mR = 16, mT = 18, mB = o.xTitle ? 44 : 30, H = mT + plotH + mB, plotW = W - mL - mR;
    var svg = s('svg', { 'class': 'chart', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-label': card.title });
    function x(i) { return mL + (n === 1 ? plotW / 2 : i / (n - 1) * plotW); }
    function y(v) { return mT + plotH - (v - yMin) / (yMax - yMin) * plotH; }
    ticks.forEach(function (t) {
      var yy = y(t);
      s('line', { x1: mL, x2: W - mR, y1: yy, y2: yy, 'class': t === ticks[0] ? 'axis' : 'grid-line' }, svg);
      text(svg, mL - 8, yy + 4, fmt(t), 'tick', 'end');
    });
    var shortLabels = o.xShort || o.xLabels;
    var labelW = Math.max.apply(null, shortLabels.map(function (l) { return textWidth(l, 11); })) + 14;
    var step = Math.max(1, Math.ceil(labelW / (n > 1 ? plotW / (n - 1) : plotW)));
    var prevRight = -Infinity;
    for (var i = 0; i < n; i += step) {
      var w = textWidth(shortLabels[i], 11), anchor = 'middle', left = x(i) - w / 2;
      if (left < 0) { anchor = 'start'; left = x(i); }
      else if (left + w > W) { anchor = 'end'; left = x(i) - w; }
      if (left < prevRight + 8) continue;          // would collide with the previous label: skip it
      text(svg, x(i), mT + plotH + 18, shortLabels[i], 'tick', anchor);
      prevRight = left + w;
    }
    if (o.xTitle) text(svg, mL + plotW / 2, H - 6, o.xTitle, 'axis-title', 'middle');
    if (o.ref && o.ref.value >= yMin && o.ref.value <= yMax) {
      s('line', { x1: mL, x2: W - mR, y1: y(o.ref.value), y2: y(o.ref.value), 'class': 'ref' }, svg);
      text(svg, W - mR, y(o.ref.value) - 5, o.ref.label, 'tick', 'end');
    }
    var markers = [];
    o.series.forEach(function (sr, k) {
      var d = '', pen = false, lastIdx = -1;
      sr.values.forEach(function (v, i) {
        if (v == null || !isFinite(v)) { pen = false; return; }
        d += (pen ? ' L' : ' M') + x(i).toFixed(1) + ',' + y(v).toFixed(1);
        pen = true; lastIdx = i;
      });
      if (o.area && o.series.length === 1 && lastIdx >= 0) {
        var firstIdx = sr.values.findIndex(function (v) { return v != null && isFinite(v); });
        s('path', { d: d.trim() + ' L' + x(lastIdx).toFixed(1) + ',' + y(yMin) + ' L' + x(firstIdx).toFixed(1) + ',' + y(yMin) + ' Z', 'class': 'area ' + slotClass(sr.slot) }, svg);
      }
      s('path', { d: d.trim(), 'class': 'line ' + slotClass(sr.slot) }, svg);
      markers[k] = [];
      if (n <= 60) sr.values.forEach(function (v, i) {
        if (v == null || !isFinite(v)) return;
        markers[k][i] = s('circle', { cx: x(i), cy: y(v), r: 4.5, 'class': 'marker ' + slotClass(sr.slot) }, svg);
      });
      if (o.labelLast && lastIdx >= 0) {
        var lv = sr.values[lastIdx], lx = x(lastIdx), ly = y(lv);
        text(svg, lx, ly - 10, fmt(lv), 'value', lastIdx === n - 1 ? 'end' : 'middle');
      }
    });
    if (o.annotate && o.annotate.index != null) {
      var ai = o.annotate.index, av = o.series[0].values[ai];
      var ax = x(ai), ay = y(av);
      s('circle', { cx: ax, cy: ay, r: 7, 'class': 'marker ' + slotClass(o.series[0].slot) }, svg);
      var left = ax > mL + plotW / 2;
      text(svg, ax + (left ? -12 : 12), ay + (ay < mT + 24 ? 20 : -12), o.annotate.text, 'annot', left ? 'end' : 'start');
    }
    // crosshair + shared tooltip
    var cross = s('line', { x1: 0, x2: 0, y1: mT, y2: mT + plotH, 'class': 'crosshair' }, svg);
    cross.style.display = 'none';
    var overlay = s('rect', { x: mL, y: mT, width: plotW, height: plotH, 'class': 'hit', tabindex: 0, role: 'img', 'aria-label': card.title + ' (use arrow keys to step through values)' }, svg);
    var cur = -1;
    function highlight(i) {
      markers.forEach(function (arr) { arr.forEach(function (m, j) { if (m) m.classList.toggle('is-hot', j === i); }); });
    }
    function build(i, box) {
      tipTitle(box, o.xLabels[i]);
      o.series.forEach(function (sr) { tipRow(box, fmt(sr.values[i]), sr.name, sr.slot); });
      if (o.extra) o.extra(i).forEach(function (row) { tipRow(box, row[0], row[1]); });
    }
    function at(i, px, py) {
      i = Math.max(0, Math.min(n - 1, i));
      cur = i;
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
      highlight(i);
      showTip(function (box) { build(i, box); }, px, py);
    }
    function idxFromEvent(e) {
      var r = overlay.getBoundingClientRect();
      var rel = (e.clientX - r.left) / r.width;
      return Math.round(rel * (n - 1));
    }
    function leave() { cross.style.display = 'none'; highlight(-1); hideTip(); cur = -1; }
    overlay.addEventListener('pointermove', function (e) { at(idxFromEvent(e), e.clientX, e.clientY); });
    overlay.addEventListener('pointerenter', function (e) { at(idxFromEvent(e), e.clientX, e.clientY); });
    overlay.addEventListener('pointerleave', leave);
    overlay.addEventListener('focus', function () {
      var r = overlay.getBoundingClientRect(); var i = n - 1;
      at(i, r.left + (n === 1 ? r.width / 2 : i / (n - 1) * r.width), r.top + r.height / 2);
    });
    overlay.addEventListener('blur', leave);
    overlay.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var i = (cur < 0 ? n - 1 : cur) + (e.key === 'ArrowLeft' ? -1 : 1);
      i = Math.max(0, Math.min(n - 1, i));
      var r = overlay.getBoundingClientRect();
      at(i, r.left + (n === 1 ? r.width / 2 : i / (n - 1) * r.width), r.top + r.height / 2);
    });
    body.appendChild(svg);
    card.legend(o.series.length > 1 ? o.series : []);
    card.table({
      columns: [o.xTitle || 'Period'].concat(o.series.map(function (sr) { return sr.name; })).concat(o.tableExtra ? o.tableExtra.columns : []),
      rows: o.xLabels.map(function (l, i) {
        return [l].concat(o.series.map(function (sr) { return fmt(sr.values[i]); })).concat(o.tableExtra ? o.tableExtra.row(i) : []);
      })
    });
  }

  function sparkline(values, w, hgt) {
    var svg = s('svg', { 'class': 'spark', width: w, height: hgt, viewBox: '0 0 ' + w + ' ' + hgt, 'aria-hidden': 'true' });
    var n = values.length, max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    function x(i) { return n === 1 ? w / 2 : 3 + i / (n - 1) * (w - 6); }
    function y(v) { return max === min ? hgt / 2 : 3 + (1 - (v - min) / (max - min)) * (hgt - 6); }
    s('path', { d: values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' '), 'class': 'spark-line' }, svg);
    s('circle', { cx: x(n - 1), cy: y(values[n - 1]), r: 3, 'class': 'spark-dot' }, svg);
    return svg;
  }

  // ------------------------------------------------------------------ sections
  var cards = {};
  function buildLayout() {
    var grid = $('#charts');
    cards.trend = makeCard(grid, 'trend', 'Spend over time', '', true);
    cards.vendors = makeCard(grid, 'vendors', 'Top vendors by spend', '');
    if (fields.category) cards.categories = makeCard(grid, 'categories', 'Spend by category', 'Share of spend in the selected period');
    cards.pareto = makeCard(grid, 'pareto', 'Vendor concentration', 'Cumulative share of spend by vendor rank');
    if (fields.region) cards.regions = makeCard(grid, 'regions', 'Spend by region', '');
    if (fields.status) cards.status = makeCard(grid, 'status', 'Amount by status', 'Payment or order status of the transactions');
    if (fields.on_time) cards.onTime = makeCard(grid, 'ontime', 'On-time delivery', 'Share of deliveries recorded as on time');
    if (fields.rating) cards.ratings = makeCard(grid, 'rating', 'Average vendor rating', 'Mean of the ratings recorded per ' + GRAIN_NOUN);
  }

  function tile(o) {
    var t = h('article', { 'class': 'tile' + (o.hero ? ' hero' : '') });
    t.appendChild(h('p', { 'class': 'tile-label', text: o.label }));
    t.appendChild(h('p', { 'class': 'tile-value', text: o.value }));
    var foot = h('div', { 'class': 'tile-foot' });
    if (o.delta) {
      var cls = o.delta.good == null ? 'neutral' : o.delta.good ? 'good' : 'bad';
      foot.appendChild(h('span', { 'class': 'delta ' + cls }, [
        h('span', { 'class': 'arrow', 'aria-hidden': 'true', text: o.delta.dir > 0 ? '▲' : o.delta.dir < 0 ? '▼' : '' }),
        o.delta.text
      ]));
    }
    if (o.sub) foot.appendChild(h('span', { 'class': 'tile-sub', text: o.sub, title: o.sub }));
    t.appendChild(foot);
    if (o.spark && o.spark.length > 1) t.appendChild(sparkline(o.spark, 120, 30));
    return t;
  }

  // Shrink a tile value's font until it fits on one line (large currencies, long numbers).
  function fitTileValues(box) {
    Array.prototype.forEach.call(box.querySelectorAll('.tile-value'), function (el) {
      el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 1 && size > 20) {
        size -= 2;
        el.style.fontSize = size + 'px';
      }
    });
  }

  function renderKpis(A, P) {
    var box = $('#kpis'); box.replaceChildren();
    try { return renderKpiTiles(A, P, box); } finally { fitTileValues(box); }
  }

  function renderKpiTiles(A, P, box) {
    if (!A.count) { box.appendChild(h('p', { 'class': 'kpi-empty', text: 'No transactions match the current filters.' })); return; }
    var rangeText = periodLabel(keys[state.from]) + (state.from !== state.to ? ' – ' + periodLabel(keys[state.to]) : '');
    var prevText = P ? ' vs previous ' + A.len + ' ' + GRAIN_NOUN + (A.len > 1 ? 's' : '') : '';
    function change(a, b) { return P && b > 0 ? (a - b) / b : null; }
    function neutralDelta(v) { return v == null ? null : { text: signed(v, '%') + prevText, dir: Math.sign(v) }; }

    var totalText = money(A.amount);
    box.appendChild(tile({ label: 'Total spend', hero: true, value: totalText.length > 18 ? money(A.amount, true) : totalText, delta: neutralDelta(change(A.amount, P && P.amount)),
      sub: rangeText, spark: A.byPeriod.map(function (p) { return p.amount; }) }));
    box.appendChild(tile({ label: 'Transactions', value: num(A.count), delta: neutralDelta(change(A.count, P && P.count)),
      spark: A.byPeriod.map(function (p) { return p.count; }) }));
    box.appendChild(tile({ label: 'Average transaction', value: money(A.amount / A.count),
      delta: neutralDelta(change(A.amount / A.count, P && P.count ? P.amount / P.count : 0)) }));
    var vendors = sortedByAmount(A.byVendor);
    var top5 = vendors.slice(0, 5).reduce(function (sum, e) { return sum + e[1].amount; }, 0);
    box.appendChild(tile({ label: 'Active vendors', value: num(vendors.length), sub: 'of ' + num(dims.vendors.length) + ' vendors overall' }));
    box.appendChild(tile({ label: 'Top 5 vendor share', value: pct(A.amount ? top5 / A.amount : null),
      sub: vendors.length ? 'Largest: ' + dims.vendors[vendors[0][0]] + ' (' + pct(vendors[0][1].amount / A.amount) + ')' : '' }));
    if (fields.on_time) {
      var r = rate(A), pr = P ? rate(P) : null, d = r != null && pr != null ? r - pr : null;
      box.appendChild(tile({ label: 'On-time delivery', value: pct(r), delta: d != null ? { text: signed(d, ' pp') + prevText, dir: Math.sign(d), good: d >= 0 } : null,
        sub: A.on_time_n ? num(A.on_time_n) + ' deliveries recorded' : 'not recorded' }));
    }
    if (fields.rating) {
      var g = avgRating(A), pg = P ? avgRating(P) : null, dg = g != null && pg != null ? g - pg : null;
      box.appendChild(tile({ label: 'Average rating', value: rating(g), delta: dg != null ? { text: signed(dg, '', 2) + prevText, dir: Math.sign(dg), good: dg >= 0 } : null,
        sub: A.rating_n ? num(A.rating_n) + ' ratings recorded' : 'not recorded' }));
    }
  }

  function renderTrend(A) {
    var labels = keys.slice(state.from, state.to + 1);
    var series;
    if (fields.category && state.category === null) {
      var present = Array.from(A.byCategory.keys()).sort(function (a, b) { return a - b; });
      var named = present.filter(function (c) { return c < MAX_SERIES; });
      var other = present.filter(function (c) { return c >= MAX_SERIES; });
      series = named.map(function (c) {
        return { name: dims.categories[c], slot: c + 1, values: A.periodCategory.map(function (pc) { return pc.get(c) || 0; }) };
      });
      if (other.length) series.push({ name: 'Other (' + other.length + ' categories)', slot: 'other',
        values: A.periodCategory.map(function (pc) { return other.reduce(function (sum, c) { return sum + (pc.get(c) || 0); }, 0); }) });
      cards.trend.setSub('Spend per ' + GRAIN_NOUN + ', stacked by category');
    } else {
      series = [{ name: 'Spend', slot: 1, values: A.byPeriod.map(function (p) { return p.amount; }) }];
      cards.trend.setSub('Spend per ' + GRAIN_NOUN + (state.category !== null ? ' in ' + dims.categories[state.category] : ''));
    }
    columnChart(cards.trend, { labels: labels, series: series, counts: A.byPeriod.map(function (p) { return p.count; }) });
  }

  function renderVendors(A) {
    var entries = sortedByAmount(A.byVendor);
    var items = entries.slice(0, TOP_VENDORS).map(function (e) {
      return { name: dims.vendors[e[0]], value: e[1].amount, share: A.amount ? e[1].amount / A.amount : null, count: e[1].count, slot: 1 };
    });
    var rest = entries.slice(TOP_VENDORS);
    if (rest.length) {
      var restAmt = rest.reduce(function (sum, e) { return sum + e[1].amount; }, 0);
      items.push({ name: 'Other (' + rest.length + ' vendors)', value: restAmt, share: A.amount ? restAmt / A.amount : null,
        count: rest.reduce(function (sum, e) { return sum + e[1].count; }, 0), slot: 'other' });
    }
    cards.vendors.setSub(entries.length > TOP_VENDORS ? 'Top ' + TOP_VENDORS + ' of ' + entries.length + ' vendors in the selected period' : 'All ' + entries.length + ' vendors in the selected period');
    barChart(cards.vendors, { items: items, nameLabel: 'Vendor' });
  }

  function renderCategories(A) {
    if (!cards.categories) return;
    var entries = sortedByAmount(A.byCategory);
    var named = entries.filter(function (e) { return e[0] < MAX_SERIES; });
    var other = entries.filter(function (e) { return e[0] >= MAX_SERIES; });
    var segments = named.map(function (e) { return { name: dims.categories[e[0]], value: e[1].amount, count: e[1].count, slot: e[0] + 1 }; });
    if (other.length) segments.push({ name: 'Other (' + other.length + ' categories)', slot: 'other',
      value: other.reduce(function (sum, e) { return sum + e[1].amount; }, 0), count: other.reduce(function (sum, e) { return sum + e[1].count; }, 0) });
    shareBar(cards.categories, { segments: segments.filter(function (sg) { return sg.value > 0; }), total: A.amount });
  }

  function renderPareto(A) {
    var entries = sortedByAmount(A.byVendor).filter(function (e) { return e[1].amount > 0; });
    if (!entries.length || !(A.amount > 0)) return cards.pareto.empty();
    var cum = 0, values = entries.map(function (e) { cum += e[1].amount; return cum / A.amount; });
    var k80 = values.findIndex(function (v) { return v >= 0.8; });
    cards.pareto.setSub(k80 >= 0 ? (k80 + 1) + ' of ' + entries.length + ' vendors make up 80% of spend' : 'Cumulative share of spend by vendor rank');
    lineChart(cards.pareto, {
      xLabels: entries.map(function (e, i) { return '#' + (i + 1) + ' ' + dims.vendors[e[0]]; }),
      xShort: entries.map(function (e, i) { return String(i + 1); }),
      xTitle: 'Vendors ranked by spend',
      series: [{ name: 'Cumulative share', slot: 1, values: values }],
      yMin: 0, yMax: 1, fmt: function (v) { return pct(v, 0); }, area: true,
      ref: { value: 0.8, label: '80% of spend' },
      annotate: k80 >= 0 ? { index: k80, text: 'Top ' + (k80 + 1) + ' = ' + pct(values[k80], 0) } : null,
      extra: function (i) { return [[money(entries[i][1].amount), 'Spend'], [pct(entries[i][1].amount / A.amount), 'Share']]; },
      tableExtra: { columns: ['Spend', 'Share'], row: function (i) { return [money(entries[i][1].amount), pct(entries[i][1].amount / A.amount)]; } }
    });
  }

  function renderRegions(A) {
    if (!cards.regions) return;
    var entries = sortedByAmount(A.byRegion);
    cards.regions.setSub(entries.length + ' region' + (entries.length === 1 ? '' : 's') + ' in the selected period');
    barChart(cards.regions, { nameLabel: 'Region', items: entries.map(function (e) {
      return { name: dims.regions[e[0]], value: e[1].amount, share: A.amount ? e[1].amount / A.amount : null, count: e[1].count, slot: 1 };
    }) });
  }

  function renderStatus(A) {
    if (!cards.status) return;
    var entries = sortedByAmount(A.byStatus);
    barChart(cards.status, { nameLabel: 'Status', valueLabel: 'Amount', items: entries.map(function (e) {
      return { name: dims.statuses[e[0]], value: e[1].amount, share: A.amount ? e[1].amount / A.amount : null, count: e[1].count, slot: 1 };
    }) });
  }

  function renderRateLines(A) {
    var labels = keys.slice(state.from, state.to + 1);
    if (cards.onTime) {
      var rates = A.byPeriod.map(rate);
      var known = rates.filter(function (v) { return v != null; });
      var lo = known.length ? Math.min.apply(null, known) : 0;
      lineChart(cards.onTime, {
        xLabels: labels.map(function (k) { return periodLabel(k); }), xShort: labels.map(function (k) { return periodLabel(k, true); }),
        series: [{ name: 'On-time rate', slot: 1, values: rates }],
        yMin: lo < 0.5 ? 0 : Math.max(0, Math.floor((lo - 0.02) * 10) / 10), yMax: 1,
        fmt: function (v) { return pct(v, 0); }, labelLast: true, area: true,
        extra: function (i) { return [[num(A.byPeriod[i].on_time_n), 'Deliveries recorded']]; },
        tableExtra: { columns: ['Deliveries recorded'], row: function (i) { return [num(A.byPeriod[i].on_time_n)]; } }
      });
    }
    if (cards.ratings) {
      var avgs = A.byPeriod.map(avgRating);
      var knownR = avgs.filter(function (v) { return v != null; });
      var loR = knownR.length ? Math.min.apply(null, knownR) : 1;
      lineChart(cards.ratings, {
        xLabels: labels.map(function (k) { return periodLabel(k); }), xShort: labels.map(function (k) { return periodLabel(k, true); }),
        series: [{ name: 'Average rating', slot: 1, values: avgs }],
        yMin: Math.max(0, Math.floor((loR - 0.25) * 2) / 2), yMax: Math.max(5, Math.ceil(Math.max.apply(null, knownR.concat([5])))),
        fmt: function (v) { return v == null || !isFinite(v) ? '–' : (Math.round(v * 100) / 100).toString(); }, labelLast: true, area: true,
        extra: function (i) { return [[num(A.byPeriod[i].rating_n), 'Ratings recorded']]; },
        tableExtra: { columns: ['Ratings recorded'], row: function (i) { return [num(A.byPeriod[i].rating_n)]; } }
      });
    }
  }

  // ------------------------------------------------------------------ vendor table
  var sortState = { key: 'spend', dir: -1 };
  function renderTable(A, P) {
    var box = $('#vendor-table'); box.replaceChildren();
    var rows = Array.from(A.byVendor.entries()).map(function (e) {
      var v = e[0], t = e[1];
      var cats = Array.from(t.categories.entries()).sort(function (a, b) { return b[1] - a[1]; });
      var prev = P ? (P.byVendor.get(v) ? P.byVendor.get(v).amount : 0) : null;
      return {
        name: dims.vendors[v], category: cats.length ? dims.categories[cats[0][0]] : '',
        spend: t.amount, share: A.amount ? t.amount / A.amount : 0, count: t.count, avg: t.count ? t.amount / t.count : 0,
        trend: t.periods, change: prev == null ? null : prev > 0 ? (t.amount - prev) / prev : (t.amount > 0 ? Infinity : null),
        onTime: rate(t), rating: avgRating(t), last: keys[t.last]
      };
    });
    var note = $('#vendor-table-note');
    if (!rows.length) { note.textContent = ''; box.appendChild(h('p', { 'class': 'empty', text: 'No vendors match the current filters.' })); return; }
    note.textContent = rows.length + ' vendor' + (rows.length === 1 ? '' : 's') + ' active in the selected period' +
      (P ? '. Change compares with the previous ' + A.len + ' ' + GRAIN_NOUN + (A.len > 1 ? 's' : '') + '.' : '. Select a shorter period to see change versus the previous one.');

    var cols = [
      { key: 'name', label: 'Vendor' },
      fields.category ? { key: 'category', label: 'Top category' } : null,
      { key: 'spend', label: 'Spend', num: true, fmt: function (v) { return money(v); } },
      { key: 'share', label: 'Share', num: true, fmt: function (v) { return pct(v); } },
      { key: 'count', label: 'Transactions', num: true, fmt: function (v) { return num(v); } },
      { key: 'avg', label: 'Avg transaction', num: true, fmt: function (v) { return money(v); } },
      { key: 'trend', label: 'Trend', sortable: false },
      { key: 'change', label: 'Change', num: true, fmt: function (v) { return v == null ? '–' : v === Infinity ? 'new' : signed(v, '%'); } },
      fields.on_time ? { key: 'onTime', label: 'On time', num: true, fmt: function (v) { return pct(v); } } : null,
      fields.rating ? { key: 'rating', label: 'Rating', num: true, fmt: rating } : null,
      { key: 'last', label: 'Last activity', fmt: function (v) { return periodLabel(v); } }
    ].filter(Boolean);

    rows.sort(function (a, b) {
      var x = a[sortState.key], y = b[sortState.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string') return x.localeCompare(y) * sortState.dir;
      return (x - y) * sortState.dir;
    });

    var table = h('table', { 'class': 'vendor-table' });
    var thead = h('thead'), tr = h('tr');
    cols.forEach(function (c) {
      var th = h('th', { scope: 'col', 'class': c.num ? 'num' : '' });
      if (c.sortable === false) th.textContent = c.label;
      else {
        th.setAttribute('aria-sort', sortState.key === c.key ? (sortState.dir > 0 ? 'ascending' : 'descending') : 'none');
        th.appendChild(h('button', { type: 'button', text: c.label, onclick: function () {
          if (sortState.key === c.key) sortState.dir = -sortState.dir;
          else { sortState.key = c.key; sortState.dir = c.num ? -1 : 1; }
          renderTable(A, P);
        } }));
      }
      tr.appendChild(th);
    });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = h('tbody');
    rows.forEach(function (r) {
      var trow = h('tr');
      cols.forEach(function (c) {
        var td = h('td', { 'class': (c.num ? 'num' : '') + (c.key === 'name' ? ' name' : '') });
        if (c.key === 'trend') { if (r.trend.length > 1) td.appendChild(sparkline(r.trend, 90, 22)); }
        else if (c.key === 'change' && r.change != null && r.change !== Infinity) {
          td.appendChild(h('span', { 'class': 'delta neutral' }, [
            h('span', { 'class': 'arrow', 'aria-hidden': 'true', text: r.change > 0 ? '▲' : r.change < 0 ? '▼' : '' }), c.fmt(r.change)]));
        } else td.textContent = c.fmt ? c.fmt(r[c.key]) : r[c.key];
        if (c.key === 'name') td.title = r.name;
        trow.appendChild(td);
      });
      tbody.appendChild(trow);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }

  // ------------------------------------------------------------------ meta, filters, theme
  function renderMeta() {
    var src = MODEL.source || {};
    var span = K ? periodLabel(keys[0]) + ' – ' + periodLabel(keys[K - 1]) : 'no data';
    $('#subtitle').textContent = 'Spend and performance across ' + num(dims.vendors.length) + ' vendors, ' + span + ' (' + currency + ')';
    var meta = [];
    if (K) meta.push('Data through ' + periodLabel(keys[K - 1]));
    if (MODEL.generated_on) meta.push('built ' + MODEL.generated_on);
    if (MODEL.source_revision) meta.push('source ' + MODEL.source_revision.slice(0, 7));
    $('#updated').textContent = meta.join(' · ');
    $('#sample-banner').hidden = !src.sample;
    $('#anon-note').hidden = !src.anonymized;
  }

  function fillSelect(sel, options, current) {
    sel.replaceChildren();
    options.forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
    sel.value = current;
  }
  function syncFilterControls() {
    $('#f-preset').value = state.preset;
    $('#f-from').value = String(state.from);
    $('#f-to').value = String(state.to);
    ['category', 'region', 'status', 'vendor'].forEach(function (k) {
      var sel = $('#f-' + k); if (sel) sel.value = state[k] === null ? '' : String(state[k]);
    });
  }
  function initFilters() {
    var periodOpts = keys.map(function (k, i) { return { value: String(i), label: periodLabel(k) }; });
    fillSelect($('#f-preset'), presets().map(function (p) { return { value: p.id, label: p.label }; }), state.preset);
    fillSelect($('#f-from'), periodOpts, String(state.from));
    fillSelect($('#f-to'), periodOpts, String(state.to));
    var dimSelects = { category: dims.categories, region: dims.regions, status: dims.statuses, vendor: dims.vendors };
    Object.keys(dimSelects).forEach(function (k) {
      var wrap = $('#filter-' + k), sel = $('#f-' + k);
      var present = k === 'vendor' ? dims.vendors.length > 0 : !!fields[k];
      wrap.hidden = !present;
      if (!present) return;
      fillSelect(sel, [{ value: '', label: 'All' }].concat(dimSelects[k].map(function (name, i) { return { value: String(i), label: name }; })), '');
      sel.addEventListener('change', function () { state[k] = sel.value === '' ? null : parseInt(sel.value, 10); render(); });
    });
    $('#f-preset').addEventListener('change', function () {
      var id = $('#f-preset').value;
      if (id === 'custom') { state.preset = 'custom'; return; }
      applyPreset(id); syncFilterControls(); render();
    });
    function onRange() {
      var from = parseInt($('#f-from').value, 10), to = parseInt($('#f-to').value, 10);
      if (from > to) { if (this && this.id === 'f-from') to = from; else from = to; }
      state.from = from; state.to = to; state.preset = 'custom';
      syncFilterControls(); render();
    }
    $('#f-from').addEventListener('change', onRange);
    $('#f-to').addEventListener('change', onRange);
    $('#f-reset').addEventListener('click', function () {
      state.category = state.region = state.status = state.vendor = null;
      applyPreset('all'); syncFilterControls(); render();
    });
  }

  function initTheme() {
    var btn = $('#theme-toggle');
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

  // ------------------------------------------------------------------ render loop
  function render() {
    if (!K) {
      renderKpis(zero(), null);
      Object.keys(cards).forEach(function (k) { cards[k].empty('No data available.'); });
      $('#vendor-table').replaceChildren(h('p', { 'class': 'empty', text: 'No data available.' }));
      return;
    }
    hideTip();
    var cur = aggregate(state.from, state.to);
    var prevFrom = state.from - cur.len;
    var prev = prevFrom >= 0 ? aggregate(prevFrom, state.from - 1) : null;
    renderKpis(cur, prev);
    if (!cur.count) {
      Object.keys(cards).forEach(function (k) { cards[k].empty(); });
      renderTable(cur, prev);
      return;
    }
    renderTrend(cur); renderVendors(cur); renderCategories(cur); renderPareto(cur);
    renderRegions(cur); renderStatus(cur); renderRateLines(cur); renderTable(cur, prev);
  }
  var resizeTimer = null, lastWidth = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150);
  });

  document.addEventListener('DOMContentLoaded', function () {
    renderMeta(); initTheme(); buildLayout(); initFilters(); render();
  });
})();
