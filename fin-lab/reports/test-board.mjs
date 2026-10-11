/* FixC Report board - tests for the pure helpers (names, grouping, Markdown, repository paths).
   Run: node fin-lab/reports/test-board.mjs   (from the Lobby repository root, Node 18+) */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const B = require('./board.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name); console.log(e.stack || e); process.exitCode = 1; }
}

console.log('FixC Report board tests');

test('parseName: a date at the start is taken off the title', () => {
  let p = B.parseName('(261011) 금리 상승 재료 점검.md');
  assert.deepEqual([p.date, p.dateEnd, p.title, p.ext, p.kind, p.dated], ['2026-10-11', null, '금리 상승 재료 점검', 'md', 'daily', true]);
  p = B.parseName('2026-10-11 KOSPI 리스크 점검.html');
  assert.deepEqual([p.date, p.title, p.ext], ['2026-10-11', 'KOSPI 리스크 점검', 'html']);
  p = B.parseName('20261011_daily_report.pdf');
  assert.deepEqual([p.date, p.title], ['2026-10-11', 'daily_report']);
  p = B.parseName('[2026.10.11] 시황.md');
  assert.deepEqual([p.date, p.title], ['2026-10-11', '시황']);
});

test('parseName: a period or the words 주간/weekly/월간 set the kind', () => {
  let p = B.parseName('(261006-261010) 주간 시황 - 성장과 금리.md');
  assert.deepEqual([p.date, p.dateEnd, p.kind, p.title], ['2026-10-06', '2026-10-10', 'weekly', '주간 시황 - 성장과 금리']);
  assert.equal(B.parseName('261011 Weekly wrap.md').kind, 'weekly');
  assert.equal(B.parseName('2026-10 월간 전망 20261001.md').kind, 'monthly');
});

test('parseName: a date elsewhere in the name dates the post but leaves the name as it came', () => {
  let p = B.parseName('FixC_Daily_Report_2026-10-11.md');
  assert.deepEqual([p.date, p.title, p.dated], ['2026-10-11', 'FixC_Daily_Report_2026-10-11', true]);
  p = B.parseName('FixC 시황 261011 v2.md');
  assert.deepEqual([p.date, p.title], ['2026-10-11', 'FixC 시황 261011 v2']);
  p = B.parseName('FixC_0226_daily_report.pdf');                 // 4 digits are not a date
  assert.deepEqual([p.date, p.kind, p.title], [null, 'undated', 'FixC_0226_daily_report']);
  p = B.parseName('report 3200pt 123456789.md');                   // a 9-digit number is not a date
  assert.equal(p.date, null);
  assert.equal(B.parseName('(261399) 제목.md').date, null);         // impossible dates are not dates
});

test('groupPosts: files with one stem form a post; .assets and sub-folders join it; README ignored', () => {
  const posts = B.groupPosts([
    { path: 'README.md', name: 'README.md', size: 10 },
    { path: '(261011) 금리 점검.md', name: '(261011) 금리 점검.md', size: 3000, sha: 'a' },
    { path: '(261011) 금리 점검.pdf', name: '(261011) 금리 점검.pdf', size: 90000, sha: 'b' },
    { path: '(261011) 금리 점검.assets/chart1.png', name: 'chart1.png', size: 40000, sha: 'c' },
    { path: '(261006-261010) 주간 시황/(261006-261010) 주간 시황.md', name: '(261006-261010) 주간 시황.md', size: 5000 },
    { path: '(261006-261010) 주간 시황/data.xlsx', name: 'data.xlsx', size: 7000 },
    { path: '(261009) 전날 글.md', name: '(261009) 전날 글.md', size: 1000 },
    { path: '.fin-desk/board.json', name: 'board.json', size: 100 },
    { path: '.gitkeep', name: '.gitkeep', size: 0 },
  ], null);
  assert.equal(posts.length, 3);
  assert.deepEqual(posts.map((p) => p.title), ['금리 점검', '주간 시황', '전날 글']);   // newest first; the weekly by its last day (10-10)
  const first = posts[0];
  assert.equal(first.body.name, '(261011) 금리 점검.md');
  assert.deepEqual(first.attachments.map((f) => f.ext), ['md', 'pdf']);
  assert.equal(first.assets.length, 1);
  assert.equal(first.size, 3000 + 90000 + 40000);
  const weekly = posts[1];
  assert.equal(weekly.kind, 'weekly');
  assert.deepEqual(weekly.attachments.map((f) => f.name), ['(261006-261010) 주간 시황.md', 'data.xlsx']);
  assert.equal(weekly.attachments[1].type, 'binary');
  assert.ok(posts.every((p) => p.indexed === false && p.picks.length === 0));
});

