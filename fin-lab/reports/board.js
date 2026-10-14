/* Fin Lab boards - Lobby.  One script, two pages:
     fin-lab/reports/   "FixC report"       the reports the FixC Claude Project commits into Drive
     fin-lab/picks/     "FixC Daily Picks"  the day's picked documents, named in daily/*_Picks.md
   (the page says which with <body data-board="reports|picks">).

   A plain board: one post per report (its file name is the title), newest first, twenty to a page.
   Opening a post shows FixC's own file first (the PDF when there is one, else the .md) in the viewer,
   and lists every file the post carries above the viewer: FixC's files, the day's Daily Picks file,
   and the documents the picks name in the room (the originals in fin-lab/Fin Docraw, their renderings
   in Fin Docai). Each one opens in place or downloads. PDFs are drawn page by page with pdf.js
   (vendor/pdfjs/), so they open on every browser, phones included.

   Both pages read the private Drive repository through the GitHub API with a token kept in this
   browser only (localStorage key ds.github.token). Nothing is copied into Lobby: every read goes to
   api.github.com, so a file FixC pushes is on the board the moment the page is (re)loaded.

   The folder (fin-lab/FixC report/) holds weekly/, daily/ and notes/; a report is a PDF plus a
   same-name .md, a Daily Picks file is daily/YYMMDD_FixC_Daily_Picks.md. File names are shown as
   they come: a date found in the name orders the post, otherwise the day the file entered the
   repository does, read from the Fin Desk's board index (<folder>/.fin-desk/board.json), which also
   carries the picks each file names (original -> repository path, rendering). Without that index the
   page reads the picks itself from the Markdown and finds the originals in fin-lab/Fin Docraw.

   The pure helpers (parseName, groupPosts, postItems, renderMarkdown, parsePicksText, ...) are
   exported for Node tests (fin-lab/reports/test-board.mjs); the page code runs only in a browser. */
