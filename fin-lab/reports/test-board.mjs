/* Fin Lab boards - tests for the pure helpers (names, grouping, a post's files, Daily Picks text,
   Markdown, paths).  Run: node fin-lab/reports/test-board.mjs   (from the Lobby repository root, Node 18+) */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const B = require('./board.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name); console.log(e.stack || e); process.exitCode = 1; }
}

console.log('Fin Lab board tests');

test('parseName: the title is the file name as it came; the date is read from anywhere in it', () => {
  let p = B.parseName('261012_FixC_Daily.md');
  assert.deepEqual([p.date, p.dateEnd, p.title, p.ext, p.dated], ['2026-10-12', null, '261012_FixC_Daily', 'md', true]);
  p = B.parseName('261006-261010_FixC_Weekly_W9.pdf');
  assert.deepEqual([p.date, p.dateEnd, p.title, p.kind], ['2026-10-06', '2026-10-10', '261006-261010_FixC_Weekly_W9', 'weekly']);
  p = B.parseName('FixC_Catchup_261008-261010_2of2.md');
  assert.deepEqual([p.date, p.dateEnd, p.title, p.kind], ['2026-10-08', '2026-10-10', 'FixC_Catchup_261008-261010_2of2', 'note']);
  p = B.parseName('(261011) 금리 상승 재료 점검.md');
  assert.deepEqual([p.date, p.title, p.kind], ['2026-10-11', '(261011) 금리 상승 재료 점검', 'daily']);
  p = B.parseName('FixC_0226_daily_report.pdf');                 // 4 digits are not a date
  assert.deepEqual([p.date, p.kind], [null, 'daily']);
  assert.equal(B.parseName('report 3200pt 123456789.md').date, null);
  assert.equal(B.parseName('(261399) 제목.md').date, null);
  assert.equal(B.parseName('261012_FixC_Daily_Picks.md').kind, 'picks');
});

test('kindOf: the sub-folder decides first, then the name', () => {
  assert.equal(B.kindOf('261012_FixC_Daily', '2026-10-12', null, 'daily'), 'daily');
  assert.equal(B.kindOf('whatever', '2026-10-12', null, 'weekly'), 'weekly');
  assert.equal(B.kindOf('FixC_Catchup_261006-261007_1of2', '2026-10-06', '2026-10-07', 'notes'), 'note');
  assert.equal(B.kindOf('2026-10 월간 전망', '2026-10-01', null, ''), 'monthly');
  assert.equal(B.kindOf('FixC_STATE', null, null, ''), 'undated');
});

const FILES = [
  { path: 'README.md', name: 'README.md', size: 10 },
  { path: 'daily/261010_FixC_Daily.md', name: '261010_FixC_Daily.md', size: 20000 },
  { path: 'daily/261010_FixC_Daily.pdf', name: '261010_FixC_Daily.pdf', size: 1188705 },
  { path: 'daily/261010_FixC_Daily_Picks.md', name: '261010_FixC_Daily_Picks.md', size: 6529 },
  { path: 'daily/261012_FixC_Daily.md', name: '261012_FixC_Daily.md', size: 24725 },
  { path: 'daily/261012_FixC_Daily.pdf', name: '261012_FixC_Daily.pdf', size: 1296539 },
  { path: 'daily/261012_FixC_Daily_Picks.md', name: '261012_FixC_Daily_Picks.md', size: 7647 },
  { path: 'notes/FixC_Catchup_261006-261007_1of2.md', name: 'FixC_Catchup_261006-261007_1of2.md', size: 22967 },
  { path: 'notes/FixC_Catchup_261008-261010_2of2.md', name: 'FixC_Catchup_261008-261010_2of2.md', size: 39241 },
  { path: 'weekly/261006-261010_FixC_Weekly_W9.md', name: '261006-261010_FixC_Weekly_W9.md', size: 53353 },
  { path: 'weekly/261006-261010_FixC_Weekly_W9.pdf', name: '261006-261010_FixC_Weekly_W9.pdf', size: 1481146 },
  { path: '.fin-desk/board.json', name: 'board.json', size: 100 },
];
const ROOT = 'fin-lab/FixC report';
const PDF1 = 'fin-lab/Fin Docraw/20261012_mail_홍상준_1485_DB증권.pdf';