test('groupPosts: the desk index dates undated names, carries picks and the heading', () => {
  const meta = B.indexMeta({ generator: 'Fin Desk 1.0.0', files: [
    { path: 'FixC_Daily_Report.md', bytes: 500, registered: '2026-10-09', heading: '10월 9일 시황',
      picks: [{ path: 'fin-lab/Fin Docraw/Bond&Macro/x.pdf', text: 'KB Bond', note: '이유', exists: true, kind: 'pdf', bytes: 1000, rendering: 'fin-lab/Fin Docai/Bond&Macro/x.html' }] },
    { path: 'FixC_Daily_Report.pdf', bytes: 9000, registered: '2026-10-10',
      picks: [{ path: 'fin-lab/Fin Docraw/Bond&Macro/x.pdf', text: 'dup', exists: true }, { path: 'fin-lab/Fin Docai/Stock/y.html', text: 'Y', exists: true, kind: 'text' }] },
    { path: '(261011) 금리 점검.md', bytes: 100, registered: '2026-10-11' },
  ] });
  assert.equal(meta.count, 3);
  const posts = B.groupPosts([
    { path: 'FixC_Daily_Report.md', name: 'FixC_Daily_Report.md', size: 500 },
    { path: 'FixC_Daily_Report.pdf', name: 'FixC_Daily_Report.pdf', size: 9000 },
    { path: '(261011) 금리 점검.md', name: '(261011) 금리 점검.md', size: 100 },
    { path: 'loose.md', name: 'loose.md', size: 1 },
  ], meta);
  assert.deepEqual(posts.map((p) => p.title), ['금리 점검', 'FixC_Daily_Report', 'loose']);
  const daily = posts[1];
  assert.deepEqual([daily.date, daily.dated, daily.kind, daily.indexed, daily.heading], ['2026-10-09', false, 'daily', true, '10월 9일 시황']);
  assert.deepEqual(daily.picks.map((k) => k.path), ['fin-lab/Fin Docraw/Bond&Macro/x.pdf', 'fin-lab/Fin Docai/Stock/y.html']);
  assert.equal(daily.picks[0].rendering, 'fin-lab/Fin Docai/Bond&Macro/x.html');
  assert.equal(B.fmtPeriod(daily), '2026.10.09 (금) · 등록일');
  assert.deepEqual([posts[2].date, posts[2].kind, posts[2].sortDate], [null, 'undated', null]);
});

test('renderMarkdown: headings, emphasis, lists, table, code, quote, rule', () => {
  const html = B.renderMarkdown([
    '# 제목', '', '본문 **굵게** 와 *기울임*, `코드`, [링크](https://example.com/x).', '',
    '- 하나', '- 둘', '  - 둘-하나', '', '1. 첫', '2. 둘', '',
    '| 지표 | 값 |', '|---|---:|', '| KOSPI | 3,200 |', '| US10Y | 4.1% |', '',
    '> 인용', '', '---', '', '```python', 'x = 1 < 2', '```',
  ].join('\n'));
  assert.ok(html.includes('<h1>제목</h1>'));
  assert.ok(html.includes('<strong>굵게</strong>') && html.includes('<em>기울임</em>') && html.includes('<code>코드</code>'));
  assert.ok(html.includes('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">링크</a>'));
  assert.ok(html.includes('<ul><li>하나</li><li>둘<ul><li>둘-하나</li></ul></li></ul>'));
  assert.ok(html.includes('<ol><li>첫</li><li>둘</li></ol>'));
  assert.ok(html.includes('<th style="text-align:right">값</th>') && html.includes('<td style="text-align:right">4.1%</td>'));
  assert.ok(html.includes('<blockquote><p>인용</p></blockquote>'));
  assert.ok(html.includes('<hr>'));
  assert.ok(html.includes('<pre><code class="lang-python">x = 1 &lt; 2</code></pre>'));
});

test('renderMarkdown: escapes HTML and drops dangerous URLs', () => {
  const html = B.renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) ![y](data:text/html,oops) <img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('data:'));
  assert.ok(!html.includes('<img src=x'));          // the raw tag survives only as escaped text
});

test('renderMarkdown: link targets may hold spaces and parentheses, as rendering names do', () => {
  const md = '- [(261002) Macro Review (한화투자증권, 최규호)](fin-lab/Fin Docai/Bond&Macro/(261002) Macro Review (한화투자증권, 최규호).html) — 고용 해석이 다름';
  const html = B.renderMarkdown(md);
  assert.ok(html.includes('data-href="fin-lab/Fin Docai/Bond&amp;Macro/(261002) Macro Review (한화투자증권, 최규호).html"'), html);
  assert.ok(html.includes('>(261002) Macro Review (한화투자증권, 최규호)</a> — 고용 해석이 다름'));
  const links = B.scanLinks('see [a b](<path with spaces.pdf> "t") and ![img](x.png) and [c](https://e.com/(x))');
  assert.deepEqual(links.map((l) => [l.image, l.text, l.target]), [[false, 'a b', 'path with spaces.pdf'], [true, 'img', 'x.png'], [false, 'c', 'https://e.com/(x)']]);
  assert.ok(B.renderMarkdown('**[굵은 링크](x.md)**').includes('<strong><a href="x.md" data-href="x.md">굵은 링크</a></strong>'));
});

