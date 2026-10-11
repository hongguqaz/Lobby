/* FixC Report board - Fin Lab, Lobby.
   Lists the reports the FixC Claude Project commits into the private Drive repository
   (fin-lab/FixC Report/) as a date-ordered board, opens a post to read its body and download
   its attachments. The repository is private, so the page reads it through the GitHub API with
   a token kept in this browser (localStorage, the same key Drives Sync uses: ds.github.token).
   Nothing is copied into Lobby: every read goes to api.github.com.

   File-name convention (fin-lab/FixC Report/README.md in Drive):
     (YYMMDD) 제목.md                 daily   -> date + title
     (YYMMDD-YYMMDD) 제목.md          weekly  -> period + title
     (YYMMDD) 제목.assets/figure.png  figures the body refers to
     (YYMMDD) 제목.pdf                same date + title = another attachment of the same post
   Also read: "2026-10-11 제목.md", "20261011_제목.md", "261011 제목.md".

   The pure helpers (parseName, groupPosts, renderMarkdown, ...) are exported for Node tests
   (fin-lab/reports/test-board.mjs); the page code runs only in a browser. */
(function (root) {
  'use strict';

  var DEFAULTS = { owner: 'hongguqaz', repo: 'Drive', branch: '', path: 'fin-lab/FixC Report' };
  var LS = { token: 'ds.github.token', config: 'fixc-report.config' };
  var GITHUB_API = 'https://api.github.com';
  var IGNORED_NAMES = { 'README.md': 1, '.gitkeep': 1, '.DS_Store': 1, 'Thumbs.db': 1 };
  var MAX_DEPTH = 3;

  /* ------------------------------------------------------------------ names and dates */

  // "(YYMMDD)" / "(YYMMDD-YYMMDD)" / "(YYYY-MM-DD)" / bare "YYYY-MM-DD" "YYYYMMDD" "YYMMDD" at the start.
  var RE_PAREN = /^\(\s*(\d{6}|\d{8}|\d{4}-\d{2}-\d{2})(?:\s*[-~–]\s*(\d{6}|\d{8}|\d{4}-\d{2}-\d{2}))?\s*\)\s*(.*)$/;
  var RE_BARE = /^(\d{4}-\d{2}-\d{2}|\d{8}|\d{6})(?:\s*[-~–]\s*(\d{4}-\d{2}-\d{2}|\d{8}|\d{6}))?[\s_.-]+(.*)$/;

  function toIsoDate(s) {
    if (!s) return null;
    var y, m, d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { y = +s.slice(0, 4); m = +s.slice(5, 7); d = +s.slice(8, 10); }
    else if (/^\d{8}$/.test(s)) { y = +s.slice(0, 4); m = +s.slice(4, 6); d = +s.slice(6, 8); }
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

  /** Parse one file name. Returns { date, dateEnd, title, ext, stem, kind } where kind is
      'weekly' (a period), 'daily' (one date) or 'undated'. `stem` is the name without extension. */
  function parseName(name) {
    var se = splitExt(name);
    var m = RE_PAREN.exec(se.stem) || RE_BARE.exec(se.stem);
    var date = m ? toIsoDate(m[1]) : null;
    var dateEnd = m && m[2] ? toIsoDate(m[2]) : null;
    var title = m && date ? m[3].trim() : se.stem;
    if (!date) { dateEnd = null; title = se.stem; }
    title = title.replace(/^[-_.:\s]+/, '').replace(/[-_.\s]+$/, '') || se.stem;
    var kind = !date ? 'undated' : (dateEnd && dateEnd !== date ? 'weekly' : (/주간|weekly/i.test(title) ? 'weekly' : 'daily'));
    return { date: date, dateEnd: dateEnd, title: title, ext: se.ext, stem: se.stem, kind: kind };
  }

  /* ------------------------------------------------------------------ posts */

  var BODY_EXT = { md: 1, markdown: 1, html: 1, htm: 1, txt: 1 };
  var EXT_ORDER = ['md', 'markdown', 'html', 'htm', 'txt', 'pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];

  /** Group the files of the report folder into posts.
      files: [{ path, name, size, sha, download_url? }] - paths relative to the report folder.
      A post is every file whose stem (or whose parent folder, or whose ".assets" folder) shares the
      same "(date) title". Returns posts newest first. */
  function groupPosts(files) {
    var posts = {}, order = [];
    files.forEach(function (f) {
      if (IGNORED_NAMES[f.name] || f.name.charAt(0) === '.') return;
      var parts = f.path.split('/');
      var key, meta, role = 'attachment';
      // "(date) title.assets/figure.png" or "(date) title/anything" -> the post of that folder
      var folder = null;
      for (var i = 0; i < parts.length - 1; i++) {
        var p = parseName(parts[i].replace(/\.assets$/i, ''));
        if (p.date) { folder = parts[i].replace(/\.assets$/i, ''); break; }
      }
      if (folder) {
        meta = parseName(folder); key = postKey(meta);
        var inAssets = /\.assets$/i.test(parts[parts.length - 2] || '');
        var own = parseName(f.name);
        role = inAssets ? 'asset' : (BODY_EXT[own.ext] ? 'body' : 'attachment');
      } else {
        meta = parseName(f.name); key = postKey(meta);
        role = BODY_EXT[meta.ext] ? 'body' : 'attachment';
      }
      if (!posts[key]) {
        posts[key] = { id: key, date: meta.date, dateEnd: meta.dateEnd, title: meta.title, kind: meta.kind, files: [], size: 0, body: null };
        order.push(key);
      }
      var post = posts[key];
      var ext = splitExt(f.name).ext;
      var entry = { path: f.path, name: f.name, size: f.size || 0, sha: f.sha || null, ext: ext, role: role, type: typeOf(ext) };
      post.files.push(entry);
      post.size += entry.size;
    });
    var list = order.map(function (k) {
      var post = posts[k];
      post.files.sort(function (a, b) { return rank(a) - rank(b) || a.path.localeCompare(b.path); });
      var bodies = post.files.filter(function (e) { return e.role === 'body'; });
      post.body = bodies.length ? bodies[0] : null;
      post.attachments = post.files.filter(function (e) { return e.role !== 'asset'; });
      post.assets = post.files.filter(function (e) { return e.role === 'asset'; });
      return post;
    });
    // a weekly report sorts (and is filed under the month) by the last day of its period
    list.forEach(function (p) { p.sortDate = p.dateEnd || p.date; });
    list.sort(function (a, b) {
      var da = a.sortDate || '0000', db = b.sortDate || '0000';
      if (da !== db) return da < db ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
    return list;
  }

  function postKey(meta) { return (meta.date || 'undated') + '|' + (meta.dateEnd || '') + '|' + meta.title.toLowerCase(); }
  function rank(e) { var i = EXT_ORDER.indexOf(e.ext); return (e.role === 'body' ? 0 : 100) + (i < 0 ? 50 : i); }

  function typeOf(ext) {
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'html' || ext === 'htm') return 'html';
    if (ext === 'txt' || ext === 'csv' || ext === 'json' || ext === 'yml' || ext === 'yaml') return 'text';
    if (ext === 'pdf') return 'pdf';
    if (/^(png|jpe?g|webp|gif|svg|bmp|avif)$/.test(ext)) return 'image';
    return 'binary';
  }

  function mimeOf(ext) {
    return { md: 'text/markdown', markdown: 'text/markdown', html: 'text/html', htm: 'text/html', txt: 'text/plain', csv: 'text/csv',
      json: 'application/json', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
      gif: 'image/gif', svg: 'image/svg+xml', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }[ext] || 'application/octet-stream';
  }

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
    return fmtDate(post.date, true);
  }
  function fmtMonth(iso) { return iso ? iso.slice(0, 4) + '년 ' + (+iso.slice(5, 7)) + '월' : '날짜 없음'; }
  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /* ------------------------------------------------------------------ markdown (small, safe) */

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^(https?:|mailto:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;        // javascript:, data:, vbscript: ...
    return u;                                                 // relative: resolved against the post's files
  }

  function inline(text) {
    var out = '', i = 0, codes = [];
    // protect code spans first
    text = text.replace(/`([^`\n]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    text = escapeHtml(text);
    // images ![alt](src)
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (_, alt, src) {
      var u = safeUrl(src); if (!u) return escapeHtml(alt);
      return '<img alt="' + alt + '" data-src="' + escapeHtml(u) + '">';
    });
    // links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (_, t, href) {
      var u = safeUrl(href); if (!u) return t;
      var ext = /^(https?:|mailto:)/i.test(u) ? ' target="_blank" rel="noopener noreferrer"' : ' data-href="' + escapeHtml(u) + '"';
      return '<a href="' + escapeHtml(u) + '"' + ext + '>' + t + '</a>';
    });
    // bare URLs
    text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, function (_, pre, url) {
      return pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
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
      images, lists (nested by indent), blockquotes, fenced code, GFM tables, rules. Output is
      escaped; only http(s)/mailto/relative URLs survive. */
  function renderMarkdown(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [], i = 0, para = [];
    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }

    while (i < lines.length) {
      var line = lines[i];
      // fenced code
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
      // setext headings
      if (para.length && /^\s*=+\s*$/.test(line)) { out.push('<h1>' + inline(para.join(' ')) + '</h1>'); para = []; i++; continue; }
      if (para.length && /^\s*-+\s*$/.test(line) && para.length === 1) { out.push('<h2>' + inline(para.join(' ')) + '</h2>'); para = []; i++; continue; }
      // table
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
      // blockquote
      if (/^\s*>/.test(line)) {
        flushPara();
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote>' + renderMarkdown(q.join('\n')) + '</blockquote>');
        continue;
      }
      // lists
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        flushPara();
        var items = [];
        while (i < lines.length && lines[i].trim()) {
          var lm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
          if (lm) { items.push({ indent: lm[1].replace(/\t/g, '    ').length, ordered: /\d/.test(lm[2]), text: lm[3] }); i++; }
          else if (items.length && /^\s{2,}/.test(lines[i])) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; }
          else break;
        }
        out.push(renderList(items, 0, items[0].indent));
        continue;
      }
      para.push(line.trim());
      i++;
    }
    flushPara();
    return out.join('\n');
  }

  function renderList(items, start, indent) {
    var tag = items[start].ordered ? 'ol' : 'ul', html = '<' + tag + '>', k = start;
    while (k < items.length && items[k].indent >= indent) {
      if (items[k].indent > indent) {           // a nested list belongs to the previous item
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

  /* ------------------------------------------------------------------ GitHub (browser) */

  function GitHub(token, cfg) { this.token = token; this.cfg = cfg; this.defaultBranch = null; }
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
  /** Every file under the report folder (depth <= MAX_DEPTH), paths relative to it. */
  GitHub.prototype.listFolder = function () {
    var self = this, rootPath = this.cfg.path.replace(/^\/+|\/+$/g, '');
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
  /** The bytes of one file, as a Blob with the right MIME type. */
  GitHub.prototype.blob = function (relPath, ext) {
    var self = this, rootPath = this.cfg.path.replace(/^\/+|\/+$/g, '');
    return this.branch().then(function (ref) {
      return self.fetch(self.contentsUrl(rootPath + '/' + relPath, ref), 'application/vnd.github.raw+json');
    }).then(function (r) { return r.arrayBuffer(); }).then(function (buf) { return new Blob([buf], { type: mimeOf(ext) }); });
  };
  GitHub.prototype.webUrl = function (relPath, ref) {
    var rootPath = this.cfg.path.replace(/^\/+|\/+$/g, '');
    return 'https://github.com/' + this.cfg.owner + '/' + this.cfg.repo + '/blob/' + encodeURIComponent(ref) + '/' +
      (rootPath + (relPath ? '/' + relPath : '')).split('/').map(encodeURIComponent).join('/');
  };
  GitHub.prototype.whoami = function () { return this.fetch(GITHUB_API + '/user').then(function (r) { return r.json(); }); };

  function explainError(err, cfg) {
    if (!err) return '';
    if (err.status === 401) return '토큰이 유효하지 않습니다 (401). ⚙ 설정에서 새 토큰을 넣으세요.';
    if (err.status === 403) return 'GitHub 가 거절했습니다 (403): 토큰에 ' + cfg.owner + '/' + cfg.repo + ' 의 Contents 읽기 권한이 없거나, 요청 한도에 걸렸습니다.';
    if (err.status === 404) return '폴더를 찾지 못했습니다 (404): ' + cfg.owner + '/' + cfg.repo + ' 의 "' + cfg.path + '"' + (cfg.branch ? ' (브랜치 ' + cfg.branch + ')' : '') + ' 가 없거나, 토큰이 이 저장소에 접근할 수 없습니다.';
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
    var state = { cfg: readConfig(), token: readToken(), posts: [], ref: null, loadedAt: null, error: null, filter: '', kind: 'all', urls: [] };
    var gh = null;

    var views = { list: $('view-list'), post: $('view-post'), settings: $('settings') };
    var listEl = $('post-list'), statusEl = $('status'), noteEl = $('note');

    function setStatus(text, tone) { statusEl.textContent = text; statusEl.className = 'status' + (tone ? ' ' + tone : ''); }
    function note(html, tone) { noteEl.innerHTML = html || ''; noteEl.className = 'note' + (tone ? ' ' + tone : ''); noteEl.hidden = !html; }
    function revokeAll() { state.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); state.urls = []; }
    function objectUrl(blob) { var u = URL.createObjectURL(blob); state.urls.push(u); return u; }

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
      gh = null;
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
        return probe.listFolder().then(function (r) { out.textContent = '✓ ' + u.login + ' 으로 로그인. 보고서 폴더에 파일 ' + r.files.length + '개 (브랜치 ' + r.ref + ').'; });
      }).catch(function (err) { out.textContent = '✗ ' + explainError(err, probe.cfg); });
    });

    // toolbar
    $('search').addEventListener('input', function (e) { state.filter = e.target.value.trim().toLowerCase(); renderList(); });
    $('kind').addEventListener('change', function (e) { state.kind = e.target.value; renderList(); });
    $('btn-refresh').addEventListener('click', function () { load(); });
    $('btn-back').addEventListener('click', function (e) { e.preventDefault(); location.hash = ''; });

    function client() {
      if (!gh) gh = new GitHub(state.token, state.cfg);
      return gh;
    }

    function load() {
      $('repo-label').textContent = state.cfg.owner + '/' + state.cfg.repo + ' · ' + state.cfg.path;
      if (!state.token) {
        state.posts = []; renderList();
        setStatus('토큰 없음', 'warn');
        note('이 게시판은 비공개 저장소 <code>' + escapeHtml(state.cfg.owner + '/' + state.cfg.repo) + '</code> 를 직접 읽습니다. ⚙ 설정에 GitHub 토큰(fine-grained, 이 저장소의 <b>Contents: Read</b>)을 한 번 넣어 두세요. Drives Sync 에 넣은 토큰이 있으면 그대로 쓰입니다.', 'warn');
        toggleSettings(true);
        return Promise.resolve();
      }
      setStatus('불러오는 중…');
      note('');
      listEl.setAttribute('aria-busy', 'true');
      return client().listFolder().then(function (r) {
        state.ref = r.ref; state.posts = groupPosts(r.files); state.loadedAt = new Date(); state.error = null;
        setStatus(state.posts.length + '건 · ' + fmtTime(state.loadedAt));
        if (!state.posts.length) note('아직 보고서가 없습니다. FixC 가 <code>' + escapeHtml(state.cfg.path) + '/(YYMMDD) 제목.md</code> 로 커밋하면 여기에 실립니다.');
        renderList();
        route();
      }).catch(function (err) {
        state.error = err; state.posts = []; renderList();
        setStatus('오류', 'bad');
        note(escapeHtml(explainError(err, state.cfg)), 'bad');
        if (err.status === 401) toggleSettings(true);
      }).then(function () { listEl.removeAttribute('aria-busy'); });
    }
    function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' 기준'; }

    function visiblePosts() {
      return state.posts.filter(function (p) {
        if (state.kind !== 'all' && p.kind !== state.kind) return false;
        if (!state.filter) return true;
        var hay = (p.title + ' ' + (p.date || '') + ' ' + p.files.map(function (f) { return f.name; }).join(' ')).toLowerCase();
        return state.filter.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
      });
    }

    function renderList() {
      listEl.replaceChildren();
      var posts = visiblePosts();
      $('count').textContent = state.posts.length ? (posts.length === state.posts.length ? posts.length + '건' : posts.length + ' / ' + state.posts.length + '건') : '';
      if (!posts.length) {
        if (state.posts.length) listEl.appendChild(el('p', { class: 'empty', text: '조건에 맞는 글이 없습니다.' }));
        return;
      }
      var month = null, group = null, n = posts.length;
      posts.forEach(function (p) {
        var m = fmtMonth(p.sortDate);
        if (m !== month) {
          month = m;
          listEl.appendChild(el('h2', { class: 'month', text: m }));
          group = el('ol', { class: 'posts' });
          listEl.appendChild(group);
        }
        var attach = p.attachments.length;
        var link = el('a', { class: 'post', href: '#post=' + encodeURIComponent(p.id) }, [
          el('span', { class: 'no', text: String(n--) }),
          el('span', { class: 'date', text: p.dateEnd && p.dateEnd !== p.date ? fmtDate(p.date) + '~' + fmtDate(p.dateEnd).slice(5) : fmtDate(p.date) }),
          el('span', { class: 'kind ' + p.kind, text: p.kind === 'weekly' ? '주간' : (p.kind === 'daily' ? '일간' : '기타') }),
          el('span', { class: 'title', text: p.title }),
          el('span', { class: 'meta', text: (p.body ? p.body.ext.toUpperCase() : '') + (attach > 1 ? ' · 첨부 ' + attach : '') + (p.size ? ' · ' + fmtBytes(p.size) : '') })
        ]);
        group.appendChild(el('li', null, [link]));
      });
    }

    // post view
    function showPost(post) {
      revokeAll();
      views.list.hidden = true; views.post.hidden = false;
      $('post-title').textContent = post.title;
      $('post-date').textContent = fmtPeriod(post);
      $('post-kind').textContent = post.kind === 'weekly' ? '주간' : (post.kind === 'daily' ? '일간' : '');
      $('post-kind').className = 'kind ' + post.kind;
      document.title = post.title + ' - FixC Report - Lobby';
      var files = $('post-files'); files.replaceChildren();
      post.attachments.forEach(function (f) {
        var row = el('li', { class: 'file' }, [
          el('span', { class: 'fname', text: f.name }),
          el('span', { class: 'fsize', text: fmtBytes(f.size) }),
          el('button', { type: 'button', class: 'btn', text: '내려받기', onclick: function () { download(f); } }),
          (f.type !== 'binary') ? el('button', { type: 'button', class: 'btn ghost', text: '보기', onclick: function () { preview(post, f); } }) : null,
          el('a', { class: 'btn ghost', href: client().webUrl(f.path, state.ref || state.cfg.branch || 'main'), target: '_blank', rel: 'noopener noreferrer', text: 'GitHub' })
        ]);
        files.appendChild(row);
      });
      if (post.assets.length) files.appendChild(el('li', { class: 'file assets', text: '그림 ' + post.assets.length + '개 (' + fmtBytes(post.assets.reduce(function (s, a) { return s + a.size; }, 0)) + ') 는 본문에 표시됩니다.' }));
      var first = post.body || post.attachments.filter(function (f) { return f.type !== 'binary'; })[0];
      if (first) preview(post, first);
      else $('post-body').replaceChildren(el('p', { class: 'empty', text: '미리볼 수 있는 파일이 없습니다. 위에서 내려받으세요.' }));
      window.scrollTo(0, 0);
    }

    function download(f) {
      setStatus('내려받는 중…');
      client().blob(f.path, f.ext).then(function (blob) {
        var a = el('a', { href: objectUrl(blob), download: f.name }); document.body.appendChild(a); a.click(); a.remove();
        setStatus(state.posts.length + '건 · ' + fmtTime(state.loadedAt || new Date()));
      }).catch(function (err) { note(escapeHtml(explainError(err, state.cfg)), 'bad'); setStatus('오류', 'bad'); });
    }

    function preview(post, f) {
      var body = $('post-body');
      body.replaceChildren(el('p', { class: 'empty', text: f.name + ' 불러오는 중…' }));
      body.setAttribute('aria-busy', 'true');
      Array.prototype.forEach.call($('post-files').querySelectorAll('.file'), function (li) { li.classList.toggle('current', li.firstChild && li.firstChild.textContent === f.name); });
      client().blob(f.path, f.ext).then(function (blob) {
        if (f.type === 'markdown') {
          return blob.text().then(function (text) {
            body.className = 'body prose';
            body.innerHTML = renderMarkdown(text);
            resolveRelative(post, body);
          });
        }
        if (f.type === 'html') {
          body.className = 'body';
          return blob.text().then(function (html) {
            var frame = el('iframe', { class: 'frame html', sandbox: '', title: f.name });
            frame.srcdoc = html;
            body.replaceChildren(frame);
            frame.addEventListener('load', function () { try { frame.style.height = Math.max(600, frame.contentDocument.documentElement.scrollHeight + 24) + 'px'; } catch (e) { frame.style.height = '80vh'; } });
          });
        }
        if (f.type === 'text') {
          body.className = 'body';
          return blob.text().then(function (text) { body.replaceChildren(el('pre', { class: 'plain', text: text })); });
        }
        if (f.type === 'pdf') {
          body.className = 'body';
          body.replaceChildren(el('iframe', { class: 'frame pdf', src: objectUrl(blob), title: f.name }));
          return;
        }
        if (f.type === 'image') {
          body.className = 'body';
          body.replaceChildren(el('img', { class: 'picture', src: objectUrl(blob), alt: f.name }));
        }
      }).catch(function (err) {
        body.className = 'body';
        body.replaceChildren(el('p', { class: 'empty bad', text: explainError(err, state.cfg) }));
      }).then(function () { body.removeAttribute('aria-busy'); });
    }

    /** Relative images and links in a Markdown body point at the post's own files. */
    function resolveRelative(post, container) {
      var byName = {};
      post.files.forEach(function (f) { byName[f.path.toLowerCase()] = f; byName[f.name.toLowerCase()] = f; });
      function find(ref) {
        var r = decodeURIComponent(ref).replace(/^\.\//, '').toLowerCase();
        if (byName[r]) return byName[r];
        var tail = r.split('/').pop();
        var hit = null;
        post.files.forEach(function (f) { if (!hit && f.path.toLowerCase().slice(-r.length) === r) hit = f; });
        if (!hit && byName[tail]) hit = byName[tail];
        return hit;
      }
      Array.prototype.forEach.call(container.querySelectorAll('img[data-src]'), function (img) {
        var f = find(img.getAttribute('data-src'));
        if (!f) { img.replaceWith(el('span', { class: 'missing', text: '[그림 없음: ' + img.getAttribute('data-src') + ']' })); return; }
        client().blob(f.path, f.ext).then(function (blob) { img.src = objectUrl(blob); }).catch(function () { img.alt = '[그림을 불러오지 못했습니다]'; });
      });
      Array.prototype.forEach.call(container.querySelectorAll('a[data-href]'), function (a) {
        var f = find(a.getAttribute('data-href'));
        if (f) { a.href = '#'; a.addEventListener('click', function (e) { e.preventDefault(); download(f); }); }
        else a.removeAttribute('href');
      });
    }

    function route() {
      var m = /^#post=(.+)$/.exec(location.hash || '');
      if (m) {
        var id = decodeURIComponent(m[1]);
        var post = state.posts.filter(function (p) { return p.id === id; })[0];
        if (post) { showPost(post); return; }
        if (state.posts.length) note('그 글을 찾지 못했습니다: ' + escapeHtml(id.split('|').pop()), 'warn');
      }
      revokeAll();
      views.post.hidden = true; views.list.hidden = false;
      document.title = 'FixC Report - Fin Lab - Lobby';
    }
    window.addEventListener('hashchange', route);

    load();
  }

  var api = { DEFAULTS: DEFAULTS, parseName: parseName, groupPosts: groupPosts, renderMarkdown: renderMarkdown, inline: inline,
    escapeHtml: escapeHtml, safeUrl: safeUrl, fmtBytes: fmtBytes, fmtDate: fmtDate, fmtPeriod: fmtPeriod, fmtMonth: fmtMonth,
    typeOf: typeOf, mimeOf: mimeOf, toIsoDate: toIsoDate, GitHub: GitHub, explainError: explainError, startPage: startPage };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FixCBoard = api;
  if (typeof document !== 'undefined' && document.getElementById && typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (document.getElementById('post-list')) startPage(); });
    else if (document.getElementById('post-list')) startPage();
  }
})(typeof window !== 'undefined' ? window : null);