test("groupPosts: FixC's folder - a PDF and its .md twin are one post, in time order, picks files apart", () => {
  const posts = B.groupPosts(FILES, null);
  assert.deepEqual(posts.map((p) => p.title), [
    '261012_FixC_Daily', '261012_FixC_Daily_Picks',
    '261010_FixC_Daily', '261010_FixC_Daily_Picks', '261006-261010_FixC_Weekly_W9', 'FixC_Catchup_261008-261010_2of2',
    'FixC_Catchup_261006-261007_1of2',
  ]);
  assert.deepEqual(posts.map((p) => p.kind), ['daily', 'picks', 'daily', 'picks', 'weekly', 'note', 'note']);
  const daily = posts[0];
  assert.equal(daily.id, 'daily/261012_fixc_daily');
  assert.deepEqual(daily.attachments.map((f) => f.ext), ['pdf', 'md']);        // the PDF is the report people read
  assert.equal(daily.body.name, '261012_FixC_Daily.md');
  assert.equal(daily.size, 24725 + 1296539);
  assert.equal(daily.picksFile, false);
  assert.equal(daily.picksPost, posts[1]);                                   // the same day's Daily Picks
  assert.equal(posts[1].picksFile, true);
  assert.equal(posts[1].reportPost, daily);
  assert.equal(posts[4].picksPost, null);
  assert.equal(posts[5].dateEnd, '2026-10-10');
  assert.ok(posts.every((p) => p.indexed === false && p.picks.length === 0));
});

test('groupPosts: the desk index dates an undated name, adds picks and the heading', () => {
  const meta = B.indexMeta({ generator: 'Fin Desk 1.0.0', files: [
    { path: 'daily/261012_FixC_Daily_Picks.md', bytes: 7647, registered: '2026-10-13', picks_file: true, heading: '261012 FixC Daily Picks — 오늘의 선별 자료',
      picks: [{ path: PDF1, text: '2026.10.12, 「오만과 편견」, 문홍철, DB증권', note: '', exists: true, kind: 'pdf', bytes: 1000 }] },
    { path: 'notes/FixC_STATE_handover.md', bytes: 500, registered: '2026-10-13', heading: '인계 상태' },
  ] });
  const posts = B.groupPosts(FILES.concat([{ path: 'notes/FixC_STATE_handover.md', name: 'FixC_STATE_handover.md', size: 500 }]), meta);
  const handover = posts.filter((p) => p.title === 'FixC_STATE_handover')[0];
  assert.deepEqual([handover.date, handover.dated, handover.kind, handover.indexed, handover.heading], ['2026-10-13', false, 'note', true, '인계 상태']);
  assert.equal(B.fmtPeriod(handover), '2026.10.13 (화) · 등록일');
  const picks = posts.filter((p) => p.title === '261012_FixC_Daily_Picks')[0];
  assert.equal(picks.picks.length, 1);
  assert.equal(picks.reportPost.title, '261012_FixC_Daily');
  assert.equal(posts[0].title, 'FixC_STATE_handover');
});