test('renderMarkdown: relative images and links are marked for resolution against the post files', () => {
  const html = B.renderMarkdown('![차트](%28261011%29%20제목.assets/chart.png) 와 [표](data.xlsx)');
  assert.ok(html.includes('<img alt="차트" data-src="%28261011%29%20제목.assets/chart.png">'));
  assert.ok(html.includes('<a href="data.xlsx" data-href="data.xlsx">표</a>'));
});

test('renderMarkdown: a table cell may contain an escaped pipe', () => {
  const html = B.renderMarkdown('| a | b |\n|---|---|\n| x \\| y | z |');
  assert.ok(html.includes('<td>x | y</td>'));
});

test('repoPathCandidates: repository paths, relative paths and GitHub URLs of the configured repository', () => {
  const cfg = { owner: 'hongguqaz', repo: 'Drive', path: 'fin-lab/FixC Report' };
  const dir = 'fin-lab/FixC Report';
  assert.deepEqual(B.repoPathCandidates('fin-lab/Fin Docraw/Bond&Macro/x.pdf', cfg, dir),
    ['fin-lab/Fin Docraw/Bond&Macro/x.pdf', 'fin-lab/FixC Report/fin-lab/Fin Docraw/Bond&Macro/x.pdf', 'fin-lab/fin-lab/Fin Docraw/Bond&Macro/x.pdf']);
  assert.deepEqual(B.repoPathCandidates('../Fin Docraw/x.pdf', cfg, dir)[0], 'fin-lab/Fin Docraw/x.pdf');
  assert.deepEqual(B.repoPathCandidates('Fin Docraw/x.pdf', cfg, dir), ['fin-lab/FixC Report/Fin Docraw/x.pdf', 'fin-lab/Fin Docraw/x.pdf', 'Fin Docraw/x.pdf']);
  assert.deepEqual(B.repoPathCandidates('/fin-lab/Fin%20Docraw/x.pdf', cfg, dir), ['fin-lab/Fin Docraw/x.pdf']);
  assert.deepEqual(B.repoPathCandidates('https://github.com/hongguqaz/Drive/blob/main/fin-lab/Fin%20Docraw/x%20y.pdf', cfg, dir), ['fin-lab/Fin Docraw/x y.pdf']);
  assert.deepEqual(B.repoPathCandidates('https://raw.githubusercontent.com/hongguqaz/Drive/main/fin-lab/Fin%20Docraw/x.pdf?raw=1', cfg, dir), ['fin-lab/Fin Docraw/x.pdf']);
  assert.deepEqual(B.repoPathCandidates('https://github.com/other/Drive/blob/main/x.pdf', cfg, dir), []);
  assert.deepEqual(B.repoPathCandidates('https://example.com/x.pdf', cfg, dir), []);
  assert.deepEqual(B.repoPathCandidates('mailto:a@b.c', cfg, dir), []);
  assert.deepEqual(B.repoPathCandidates('#top', cfg, dir), []);
  assert.equal(B.normPath('a/./b/../c//d/'), 'a/c/d');
});

test('formatting helpers', () => {
  assert.equal(B.fmtBytes(512), '512 B');
  assert.equal(B.fmtBytes(2048), '2.0 KB');
  assert.equal(B.fmtBytes(3 * 1048576), '3.0 MB');
  assert.equal(B.fmtDate('2026-10-11'), '2026.10.11');
  assert.equal(B.fmtDate('2026-10-11', true), '2026.10.11 (일)');
  assert.equal(B.fmtMonth('2026-10-11'), '2026년 10월');
  assert.equal(B.fmtPeriod({ date: '2026-10-06', dateEnd: '2026-10-10' }), '2026.10.06 ~ 2026.10.10');
  assert.equal(B.typeOf('md'), 'markdown'); assert.equal(B.typeOf('docx'), 'binary'); assert.equal(B.typeOf('png'), 'image');
  assert.equal(B.mimeOf('pdf'), 'application/pdf');
});

test('explainError names the path on 404 and the token on 401', () => {
  const cfg = B.DEFAULTS;
  assert.ok(B.explainError({ status: 404 }, cfg).includes('fin-lab/FixC Report'));
  assert.ok(B.explainError({ status: 404, path: 'fin-lab/Fin Docraw/x.pdf' }, cfg).includes('fin-lab/Fin Docraw/x.pdf'));
  assert.ok(B.explainError({ status: 401 }, cfg).includes('토큰'));
});

console.log(process.exitCode ? 'some tests FAILED' : `all ${passed} tests passed`);