(function (root) {
  'use strict';

  var DEFAULTS = { owner: 'hongguqaz', repo: 'Drive', branch: '', path: 'fin-lab/FixC report' };
  var INDEX_FILE = '.fin-desk/board.json';
  var ORIGINALS_FOLDER = 'Fin Docraw';          // under the room root: where picked originals are looked up
  var LS = { token: 'ds.github.token', config: 'fixc-report.config' };
  var GITHUB_API = 'https://api.github.com';
  var IGNORED_NAMES = { 'README.md': 1, '.gitkeep': 1, '.DS_Store': 1, 'Thumbs.db': 1 };
  var MAX_DEPTH = 3;
  var PAGE_SIZE = 20;
  var PAGES = { reports: 'reports', picks: 'picks' };
  var SCRIPT_BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src)
    ? document.currentScript.src.replace(/[^/]*$/, '') : '';
  var PDFJS = { version: '4.10.38', lib: SCRIPT_BASE + 'vendor/pdfjs/pdf.min.mjs', worker: SCRIPT_BASE + 'vendor/pdfjs/pdf.worker.min.mjs',
    cmaps: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/', fonts: 'https://unpkg.com/pdfjs-dist@4.10.38/standard_fonts/' };

  /* ------------------------------------------------------------------ names and dates */

  var DATE = '(\\d{4}[-._]\\d{2}[-._]\\d{2}|\\d{8}|\\d{6})';
  var RANGE = '(?:\\s*[-~–]\\s*' + DATE + ')?';
  var RE_PREFIX = new RegExp('^[\\[(]?\\s*' + DATE + RANGE + '\\s*[\\])]?(?=$|[\\s_.\\-:,)\\]])');
  var RE_ANYWHERE = new RegExp('(?:^|[\\s_\\-\\[(.,])' + DATE + RANGE + '(?=$|[\\s_\\-\\])(.,])', 'g');

  function toIsoDate(s) {
    if (!s) return null;
    s = String(s).replace(/[-._]/g, '');
    var y, m, d;
    if (/^\d{8}$/.test(s)) { y = +s.slice(0, 4); m = +s.slice(4, 6); d = +s.slice(6, 8); }
    else if (/^\d{6}$/.test(s)) { y = 2000 + (+s.slice(0, 2)); m = +s.slice(2, 4); d = +s.slice(4, 6); }
    else return null;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    return y + '-' + pad2(m) + '-' + pad2(d);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function splitExt(name) {
    var i = name.lastIndexOf('.');
    if (i <= 0) return { stem: name, ext: '' };
    return { stem: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() };
  }

  /** Parse one file name. Returns { date, dateEnd, title, ext, stem, kind, dated }. The title is the
      name without its extension, as it came; the date is read from anywhere in the name. */
  function parseName(name) {
    var se = splitExt(name), stem = se.stem;
    var date = null, dateEnd = null;
    var m = RE_PREFIX.exec(stem);
    if (m && toIsoDate(m[1])) { date = toIsoDate(m[1]); dateEnd = m[2] ? toIsoDate(m[2]) : null; }
    else {
      RE_ANYWHERE.lastIndex = 0;
      var a;
      while ((a = RE_ANYWHERE.exec(stem))) {
        if (toIsoDate(a[1])) { date = toIsoDate(a[1]); dateEnd = a[2] ? toIsoDate(a[2]) : null; break; }
      }
    }
    return { date: date, dateEnd: dateEnd, title: stem, ext: se.ext, stem: stem, kind: kindOf(stem, date, dateEnd, ''), dated: !!date };
  }

  /** The kind of a post: from its sub-folder (daily/, weekly/, notes/, monthly/) first, then its name. */
  function kindOf(title, date, dateEnd, subdir) {
    var s = String(subdir || '').toLowerCase();
    if (/pick/i.test(title)) return 'picks';
    if (/^daily|^일간/.test(s)) return 'daily';
    if (/^weekly|^주간/.test(s)) return 'weekly';
    if (/^monthly|^월간/.test(s)) return 'monthly';
    if (/^note|^노트|^memo/.test(s)) return 'note';
    if (/월간|monthly/i.test(title)) return 'monthly';
    if (/주간|weekly/i.test(title)) return 'weekly';
    if (/note|catch.?up|노트|메모|인계/i.test(title)) return 'note';
    if (dateEnd && date && dateEnd !== date) return 'weekly';
    if (/daily|일간|데일리/i.test(title)) return 'daily';
    return date ? 'daily' : 'undated';
  }
  var KIND_LABEL = { daily: '일간', weekly: '주간', monthly: '월간', note: '노트', picks: '픽', undated: '' };
  var KIND_RANK = { daily: 0, picks: 1, weekly: 2, monthly: 3, note: 4, undated: 5 };

  /* ------------------------------------------------------------------ posts */

  var BODY_EXT = { md: 1, markdown: 1, html: 1, htm: 1, txt: 1 };
  var EXT_ORDER = ['pdf', 'md', 'markdown', 'html', 'htm', 'txt', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];

  function isPicksName(name) { return /pick/i.test(splitExt(name).stem); }

  /** Group the files of the report folder into posts.
      files: [{ path, name, size, sha }] - paths relative to the report folder.
      meta:  the Fin Desk board index as { byPath } or null.
      A post is every file that shares a stem (name without extension) inside the same sub-folder, plus
      everything under "<stem>.assets/". A file whose name says "pick" is a picks post. Newest first;
      on one day a daily sorts before its picks, the weekly and the notes. Every post gets its
      same-day partner: a report's `picksPost`, a picks post's `reportPost`. */
  function groupPosts(files, meta) {
    var byPath = (meta && meta.byPath) || {};
    var posts = {}, order = [];
    files.forEach(function (f) {
      if (IGNORED_NAMES[f.name] || f.path.split('/').some(function (seg) { return seg.charAt(0) === '.'; })) return;
      var parts = f.path.split('/');
      var dirs = parts.slice(0, -1), stem, role, subdir;
      if (dirs.length && /\.assets$/i.test(dirs[dirs.length - 1])) {
        stem = dirs[dirs.length - 1].replace(/\.assets$/i, ''); role = 'asset'; subdir = dirs.slice(0, -1).join('/');
      } else {
        stem = splitExt(f.name).stem; subdir = dirs.join('/');
        role = BODY_EXT[splitExt(f.name).ext] ? 'body' : 'attachment';
      }
      var key = ((subdir ? subdir + '/' : '') + stem).toLowerCase();
      if (!posts[key]) {
        var p = parseName(stem);
        posts[key] = { id: key, stem: stem, subdir: subdir, title: p.title, date: p.date, dateEnd: p.dateEnd, dated: p.dated,
          picksFile: isPicksName(stem), files: [], size: 0, body: null, picks: [], heading: null, registered: null, indexed: false };
        order.push(key);
      }
      var post = posts[key];
      var ext = splitExt(f.name).ext;
      var rec = byPath[f.path] || null;
      var entry = { path: f.path, name: f.name, size: f.size || (rec && rec.bytes) || 0, sha: f.sha || null, ext: ext, role: role,
        type: typeOf(ext), registered: rec ? rec.registered || null : null, heading: rec ? rec.heading || null : null };
      post.files.push(entry);
      post.size += entry.size;
      if (rec) {
        post.indexed = true;
        if (rec.registered && (!post.registered || rec.registered < post.registered)) post.registered = rec.registered;
        (rec.picks || []).forEach(function (pk) {
          if (!pk || !pk.path) return;
          if (!post.picks.some(function (q) { return q.path === pk.path; })) post.picks.push(pk);
        });
      }
    });
    var list = order.map(function (k) {
      var post = posts[k];
      post.files.sort(function (a, b) { return rank(a) - rank(b) || a.path.localeCompare(b.path); });
      var bodies = post.files.filter(function (e) { return e.role === 'body'; });
      post.body = bodies.length ? bodies[0] : null;
      post.heading = post.body ? post.body.heading : null;
      post.attachments = post.files.filter(function (e) { return e.role !== 'asset'; });
      post.assets = post.files.filter(function (e) { return e.role === 'asset'; });
      if (!post.date && post.registered) post.date = post.registered;      // no date in the name: the day it arrived
      post.kind = kindOf(post.title, post.date, post.dateEnd, post.subdir);
      post.sortDate = post.dateEnd || post.date;                            // a period files under its last day
      post.picksPost = null; post.reportPost = null;
      return post;
    });
    list.sort(function (a, b) {
      var da = a.sortDate || '0000', db = b.sortDate || '0000';
      if (da !== db) return da < db ? 1 : -1;
      var ra = KIND_RANK[a.kind] || 0, rb = KIND_RANK[b.kind] || 0;
      if (ra !== rb) return ra - rb;
      return b.title.localeCompare(a.title);
    });
    list.forEach(function (p) {
      if (!p.date) return;
      if (p.picksFile) {
        p.reportPost = list.filter(function (q) { return !q.picksFile && q.date === p.date && q.kind === 'daily'; })[0] ||
          list.filter(function (q) { return !q.picksFile && q.sortDate === p.sortDate; })[0] || null;
      } else {
        p.picksPost = list.filter(function (q) { return q.picksFile && q.date === p.date; })[0] || null;
      }
    });
    return list;
  }

  function rank(e) { var i = EXT_ORDER.indexOf(e.ext); return (e.role === 'asset' ? 100 : 0) + (i < 0 ? 50 : i); }

  /** The Fin Desk board index as the page uses it: { byPath }. */
  function indexMeta(data) {
    var byPath = {};
    if (data && Array.isArray(data.files)) data.files.forEach(function (r) { if (r && r.path) byPath[r.path] = r; });
    return { byPath: byPath, count: Object.keys(byPath).length, generator: data && data.generator };
  }

  function typeOf(ext) {
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'html' || ext === 'htm') return 'html';
    if (ext === 'txt' || ext === 'csv' || ext === 'json' || ext === 'yml' || ext === 'yaml') return 'text';
    if (ext === 'pdf') return 'pdf';
    if (/^(png|jpe?g|webp|gif|svg|bmp|avif)$/.test(ext)) return 'image';
    return 'binary';
  }
  var TYPE_LABEL = { markdown: 'MD', html: 'HTML', text: '텍스트', pdf: 'PDF', image: '그림', binary: '파일' };

  function mimeOf(ext) {
    return { md: 'text/markdown', markdown: 'text/markdown', html: 'text/html', htm: 'text/html', txt: 'text/plain', csv: 'text/csv',
      json: 'application/json', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
      gif: 'image/gif', svg: 'image/svg+xml', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }[ext] || 'application/octet-stream';
  }

  function basename(p) { return String(p || '').split('/').pop(); }
  function dirname(p) { var i = String(p || '').lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
  function normPath(p) {
    var out = [];
    String(p || '').split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') { if (out.length) out.pop(); return; }
      out.push(seg);
    });
    return out.join('/');
  }

  /* ------------------------------------------------------------------ the files of a post */

  /** Everything a post lets you open, in the order the strip shows it:
        FixC's own files (PDF first, then the .md twin, then other attachments),
        the day's Daily Picks file (for a report) and the documents it names (the picks),
        and, for a picks post, the day's report files after the picks.
      Items: { kind: 'file'|'link', role, repoPath, name, label, note, size, ext, type, exists, unresolved,
               rendering, index, post }.  rootPath: the report folder in the repository. */
  function postItems(post, rootPath) {
    var items = [], seen = {};
    function push(it) { if (!it.repoPath || seen[it.repoPath]) return; seen[it.repoPath] = 1; items.push(it); }
    function fileItem(f, role, owner) {
      return { kind: 'file', role: role, repoPath: rootPath + '/' + f.path, name: f.name, label: f.name, note: '', size: f.size || 0,
        ext: f.ext, type: f.type, exists: true, unresolved: false, rendering: null, index: 0, post: owner };
    }
    function materials(src) {
      return src.picks.map(function (pk, i) {
        var name = basename(pk.path), ext = splitExt(name).ext;
        return { kind: 'link', role: 'material', repoPath: pk.path, name: name,
          label: (pk.text && pk.text !== name) ? pk.text : (pk.title || name), note: pk.note || '',
          size: pk.bytes || 0, ext: ext, type: typeOf(ext), exists: pk.exists !== false, unresolved: !!pk.unresolved,
          rendering: pk.rendering || null, institution: pk.institution || '', publication_date: pk.publication_date || '',
          index: i + 1, post: src };
      });
    }
    if (!post.picksFile) {
      post.attachments.forEach(function (f) { push(fileItem(f, f.type === 'pdf' ? 'report' : 'twin', post)); });
      if (post.picksPost) {
        post.picksPost.attachments.forEach(function (f) { push(fileItem(f, 'picks', post.picksPost)); });
        materials(post.picksPost).forEach(push);
      }
      materials(post).forEach(push);
    } else {
      post.attachments.forEach(function (f) { push(fileItem(f, 'picks', post)); });
      materials(post).forEach(push);
      if (post.reportPost) post.reportPost.attachments.forEach(function (f) { push(fileItem(f, 'daily', post.reportPost)); });
    }
    return items;
  }

  /** What the viewer shows when a post opens: FixC's PDF, else its first readable file, else the first
      readable document among the picks. */
  function defaultItem(items) {
    return items.filter(function (i) { return i.kind === 'file' && i.type === 'pdf' && (i.role === 'report' || i.role === 'picks'); })[0] ||
      items.filter(function (i) { return i.kind === 'file' && i.type !== 'binary' && i.role !== 'daily'; })[0] ||
      items.filter(function (i) { return i.kind === 'file' && i.type !== 'binary'; })[0] ||
      items.filter(function (i) { return i.exists && i.type !== 'binary'; })[0] || null;
  }

  /* ------------------------------------------------------------------ a Daily Picks text */

  var EXT_RE = '(?:pdf|html?|md|markdown|txt|png|jpe?g|webp|gif|docx?|xlsx?|pptx?|hwpx?)';
  var RE_QUOTED_NAME = new RegExp('["“”\'‘’「」『』]\\s*([^"“”\'‘’「」『』\\n]+?\\.' + EXT_RE + ')\\s*["“”\'‘’「」『』]', 'gi');
  var RE_BARE_NAME = new RegExp('(?:^|[^\\w/\\\\])([^\\s"“”\'‘’「」『』()<>\\[\\]]+\\.' + EXT_RE + ')(?![\\w.])', 'gi');

  /** The picks a Daily Picks file names: its top-level numbered items, each with its first line as the
      label, the quoted file name as the document ("* Findocraw 상의 파일명: "…pdf""), the rest of that
      line as the note, and an optional "* 판독본: "…html"" naming the rendering.
      Returns [{ label, name, note, renderingName }]. */
  function parsePicksText(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var items = [], fence = false;
    lines.forEach(function (line) {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return; }
      if (fence) return;
      var m = /^(\d+)[.)]\s+(.*)$/.exec(line);
      if (m) { items.push([m[2]]); return; }
      if (/^#{1,6}\s/.test(line)) { items.push([]); return; }
      if (items.length && items[items.length - 1].length) items[items.length - 1].push(line);
    });
    var out = [];
    items.forEach(function (item) {
      if (!item.length) return;
      var label = item[0].trim().replace(/^[*_]+|[*_]+$/g, '').trim().replace(/^["“”'‘’]|["“”'‘’]$/g, '').trim();
      var doc = null, renderingName = '';
      item.forEach(function (line) {
        var names = namesIn(line);
        if (!names.length) return;
        var head = line.split(':')[0];
        if (/판독본|rendering/i.test(head) && !renderingName) { renderingName = names[0].name; return; }
        if (!doc) doc = names[0];
      });
      if (doc) out.push({ label: label, name: doc.name, note: doc.note, renderingName: renderingName });
    });
    return out;
  }
  function namesIn(line) {
    var found = [], m;
    RE_QUOTED_NAME.lastIndex = 0;
    while ((m = RE_QUOTED_NAME.exec(line))) found.push({ name: m[1].trim(), note: noteAfterText(line.slice(m.index + m[0].length)) });
    if (!found.length) {
      RE_BARE_NAME.lastIndex = 0;
      while ((m = RE_BARE_NAME.exec(line))) found.push({ name: m[1].trim(), note: noteAfterText(line.slice(m.index + m[0].length)) });
    }
    return found;
  }
  function noteAfterText(s) { return String(s || '').replace(/^[\s—–\-:：·,"“”'‘’」』]+/, '').replace(/\s+/g, ' ').trim().slice(0, 200); }

  /* ------------------------------------------------------------------ formatting */

  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  function fmtDate(iso, withDay) {
    if (!iso) return '날짜 없음';
    var y = iso.slice(0, 4), m = iso.slice(5, 7), d = iso.slice(8, 10);
    var s = y + '.' + m + '.' + d;
    if (withDay) { var dt = new Date(+y, +m - 1, +d); s += ' (' + WEEKDAY[dt.getDay()] + ')'; }
    return s;
  }
  function fmtPeriod(post) {
    if (!post.date) return '날짜 없음';
    if (post.dateEnd && post.dateEnd !== post.date) return fmtDate(post.date) + ' ~ ' + fmtDate(post.dateEnd);
    return fmtDate(post.date, true) + (post.dated ? '' : ' · 등록일');
  }
  function fmtShort(post) {
    if (!post.date) return '';
    return post.dateEnd && post.dateEnd !== post.date ? fmtDate(post.date).slice(2) + '~' + fmtDate(post.dateEnd).slice(5) : fmtDate(post.date).slice(2);
  }
  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function fmtPub(iso) { return iso && iso.length >= 10 ? iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10) : ''; }

  /* ------------------------------------------------------------------ markdown (small, safe) */

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^(https?:|mailto:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;        // javascript:, data:, vbscript: ...
    return u;                                                 // relative or repository path: resolved later
  }

  /** Markdown links on one line: [{ image, text, target, start, end }]. Targets may hold spaces and
      balanced parentheses, as the file names in the repository do ("(261002) 제목 (기관, 저자).html"). */
  function scanLinks(line) {
    var out = [], i = 0, n = line.length;
    for (;;) {
      var j = line.indexOf('](', i);
      if (j < 0) return out;
      var k = j - 1, depth = 0;
      while (k >= 0) {
        var c = line.charAt(k);
        if (c === ']') depth++;
        else if (c === '[') { if (depth === 0) break; depth--; }
        k--;
      }
      if (k < 0) { i = j + 2; continue; }
      var text = line.slice(k + 1, j), image = k > 0 && line.charAt(k - 1) === '!';
      var p = j + 2, target, end;
      if (line.charAt(p) === '<') {
        var q = line.indexOf('>', p + 1), r = q > 0 ? line.indexOf(')', q) : -1;
        if (r < 0) { i = j + 2; continue; }
        target = line.slice(p + 1, q); end = r + 1;
      } else {
        var q2 = p; depth = 0;
        while (q2 < n) {
          var c2 = line.charAt(q2);
          if (c2 === '(') depth++;
          else if (c2 === ')') { if (depth === 0) break; depth--; }
          q2++;
        }
        if (q2 >= n) { i = j + 2; continue; }
        target = line.slice(p, q2); end = q2 + 1;
      }
      var t = /^(.*?)\s+"[^"]*"\s*$/.exec(target);
      if (t) target = t[1];
      out.push({ image: image, text: text, target: target.trim(), start: image ? k - 1 : k, end: end });
      i = end;
    }
  }

  function inline(text) {
    var codes = [], links = [];
    text = text.replace(/`([^`\n]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    var parts = [], pos = 0;
    scanLinks(text).forEach(function (l) {
      parts.push(text.slice(pos, l.start));
      var u = safeUrl(l.target), html;
      if (!u) html = escapeHtml(l.text);
      else if (l.image) html = '<img alt="' + escapeHtml(l.text) + '" data-src="' + escapeHtml(u) + '">';
      else {
        var external = /^(https?:|mailto:)/i.test(u);
        html = '<a href="' + escapeHtml(u) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : ' data-href="' + escapeHtml(u) + '"') + '>' + escapeHtml(l.text) + '</a>';
      }
      links.push(html);
      parts.push('\u0001' + (links.length - 1) + '\u0001');
      pos = l.end;
    });
    parts.push(text.slice(pos));
    text = escapeHtml(parts.join(''));
    text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, function (_, pre, url) {
      return pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    text = text.replace(/\u0001(\d+)\u0001/g, function (_, n) { return links[+n]; });
    text = text.replace(/\u0000(\d+)\u0000/g, function (_, n) { return '<code>' + escapeHtml(codes[+n]) + '</code>'; });
    return text;
  }

  function tableRow(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    var cells = [], cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '\\' && s.charAt(i + 1) === '|') { cur += '|'; i++; }
      else if (ch === '|') { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }
  function isTableSep(line) { return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line); }

  /** Markdown -> HTML. Covers what reports use: headings, paragraphs, emphasis, code, links,
      images, lists (nested by indent, numbered lists keep their start number), blockquotes, fenced
      code, GFM tables, rules, HTML comments dropped. Output is escaped; only http(s)/mailto/relative
      URLs survive. */
  function renderMarkdown(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
    var out = [], i = 0, para = [];
    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }

    while (i < lines.length) {
      var line = lines[i];
      var fence = /^\s*(```|~~~)\s*([\w-]*)\s*$/.exec(line);
      if (fence) {
        flushPara();
        var buf = []; i++;
        while (i < lines.length && lines[i].trim().indexOf(fence[1]) !== 0) buf.push(lines[i++]);
        i++;
        out.push('<pre><code' + (fence[2] ? ' class="lang-' + escapeHtml(fence[2]) + '"' : '') + '>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (!line.trim()) { flushPara(); i++; continue; }
      var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) { flushPara(); out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); out.push('<hr>'); i++; continue; }
      if (para.length && /^\s*=+\s*$/.test(line)) { out.push('<h1>' + inline(para.join(' ')) + '</h1>'); para = []; i++; continue; }
      if (para.length && /^\s*-+\s*$/.test(line) && para.length === 1) { out.push('<h2>' + inline(para.join(' ')) + '</h2>'); para = []; i++; continue; }
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara();
        var head = tableRow(line), aligns = tableRow(lines[i + 1]).map(function (c) {
          var l = c.charAt(0) === ':', r = c.charAt(c.length - 1) === ':';
          return l && r ? 'center' : (r ? 'right' : (l ? 'left' : ''));
        });
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) rows.push(tableRow(lines[i++]));
        var html = '<div class="table-wrap"><table><thead><tr>';
        head.forEach(function (c, k) { html += '<th' + (aligns[k] ? ' style="text-align:' + aligns[k] + '"' : '') + '>' + inline(c) + '</th>'; });
        html += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr>';
          for (var k = 0; k < head.length; k++) html += '<td' + (aligns[k] ? ' style="text-align:' + aligns[k] + '"' : '') + '>' + inline(r[k] || '') + '</td>';
          html += '</tr>';
        });
        out.push(html + '</tbody></table></div>');
        continue;
      }
      if (/^\s*>/.test(line)) {
        flushPara();
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote>' + renderMarkdown(q.join('\n')) + '</blockquote>');
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        flushPara();
        var items = [];
        while (i < lines.length && lines[i].trim()) {
          var lm = /^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/.exec(lines[i]);
          if (lm) { items.push({ indent: lm[1].replace(/\t/g, '    ').length, ordered: !!lm[3], start: lm[3] ? +lm[3] : 0, text: lm[4] }); i++; }
          else if (items.length && /^\s{2,}/.test(lines[i])) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; }
          else break;
        }
        out.push(renderList(items, 0, items[0].indent));
        continue;
      }
      if (/^\s*<(sub|sup|small|br)\b/i.test(line)) { flushPara(); out.push('<p class="fine">' + inline(line.replace(/<\/?(sub|sup|small)\b[^>]*>/gi, '').replace(/<br\s*\/?>/gi, ' ')) + '</p>'); i++; continue; }
      para.push(line.trim());
      i++;
    }
    flushPara();
    return out.join('\n');
  }

  function renderList(items, start, indent) {
    var first = items[start];
    var tag = first.ordered ? 'ol' : 'ul';
    var html = '<' + tag + (first.ordered && first.start > 1 ? ' start="' + first.start + '"' : '') + '>', k = start;
    while (k < items.length && items[k].indent >= indent) {
      if (items[k].indent > indent) {
        var sub = renderListSpan(items, k, items[k].indent);
        html = html.replace(/<\/li>$/, sub.html + '</li>');
        k = sub.next;
        continue;
      }
      var text = items[k].text, task = /^\[([ xX])\]\s+/.exec(text);
      if (task) text = '<span class="task' + (task[1] !== ' ' ? ' done' : '') + '"></span>' + inline(text.slice(task[0].length));
      else text = inline(text);
      html += '<li>' + text + '</li>';
      k++;
    }
    return html + '</' + tag + '>';
  }
  function renderListSpan(items, start, indent) {
    var end = start;
    while (end < items.length && items[end].indent >= indent) end++;
    return { html: renderList(items.slice(start, end), 0, indent), next: end };
  }

  /** The repository paths a link target in a report may mean (most likely first); [] for an outside URL.
      cfg: { owner, repo, path }; fileDir: the report's folder inside the repository. */
  function repoPathCandidates(target, cfg, fileDir) {
    var t = String(target || '').trim().replace(/^<|>$/g, '');
    if (!t || t.charAt(0) === '#') return [];
    var m = /^https?:\/\/(github\.com|raw\.githubusercontent\.com)\/([^/]+)\/([^/]+)\/(.*)$/i.exec(t);
    if (m) {
      if ((m[2] + '/' + m[3]).toLowerCase() !== (cfg.owner + '/' + cfg.repo).toLowerCase()) return [];
      var rest = m[4].split('?')[0].split('#')[0].split('/').map(function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } });
      if (m[1].toLowerCase() === 'github.com') { if (rest.length < 3 || !/^(blob|raw|tree)$/.test(rest[0])) return []; rest = rest.slice(2); }
      else rest = rest.slice(1);
      return [normPath(rest.join('/'))];
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return [];
    try { t = decodeURIComponent(t.split('#')[0].split('?')[0]); } catch (e) { /* keep */ }
    if (!t) return [];
    if (t.charAt(0) === '/') return [normPath(t)];
    var rootSeg = cfg.path.split('/')[0];
    var asIs = normPath(t), fromFile = normPath((fileDir ? fileDir + '/' : '') + t), fromRoot = normPath(rootSeg + '/' + t);
    var order = asIs.indexOf(rootSeg + '/') === 0 ? [asIs, fromFile, fromRoot] : [fromFile, fromRoot, asIs];
    var out = [];
    order.forEach(function (c) { if (c && out.indexOf(c) < 0) out.push(c); });
    return out;
  }

  /* ------------------------------------------------------------------ GitHub (browser) */

  function GitHub(token, cfg) { this.token = token; this.cfg = cfg; this.defaultBranch = null; this.rootPath = String(cfg.path || '').replace(/^\/+|\/+$/g, ''); }
  GitHub.prototype.base = function () { return GITHUB_API + '/repos/' + encodeURIComponent(this.cfg.owner) + '/' + encodeURIComponent(this.cfg.repo); };
  GitHub.prototype.headers = function (accept) {
    return { Authorization: 'Bearer ' + this.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  };
  GitHub.prototype.fetch = function (url, accept) {
    return fetch(url, { headers: this.headers(accept), cache: 'no-store' }).then(function (res) {
      if (res.ok) return res;
      var err = new Error('GitHub ' + res.status);
      err.status = res.status;
      return res.json().then(function (b) { err.detail = b && b.message; throw err; }, function () { throw err; });
    });
  };
  GitHub.prototype.branch = function () {
    var self = this;
    if (this.cfg.branch) return Promise.resolve(this.cfg.branch);
    if (this.defaultBranch) return Promise.resolve(this.defaultBranch);
    return this.fetch(this.base()).then(function (r) { return r.json(); }).then(function (info) { self.defaultBranch = info.default_branch; return self.defaultBranch; });
  };
  GitHub.prototype.contentsUrl = function (path, ref) {
    var p = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return this.base() + '/contents/' + p + (ref ? '?ref=' + encodeURIComponent(ref) : '');
  };
  /** The entries of one folder of the repository ([] when it does not exist). */
  GitHub.prototype.dir = function (repoPath) {
    var self = this;
    return this.branch().then(function (ref) { return self.fetch(self.contentsUrl(repoPath, ref)); })
      .then(function (r) { return r.json(); }).then(function (items) { return Array.isArray(items) ? items : []; })
      .catch(function (err) { if (err && err.status === 404) return []; throw err; });
  };
  /** Every file under the report folder (depth <= MAX_DEPTH), paths relative to it. */
  GitHub.prototype.listFolder = function () {
    var self = this, rootPath = this.rootPath;
    return this.branch().then(function (ref) {
      function walk(rel, depth) {
        var full = rel ? rootPath + '/' + rel : rootPath;
        return self.fetch(self.contentsUrl(full, ref)).then(function (r) { return r.json(); }).then(function (items) {
          if (!Array.isArray(items)) return [];
          var files = [], dirs = [];
          items.forEach(function (it) {
            var relPath = rel ? rel + '/' + it.name : it.name;
            if (it.type === 'file') files.push({ path: relPath, name: it.name, size: it.size, sha: it.sha });
            else if (it.type === 'dir' && depth < MAX_DEPTH && it.name.charAt(0) !== '.') dirs.push(relPath);
          });
          return Promise.all(dirs.map(function (d) { return walk(d, depth + 1); })).then(function (nested) {
            nested.forEach(function (n) { files = files.concat(n); });
            return files;
          });
        });
      }
      return walk('', 0).then(function (files) { return { ref: ref, files: files }; });
    });
  };
  /** name (lower-cased) -> repository path for every file in a folder and its first-level sub-folders. */
  GitHub.prototype.namesIn = function (repoPath) {
    var self = this, map = {};
    return this.dir(repoPath).then(function (items) {
      var dirs = [];
      items.forEach(function (it) {
        if (it.type === 'file') map[it.name.toLowerCase()] = { path: repoPath + '/' + it.name, size: it.size };
        else if (it.type === 'dir' && it.name.charAt(0) !== '.') dirs.push(it.name);
      });
      return Promise.all(dirs.map(function (d) {
        return self.dir(repoPath + '/' + d).then(function (sub) {
          sub.forEach(function (it) { if (it.type === 'file' && !map[it.name.toLowerCase()]) map[it.name.toLowerCase()] = { path: repoPath + '/' + d + '/' + it.name, size: it.size }; });
        });
      }));
    }).then(function () { return map; });
  };
  /** The bytes of any file of the repository, as a Blob with the right MIME type. */
  GitHub.prototype.blobAt = function (repoPath, ext) {
    var self = this;
    return this.branch().then(function (ref) {
      return self.fetch(self.contentsUrl(repoPath, ref), 'application/vnd.github.raw+json');
    }).then(function (r) { return r.arrayBuffer(); }).then(function (buf) { return new Blob([buf], { type: mimeOf(ext || splitExt(basename(repoPath)).ext) }); });
  };
  GitHub.prototype.blob = function (relPath, ext) { return this.blobAt(this.rootPath + '/' + relPath, ext); };
  /** The Fin Desk board index of the folder, or null when there is none yet. */
  GitHub.prototype.boardIndex = function () {
    var self = this;
    return this.branch().then(function (ref) {
      return self.fetch(self.contentsUrl(self.rootPath + '/' + INDEX_FILE, ref), 'application/vnd.github.raw+json');
    }).then(function (r) { return r.json(); }).catch(function (err) { if (err && err.status === 404) return null; throw err; });
  };
  GitHub.prototype.webUrlAt = function (repoPath, ref) {
    return 'https://github.com/' + this.cfg.owner + '/' + this.cfg.repo + '/blob/' + encodeURIComponent(ref) + '/' +
      repoPath.split('/').map(encodeURIComponent).join('/');
  };
  GitHub.prototype.whoami = function () { return this.fetch(GITHUB_API + '/user').then(function (r) { return r.json(); }); };

  function explainError(err, cfg) {
    if (!err) return '';
    if (err.status === 401) return '토큰이 유효하지 않습니다 (401). ⚙ 설정에서 새 토큰을 넣으세요.';
    if (err.status === 403) return 'GitHub 가 거절했습니다 (403): 토큰에 ' + cfg.owner + '/' + cfg.repo + ' 의 Contents 읽기 권한이 없거나, 요청 한도에 걸렸습니다.';
    if (err.status === 404) return '찾지 못했습니다 (404): ' + cfg.owner + '/' + cfg.repo + ' 의 "' + (err.path || cfg.path) + '"' + (cfg.branch ? ' (브랜치 ' + cfg.branch + ')' : '') + ' 가 없거나, 토큰이 이 저장소에 접근할 수 없습니다.';
    if (err.name === 'TypeError') return '네트워크 오류: api.github.com 에 닿지 못했습니다.';
    return (err.detail || err.message || String(err));
  }

  /* ------------------------------------------------------------------ storage */

  function readToken() {
    try {
      var v = localStorage.getItem(LS.token);
      if (v === null) return null;
      try { var parsed = JSON.parse(v); return typeof parsed === 'string' ? parsed : null; } catch (e) { return v; }
    } catch (e) { return null; }
  }
  function writeToken(t) {
    try { if (t) localStorage.setItem(LS.token, JSON.stringify(String(t).trim())); else localStorage.removeItem(LS.token); } catch (e) { /* no storage */ }
  }
  function readConfig() {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(LS.config) || '{}') || {}; } catch (e) { cfg = {}; }
    return { owner: cfg.owner || DEFAULTS.owner, repo: cfg.repo || DEFAULTS.repo, branch: cfg.branch || DEFAULTS.branch, path: cfg.path || DEFAULTS.path };
  }
  function writeConfig(cfg) { try { localStorage.setItem(LS.config, JSON.stringify(cfg)); } catch (e) { /* no storage */ } }

  /* ------------------------------------------------------------------ the page */

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function startPage() {
    var $ = function (id) { return document.getElementById(id); };
    var page = document.body.getAttribute('data-board') === PAGES.picks ? PAGES.picks : PAGES.reports;
    var other = page === PAGES.picks ? '../reports/' : '../picks/';
    var state = { page: page, cfg: readConfig(), token: readToken(), posts: [], allPosts: [], meta: null, ref: null, loadedAt: null,
      error: null, filter: '', kind: 'all', pageNo: 1, urls: [], current: null, items: [], viewing: null, names: null, pdfjs: null };
    var gh = null;

    var views = { list: $('view-list'), post: $('view-post'), settings: $('settings') };
    var listEl = $('post-list'), statusEl = $('status'), noteEl = $('note');

    function setStatus(text, tone) { statusEl.textContent = text; statusEl.className = 'status' + (tone ? ' ' + tone : ''); }
    function note(html, tone) { noteEl.innerHTML = html || ''; noteEl.className = 'note' + (tone ? ' ' + tone : ''); noteEl.hidden = !html; }
    function revokeAll() { state.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); state.urls = []; }
    function objectUrl(blob) { var u = URL.createObjectURL(blob); state.urls.push(u); return u; }
    function statusCount() { return state.posts.length + '건' + (state.meta && state.meta.count ? ' · 색인 ' + state.meta.count : ' · 색인 없음') + ' · ' + fmtTime(state.loadedAt || new Date()); }
    function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' 기준'; }
    function pageTitle() { return page === PAGES.picks ? 'FixC Daily Picks' : 'FixC report'; }

    // settings
    function fillSettings() {
      $('cfg-owner').value = state.cfg.owner; $('cfg-repo').value = state.cfg.repo; $('cfg-branch').value = state.cfg.branch; $('cfg-path').value = state.cfg.path;
      $('cfg-token').value = ''; $('cfg-token').placeholder = state.token ? '저장됨 (바꾸려면 새 토큰 입력)' : 'github_pat_...';
      $('cfg-forget').hidden = !state.token;
    }
    function toggleSettings(show) { views.settings.hidden = !show; $('btn-settings').setAttribute('aria-expanded', show ? 'true' : 'false'); if (show) fillSettings(); }
    $('btn-settings').addEventListener('click', function () { toggleSettings(views.settings.hidden); });
    views.settings.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = $('cfg-token').value.trim();
      if (t) { state.token = t; writeToken(t); }
      state.cfg = { owner: $('cfg-owner').value.trim() || DEFAULTS.owner, repo: $('cfg-repo').value.trim() || DEFAULTS.repo,
        branch: $('cfg-branch').value.trim(), path: ($('cfg-path').value.trim() || DEFAULTS.path).replace(/^\/+|\/+$/g, '') };
      writeConfig(state.cfg);
      gh = null; state.names = null;
      toggleSettings(false);
      load();
    });
    $('cfg-forget').addEventListener('click', function () { state.token = null; writeToken(null); fillSettings(); setStatus('토큰 없음', 'warn'); });
    $('cfg-check').addEventListener('click', function () {
      var t = $('cfg-token').value.trim() || state.token;
      var out = $('cfg-result');
      if (!t) { out.textContent = '토큰을 먼저 넣으세요.'; return; }
      out.textContent = '확인 중…';
      var probe = new GitHub(t, { owner: $('cfg-owner').value.trim() || DEFAULTS.owner, repo: $('cfg-repo').value.trim() || DEFAULTS.repo,
        branch: $('cfg-branch').value.trim(), path: ($('cfg-path').value.trim() || DEFAULTS.path) });
      probe.whoami().then(function (u) {
        return probe.listFolder().then(function (r) {
          return probe.boardIndex().then(function (idx) {
            out.textContent = '✓ ' + u.login + ' 으로 로그인. 보고서 폴더에 파일 ' + r.files.length + '개 (브랜치 ' + r.ref + '), 열람대 색인 ' + (idx ? indexMeta(idx).count + '건' : '없음') + '.';
          });
        });
      }).catch(function (err) { out.textContent = '✗ ' + explainError(err, probe.cfg); });
    });

    // toolbar
    $('search').addEventListener('input', function (e) { state.filter = e.target.value.trim().toLowerCase(); state.pageNo = 1; renderList(); });
    if ($('kind')) $('kind').addEventListener('change', function (e) { state.kind = e.target.value; state.pageNo = 1; renderList(); });
    $('btn-refresh').addEventListener('click', function () { load(); });
    $('btn-back').addEventListener('click', function (e) { e.preventDefault(); location.hash = state.pageNo > 1 ? '#page=' + state.pageNo : '#'; });

    function client() {
      if (!gh) gh = new GitHub(state.token, state.cfg);
      return gh;
    }
    function roomRoot() { return client().rootPath.split('/')[0]; }

    function load() {
      $('repo-label').textContent = state.cfg.owner + '/' + state.cfg.repo + ' · ' + state.cfg.path;
      if (!state.token) {
        state.posts = []; state.allPosts = []; state.meta = null; renderList();
        setStatus('토큰 없음', 'warn');
        note('이 게시판은 비공개 저장소 <code>' + escapeHtml(state.cfg.owner + '/' + state.cfg.repo) + '</code> 를 직접 읽습니다. ⚙ 설정에 GitHub 토큰(fine-grained, 이 저장소의 <b>Contents: Read</b>)을 한 번 넣어 두세요. 토큰은 이 브라우저에만 남습니다.', 'warn');
        toggleSettings(true);
        return Promise.resolve();
      }
      setStatus('불러오는 중…');
      note('');
      listEl.setAttribute('aria-busy', 'true');
      var c = client();
      return Promise.all([c.listFolder(), c.boardIndex().catch(function () { return null; })]).then(function (res) {
        var r = res[0];
        state.ref = r.ref; state.meta = indexMeta(res[1]);
        state.allPosts = groupPosts(r.files, state.meta);
        state.posts = state.allPosts.filter(function (p) { return page === PAGES.picks ? p.picksFile : !p.picksFile; });
        state.loadedAt = new Date(); state.error = null;
        setStatus(statusCount());
        if (!state.posts.length) note(page === PAGES.picks
          ? '아직 Daily Picks 파일이 없습니다. FixC 가 <code>' + escapeHtml(state.cfg.path) + '/daily/</code> 에 <code>…_Picks.md</code> 를 커밋하면 여기에 실립니다.'
          : '아직 보고서가 없습니다. FixC 가 <code>' + escapeHtml(state.cfg.path) + '/</code> 에 파일을 커밋하면 여기에 실립니다.');
        renderList();
        route();
        return fillMissingPicks();
      }).catch(function (err) {
        state.error = err; state.posts = []; state.allPosts = []; renderList();
        setStatus('오류', 'bad');
        note(escapeHtml(explainError(err, state.cfg)), 'bad');
        if (err.status === 401) toggleSettings(true);
      }).then(function () { listEl.removeAttribute('aria-busy'); });
    }

    /** Picks posts the desk has not indexed yet (pushed minutes ago): read their picks from the text
        and find the originals in the room's inbox folder. */
    function fillMissingPicks() {
      var todo = state.allPosts.filter(function (p) { return p.picksFile && !p.indexed && p.body && p.body.type === 'markdown'; }).slice(0, 5);
      if (!todo.length) return Promise.resolve();
      return Promise.all(todo.map(function (p) {
        return client().blob(p.body.path, p.body.ext).then(function (b) { return b.text(); }).then(function (text) {
          var items = parsePicksText(text);
          if (!items.length) return;
          return originalNames().then(function (names) {
            items.forEach(function (it) {
              var hit = names[it.name.toLowerCase()] || names[basename(it.name).toLowerCase()];
              var rend = it.renderingName ? (names[it.renderingName.toLowerCase()] || null) : null;
              var pk = hit ? { path: hit.path, text: it.label, note: it.note, exists: true, kind: typeOf(splitExt(hit.path).ext) === 'pdf' ? 'pdf' : undefined, bytes: hit.size }
                           : { path: it.name, text: it.label, note: it.note, exists: false, unresolved: true };
              if (rend) pk.rendering = rend.path;
              if (!p.picks.some(function (q) { return q.path === pk.path; })) p.picks.push(pk);
            });
            p.picksFromText = true;
          });
        }).catch(function () { /* leave the post without picks */ });
      })).then(function () { renderList(); if (state.current) renderStrip(state.current); });
    }
    function originalNames() {
      if (state.names) return Promise.resolve(state.names);
      return client().namesIn(roomRoot() + '/' + ORIGINALS_FOLDER).then(function (map) { state.names = map; return map; });
    }

    /** The picks that belong to a post on the board: its own, plus the day's Daily Picks for a report. */
    function dayPicks(post) {
      var out = post.picks.slice();
      if (!post.picksFile && post.picksPost) post.picksPost.picks.forEach(function (pk) { if (!out.some(function (q) { return q.path === pk.path; })) out.push(pk); });
      return out;
    }

    function visiblePosts() {
      return state.posts.filter(function (p) {
        if (state.kind === 'picks') { if (!dayPicks(p).length) return false; }
        else if (state.kind !== 'all' && p.kind !== state.kind) return false;
        if (!state.filter) return true;
        var hay = (p.title + ' ' + (p.heading || '') + ' ' + (p.date || '') + ' ' + p.files.map(function (f) { return f.name; }).join(' ') + ' ' +
          dayPicks(p).map(function (k) { return (k.text || '') + ' ' + (k.title || '') + ' ' + basename(k.path); }).join(' ')).toLowerCase();
        return state.filter.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
      });
    }

    /* ---- the list: a board, twenty posts a page */
    function renderList() {
      listEl.replaceChildren();
      var posts = visiblePosts();
      var total = posts.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (state.pageNo > pages) state.pageNo = pages;
      if (state.pageNo < 1) state.pageNo = 1;
      $('count').textContent = state.posts.length ? (total === state.posts.length ? total + '건' : total + ' / ' + state.posts.length + '건') : '';
      if (!total) {
        if (state.posts.length) listEl.appendChild(el('p', { class: 'empty', text: '조건에 맞는 글이 없습니다.' }));
        renderPager(0, 1);
        return;
      }
      var start = (state.pageNo - 1) * PAGE_SIZE, slice = posts.slice(start, start + PAGE_SIZE);
      var table = el('table', { class: 'board-table' }, [
        el('thead', null, [el('tr', null, [
          el('th', { class: 'c-no', text: '번호' }), el('th', { class: 'c-kind', text: '종류' }), el('th', { class: 'c-title', text: '제목' }),
          el('th', { class: 'c-files', text: '파일' }), el('th', { class: 'c-date', text: '날짜' })
        ])])
      ]);
      var tbody = el('tbody');
      slice.forEach(function (p, i) {
        var items = postItems(p, client().rootPath);
        var files = items.filter(function (it) { return it.kind === 'file'; }).length;
        var links = items.filter(function (it) { return it.kind === 'link'; }).length;
        var href = '#post=' + encodeURIComponent(p.id);
        tbody.appendChild(el('tr', { class: 'row ' + p.kind, onclick: function (e) { if (e.target.closest('a')) return; location.hash = href; } }, [
          el('td', { class: 'c-no', text: String(total - start - i) }),
          el('td', { class: 'c-kind' }, [el('span', { class: 'kind ' + p.kind, text: KIND_LABEL[p.kind] || '기타' })]),
          el('td', { class: 'c-title' }, [
            el('a', { class: 'post-link', href: href, text: p.title }),
            p.heading && p.heading !== p.title ? el('span', { class: 'sub-heading', text: p.heading }) : null
          ]),
          el('td', { class: 'c-files', text: files + (links ? ' + 참고 ' + links : '') }),
          el('td', { class: 'c-date', text: fmtShort(p) })
        ]));
      });
      table.appendChild(tbody);
      listEl.appendChild(table);
      renderPager(total, pages);
    }

    function renderPager(total, pages) {
      var pager = $('pager');
      pager.replaceChildren();
      pager.hidden = pages <= 1;
      if (pages <= 1) return;
      var cur = state.pageNo;
      function go(n) { return function (e) { e.preventDefault(); state.pageNo = n; location.hash = n > 1 ? '#page=' + n : '#'; renderList(); window.scrollTo(0, 0); }; }
      pager.appendChild(el('a', { class: 'pg' + (cur === 1 ? ' off' : ''), href: '#page=' + Math.max(1, cur - 1), text: '‹ 이전', onclick: go(Math.max(1, cur - 1)) }));
      var from = Math.max(1, cur - 3), to = Math.min(pages, from + 6);
      from = Math.max(1, Math.min(from, to - 6));
      if (from > 1) { pager.appendChild(el('a', { class: 'pg', href: '#page=1', text: '1', onclick: go(1) })); if (from > 2) pager.appendChild(el('span', { class: 'pg gap', text: '…' })); }
      for (var n = from; n <= to; n++) pager.appendChild(el('a', { class: 'pg' + (n === cur ? ' current' : ''), href: '#page=' + n, text: String(n), 'aria-current': n === cur ? 'page' : null, onclick: go(n) }));
      if (to < pages) { if (to < pages - 1) pager.appendChild(el('span', { class: 'pg gap', text: '…' })); pager.appendChild(el('a', { class: 'pg', href: '#page=' + pages, text: String(pages), onclick: go(pages) })); }
      pager.appendChild(el('a', { class: 'pg' + (cur === pages ? ' off' : ''), href: '#page=' + Math.min(pages, cur + 1), text: '다음 ›', onclick: go(Math.min(pages, cur + 1)) }));
      pager.appendChild(el('span', { class: 'pg total', text: total + '건 · ' + cur + '/' + pages + ' 쪽' }));
    }

    /* ---- a post: title, the strip of everything it opens, the viewer */
    function showPost(post, filePath) {
      var samePost = state.current === post;
      state.current = post;
      state.items = postItems(post, client().rootPath);
      views.list.hidden = true; views.post.hidden = false;
      if (!samePost) {
        revokeAll();
        $('post-title').textContent = post.title;
        $('post-heading').textContent = post.heading && post.heading !== post.title ? post.heading : '';
        $('post-heading').hidden = !$('post-heading').textContent;
        $('post-date').textContent = fmtPeriod(post);
        $('post-kind').textContent = KIND_LABEL[post.kind] || '';
        $('post-kind').className = 'kind ' + post.kind;
        document.title = post.title + ' - ' + pageTitle() + ' - Lobby';
        renderStrip(post);
        window.scrollTo(0, 0);
      }
      var target = null;
      if (filePath) target = state.items.filter(function (it) { return it.repoPath === filePath; })[0] ||
        (function () { var by = state.items.filter(function (it) { return it.rendering === filePath; })[0]; return by ? renderingItem(by) : null; })() ||
        { kind: 'link', role: 'material', repoPath: filePath, name: basename(filePath), label: basename(filePath), note: '', size: 0, ext: splitExt(basename(filePath)).ext, type: typeOf(splitExt(basename(filePath)).ext), exists: true, post: post };
      if (!target) {
        if (samePost && state.viewing) return;
        target = defaultItem(state.items);
      }
      if (target) view(post, target); else emptyBody(post);
    }

    function renderingItem(it) {
      var name = basename(it.rendering), ext = splitExt(name).ext;
      return { kind: 'link', role: 'rendering', repoPath: it.rendering, name: name, label: '판독본 · ' + it.label, note: '', size: 0, ext: ext, type: typeOf(ext), exists: true, of: it, post: it.post };
    }

    /** The strip under the title: FixC's files, then the documents the day's picks name. */
    function renderStrip(post) {
      state.items = postItems(post, client().rootPath);
      var strip = $('post-strip');
      strip.replaceChildren();
      var groups = [
        { title: 'FixC 파일', items: state.items.filter(function (it) { return it.kind === 'file' && it.role !== 'daily'; }) },
        { title: '참고 자료 (Daily Picks 가 고른 원문)', items: state.items.filter(function (it) { return it.kind === 'link'; }) },
        { title: '이 날의 데일리', items: state.items.filter(function (it) { return it.kind === 'file' && it.role === 'daily'; }) }
      ];
      groups.forEach(function (g) {
        if (!g.items.length) return;
        strip.appendChild(el('li', { class: 'strip-head', text: g.title }));
        g.items.forEach(function (it) { strip.appendChild(stripRow(post, it)); });
      });
      var src = post.picksFile ? post : post.picksPost;
      var noteText = src && src.picksFromText ? '열람대 색인이 아직 없어 Daily Picks 본문에서 읽고 Fin Docraw 에서 찾았습니다.' : '';
      $('strip-note').textContent = noteText;
      $('strip-note').hidden = !noteText;
      var cross = $('post-cross');
      cross.replaceChildren();
      var partner = post.picksFile ? post.reportPost : post.picksPost;
      cross.hidden = !partner;
      if (partner) cross.appendChild(el('a', { class: 'btn ghost', href: other + '#post=' + encodeURIComponent(partner.id),
        text: (post.picksFile ? '이 날의 데일리 글 → ' : 'Daily Picks 글 → ') + partner.title }));
      if (state.viewing) markViewing(post, state.viewing);
    }

    function stripRow(post, it) {
      var missing = !it.exists;
      var roleLabel = { report: 'FixC', twin: '텍스트판', picks: 'Daily Picks', daily: '데일리', material: it.index ? '참고 ' + it.index : '참고' }[it.role] || '';
      var bits = [];
      if (it.institution) bits.push(it.institution);
      if (it.publication_date) bits.push('발간 ' + fmtPub(it.publication_date));
      if (it.size) bits.push(fmtBytes(it.size));
      if (it.kind === 'link') bits.push(missing && it.unresolved ? '파일명: ' + it.repoPath : it.repoPath);
      var buttons = [];
      if (!missing) buttons.push(el('button', { type: 'button', class: 'btn ghost small', text: '내려받기', onclick: function (e) { e.stopPropagation(); download(it); } }));
      if (it.rendering) buttons.push(el('button', { type: 'button', class: 'btn ghost small', text: '판독본', onclick: function (e) { e.stopPropagation(); setHash(post, it.rendering, true); view(post, renderingItem(it)); } }));
      if (!missing) buttons.push(el('a', { class: 'btn ghost small', href: client().webUrlAt(it.repoPath, state.ref || state.cfg.branch || 'main'), target: '_blank', rel: 'noopener noreferrer', text: 'GitHub', onclick: function (e) { e.stopPropagation(); } }));
      var row = el('li', { class: 'strip-item ' + it.kind + (missing ? ' missing' : ''), 'data-path': it.repoPath, tabindex: missing ? null : '0', role: missing ? null : 'button' }, [
        el('span', { class: 'ptype', text: missing ? '없음' : (TYPE_LABEL[it.type] || it.ext.toUpperCase()) }),
        el('span', { class: 'strip-main' }, [
          el('span', { class: 'strip-label' }, [roleLabel ? el('span', { class: 'role', text: roleLabel }) : null, it.label]),
          bits.length ? el('span', { class: 'strip-meta', text: bits.join(' · ') }) : null,
          it.note ? el('span', { class: 'strip-note', text: it.note }) : null,
          missing ? el('span', { class: 'strip-note bad', text: it.unresolved ? '저장소에서 이 이름의 파일을 찾지 못했습니다. Daily Picks 의 파일명을 확인하세요.' : '저장소에 이 경로의 파일이 없습니다.' }) : null
        ]),
        el('span', { class: 'strip-actions' }, buttons)
      ]);
      if (!missing) {
        var open = function () { setHash(post, it.repoPath, true); view(post, it); };
        row.addEventListener('click', open);
        row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      }
      return row;
    }

    /** Point the address at a post (and one of its files). `replace` records it without routing. */
    function setHash(post, filePath, replace) {
      var h = '#post=' + encodeURIComponent(post.id) + (filePath ? '&file=' + encodeURIComponent(filePath) : '');
      if (location.hash === h) return;
      if (replace && history.replaceState) history.replaceState(null, '', h); else location.hash = h;
    }

    function emptyBody(post) {
      $('post-body').className = 'body';
      $('post-body').replaceChildren(el('p', { class: 'empty', text: '미리볼 수 있는 파일이 없습니다. 위에서 내려받으세요.' }));
      markViewing(post, null);
    }

    function markViewing(post, it) {
      state.viewing = it;
      $('viewing-name').textContent = it ? it.name : '';
      $('viewing').hidden = !it;
      var dl = $('viewing-download');
      dl.hidden = !it;
      dl.onclick = function () { if (it) download(it); };
      Array.prototype.forEach.call(document.querySelectorAll('#post-strip .strip-item'), function (li) {
        li.classList.toggle('current', !!it && li.getAttribute('data-path') === (it.of ? it.of.repoPath : it.repoPath));
      });
    }

    function download(it) {
      setStatus('내려받는 중…');
      client().blobAt(it.repoPath, it.ext).then(function (blob) {
        var a = el('a', { href: objectUrl(blob), download: it.name }); document.body.appendChild(a); a.click(); a.remove();
        setStatus(statusCount());
      }).catch(function (err) { err.path = it.repoPath; note(escapeHtml(explainError(err, state.cfg)), 'bad'); setStatus('오류', 'bad'); });
    }

    /* ---- the viewer */
    function view(post, it) {
      var body = $('post-body');
      body.className = 'body';
      body.replaceChildren(el('p', { class: 'empty', text: it.name + ' 불러오는 중…' }));
      body.setAttribute('aria-busy', 'true');
      markViewing(post, it);
      var token = {}; state.previewToken = token;
      client().blobAt(it.repoPath, it.ext).then(function (blob) {
        if (state.previewToken !== token) return;
        if (it.type === 'pdf') return showPdf(body, blob, it, token);
        if (it.type === 'markdown') {
          return blob.text().then(function (text) {
            if (state.previewToken !== token) return;
            body.className = 'body prose';
            body.innerHTML = renderMarkdown(text);
            resolveLinks(post, it, body);
          });
        }
        if (it.type === 'html') {
          return blob.text().then(function (html) { return inlineHtmlImages(html, dirname(it.repoPath)); }).then(function (html) {
            if (state.previewToken !== token) return;
            var frame = el('iframe', { class: 'frame html', sandbox: '', title: it.name });
            frame.srcdoc = html;
            body.replaceChildren(frame);
            frame.addEventListener('load', function () { try { frame.style.height = Math.max(600, frame.contentDocument.documentElement.scrollHeight + 24) + 'px'; } catch (e) { frame.style.height = '80vh'; } });
          });
        }
        if (it.type === 'text') return blob.text().then(function (text) { if (state.previewToken === token) body.replaceChildren(el('pre', { class: 'plain', text: text })); });
        if (it.type === 'image') { body.replaceChildren(el('img', { class: 'picture', src: objectUrl(blob), alt: it.name })); return; }
        var a = el('a', { href: objectUrl(blob), download: it.name, class: 'btn', text: it.name + ' 내려받기' });
        body.replaceChildren(el('p', { class: 'empty' }, ['이 형식은 미리볼 수 없습니다. ', a]));
      }).catch(function (err) {
        if (state.previewToken !== token) return;
        err.path = it.repoPath;
        body.className = 'body';
        body.replaceChildren(el('p', { class: 'empty bad', text: explainError(err, state.cfg) }));
      }).then(function () { if (state.previewToken === token) body.removeAttribute('aria-busy'); });
    }

    /** PDFs are drawn page by page with pdf.js, so they open on every browser (a phone's browser has no
        viewer of its own, and an <iframe> of a blob shows nothing there). Falls back to the browser's
        viewer when the library cannot be loaded. */
    function loadPdfJs() {
      if (!state.pdfjs) {
        state.pdfjs = import(PDFJS.lib).then(function (lib) { lib.GlobalWorkerOptions.workerSrc = PDFJS.worker; return lib; });
        state.pdfjs.catch(function () { state.pdfjs = null; });
      }
      return state.pdfjs;
    }
    function showPdf(body, blob, it, token) {
      return blob.arrayBuffer().then(function (buf) {
        return loadPdfJs().then(function (lib) {
          return lib.getDocument({ data: buf, cMapUrl: PDFJS.cmaps, cMapPacked: true, standardFontDataUrl: PDFJS.fonts }).promise;
        });
      }).then(function (pdf) {
        if (state.previewToken !== token) return;
        var pages = el('div', { class: 'pdf-pages' });
        var count = el('span', { class: 'pdf-count', text: pdf.numPages + '면' });
        body.className = 'body pdf';
        body.replaceChildren(el('div', { class: 'pdf-bar' }, [
          el('span', { class: 'pdf-name', text: it.name }), count,
          el('a', { class: 'btn ghost small', href: objectUrl(blob), download: it.name, text: '내려받기' }),
          el('a', { class: 'btn ghost small', href: objectUrl(blob), target: '_blank', rel: 'noopener', text: '새 창에서' })
        ]), pages);
        var width = Math.max(280, pages.clientWidth || body.clientWidth - 32);
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        function renderPage(n) {
          if (n > pdf.numPages || state.previewToken !== token) return Promise.resolve();
          return pdf.getPage(n).then(function (pg) {
            var base = pg.getViewport({ scale: 1 });
            var vp = pg.getViewport({ scale: (width / base.width) * dpr });
            var canvas = el('canvas', { class: 'pdf-page', 'aria-label': n + '면' });
            canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
            pages.appendChild(canvas);
            return pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          }).then(function () { count.textContent = Math.min(n, pdf.numPages) + ' / ' + pdf.numPages + '면'; return renderPage(n + 1); });
        }
        return renderPage(1);
      }).catch(function (err) {
        if (state.previewToken !== token) return;
        body.className = 'body';
        body.replaceChildren(
          el('p', { class: 'empty', text: 'PDF 뷰어를 불러오지 못해 브라우저의 뷰어로 엽니다 (' + (err && err.message ? err.message : err) + ').' }),
          el('iframe', { class: 'frame pdf', src: objectUrl(blob), title: it.name }),
          el('p', null, [el('a', { class: 'btn', href: objectUrl(blob), download: it.name, text: it.name + ' 내려받기' })]));
      });
    }

    /** A rendering's figures sit next to it ("<name>.assets/"); fetch them so the sandboxed frame shows them. */
    function inlineHtmlImages(html, baseDir) {
      var refs = [], seen = {};
      html.replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi, function (_, src) {
        if (/^(https?:|data:|blob:|\/\/)/i.test(src) || seen[src] || refs.length >= 40) return _;
        seen[src] = 1; refs.push(src); return _;
      });
      if (!refs.length) return Promise.resolve(html);
      return Promise.all(refs.map(function (src) {
        var path; try { path = normPath((baseDir ? baseDir + '/' : '') + decodeURIComponent(src)); } catch (e) { path = normPath((baseDir ? baseDir + '/' : '') + src); }
        return client().blobAt(path).then(function (blob) { return new Promise(function (resolve) {
          var fr = new FileReader(); fr.onload = function () { resolve({ src: src, data: fr.result }); }; fr.onerror = function () { resolve(null); }; fr.readAsDataURL(blob);
        }); }).catch(function () { return null; });
      })).then(function (got) {
        var map = {};
        got.forEach(function (g) { if (g) map[g.src] = g.data; });
        return html.replace(/(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi, function (_, a, src, b) { return map[src] ? a + map[src] + b : _; });
      });
    }

    /** Images and links in a Markdown body: the post's own files first, then any file of the repository
        (a repository path, a relative path or a GitHub URL). Without a desk index the repository links
        found in a report become its picks. */
    function resolveLinks(post, it, container) {
      var byName = {};
      post.files.forEach(function (f) { byName[f.path.toLowerCase()] = f; byName[f.name.toLowerCase()] = f; });
      var fileDir = dirname(it.repoPath);
      function ownItem(target) {
        var r; try { r = decodeURIComponent(target); } catch (e) { r = target; }
        r = r.replace(/^\.\//, '').toLowerCase();
        var f = byName[r] || null;
        if (!f) post.files.forEach(function (x) { if (!f && x.path.toLowerCase().slice(-r.length) === r) f = x; });
        if (!f) f = byName[r.split('/').pop()] || null;
        if (!f) return null;
        return state.items.filter(function (x) { return x.repoPath === client().rootPath + '/' + f.path; })[0] ||
          { kind: 'file', role: 'twin', repoPath: client().rootPath + '/' + f.path, name: f.name, label: f.name, note: '', size: f.size, ext: f.ext, type: f.type, exists: true, post: post };
      }
      Array.prototype.forEach.call(container.querySelectorAll('img[data-src]'), function (img) {
        var target = img.getAttribute('data-src'), own = ownItem(target);
        var paths = own ? [own.repoPath] : repoPathCandidates(target, state.cfg, fileDir);
        if (!paths.length) { img.replaceWith(el('span', { class: 'missing', text: '[그림 없음: ' + target + ']' })); return; }
        firstBlob(paths).then(function (r) { img.src = objectUrl(r.blob); }).catch(function () { img.replaceWith(el('span', { class: 'missing', text: '[그림을 불러오지 못했습니다: ' + target + ']' })); });
      });
      var found = [];
      Array.prototype.forEach.call(container.querySelectorAll('a[data-href], a[href^="https://github.com/"], a[href^="https://raw.githubusercontent.com/"]'), function (a) {
        var target = a.getAttribute('data-href') || a.getAttribute('href');
        var own = a.hasAttribute('data-href') ? ownItem(target) : null;
        if (own) {
          a.href = '#';
          a.addEventListener('click', function (e) { e.preventDefault(); if (own.type === 'binary') download(own); else { setHash(post, own.repoPath, true); view(post, own); } });
          return;
        }
        var paths = repoPathCandidates(target, state.cfg, fileDir);
        if (!paths.length) { if (a.hasAttribute('data-href')) a.removeAttribute('href'); return; }
        var known = state.items.filter(function (k) { return paths.indexOf(k.repoPath) >= 0; })[0];
        if (known) paths = [known.repoPath].concat(paths.filter(function (c) { return c !== known.repoPath; }));
        a.classList.add('repo-link');
        a.title = paths[0];
        if (!a.hasAttribute('target')) a.href = client().webUrlAt(paths[0], state.ref || state.cfg.branch || 'main');
        if (!known && paths[0].indexOf(client().rootPath + '/') !== 0) found.push({ path: paths[0], text: a.textContent, note: noteAfter(a) });
        a.addEventListener('click', function (e) {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;      // let the browser open GitHub
          e.preventDefault();
          openRepoPaths(post, paths, known || null);
        });
      });
      if (!post.indexed && found.length) {
        found.forEach(function (k) { if (!post.picks.some(function (q) { return q.path === k.path; })) post.picks.push({ path: k.path, text: k.text, note: k.note }); });
        renderStrip(post);
        renderList();
      }
    }
    function noteAfter(a) {
      var t = a.nextSibling, s = '';
      while (t && t.nodeType === 3) { s += t.nodeValue; t = t.nextSibling; }
      return s.replace(/^[\s—–\-:：·,]+/, '').trim().slice(0, 200);
    }
    function firstBlob(paths) {
      var i = 0;
      function next(err) {
        if (i >= paths.length) return Promise.reject(err || new Error('not found'));
        var p = paths[i++];
        return client().blobAt(p).then(function (blob) { return { path: p, blob: blob }; }, next);
      }
      return next(null);
    }
    function openRepoPaths(post, paths, known) {
      setStatus('여는 중…');
      firstBlob(paths).then(function (r) {
        setStatus(statusCount());
        var name = basename(r.path), ext = splitExt(name).ext;
        var it = known || { kind: 'link', role: 'material', repoPath: r.path, name: name, label: name, note: '', size: r.blob.size, ext: ext, type: typeOf(ext), exists: true, post: post };
        if (it.type === 'binary') { var a = el('a', { href: objectUrl(r.blob), download: it.name }); document.body.appendChild(a); a.click(); a.remove(); return; }
        setHash(post, r.path, true);
        view(post, it);
      }).catch(function (err) {
        err.path = paths[0];
        setStatus('오류', 'bad');
        note(escapeHtml(explainError(err, state.cfg)), 'bad');
      });
    }

    function route() {
      var h = location.hash || '';
      var m = /^#post=([^&]+)(?:&(?:file|pick)=(.+))?$/.exec(h);
      if (m) {
        var id = decodeURIComponent(m[1]), filePath = m[2] ? decodeURIComponent(m[2]) : null;
        var post = state.posts.filter(function (p) { return p.id === id; })[0];
        if (post) { showPost(post, filePath); return; }
        var elsewhere = state.allPosts.filter(function (p) { return p.id === id; })[0];
        if (elsewhere) { location.replace(other + h); return; }                 // the post lives on the other board
        if (state.allPosts.length) note('그 글을 찾지 못했습니다: ' + escapeHtml(id), 'warn');
      }
      var pg = /^#page=(\d+)$/.exec(h);
      if (pg) { state.pageNo = Math.max(1, +pg[1]); renderList(); }
      state.current = null; state.viewing = null; state.items = [];
      revokeAll();
      views.post.hidden = true; views.list.hidden = false;
      document.title = pageTitle() + ' - Fin Lab - Lobby';
    }
    window.addEventListener('hashchange', route);

    load();
  }

  var api = { DEFAULTS: DEFAULTS, INDEX_FILE: INDEX_FILE, PAGE_SIZE: PAGE_SIZE, PDFJS: PDFJS, parseName: parseName, kindOf: kindOf,
    groupPosts: groupPosts, postItems: postItems, defaultItem: defaultItem, indexMeta: indexMeta, parsePicksText: parsePicksText,
    renderMarkdown: renderMarkdown, inline: inline, scanLinks: scanLinks, repoPathCandidates: repoPathCandidates, normPath: normPath,
    escapeHtml: escapeHtml, safeUrl: safeUrl, fmtBytes: fmtBytes, fmtDate: fmtDate, fmtPeriod: fmtPeriod, fmtShort: fmtShort,
    typeOf: typeOf, mimeOf: mimeOf, toIsoDate: toIsoDate, GitHub: GitHub, explainError: explainError, startPage: startPage };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FixCBoard = api;
  if (typeof document !== 'undefined' && document.getElementById && typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (document.getElementById('post-list')) startPage(); });
    else if (document.getElementById('post-list')) startPage();
  }
})(typeof window !== 'undefined' ? window : null);
