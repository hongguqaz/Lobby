/* FixC Report board - Fin Lab, Lobby.
   Lists the reports the FixC Claude Project commits into the private Drive repository
   (fin-lab/FixC Report/) as a date-ordered board, opens a post to read its body, download its
   attachments and open the material it picks out ("FixC Pick": the originals and renderings a
   report links to elsewhere in the room). The repository is private, so the page reads it through
   the GitHub API with a token kept in this browser (localStorage, the same key Drives Sync uses:
   ds.github.token). Nothing is copied into Lobby: every read goes to api.github.com.

   File names are whatever FixC produces. The board shows them as they come: a date found in the
   name ("(261011)", "2026-10-11", "20261011", "261011", a period "(261006-261010)") orders the post;
   without one, the day the file entered the repository is used, read from the Fin Desk's board index
   (<folder>/.fin-desk/board.json), which also carries each report's picks. Files that share a name
   (extension aside), a "<name>.assets/" folder and a "<name>/" folder form one post.

   The pure helpers (parseName, groupPosts, renderMarkdown, ...) are exported for Node tests
   (fin-lab/reports/test-board.mjs); the page code runs only in a browser. */
(function (root) {
  'use strict';

  var DEFAULTS = { owner: 'hongguqaz', repo: 'Drive', branch: '', path: 'fin-lab/FixC Report' };
  var INDEX_FILE = '.fin-desk/board.json';
  var LS = { token: 'ds.github.token', config: 'fixc-report.config' };
  var GITHUB_API = 'https://api.github.com';
  var IGNORED_NAMES = { 'README.md': 1, '.gitkeep': 1, '.DS_Store': 1, 'Thumbs.db': 1 };
  var MAX_DEPTH = 3;
  var RECENT_PICK_POSTS = 3, RECENT_PICK_MAX = 9;

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

  /** Parse one file name (or a post stem). Returns { date, dateEnd, title, ext, stem, kind, dated } where
      kind is 'weekly' (a period or the word), 'monthly' (the word), 'daily' (one date) or 'undated'.
      The title is the name without its extension; a date written at the start is taken off it, a date
      elsewhere is left in place so the name shows as it came. */
  function parseName(name) {
    var se = splitExt(name), stem = se.stem;
    var date = null, dateEnd = null, title = stem;
    var m = RE_PREFIX.exec(stem);
    if (m && toIsoDate(m[1])) {
      date = toIsoDate(m[1]); dateEnd = m[2] ? toIsoDate(m[2]) : null;
      title = stem.slice(m[0].length).replace(/^[\s_.\-:,)\]]+/, '');
    } else {
      RE_ANYWHERE.lastIndex = 0;
      var a;
      while ((a = RE_ANYWHERE.exec(stem))) {
        if (toIsoDate(a[1])) { date = toIsoDate(a[1]); dateEnd = a[2] ? toIsoDate(a[2]) : null; break; }
      }
    }
    title = title.replace(/[\s_.\-]+$/, '') || stem;
    return { date: date, dateEnd: dateEnd, title: title, ext: se.ext, stem: stem, kind: kindOf(title, date, dateEnd), dated: !!date };
  }

  function kindOf(title, date, dateEnd) {
    if (dateEnd && date && dateEnd !== date) return 'weekly';
    if (/월간|monthly/i.test(title)) return 'monthly';
    if (/주간|weekly/i.test(title)) return 'weekly';
    return date ? 'daily' : 'undated';
  }
  var KIND_LABEL = { daily: '일간', weekly: '주간', monthly: '월간', undated: '' };

  /* ------------------------------------------------------------------ posts */

  var BODY_EXT = { md: 1, markdown: 1, html: 1, htm: 1, txt: 1 };
  var EXT_ORDER = ['md', 'markdown', 'html', 'htm', 'txt', 'pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];

  /** Group the files of the report folder into posts.
      files: [{ path, name, size, sha }] - paths relative to the report folder.
      meta:  the Fin Desk board index as { byPath: { path: record } } or null; a record carries the
             file's registered day, its heading and its picks.
      A post is every file that shares a stem (name without extension), everything under
      "<stem>.assets/" and everything under a first-level folder "<stem>/". Newest first. */
  function groupPosts(files, meta) {
    var byPath = (meta && meta.byPath) || {};
    var posts = {}, order = [];
    files.forEach(function (f) {
      if (IGNORED_NAMES[f.name] || f.path.split('/').some(function (seg) { return seg.charAt(0) === '.'; })) return;
      var parts = f.path.split('/');
      var stem, role, inAssets = false;
      if (parts.length > 1) {
        inAssets = /\.assets$/i.test(parts[parts.length - 2]);
        stem = parts[0].replace(/\.assets$/i, '');
        role = inAssets ? 'asset' : (BODY_EXT[splitExt(f.name).ext] ? 'body' : 'attachment');
      } else {
        stem = splitExt(f.name).stem;
        role = BODY_EXT[splitExt(f.name).ext] ? 'body' : 'attachment';
      }
      var key = stem.toLowerCase();
      if (!posts[key]) {
        var p = parseName(stem);
        posts[key] = { id: key, stem: stem, title: p.title, date: p.date, dateEnd: p.dateEnd, dated: p.dated,
          files: [], size: 0, body: null, picks: [], heading: null, registered: null, indexed: false };
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
      post.kind = kindOf(post.title, post.date, post.dateEnd);
      post.sortDate = post.dateEnd || post.date;                            // a period files under its last day
      return post;
    });
    list.sort(function (a, b) {
      var da = a.sortDate || '0000', db = b.sortDate || '0000';
      if (da !== db) return da < db ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
    return list;
  }

  function rank(e) { var i = EXT_ORDER.indexOf(e.ext); return (e.role === 'body' ? 0 : 100) + (i < 0 ? 50 : i); }

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

  /** A viewable thing: { repoPath, name, ext, type, size }. */
  function refOf(repoPath, size, extra) {
    var name = basename(repoPath), ext = splitExt(name).ext;
    var r = { repoPath: repoPath, name: name, ext: ext, type: typeOf(ext), size: size || 0 };
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
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
    return fmtDate(post.date, true) + (post.dated ? '' : ' · 등록일');
  }
  function fmtMonth(iso) { return iso ? iso.slice(0, 4) + '년 ' + (+iso.slice(5, 7)) + '월' : '날짜 없음'; }
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
    // protect code spans first
    text = text.replace(/`([^`\n]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    // links and images -> placeholders holding finished HTML
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
    // bare URLs
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
      images, lists (nested by indent), blockquotes, fenced code, GFM tables, rules. Output is
      escaped; only http(s)/mailto/relative URLs survive. */
  function renderMarkdown(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
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
    // a path written as INDEX.md prints it ("fin-lab/...") means that path first; otherwise it is relative to the report
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
  GitHub.prototype.webUrl = function (relPath, ref) { return this.webUrlAt(this.rootPath + (relPath ? '/' + relPath : ''), ref); };
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
    var state = { cfg: readConfig(), token: readToken(), posts: [], meta: null, ref: null, loadedAt: null, error: null,
      filter: '', kind: 'all', urls: [], current: null, viewing: null };
    var gh = null;

    var views = { list: $('view-list'), post: $('view-post'), settings: $('settings') };
    var listEl = $('post-list'), statusEl = $('status'), noteEl = $('note');

    function setStatus(text, tone) { statusEl.textContent = text; statusEl.className = 'status' + (tone ? ' ' + tone : ''); }
    function note(html, tone) { noteEl.innerHTML = html || ''; noteEl.className = 'note' + (tone ? ' ' + tone : ''); noteEl.hidden = !html; }
    function revokeAll() { state.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); state.urls = []; }
    function objectUrl(blob) { var u = URL.createObjectURL(blob); state.urls.push(u); return u; }
    function statusCount() { return state.posts.length + '건' + (state.meta && state.meta.count ? ' · 색인 ' + state.meta.count : ' · 색인 없음') + ' · ' + fmtTime(state.loadedAt || new Date()); }
    function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' 기준'; }

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
        return probe.listFolder().then(function (r) {
          return probe.boardIndex().then(function (idx) {
            out.textContent = '✓ ' + u.login + ' 으로 로그인. 보고서 폴더에 파일 ' + r.files.length + '개 (브랜치 ' + r.ref + '), 열람대 색인 ' + (idx ? indexMeta(idx).count + '건' : '없음') + '.';
          });
        });
      }).catch(function (err) { out.textContent = '✗ ' + explainError(err, probe.cfg); });
    });

    // toolbar
    $('search').addEventListener('input', function (e) { state.filter = e.target.value.trim().toLowerCase(); renderList(); });
    $('kind').addEventListener('change', function (e) { state.kind = e.target.value; renderList(); });
    $('btn-refresh').addEventListener('click', function () { load(); });
    $('btn-back').addEventListener('click', function (e) { e.preventDefault(); location.hash = ''; });
    $('btn-body').addEventListener('click', function () {
      if (!state.current) return;
      var post = state.current;
      var first = post.body || post.attachments.filter(function (f) { return f.type !== 'binary'; })[0];
      setHash(post, null);
      if (first) preview(post, fileRef(first)); else emptyBody(post);
    });

    function client() {
      if (!gh) gh = new GitHub(state.token, state.cfg);
      return gh;
    }
    function fileRef(f) { return refOf(client().rootPath + '/' + f.path, f.size, { file: f }); }
    function pickRef(pk) { return refOf(pk.path, pk.bytes || 0, { pick: pk }); }

    function load() {
      $('repo-label').textContent = state.cfg.owner + '/' + state.cfg.repo + ' · ' + state.cfg.path;
      if (!state.token) {
        state.posts = []; state.meta = null; renderList();
        setStatus('토큰 없음', 'warn');
        note('이 게시판은 비공개 저장소 <code>' + escapeHtml(state.cfg.owner + '/' + state.cfg.repo) + '</code> 를 직접 읽습니다. ⚙ 설정에 GitHub 토큰(fine-grained, 이 저장소의 <b>Contents: Read</b>)을 한 번 넣어 두세요. Drives Sync 에 넣은 토큰이 있으면 그대로 쓰입니다.', 'warn');
        toggleSettings(true);
        return Promise.resolve();
      }
      setStatus('불러오는 중…');
      note('');
      listEl.setAttribute('aria-busy', 'true');
      var c = client();
      return Promise.all([c.listFolder(), c.boardIndex().catch(function () { return null; })]).then(function (res) {
        var r = res[0];
        state.ref = r.ref; state.meta = indexMeta(res[1]); state.posts = groupPosts(r.files, state.meta);
        state.loadedAt = new Date(); state.error = null;
        setStatus(statusCount());
        if (!state.posts.length) note('아직 보고서가 없습니다. FixC 가 <code>' + escapeHtml(state.cfg.path) + '/</code> 에 파일을 커밋하면 여기에 실립니다.');
        renderList();
        route();
      }).catch(function (err) {
        state.error = err; state.posts = []; renderList();
        setStatus('오류', 'bad');
        note(escapeHtml(explainError(err, state.cfg)), 'bad');
        if (err.status === 401) toggleSettings(true);
      }).then(function () { listEl.removeAttribute('aria-busy'); });
    }

    function visiblePosts() {
      return state.posts.filter(function (p) {
        if (state.kind === 'picks') { if (!p.picks.length) return false; }
        else if (state.kind !== 'all' && p.kind !== state.kind) return false;
        if (!state.filter) return true;
        var hay = (p.title + ' ' + (p.heading || '') + ' ' + (p.date || '') + ' ' + p.files.map(function (f) { return f.name; }).join(' ') + ' ' +
          p.picks.map(function (k) { return (k.text || '') + ' ' + (k.title || '') + ' ' + basename(k.path); }).join(' ')).toLowerCase();
        return state.filter.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
      });
    }

    function renderList() {
      listEl.replaceChildren();
      renderRecentPicks();
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
          el('span', { class: 'kind ' + p.kind, text: KIND_LABEL[p.kind] || '기타' }),
          el('span', { class: 'title' }, [p.title, p.picks.length ? el('span', { class: 'pick-badge', text: '픽 ' + p.picks.length }) : null]),
          el('span', { class: 'meta', text: (p.body ? TYPE_LABEL[p.body.type] : (p.attachments[0] ? p.attachments[0].ext.toUpperCase() : '')) + (attach > 1 ? ' · 첨부 ' + attach : '') + (p.size ? ' · ' + fmtBytes(p.size) : '') })
        ]);
        group.appendChild(el('li', null, [link]));
      });
    }

    /** The picks of the newest posts, on the list page, so an original is one click away. */
    function renderRecentPicks() {
      var box = $('recent-picks'), ul = $('recent-picks-list');
      ul.replaceChildren();
      var rows = [], seenPosts = 0;
      for (var i = 0; i < state.posts.length && seenPosts < RECENT_PICK_POSTS && rows.length < RECENT_PICK_MAX; i++) {
        var p = state.posts[i];
        if (!p.picks.length) continue;
        seenPosts++;
        p.picks.forEach(function (pk) { if (rows.length < RECENT_PICK_MAX) rows.push({ post: p, pick: pk }); });
      }
      box.hidden = !rows.length;
      rows.forEach(function (r) { ul.appendChild(pickRow(r.post, r.pick, true)); });
    }

    function pickRow(post, pk, withPost) {
      var ref = pickRef(pk);
      var missing = pk.exists === false;
      var label = pk.text && pk.text !== basename(pk.path) ? pk.text : (pk.title || basename(pk.path));
      var metaBits = [];
      if (pk.institution) metaBits.push(pk.institution);
      if (pk.publication_date) metaBits.push('발간 ' + fmtPub(pk.publication_date));
      if (pk.bytes) metaBits.push(fmtBytes(pk.bytes));
      if (pk.path !== label) metaBits.push(pk.path);
      var buttons = [];
      if (!missing && ref.type !== 'binary') buttons.push(el('button', { type: 'button', class: 'btn', text: '원문 보기', onclick: function () { openPick(post, pk); } }));
      if (!missing) buttons.push(el('button', { type: 'button', class: 'btn ghost', text: '내려받기', onclick: function () { download(ref); } }));
      if (pk.rendering) buttons.push(el('button', { type: 'button', class: 'btn ghost', text: '판독본', onclick: function () { openPick(post, pk, true); } }));
      buttons.push(el('a', { class: 'btn ghost', href: client().webUrlAt(pk.path, state.ref || state.cfg.branch || 'main'), target: '_blank', rel: 'noopener noreferrer', text: 'GitHub' }));
      return el('li', { class: 'pick' + (missing ? ' missing' : ''), 'data-path': pk.path }, [
        el('div', { class: 'pick-main' }, [
          withPost ? el('a', { class: 'pick-post', href: '#post=' + encodeURIComponent(post.id), text: fmtDate(post.date) + ' · ' + post.title }) : null,
          el('div', { class: 'pick-title' }, [
            el('span', { class: 'ptype', text: missing ? '없음' : (TYPE_LABEL[ref.type] || ref.ext.toUpperCase()) }),
            el('span', { class: 'ptext', text: label })
          ]),
          metaBits.length ? el('div', { class: 'pick-meta', text: metaBits.join(' · ') }) : null,
          pk.note ? el('div', { class: 'pick-note', text: pk.note }) : null,
          missing ? el('div', { class: 'pick-note bad', text: '저장소에 이 경로의 파일이 없습니다. 보고서의 링크를 확인하세요.' }) : null
        ]),
        el('div', { class: 'pick-actions' }, buttons)
      ]);
    }

    function openPick(post, pk, rendering) {
      var path = rendering && pk.rendering ? pk.rendering : pk.path;
      if (state.current !== post) { setHash(post, path); return; }
      setHash(post, path, true);
      preview(post, rendering && pk.rendering ? refOf(pk.rendering, 0, { pick: pk, rendering: true }) : pickRef(pk));
    }

    /** Point the address at a post (and one of its picks). `replace` records it without routing:
        the caller shows the file itself; a plain set fires hashchange and route() does the showing. */
    function setHash(post, pickPath, replace) {
      var h = '#post=' + encodeURIComponent(post.id) + (pickPath ? '&pick=' + encodeURIComponent(pickPath) : '');
      if (location.hash === h) return;
      if (replace && history.replaceState) history.replaceState(null, '', h); else location.hash = h;
    }

    // post view
    function showPost(post, pickPath) {
      var samePost = state.current === post;
      state.current = post;
      views.list.hidden = true; views.post.hidden = false;
      if (!samePost) {
        revokeAll();
        $('post-title').textContent = post.title;
        $('post-heading').textContent = post.heading && post.heading !== post.title ? post.heading : '';
        $('post-heading').hidden = !$('post-heading').textContent;
        $('post-date').textContent = fmtPeriod(post);
        $('post-kind').textContent = KIND_LABEL[post.kind] || '';
        $('post-kind').className = 'kind ' + post.kind;
        document.title = post.title + ' - FixC Report - Lobby';
        var files = $('post-files'); files.replaceChildren();
        post.attachments.forEach(function (f) {
          var ref = fileRef(f);
          files.appendChild(el('li', { class: 'file', 'data-path': ref.repoPath }, [
            el('span', { class: 'fname', text: f.name }),
            el('span', { class: 'fsize', text: fmtBytes(f.size) }),
            el('button', { type: 'button', class: 'btn', text: '내려받기', onclick: function () { download(ref); } }),
            (f.type !== 'binary') ? el('button', { type: 'button', class: 'btn ghost', text: '보기', onclick: function () { setHash(post, null, true); preview(post, ref); } }) : null,
            el('a', { class: 'btn ghost', href: client().webUrl(f.path, state.ref || state.cfg.branch || 'main'), target: '_blank', rel: 'noopener noreferrer', text: 'GitHub' })
          ]));
        });
        if (post.assets.length) files.appendChild(el('li', { class: 'file assets', text: '그림 ' + post.assets.length + '개 (' + fmtBytes(post.assets.reduce(function (s, a) { return s + a.size; }, 0)) + ') 는 본문에 표시됩니다.' }));
        renderPicks(post, post.picks, post.indexed);
        window.scrollTo(0, 0);
      }
      var target = null;
      if (pickPath) {
        var pk = post.picks.filter(function (k) { return k.path === pickPath || k.rendering === pickPath; })[0];
        target = pk ? (pk.rendering === pickPath && pk.path !== pickPath ? refOf(pickPath, 0, { pick: pk, rendering: true }) : pickRef(pk)) : refOf(pickPath, 0, {});
      }
      if (!target) {
        if (samePost && state.viewing && !state.viewing.pick) return;
        var first = post.body || post.attachments.filter(function (f) { return f.type !== 'binary'; })[0];
        target = first ? fileRef(first) : null;
      }
      if (target) preview(post, target); else emptyBody(post);
    }

    function renderPicks(post, picks, fromIndex) {
      var box = $('post-picks'), ul = $('post-picks-list');
      ul.replaceChildren();
      box.hidden = !picks.length;
      $('post-picks-note').textContent = fromIndex ? '' : '열람대 색인이 아직 없어 본문의 링크에서 읽었습니다.';
      picks.forEach(function (pk) { ul.appendChild(pickRow(post, pk, false)); });
    }

    function emptyBody(post) {
      $('post-body').className = 'body';
      $('post-body').replaceChildren(el('p', { class: 'empty', text: '미리볼 수 있는 파일이 없습니다. 위에서 내려받으세요.' }));
      markViewing(post, null);
    }

    function markViewing(post, ref) {
      state.viewing = ref;
      var isBody = !!(ref && ref.file && post.body && ref.file.path === post.body.path);
      var bar = $('viewing');
      bar.hidden = !ref || isBody;
      $('viewing-name').textContent = ref ? (ref.rendering ? '판독본 · ' : (ref.pick ? '원문 · ' : '')) + ref.name : '';
      Array.prototype.forEach.call(document.querySelectorAll('#post-files .file, #post-picks-list .pick'), function (li) {
        li.classList.toggle('current', !!ref && li.getAttribute('data-path') === (ref.rendering && ref.pick ? ref.pick.path : ref.repoPath));
      });
    }

    function download(ref) {
      setStatus('내려받는 중…');
      client().blobAt(ref.repoPath, ref.ext).then(function (blob) {
        var a = el('a', { href: objectUrl(blob), download: ref.name }); document.body.appendChild(a); a.click(); a.remove();
        setStatus(statusCount());
      }).catch(function (err) { err.path = ref.repoPath; note(escapeHtml(explainError(err, state.cfg)), 'bad'); setStatus('오류', 'bad'); });
    }

    function preview(post, ref) {
      var body = $('post-body');
      body.className = 'body';
      body.replaceChildren(el('p', { class: 'empty', text: ref.name + ' 불러오는 중…' }));
      body.setAttribute('aria-busy', 'true');
      markViewing(post, ref);
      var token = {}; state.previewToken = token;
      client().blobAt(ref.repoPath, ref.ext).then(function (blob) {
        if (state.previewToken !== token) return;
        if (ref.type === 'markdown') {
          return blob.text().then(function (text) {
            body.className = 'body prose';
            body.innerHTML = renderMarkdown(text);
            resolveLinks(post, ref, body);
          });
        }
        if (ref.type === 'html') {
          return blob.text().then(function (html) { return inlineHtmlImages(html, dirname(ref.repoPath)); }).then(function (html) {
            var frame = el('iframe', { class: 'frame html', sandbox: '', title: ref.name });
            frame.srcdoc = html;
            body.replaceChildren(frame);
            frame.addEventListener('load', function () { try { frame.style.height = Math.max(600, frame.contentDocument.documentElement.scrollHeight + 24) + 'px'; } catch (e) { frame.style.height = '80vh'; } });
          });
        }
        if (ref.type === 'text') return blob.text().then(function (text) { body.replaceChildren(el('pre', { class: 'plain', text: text })); });
        if (ref.type === 'pdf') { body.replaceChildren(el('iframe', { class: 'frame pdf', src: objectUrl(blob), title: ref.name })); return; }
        if (ref.type === 'image') { body.replaceChildren(el('img', { class: 'picture', src: objectUrl(blob), alt: ref.name })); return; }
        var a = el('a', { href: objectUrl(blob), download: ref.name, class: 'btn', text: ref.name + ' 내려받기' });
        body.replaceChildren(el('p', { class: 'empty' }, ['이 형식은 미리볼 수 없습니다. ', a]));
      }).catch(function (err) {
        if (state.previewToken !== token) return;
        err.path = ref.repoPath;
        body.className = 'body';
        body.replaceChildren(el('p', { class: 'empty bad', text: explainError(err, state.cfg) }));
      }).then(function () { body.removeAttribute('aria-busy'); });
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
        (a pick written as a repository path, a relative path or a GitHub URL). Without a desk index the
        repository links found here become the post's picks. */
    function resolveLinks(post, ref, container) {
      var byName = {};
      post.files.forEach(function (f) { byName[f.path.toLowerCase()] = f; byName[f.name.toLowerCase()] = f; });
      var fileDir = dirname(ref.repoPath);
      function ownFile(target) {
        var r; try { r = decodeURIComponent(target); } catch (e) { r = target; }
        r = r.replace(/^\.\//, '').toLowerCase();
        if (byName[r]) return byName[r];
        var hit = null;
        post.files.forEach(function (f) { if (!hit && f.path.toLowerCase().slice(-r.length) === r) hit = f; });
        return hit || byName[r.split('/').pop()] || null;
      }
      Array.prototype.forEach.call(container.querySelectorAll('img[data-src]'), function (img) {
        var target = img.getAttribute('data-src'), f = ownFile(target);
        var paths = f ? [client().rootPath + '/' + f.path] : repoPathCandidates(target, state.cfg, fileDir);
        if (!paths.length) { img.replaceWith(el('span', { class: 'missing', text: '[그림 없음: ' + target + ']' })); return; }
        firstBlob(paths).then(function (r) { img.src = objectUrl(r.blob); }).catch(function () { img.replaceWith(el('span', { class: 'missing', text: '[그림을 불러오지 못했습니다: ' + target + ']' })); });
      });
      var found = [];
      Array.prototype.forEach.call(container.querySelectorAll('a[data-href], a[href^="https://github.com/"], a[href^="https://raw.githubusercontent.com/"]'), function (a) {
        var target = a.getAttribute('data-href') || a.getAttribute('href');
        var f = a.hasAttribute('data-href') ? ownFile(target) : null;
        if (f) {
          var fr = fileRef(f);
          a.href = '#';
          a.addEventListener('click', function (e) { e.preventDefault(); if (fr.type === 'binary') download(fr); else { setHash(post, null, true); preview(post, fr); } });
          return;
        }
        var paths = repoPathCandidates(target, state.cfg, fileDir);
        if (!paths.length) { if (a.hasAttribute('data-href')) a.removeAttribute('href'); return; }
        var known = post.picks.filter(function (k) { return paths.indexOf(k.path) >= 0; })[0];
        if (known) paths = [known.path].concat(paths.filter(function (c) { return c !== known.path; }));
        a.classList.add('repo-link');
        a.title = paths[0];
        if (!a.hasAttribute('target')) a.href = client().webUrlAt(paths[0], state.ref || state.cfg.branch || 'main');
        if (!known && paths[0].indexOf(client().rootPath + '/') !== 0) found.push({ path: paths[0], text: a.textContent, note: noteAfter(a), candidates: paths });
        a.addEventListener('click', function (e) {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;      // let the browser open GitHub
          e.preventDefault();
          openRepoPaths(post, paths, known || null);
        });
      });
      if (!post.indexed && found.length) {
        found.forEach(function (k) { if (!post.picks.some(function (q) { return q.path === k.path; })) post.picks.push({ path: k.path, text: k.text, note: k.note, candidates: k.candidates }); });
        renderPicks(post, post.picks, false);
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
    function openRepoPaths(post, paths, pk) {
      setStatus('여는 중…');
      firstBlob(paths).then(function (r) {
        setStatus(statusCount());
        var ref = refOf(r.path, r.blob.size, pk ? { pick: pk } : {});
        if (ref.type === 'binary') { var a = el('a', { href: objectUrl(r.blob), download: ref.name }); document.body.appendChild(a); a.click(); a.remove(); return; }
        setHash(post, r.path, true);
        preview(post, ref);
      }).catch(function (err) {
        err.path = paths[0];
        setStatus('오류', 'bad');
        note(escapeHtml(explainError(err, state.cfg)), 'bad');
      });
    }

    function route() {
      var h = location.hash || '';
      var m = /^#post=([^&]+)(?:&pick=(.+))?$/.exec(h);
      if (m) {
        var id = decodeURIComponent(m[1]), pickPath = m[2] ? decodeURIComponent(m[2]) : null;
        var post = state.posts.filter(function (p) { return p.id === id; })[0];
        if (post) { showPost(post, pickPath); return; }
        if (state.posts.length) note('그 글을 찾지 못했습니다: ' + escapeHtml(id), 'warn');
      }
      state.current = null; state.viewing = null;
      revokeAll();
      views.post.hidden = true; views.list.hidden = false;
      document.title = 'FixC Report - Fin Lab - Lobby';
    }
    window.addEventListener('hashchange', route);

    load();
  }

  var api = { DEFAULTS: DEFAULTS, INDEX_FILE: INDEX_FILE, parseName: parseName, groupPosts: groupPosts, indexMeta: indexMeta,
    renderMarkdown: renderMarkdown, inline: inline, scanLinks: scanLinks, repoPathCandidates: repoPathCandidates, normPath: normPath,
    escapeHtml: escapeHtml, safeUrl: safeUrl, fmtBytes: fmtBytes, fmtDate: fmtDate, fmtPeriod: fmtPeriod, fmtMonth: fmtMonth,
    typeOf: typeOf, mimeOf: mimeOf, toIsoDate: toIsoDate, GitHub: GitHub, explainError: explainError, startPage: startPage };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FixCBoard = api;
  if (typeof document !== 'undefined' && document.getElementById && typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (document.getElementById('post-list')) startPage(); });
    else if (document.getElementById('post-list')) startPage();
  }
})(typeof window !== 'undefined' ? window : null);