test("postItems: a report's strip - its PDF, its .md, the day's picks file, then the picked originals", () => {
  const meta = B.indexMeta({ files: [
    { path: 'daily/261012_FixC_Daily_Picks.md', picks_file: true, picks: [
      { path: PDF1, text: '2026.10.12, 「오만과 편견」, 문홍철, DB증권', note: '', exists: true, kind: 'pdf', bytes: 1000, rendering: 'fin-lab/Fin Docai/x.html' },
      { path: 'nope.pdf', text: '없는 자료', exists: false, unresolved: true },
    ] },
  ] });
  const posts = B.groupPosts(FILES, meta);
  const daily = posts[0];
  const items = B.postItems(daily, ROOT);
  assert.deepEqual(items.map((i) => [i.kind, i.role, i.name]), [
    ['file', 'report', '261012_FixC_Daily.pdf'],
    ['file', 'twin', '261012_FixC_Daily.md'],
    ['file', 'picks', '261012_FixC_Daily_Picks.md'],
    ['link', 'material', '20261012_mail_홍상준_1485_DB증권.pdf'],
    ['link', 'material', 'nope.pdf'],
  ]);
  assert.equal(items[0].repoPath, ROOT + '/daily/261012_FixC_Daily.pdf');
  assert.equal(items[3].label, '2026.10.12, 「오만과 편견」, 문홍철, DB증권');
  assert.equal(items[3].rendering, 'fin-lab/Fin Docai/x.html');
  assert.equal(items[3].index, 1);
  assert.deepEqual([items[4].exists, items[4].unresolved], [false, true]);
  assert.equal(B.defaultItem(items).name, '261012_FixC_Daily.pdf');           // FixC's PDF opens first
  // a picks post: its own file, the originals, then the day's report files
  const pk = posts[1];
  const pitems = B.postItems(pk, ROOT);
  assert.deepEqual(pitems.map((i) => [i.kind, i.role, i.name]), [
    ['file', 'picks', '261012_FixC_Daily_Picks.md'],
    ['link', 'material', '20261012_mail_홍상준_1485_DB증권.pdf'],
    ['link', 'material', 'nope.pdf'],
    ['file', 'daily', '261012_FixC_Daily.pdf'],
    ['file', 'daily', '261012_FixC_Daily.md'],
  ]);
  assert.equal(B.defaultItem(pitems).name, '261012_FixC_Daily_Picks.md');    // the picks file itself opens first
  // a note without a PDF opens its .md; a post with only unreadable files has no default
  const note = posts.filter((p) => p.kind === 'note')[0];
  assert.equal(B.defaultItem(B.postItems(note, ROOT)).type, 'markdown');
  assert.equal(B.defaultItem([{ kind: 'file', role: 'report', type: 'binary', exists: true }]), null);
});

const PICKS_MD = `# 261012 FixC Daily Picks — 오늘의 선별 자료

> 데일리 본문은 같은 폴더의 「261012_FixC_Daily.pdf」입니다. 원본은 \`fin-lab/Fin Docraw/\`에서 아래 파일명으로 찾습니다.

1. "2026.10.12, 「오만과 편견 — 2027년 금리·FX 연간전망」, 문홍철, DB증권"

   요약 문단. 「금리상승시 오히려 장기채권투자가 줄어든다」고 본다.

   * Findocraw 상의 파일명: "20261012_mail_홍상준_1485_DB증권.pdf"

2. "2026.10.12, 「주간 하나채권」, 박준우·허성우, 하나증권"

   * Findocraw 상의 파일명: "20261011_mail_하나증권_1426-l1_Daily_261012.pdf" (합본 — 은행 Weekly는 25면)
   * 판독본: "(261012) 주간 하나채권 (하나증권, 박준우).html"

3. "항목에 파일명이 없으면 픽이 아니다"

   요약만.
`;

