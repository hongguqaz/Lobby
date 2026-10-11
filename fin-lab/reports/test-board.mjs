/* FixC Report board - tests for the pure helpers (names, grouping, Markdown).
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

test('parseName: the standard "(YYMMDD) 제목.md"', () => {
  const p = B.parseName('(261011) 금리 상승 재료 점검.md');
  assert.deepEqual([p.date, p.dateEnd, p.title, p.ext, p.kind], ['2026-10-11', null, '금리 상승 재료 점검', 'md', 'daily']);
});

test('parseName: a weekly period and other date spellings', () => {
  let p = B.parseName('(261006-261010) 주간 시황 - 성장과 금리.md');
  assert.deepEqual([p.date, p.dateEnd, p.kind, p.title], ['2026-10-06', '2026-10-10', 'weekly', '주간 시황 - 성장과 금리']);
  p = B.parseName('2026-10-11 KOSPI 리스크 점검.html');
  assert.deepEqual([p.date, p.title, p.ext], ['2026-10-11', 'KOSPI 리스크 점검', 'html']);
  p = B.parseName('20261011_daily_report.pdf');
  assert.deepEqual([p.date, p.title], ['2026-10-11', 'daily_report']);
  p = B.parseName('261011 Weekly wrap.md');
  assert.deepEqual([p.date, p.kind], ['2026-10-11', 'weekly']);          // "weekly" in the title
  p = B.parseName('(2026-10-11) 제목.md');
  assert.equal(p.date, '2026-10-11');
});

test('parseName: no date -> undated, title is the stem; impossible dates are not dates', () => {
  let p = B.parseName('FixC_Archive_Index.md');
  assert.deepEqual([p.date, p.kind, p.title], [null, 'undated', 'FixC_Archive_Index']);
  p = B.parseName('(261399) 제목.md');
  assert.equal(p.date, null);
  p = B.parseName('README');
  assert.deepEqual([p.ext, p.title], ['', 'README']);
});

test('groupPosts: same date+title -> one post with attachments; .assets and folders join it; README ignored', () => {
  const posts = B.groupPosts([
    { path: 'README.md', name: 'README.md', size: 10 },
    { path: '(261011) 금리 점검.md', name: '(261011) 금리 점검.md', size: 3000, sha: 'a' },
    { path: '(261011) 금리 점검.pdf', name: '(261011) 금리 점검.pdf', size: 90000, sha: 'b' },
    { path: '(261011) 금리 점검.assets/chart1.png', name: 'chart1.png', size: 40000, sha: 'c' },
    { path: '(261006-261010) 주간 시황/(261006-261010) 주간 시황.md', name: '(261006-261010) 주간 시황.md', size: 5000 },
    { path: '(261006-261010) 주간 시황/data.xlsx', name: 'data.xlsx', size: 7000 },
    { path: '(261009) 전날 글.md', name: '(261009) 전날 글.md', size: 1000 },
    { path: '.gitkeep', name: '.gitkeep', size: 0 },
  ]);
  assert.equal(posts.length, 3);
  assert.deepEqual(posts.map((p) => p.title), ['금리 점검', '주간 시황', '전날 글']);   // newest first; the weekly by its last day (10-10)
  const first = posts[0];
  assert.equal(first.body.name, '(261011) 금리 점검.md');
  assert.deepEqual(first.attachments.map((f) => f.ext), ['md', 'pdf']);
  assert.equal(first.assets.length, 1);
  assert.equal(first.size, 3000 + 90000 + 40000);
  const weekly = posts[1];
  assert.equal(weekly.kind, 'weekly');
  assert.equal(weekly.body.ext, 'md');
  assert.deepEqual(weekly.attachments.map((f) => f.name), ['(261006-261010) 주간 시황.md', 'data.xlsx']);
  assert.equal(weekly.attachments[1].type, 'binary');
});

test('groupPosts: undated files sort last, titles tie-break', () => {
  const posts = B.groupPosts([
    { path: 'notes.md', name: 'notes.md', size: 1 },
    { path: '(261001) B.md', name: '(261001) B.md', size: 1 },
    { path: '(261001) A.md', name: '(261001) A.md', size: 1 },
  ]);
  assert.deepEqual(posts.map((p) => p.title), ['A', 'B', 'notes']);
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

test('renderMarkdown: relative images and links are marked for resolution against the post files', () => {
  const html = B.renderMarkdown('![차트](%28261011%29%20제목.assets/chart.png) 와 [표](data.xlsx)');
  assert.ok(html.includes('<img alt="차트" data-src="%28261011%29%20제목.assets/chart.png">'));
  assert.ok(html.includes('<a href="data.xlsx" data-href="data.xlsx">표</a>'));
});

test('renderMarkdown: a table cell may contain an escaped pipe', () => {
  const html = B.renderMarkdown('| a | b |\n|---|---|\n| x \\| y | z |');
  assert.ok(html.includes('<td>x | y</td>'));
});

test('formatting helpers', () => {
  assert.equal(B.fmtBytes(512), '512 B');
  assert.equal(B.fmtBytes(2048), '2.0 KB');
  assert.equal(B.fmtBytes(3 * 1048576), '3.0 MB');
  assert.equal(B.fmtDate('2026-10-11'), '2026.10.11');
  assert.equal(B.fmtDate('2026-10-11', true), '2026.10.11 (일)');
  assert.equal(B.fmtMonth('2026-10-11'), '2026년 10월');
  assert.equal(B.fmtPeriod({ date: '2026-10-06', dateEnd: '2026-10-10' }), '2026.10.06 ~ 2026.10.10');
  assert.equal(B.typeOf('md'), 'markdown'); assert.equal(B.typeOf('docx'), 'binary'); assert.equal(B.typeOf('PNG'.toLowerCase()), 'image');
  assert.equal(B.mimeOf('pdf'), 'application/pdf');
});

test('explainError names the folder on 404 and the token on 401', () => {
  const cfg = B.DEFAULTS;
  assert.ok(B.explainError({ status: 404 }, cfg).includes('fin-lab/FixC Report'));
  assert.ok(B.explainError({ status: 401 }, cfg).includes('토큰'));
});

console.log(process.exitCode ? 'some tests FAILED' : `all ${passed} tests passed`);