test("parsePicksText: FixC's numbered items -> label, quoted file name, note, rendering", () => {
  const items = B.parsePicksText(PICKS_MD);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { label: '2026.10.12, 「오만과 편견 — 2027년 금리·FX 연간전망」, 문홍철, DB증권', name: '20261012_mail_홍상준_1485_DB증권.pdf', note: '', renderingName: '' });
  assert.deepEqual(items[1], { label: '2026.10.12, 「주간 하나채권」, 박준우·허성우, 하나증권', name: '20261011_mail_하나증권_1426-l1_Daily_261012.pdf',
    note: '(합본 — 은행 Weekly는 25면)', renderingName: '(261012) 주간 하나채권 (하나증권, 박준우).html' });
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

test("renderMarkdown: FixC's picks keep their numbers, comments vanish, <sub> notes shrink", () => {
  const html = B.renderMarkdown(PICKS_MD + '\n<!-- p4 -->\n<sub>각주</sub>\n');
  assert.ok(html.includes('<ol><li>'), html);
  assert.ok(html.includes('<ol start="2"><li>'));
  assert.ok(html.includes('<ol start="3"><li>'));
  assert.ok(!html.includes('p4'));
  assert.ok(html.includes('<p class="fine">각주</p>'));
});

test('renderMarkdown: escapes HTML and drops dangerous URLs', () => {
  const html = B.renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) ![y](data:text/html,oops) <img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('data:'));
  assert.ok(!html.includes('<img src=x'));
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

test('renderMarkdown: a table cell may contain an escaped pipe', () => {
  assert.ok(B.renderMarkdown('| a | b |\n|---|---|\n| x \\| y | z |').includes('<td>x | y</td>'));
});

test('repoPathCandidates: repository paths, relative paths and GitHub URLs of the configured repository', () => {
  const cfg = { owner: 'hongguqaz', repo: 'Drive', path: 'fin-lab/FixC report' };
  const dir = 'fin-lab/FixC report/daily';
  assert.deepEqual(B.repoPathCandidates('fin-lab/Fin Docraw/x.pdf', cfg, dir), ['fin-lab/Fin Docraw/x.pdf', 'fin-lab/FixC report/daily/fin-lab/Fin Docraw/x.pdf', 'fin-lab/fin-lab/Fin Docraw/x.pdf']);
  assert.deepEqual(B.repoPathCandidates('../../Fin Docraw/x.pdf', cfg, dir)[0], 'fin-lab/Fin Docraw/x.pdf');
  assert.deepEqual(B.repoPathCandidates('/fin-lab/Fin%20Docraw/x.pdf', cfg, dir), ['fin-lab/Fin Docraw/x.pdf']);
  assert.deepEqual(B.repoPathCandidates('https://github.com/hongguqaz/Drive/blob/main/fin-lab/Fin%20Docraw/x%20y.pdf', cfg, dir), ['fin-lab/Fin Docraw/x y.pdf']);
  assert.deepEqual(B.repoPathCandidates('https://github.com/other/Drive/blob/main/x.pdf', cfg, dir), []);
  assert.deepEqual(B.repoPathCandidates('mailto:a@b.c', cfg, dir), []);
  assert.equal(B.normPath('a/./b/../c//d/'), 'a/c/d');
});

test('formatting helpers and constants', () => {
  assert.equal(B.fmtBytes(512), '512 B');
  assert.equal(B.fmtBytes(2048), '2.0 KB');
  assert.equal(B.fmtBytes(3 * 1048576), '3.0 MB');
  assert.equal(B.fmtDate('2026-10-11', true), '2026.10.11 (일)');
  assert.equal(B.fmtPeriod({ date: '2026-10-06', dateEnd: '2026-10-10' }), '2026.10.06 ~ 2026.10.10');
  assert.equal(B.fmtShort({ date: '2026-10-06', dateEnd: '2026-10-10' }), '26.10.06~10.10');
  assert.equal(B.fmtShort({ date: '2026-10-12', dateEnd: null }), '26.10.12');
  assert.equal(B.typeOf('md'), 'markdown'); assert.equal(B.typeOf('docx'), 'binary'); assert.equal(B.typeOf('png'), 'image');
  assert.equal(B.mimeOf('pdf'), 'application/pdf');
  assert.equal(B.DEFAULTS.path, 'fin-lab/FixC report');
  assert.equal(B.PAGE_SIZE, 20);
  assert.equal(B.PDFJS.version, '4.10.38');
});

test('explainError names the path on 404 and the token on 401', () => {
  assert.ok(B.explainError({ status: 404 }, B.DEFAULTS).includes('fin-lab/FixC report'));
  assert.ok(B.explainError({ status: 404, path: 'fin-lab/Fin Docraw/x.pdf' }, B.DEFAULTS).includes('fin-lab/Fin Docraw/x.pdf'));
  assert.ok(B.explainError({ status: 401 }, B.DEFAULTS).includes('토큰'));
});

console.log(process.exitCode ? 'some tests FAILED' : `all ${passed} tests passed`);
