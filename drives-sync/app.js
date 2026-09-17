/* Drives Sync - the web app. Binds the engine in core.js to the page, keeps settings and
   tokens in this browser only, holds device-folder handles, runs the automation timer and
   exposes window.DrivesSync for agents. Every operation goes through the same preflight brake. */
import * as core from './core.js';

const $ = (id) => document.getElementById(id);
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');
/* Set by build-single.mjs for the one-file edition: { single, preview, icon192, icon512, iconMaskable }.
   preview = hosted where outside connections are blocked (a claude.ai artifact): the UI works, syncing cannot. */
const BUILD = window.DRIVES_SYNC_BUILD || {};
const PREVIEW = !!BUILD.preview;
const ICON_192 = BUILD.icon192 || 'assets/icon-192.png';
const LIVE_URL = 'https://hongguqaz.github.io/Lobby/drives-sync/';
const PREVIEW_REASON = `미리 보기 환경(claude.ai)에서는 Google·GitHub 등 외부 연결이 차단되어 실제 동기화를 할 수 없습니다. 실제 사용은 ${LIVE_URL} 또는 내려받은 drives-sync.html 파일을 웹 서버에서 여세요.`;
const previewFetch = async () => new Response(JSON.stringify({ message: PREVIEW_REASON, error: { message: PREVIEW_REASON } }), { status: 403, headers: { 'content-type': 'application/json' } });
const LS = {
  config: 'ds.config', gToken: 'ds.google.token', gRefresh: 'ds.google.refresh', ghToken: 'ds.github.token',
  logs: 'ds.logs', lastRuns: 'ds.lastRuns', pkce: 'ds.pkce', folders: 'ds.folders', automation: 'ds.automation',
};

const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { log('app', 'warn', `저장 실패 (${key}): ${e.message}`); } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/* ------------------------------------------------------------------ IndexedDB for folder handles */
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('drives-sync', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('handles');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbOp(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', mode);
    const req = fn(tx.objectStore('handles'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const handles = {
  cache: new Map(),
  async get(id) { if (this.cache.has(id)) return this.cache.get(id); const h = await idbOp('readonly', (s) => s.get(id)).catch(() => null); if (h) this.cache.set(id, h); return h || null; },
  async set(id, h) { this.cache.set(id, h); await idbOp('readwrite', (s) => s.put(h, id)); },
  async del(id) { this.cache.delete(id); await idbOp('readwrite', (s) => s.delete(id)).catch(() => null); },
};

/* ------------------------------------------------------------------ state */
const state = {
  config: core.withDefaults(store.get(LS.config, {})),
  folders: store.get(LS.folders, []),
  logs: store.get(LS.logs, []),
  lastRuns: store.get(LS.lastRuns, { preflight: null, stock: null, flow: null, automation: null }),
  automation: store.get(LS.automation, { nextRunAt: null, lastBrake: null, lastRunAt: null }),
  running: null,
  oneshot: new Map(),       // folder id -> FileList chosen for this run
  google: { email: null, mode: 'gis' },
  github: { login: null },
  installPrompt: null,
  wakeLock: null,
};
const listeners = new Map();
function emit(event, data) { for (const fn of listeners.get(event) || []) { try { fn(data); } catch { /* listener error */ } } }

/** Keeps every path and limit in the shape the engine expects, wherever the config came from. */
function normalizeConfig(cfg) {
  cfg.github.targetPath = core.joinPath(cfg.github.targetPath);
  cfg.github.owner = (cfg.github.owner || '').trim();
  cfg.github.repo = (cfg.github.repo || '').trim();
  cfg.github.branch = (cfg.github.branch || '').trim();
  cfg.google.sourceFolderId = (cfg.google.sourceFolderId || '').trim() || 'root';
  cfg.flow.driveSubPath = core.joinPath(cfg.flow.driveSubPath) || 'DrivesSync';
  cfg.limits.maxFileBytes = Math.min(100 * 1048576, Math.max(1048576, Number(cfg.limits.maxFileBytes) || 100 * 1048576));
  cfg.limits.batchFiles = Math.min(200, Math.max(1, Number(cfg.limits.batchFiles) || 20));
  cfg.limits.concurrency = Math.min(8, Math.max(1, Number(cfg.limits.concurrency) || 3));
  cfg.automation.intervalMinutes = Math.max(1, Number(cfg.automation.intervalMinutes) || 30);
  return cfg;
}
normalizeConfig(state.config);
if (!state.config.device.id) state.config.device.id = 'dev-' + core.randomId(6);
if (!state.config.device.name) state.config.device.name = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? '휴대폰' : '노트북';
saveConfig();

function saveConfig() { store.set(LS.config, state.config); }
function saveFolders() { store.set(LS.folders, state.folders); }
function saveLastRuns() { store.set(LS.lastRuns, state.lastRuns); }
function saveAutomation() { store.set(LS.automation, state.automation); }

/* ------------------------------------------------------------------ logging */
const logEls = { preflight: null, stock: 'stock-log', flow: 'flow-log', automation: 'auto-log', app: null };
function log(section, level, msg, data) {
  const entry = { t: core.nowIso(), section, level, msg, ...(data && Object.keys(data).length ? { data } : {}) };
  state.logs.push(entry);
  if (state.logs.length > 1500) state.logs.splice(0, state.logs.length - 1500);
  store.set(LS.logs, state.logs.slice(-500));
  renderLog(section);
  if (level === 'brake' || level === 'error') renderChip('status-run', level === 'brake' ? 'braked' : 'error', msg.slice(0, 80));
  emit('log', entry);
  return entry;
}
function renderLog(section) {
  const id = logEls[section];
  if (!id) return;
  const el = $(id);
  const lines = state.logs.filter((l) => l.section === section).slice(-200);
  el.innerHTML = lines.map((l) => `<span class="${l.level}">${fmtTime(l.t, true)} ${escapeHtml(l.msg)}</span>`).join('\n');
  el.scrollTop = el.scrollHeight;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtTime(iso, short = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return short ? d.toLocaleTimeString('ko-KR', { hour12: false }) : d.toLocaleString('ko-KR', { hour12: false });
}

/* ------------------------------------------------------------------ Google auth (browser) */
class BrowserGoogleAuth {
  constructor() { this.token = store.get(LS.gToken, null); this.refresh = store.get(LS.gRefresh, null); this._refresher = null; }
  get mode() { return this.refresh && this.refresh.refresh_token ? 'refresh' : 'gis'; }
  describe() { return this.mode === 'refresh' ? '장기 인증 (refresh token)' : 'Google 로그인 (1시간 토큰)'; }
  hasAny() { return !!((this.token && this.token.access_token) || (this.refresh && this.refresh.refresh_token)); }
  isValid() { return !!(this.token && this.token.access_token && Date.now() < this.token.expires_at - 60000); }

  _storeToken(data) {
    this.token = { access_token: data.access_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000, scope: data.scope || '' };
    store.set(LS.gToken, this.token);
  }

  async getAccessToken() {
    const cfg = state.config.google;
    if (this.mode === 'refresh') {
      if (!cfg.clientId || !cfg.clientSecret) throw new Error('장기 인증에는 클라이언트 ID와 보안 비밀이 필요합니다 (설정).');
      if (!this._refresher || this._refresher.refreshToken !== this.refresh.refresh_token) {
        this._refresher = new core.RefreshTokenGoogleAuth({
          clientId: cfg.clientId, clientSecret: cfg.clientSecret, refreshToken: this.refresh.refresh_token,
          accessToken: this.token && this.token.access_token, expiresAt: this.token && this.token.expires_at, scope: this.token && this.token.scope,
          onUpdate: (t) => { this.token = { access_token: t.accessToken, expires_at: t.expiresAt, scope: t.scope }; store.set(LS.gToken, this.token); },
        });
      }
      try { return await this._refresher.getAccessToken(); } catch (e) {
        if (e.status === 400 || e.status === 401) { log('app', 'error', `장기 인증이 더 이상 유효하지 않습니다: ${e.message}`); this.clearRefresh(); }
        throw e;
      }
    }
    if (this.isValid()) return { token: this.token.access_token, scope: this.token.scope };
    if (!this.token) return null;
    try {
      const data = await this._gisRequest({ prompt: '', silent: true });
      this._storeToken(data);
      log('app', 'info', 'Google 토큰을 조용히 갱신했습니다.');
      return { token: this.token.access_token, scope: this.token.scope };
    } catch (e) {
      log('app', 'warn', `Google 토큰 갱신 실패: ${e.message}`);
      return null;
    }
  }

  async _gis() {
    for (let i = 0; i < 100; i++) {
      if (window.google && google.accounts && google.accounts.oauth2) return google.accounts.oauth2;
      await core.sleep(100);
    }
    throw new Error('Google 로그인 스크립트를 불러오지 못했습니다 (네트워크 또는 차단 확장 프로그램 확인).');
  }

  async _gisRequest({ prompt, silent = false }) {
    const cfg = state.config.google;
    if (!cfg.clientId) throw new Error('설정에 Google OAuth 클라이언트 ID가 없습니다.');
    const oauth2 = await this._gis();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error(silent ? '조용한 갱신 시간 초과' : '로그인 시간 초과')); } }, silent ? 20000 : 180000);
      const client = oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: core.GOOGLE_SCOPES.join(' '),
        hint: cfg.expectedEmail || undefined,
        login_hint: cfg.expectedEmail || undefined,
        callback: (resp) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (resp && resp.access_token) resolve(resp); else reject(new Error(resp && resp.error ? `${resp.error}: ${resp.error_description || ''}` : '토큰을 받지 못했습니다.'));
        },
        error_callback: (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const type = err && err.type;
          reject(new Error(type === 'popup_failed_to_open' ? '로그인 팝업이 차단되었습니다. 이 사이트의 팝업을 허용하거나 다시 누르세요.' : type === 'popup_closed' ? '로그인 창이 닫혔습니다.' : (err && err.message) || '로그인 오류'));
        },
      });
      client.requestAccessToken({ prompt });
    });
  }

  /** User-initiated login. Verifies the account before keeping the token. */
  async connect({ consent = true } = {}) {
    if (PREVIEW) throw new Error('미리 보기에서는 Google 로그인을 할 수 없습니다. ' + PREVIEW_REASON);
    const data = await this._gisRequest({ prompt: consent ? 'consent' : '' });
    this._storeToken(data);
    const drive = new core.GoogleDrive(this, { log: (l, m) => log('app', l, m) });
    const about = await drive.about();
    const expected = (state.config.google.expectedEmail || '').trim().toLowerCase();
    if (expected && about.email.toLowerCase() !== expected) {
      await this.disconnect();
      throw new Error(`다른 Google 계정(${about.email})으로 로그인했습니다. 설정된 동기화 계정은 ${state.config.google.expectedEmail}입니다. 토큰을 폐기했습니다.`);
    }
    state.google.email = about.email;
    return about;
  }

  async disconnect() {
    const tok = this.token && this.token.access_token;
    this.token = null;
    store.del(LS.gToken);
    this.clearRefresh();
    state.google.email = null;
    if (tok) { try { const oauth2 = await this._gis(); oauth2.revoke(tok, () => {}); } catch { /* offline */ } }
  }

  clearRefresh() { this.refresh = null; this._refresher = null; store.del(LS.gRefresh); }

  async startLongRun() {
    const cfg = state.config.google;
    if (!cfg.clientId || !cfg.clientSecret) throw new Error('장기 인증에는 클라이언트 ID와 클라이언트 보안 비밀이 모두 필요합니다.');
    const { verifier, challenge } = await core.pkcePair();
    const st = core.randomId(12);
    store.set(LS.pkce, { verifier, state: st, at: Date.now() });
    location.href = core.googleAuthUrl({ clientId: cfg.clientId, redirectUri: APP_URL, codeChallenge: challenge, state: st, loginHint: cfg.expectedEmail || undefined });
  }

  async handleRedirect() {
    const params = new URLSearchParams(location.search);
    if (!params.get('code') && !params.get('error')) return false;
    const pk = store.get(LS.pkce, null);
    store.del(LS.pkce);
    history.replaceState(null, '', APP_URL);
    if (params.get('error')) throw new Error(`Google 인증 거부: ${params.get('error')}`);
    if (!pk || pk.state !== params.get('state')) throw new Error('인증 상태(state)가 일치하지 않아 코드를 무시했습니다.');
    const cfg = state.config.google;
    const data = await core.googleTokenRequest(fetch.bind(window), {
      code: params.get('code'), client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: APP_URL, grant_type: 'authorization_code', code_verifier: pk.verifier,
    });
    if (!data.refresh_token) throw new Error('Google이 refresh token을 주지 않았습니다. Google 계정 > 보안 > 타사 액세스에서 이 앱을 제거한 뒤 다시 시도하세요.');
    this.refresh = { refresh_token: data.refresh_token, at: core.nowIso() };
    store.set(LS.gRefresh, this.refresh);
    this._refresher = null;
    this._storeToken(data);
    return true;
  }
}
const googleAuth = new BrowserGoogleAuth();
const githubAuth = { async getToken() { return store.get(LS.ghToken, null); } };

/* ------------------------------------------------------------------ device folder sources */
class HandleSource {
  constructor(handle, label) { this.handle = handle; this.name = label; this.kind = 'handle'; }
  async list() {
    const out = [];
    const walk = async (dir, prefix) => {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') { if (!name.startsWith('.')) await walk(h, prefix + name + '/'); continue; }
        let file;
        try { file = await h.getFile(); } catch { continue; }
        out.push({ relPath: prefix + name, name, size: file.size, lastModified: file.lastModified, read: async () => h.getFile() });
      }
    };
    await walk(this.handle, '');
    return out;
  }
}
class FileListSource {
  constructor(files, label) { this.files = Array.from(files); this.name = label; this.kind = 'oneshot'; }
  async list() {
    return this.files.map((f) => {
      const rel = f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') || f.name : f.name;
      return { relPath: rel, name: f.name, size: f.size, lastModified: f.lastModified, read: async () => f };
    });
  }
}
const supportsHandles = 'showDirectoryPicker' in window;

async function folderReadiness(folder) {
  if (folder.mode === 'handle') {
    if (!supportsHandles) return { ready: false, reason: '이 브라우저는 폴더 지속 접근을 지원하지 않습니다. 폴더를 "실행할 때마다 선택" 방식으로 다시 추가하세요.' };
    const h = await handles.get(folder.id);
    if (!h) return { ready: false, reason: '저장된 폴더 접근 권한이 없습니다. 폴더를 다시 선택하세요.', reselect: true };
    let perm = 'prompt';
    try { perm = await h.queryPermission({ mode: 'read' }); } catch { perm = 'prompt'; }
    if (perm !== 'granted') return { ready: false, reason: '폴더 접근 권한 재승인이 필요합니다 ("권한 승인" 버튼).', permission: perm };
    return { ready: true, handle: h, permission: 'granted' };
  }
  const files = state.oneshot.get(folder.id);
  if (files && files.length) return { ready: true, files };
  return { ready: false, reason: '실행할 때마다 폴더(파일)를 선택해야 합니다 ("선택 후 업로드" 버튼). 자동 실행은 지원하지 않습니다.', oneshot: true };
}

/* ------------------------------------------------------------------ engine glue */
function makeCtx(section, signal) {
  return core.createContext({
    config: state.config, googleAuth, githubAuth, signal, fetch: PREVIEW ? previewFetch : undefined,
    log: (level, msg, data) => log(section, level, msg, data),
    progress: (p) => renderProgress(section, p),
  });
}

function setRunning(kind) {
  state.running = kind ? { kind, startedAt: core.nowIso(), abort: new AbortController() } : null;
  document.body.dataset.state = kind ? 'running' : 'idle';
  renderChip('status-run', kind ? 'running' : 'idle', kind ? `${kind} 실행 중` : '대기');
  for (const id of ['btn-preflight', 'btn-stock-run', 'btn-stock-dry', 'btn-flow-run-all', 'btn-flow-dry', 'btn-auto-run-now', 'btn-auto-check', 'btn-create-target', 'btn-manifest-reset']) $(id).disabled = !!kind;
  $('btn-stock-stop').hidden = kind !== 'stock';
  $('btn-flow-stop').hidden = kind !== 'flow';
  renderFolders();
  renderAgentState();
  emit('state', { running: !!kind, kind });
}

async function guarded(kind, fn) {
  if (state.running) return { ok: false, busy: true, reasons: [`다른 작업(${state.running.kind})이 실행 중입니다.`] };
  setRunning(kind);
  try {
    const res = await fn(state.running.abort.signal);
    if (res && res.braked) document.body.dataset.state = 'braked';
    return res;
  } catch (e) {
    if (e.name === 'AbortError') { log(kind, 'warn', '사용자가 중지했습니다.'); return { ok: false, aborted: true, reasons: ['중지됨'] }; }
    log(kind, 'error', e.message);
    document.body.dataset.state = 'error';
    return { ok: false, error: e.message, reasons: [e.message] };
  } finally {
    const st = document.body.dataset.state;
    setRunning(null);
    if (st === 'braked' || st === 'error') document.body.dataset.state = st;
  }
}

async function doPreflight({ scope = 'stock', quiet = false } = {}) {
  const ctx = makeCtx('preflight');
  const pf = await core.preflight(ctx, { scope });
  state.lastRuns.preflight = pf;
  saveLastRuns();
  const g = pf.checks.find((c) => c.id === 'google.account');
  state.google.email = g && g.ok ? g.actual : null;
  const gh = pf.checks.find((c) => c.id === 'github.account');
  state.github.login = gh && gh.ok ? gh.actual : null;
  renderPreflight(pf);
  renderStatus();
  if (!pf.ok && !quiet) showBanner(pf.reasons.join('\n'), 'bad');
  else if (pf.ok) hideBanner();
  return pf;
}

async function doStock({ dryRun = false, trigger = 'manual' } = {}) {
  return guarded('stock', async (signal) => {
    $('stock-summary').hidden = true;
    showProgress('stock', true);
    const ctx = makeCtx('stock', signal);
    const res = await core.runStockMatching(ctx, { dryRun, trigger });
    showProgress('stock', false);
    state.lastRuns.stock = res;
    saveLastRuns();
    if (res.preflight) { state.lastRuns.preflight = res.preflight; renderPreflight(res.preflight); }
    renderSummary('stock', res);
    renderStatus();
    return res;
  });
}

/**
 * strict: every requested folder must be ready (automation). Otherwise folders that are not
 * ready are skipped with a logged reason and the ready ones run.
 */
async function doFlow({ folderIds, dryRun = false, trigger = 'manual', strict = false } = {}) {
  return guarded('flow', async (signal) => {
    $('flow-summary').hidden = true;
    const wanted = state.folders.filter((f) => !folderIds || folderIds.includes(f.id));
    const ready = [];
    const notReady = [];
    for (const f of wanted) {
      const r = await folderReadiness(f);
      if (r.ready) ready.push({ folder: f, r }); else notReady.push({ folder: f, r });
    }
    const extraChecks = [];
    if (strict) for (const { folder, r } of notReady) extraChecks.push({ id: `folder.${folder.id}`, label: `폴더 "${folder.label}"`, ok: false, detail: r.reason });
    else for (const { folder, r } of notReady) log('flow', 'warn', `건너뜀 "${folder.label}": ${r.reason}`);
    if (!wanted.length) { const res = { ok: false, braked: true, reasons: ['업로드할 기기 폴더가 지정되지 않았습니다. 기능 2에서 폴더를 추가하세요.'], at: core.nowIso() }; log('flow', 'brake', res.reasons[0]); renderSummary('flow', res); return res; }
    if (!ready.length && !strict) { const res = { ok: false, braked: true, reasons: notReady.map(({ folder, r }) => `"${folder.label}": ${r.reason}`), at: core.nowIso() }; log('flow', 'brake', '실행 가능한 폴더가 없습니다.'); renderSummary('flow', res); return res; }
    showProgress('flow', true);
    const ctx = makeCtx('flow', signal);
    const folders = ready.map(({ folder, r }) => ({
      id: folder.id, label: folder.label, driveSubPath: folder.driveSubPath || '',
      source: folder.mode === 'handle' ? new HandleSource(r.handle, folder.label) : new FileListSource(r.files, folder.label),
    }));
    const res = await core.runFlowMatching(ctx, { folders, dryRun, trigger, extraChecks });
    showProgress('flow', false);
    if (res.ok !== undefined && !res.braked && !dryRun) {
      for (const fr of res.folders || []) {
        const f = state.folders.find((x) => x.id === fr.id);
        if (f) { f.lastRun = res.finishedAt; f.lastResult = { uploaded: fr.uploaded, failed: fr.failed.length, scanned: fr.scanned, error: fr.error || null }; }
        state.oneshot.delete(fr.id);
      }
      saveFolders();
    }
    if (notReady.length && !strict) res.skippedFolders = notReady.map(({ folder, r }) => ({ id: folder.id, label: folder.label, reason: r.reason }));
    state.lastRuns.flow = res;
    saveLastRuns();
    if (res.preflight) { state.lastRuns.preflight = res.preflight; renderPreflight(res.preflight); }
    renderSummary('flow', res);
    renderFolders();
    renderStatus();
    return res;
  });
}

async function automationPrereqs() {
  const folders = state.folders;
  const extraChecks = [];
  for (const f of folders) {
    const r = await folderReadiness(f);
    if (f.mode !== 'handle') extraChecks.push({ id: `folder.${f.id}`, label: `폴더 "${f.label}"`, ok: false, detail: '"실행할 때마다 선택" 방식 폴더는 자동 실행할 수 없습니다. 지속 접근 방식으로 다시 추가하거나 목록에서 제외하세요.' });
    else extraChecks.push({ id: `folder.${f.id}`, label: `폴더 "${f.label}"`, ok: r.ready, detail: r.ready ? '접근 권한 확인' : r.reason });
  }
  if (googleAuth.mode !== 'refresh') extraChecks.push({ id: 'google.longrun', label: 'Google 장기 인증', ok: true, detail: '꺼짐 (1시간 토큰). 토큰 갱신에 실패하면 자동 실행이 멈추고 재로그인을 요청합니다. 무인 실행에는 설정의 장기 인증을 권장합니다.' });
  else extraChecks.push({ id: 'google.longrun', label: 'Google 장기 인증', ok: true, detail: '켜짐' });
  const ctx = makeCtx('automation');
  const pf = await core.automationPreflight(ctx, { folders, intervalMinutes: state.config.automation.intervalMinutes, extraChecks });
  state.lastRuns.automationCheck = pf;
  saveLastRuns();
  renderChecks($('auto-prereqs'), pf.checks);
  return pf;
}

/* ------------------------------------------------------------------ automation */
const automation = {
  timer: null,
  start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 20000); this.tick(); },
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; },
  due() { const n = state.automation.nextRunAt; return !n || Date.now() >= Date.parse(n); },
  schedule() {
    const mins = Math.max(1, Number(state.config.automation.intervalMinutes) || 30);
    state.automation.nextRunAt = new Date(Date.now() + mins * 60000).toISOString();
    saveAutomation();
    renderAutomation();
  },
  async tick() {
    if (!state.config.automation.enabled) return;
    renderAutomation();
    if (state.running || !this.due()) return;
    await this.runOnce('automation');
  },
  async runOnce(trigger = 'automation') {
    if (state.running) return { ok: false, busy: true, reasons: ['다른 작업이 실행 중입니다.'] };
    log('automation', 'info', `자동 실행 주기 도래 (${trigger}) - 선결 조건 점검`);
    const pf = await automationPrereqs();
    if (!pf.ok) {
      state.automation.lastBrake = { at: core.nowIso(), reasons: pf.reasons };
      saveAutomation();
      log('automation', 'brake', `실행하지 않음: ${pf.reasons.join(' / ')}`);
      notify('Drives Sync 자동화 중단', pf.reasons[0]);
      showBanner('자동 실행을 건너뛰었습니다.\n' + pf.reasons.join('\n'), 'bad');
      if (pf.needLogin || pf.mismatch) { state.config.automation.enabled = false; saveConfig(); this.stop(); log('automation', 'warn', '로그인 문제로 자동화를 껐습니다. 문제를 해결한 뒤 다시 켜세요.'); }
      else this.schedule();
      renderAutomation();
      return { ok: false, braked: true, reasons: pf.reasons, preflight: pf };
    }
    state.automation.lastBrake = null;
    const res = await doFlow({ folderIds: state.folders.filter((f) => f.mode === 'handle').map((f) => f.id), trigger, strict: true });
    state.automation.lastRunAt = core.nowIso();
    state.lastRuns.automation = res;
    saveLastRuns();
    if (res.braked) { state.automation.lastBrake = { at: core.nowIso(), reasons: res.reasons }; log('automation', 'brake', `실행하지 않음: ${res.reasons.join(' / ')}`); notify('Drives Sync 자동화 중단', res.reasons[0]); }
    else if (res.ok) { log('automation', 'info', `완료: ${res.uploaded}개 업로드, ${res.failed}개 실패`); if (res.uploaded || res.failed) notify('Drives Sync 자동 업로드', `${res.uploaded}개 업로드, ${res.failed}개 실패`); }
    else log('automation', 'error', `오류: ${(res.reasons || []).join(' / ')}`);
    this.schedule();
    return res;
  },
  async enable({ intervalMinutes } = {}) {
    if (intervalMinutes !== undefined) state.config.automation.intervalMinutes = Number(intervalMinutes);
    saveConfig();
    const pf = await automationPrereqs();
    if (!pf.ok) {
      state.config.automation.enabled = false;
      saveConfig();
      renderAutomation();
      log('automation', 'brake', `자동화를 켤 수 없습니다: ${pf.reasons.join(' / ')}`);
      showBanner('자동화를 켤 수 없습니다.\n' + pf.reasons.join('\n'), 'bad');
      return { ok: false, braked: true, reasons: pf.reasons, preflight: pf };
    }
    state.config.automation.enabled = true;
    saveConfig();
    state.automation.nextRunAt = null;
    saveAutomation();
    hideBanner();
    log('automation', 'info', `자동화 켜짐: ${state.config.automation.intervalMinutes}분마다 Flow Matching 실행`);
    renderAutomation();
    this.start();
    updateWakeLock();
    return { ok: true, intervalMinutes: state.config.automation.intervalMinutes };
  },
  disable() {
    state.config.automation.enabled = false;
    saveConfig();
    state.automation.nextRunAt = null;
    saveAutomation();
    this.stop();
    updateWakeLock();
    log('automation', 'info', '자동화 꺼짐');
    renderAutomation();
    return { ok: true };
  },
  status() {
    return { enabled: !!state.config.automation.enabled, intervalMinutes: state.config.automation.intervalMinutes, nextRunAt: state.automation.nextRunAt, lastRunAt: state.automation.lastRunAt, lastBrake: state.automation.lastBrake, lastResult: state.lastRuns.automation || null };
  },
};

async function updateWakeLock() {
  const want = state.config.automation.enabled && state.config.automation.keepAwake && document.visibilityState === 'visible';
  if (want && !state.wakeLock && 'wakeLock' in navigator) {
    try { state.wakeLock = await navigator.wakeLock.request('screen'); state.wakeLock.addEventListener('release', () => { state.wakeLock = null; }); } catch (e) { log('automation', 'warn', `화면 켜짐 유지 실패: ${e.message}`); }
  } else if (!want && state.wakeLock) { try { await state.wakeLock.release(); } catch { /* ignore */ } state.wakeLock = null; }
}
function notify(title, body) {
  if (!state.config.automation.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: ICON_192 }); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ rendering */
function renderChip(id, st, text) { const el = $(id); el.dataset.state = st; const t = el.querySelector('.chip-text'); if (t) t.textContent = text; else el.textContent = text; }
function showBanner(text, kind = '') { const b = $('banner'); b.className = 'banner ' + kind; b.innerHTML = `<span class="banner-text"></span><button class="btn-secondary small" type="button">닫기</button>`; b.querySelector('.banner-text').textContent = text; b.querySelector('button').onclick = hideBanner; b.hidden = false; }
function hideBanner() { $('banner').hidden = true; }

function renderStatus() {
  const cfg = state.config;
  if (state.google.email) renderChip('status-google', 'ok', state.google.email);
  else if (googleAuth.hasAny()) renderChip('status-google', 'warn', googleAuth.isValid() ? '연결됨 (계정 미확인)' : '토큰 만료 - 점검 필요');
  else renderChip('status-google', 'off', '연결 안 됨');
  const ghTok = store.get(LS.ghToken, null);
  if (state.github.login) renderChip('status-github', 'ok', `${state.github.login} · ${cfg.github.owner}/${cfg.github.repo}`);
  else if (ghTok) renderChip('status-github', 'warn', '토큰 저장됨 (미확인)');
  else renderChip('status-github', 'off', '토큰 없음');
  $('google-state').textContent = state.google.email
    ? `${state.google.email} 로 연결됨 · ${googleAuth.describe()}${googleAuth.token ? ` · 토큰 만료 ${fmtTime(new Date(googleAuth.token.expires_at).toISOString())}` : ''}`
    : googleAuth.hasAny() ? `토큰이 저장되어 있습니다 (${googleAuth.describe()}). 사전 점검으로 계정을 확인하세요.` : '이 기기에서 Google Drive에 로그인되어 있지 않습니다.';
  $('github-state').textContent = ghTok ? (state.github.login ? `${state.github.login} 계정의 토큰이 저장되어 있습니다.` : '토큰이 저장되어 있습니다. 사전 점검으로 확인하세요.') : '저장된 GitHub 토큰이 없습니다.';
  $('github-token').placeholder = ghTok ? '저장됨 (바꾸려면 새 토큰 입력)' : 'github_pat_...';
  document.body.dataset.google = state.google.email || '';
  document.body.dataset.github = state.github.login || '';
  const branch = cfg.github.branch || 'HEAD';
  $('target-link').href = `https://github.com/${cfg.github.owner}/${cfg.github.repo}/tree/${encodeURIComponent(branch)}/${core.joinPath(cfg.github.targetPath)}`;
  $('target-link').textContent = `${cfg.github.owner}/${cfg.github.repo}/${core.joinPath(cfg.github.targetPath)}`;
  $('stock-from').textContent = `Google Drive · ${cfg.google.sourceFolderId && cfg.google.sourceFolderId !== 'root' ? (cfg.google.sourceFolderName || cfg.google.sourceFolderId) : '내 드라이브 전체'}`;
  $('stock-to').textContent = `${cfg.github.owner}/${cfg.github.repo}${cfg.github.branch ? '@' + cfg.github.branch : ''} : ${core.joinPath(cfg.github.targetPath)}`;
  $('flow-from').textContent = `${cfg.device.name} 의 폴더`;
  $('flow-mid').textContent = `Google Drive · ${core.joinPath(cfg.flow.driveSubPath, cfg.device.name)}/<폴더>`;
  $('flow-to').textContent = `${cfg.github.owner}/${cfg.github.repo} : ${core.joinPath(cfg.github.targetPath, cfg.flow.driveSubPath, cfg.device.name)}/<폴더>`;
  $('stock-last').textContent = state.lastRuns.stock ? `마지막 실행 ${fmtTime(state.lastRuns.stock.finishedAt || state.lastRuns.stock.at)}` : '';
  $('flow-last').textContent = state.lastRuns.flow ? `마지막 실행 ${fmtTime(state.lastRuns.flow.finishedAt || state.lastRuns.flow.at)}` : '';
  $('google-longrun-state').textContent = googleAuth.mode === 'refresh'
    ? `켜짐 (${fmtTime(googleAuth.refresh.at)}부터). 토큰이 자동 갱신되어 창이 열려 있는 한 무인 실행이 이어집니다. Google Cloud 프로젝트가 "테스트" 상태이면 7일마다 다시 인증해야 합니다.`
    : '꺼짐. 기본 연결은 1시간짜리 토큰을 쓰며, 만료 시 조용히 갱신을 시도하고 실패하면 재로그인을 요청합니다.';
  renderAgentState();
}

function renderChecks(ul, checks) {
  ul.innerHTML = '';
  if (!checks || !checks.length) { ul.innerHTML = '<li class="empty">점검 결과가 없습니다.</li>'; return; }
  for (const c of checks) {
    const li = document.createElement('li');
    li.className = c.ok ? 'ok' : 'fail';
    li.innerHTML = `<span class="mark">${c.ok ? '✓' : '✗'}</span><span class="label"></span><span class="detail"></span>`;
    li.querySelector('.label').textContent = c.label;
    li.querySelector('.detail').textContent = c.detail || '';
    ul.appendChild(li);
  }
}

function renderPreflight(pf) {
  renderChecks($('preflight-result'), pf && pf.checks);
  $('preflight-time').textContent = pf ? `${fmtTime(pf.at)} 점검 · ${pf.ok ? '모두 통과' : `${pf.reasons.length}개 실패`}` : '';
  renderChip('chip-preflight', pf ? (pf.ok ? 'ok' : 'fail') : 'idle', pf ? (pf.ok ? '통과' : '실패') : '점검 전');
  $('btn-create-target').hidden = !(pf && pf.missingTarget && pf.checks.find((c) => c.id === 'github.write' && c.ok));
}

function showProgress(section, on) {
  const el = $(`${section}-progress`);
  el.hidden = !on;
  const bar = el.querySelector('.progress-bar');
  bar.classList.toggle('indeterminate', on);
  bar.querySelector('span').style.width = '0%';
  el.querySelector('.progress-text').textContent = on ? '준비 중…' : '';
  renderChip(`chip-${section}`, on ? 'running' : 'idle', on ? '실행 중' : '대기');
}
function renderProgress(section, p) {
  const el = $(`${section}-progress`);
  if (el.hidden) return;
  const bar = el.querySelector('.progress-bar');
  const text = el.querySelector('.progress-text');
  if (p.total) {
    bar.classList.remove('indeterminate');
    bar.querySelector('span').style.width = `${Math.round((p.done / p.total) * 100)}%`;
    text.textContent = `${p.done}/${p.total}${p.folder ? ` [${p.folder}]` : ''} ${p.current ? '· ' + p.current : ''}`;
  } else {
    bar.classList.add('indeterminate');
    text.textContent = p.detail || (p.phase === 'commit' ? `커밋 완료 ${p.committed}개` : p.phase || '');
  }
  emit('progress', { section, ...p });
}

function commitLinks(commits) {
  return (commits || []).map((c) => `<a href="${escapeHtml(c.url || '#')}" target="_blank" rel="noopener">${c.sha.slice(0, 7)}</a> (${c.files})`).join(', ');
}
function renderSummary(section, res) {
  const el = $(`${section}-summary`);
  el.hidden = false;
  el.classList.toggle('braked', !!res.braked || !!res.error);
  if (res.braked) {
    el.innerHTML = `<b>작업하지 않았습니다 (브레이크).</b><ul>${res.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
    renderChip(`chip-${section}`, 'braked', '중단됨');
    return;
  }
  if (res.error) { el.innerHTML = `<b>오류:</b> ${escapeHtml(res.error)}`; renderChip(`chip-${section}`, 'error', '오류'); return; }
  if (res.aborted) { el.innerHTML = '<b>중지되었습니다.</b> 이미 커밋된 배치는 그대로 남고, 다음 실행에서 이어서 진행합니다.'; renderChip(`chip-${section}`, 'warn', '중지'); return; }
  if (section === 'stock') {
    const parts = [`Drive 파일 ${res.listed}개 (폴더 ${res.folders}개)`, `변경 없음 ${res.unchanged}`, `건너뜀 ${res.skipped.length}`];
    if (res.dryRun) el.innerHTML = `<b>미리 보기:</b> 동기화 대상 ${res.planned}개 · ${parts.join(' · ')}${res.plan && res.plan.length ? `<ul>${res.plan.slice(0, 50).map((p) => `<li>${escapeHtml(p.path)} ${p.size ? `(${core.formatBytes(p.size)})` : ''}</li>`).join('')}${res.plan.length > 50 ? `<li>… 외 ${res.plan.length - 50}개</li>` : ''}</ul>` : ''}`;
    else el.innerHTML = `<b>${res.synced}개 동기화</b> (${core.formatBytes(res.bytes)}) · 실패 ${res.failed.length} · ${parts.join(' · ')} · 커밋 ${res.commits.length}개 ${commitLinks(res.commits)}${res.failed.length ? `<ul>${res.failed.slice(0, 20).map((f) => `<li>${escapeHtml(f.path)}: ${escapeHtml(f.error)}</li>`).join('')}</ul>` : ''}`;
    renderChip('chip-stock', res.failed && res.failed.length ? 'warn' : 'ok', res.dryRun ? '미리 보기' : `${res.synced}개 동기화`);
  } else {
    const rows = (res.folders || []).map((f) => `<li><b>${escapeHtml(f.label)}</b>: 검사 ${f.scanned}, 새 파일 ${f.fresh}${res.dryRun ? '' : `, 업로드 ${f.uploaded}, 실패 ${f.failed.length}`}${f.error ? ` · 오류: ${escapeHtml(f.error)}` : ''}${f.skipped && f.skipped.length ? ` · 건너뜀 ${f.skipped.length}` : ''}</li>`);
    for (const s of res.skippedFolders || []) rows.push(`<li><b>${escapeHtml(s.label)}</b>: 건너뜀 - ${escapeHtml(s.reason)}</li>`);
    el.innerHTML = `${res.dryRun ? '<b>미리 보기</b>' : `<b>${res.uploaded}개 업로드</b> (${core.formatBytes(res.bytes)}) · 실패 ${res.failed} · 커밋 ${(res.commits || []).length}개 ${commitLinks(res.commits)}`}<ul>${rows.join('')}</ul>`;
    renderChip('chip-flow', res.failed ? 'warn' : 'ok', res.dryRun ? '미리 보기' : `${res.uploaded}개 업로드`);
  }
}

async function renderFolders() {
  const list = $('flow-folder-list');
  if (!state.folders.length) { list.innerHTML = '<p class="hint empty">아직 지정된 폴더가 없습니다. "폴더 추가"로 이 기기의 폴더를 지정하세요. 여러 폴더를 지정하면 병렬로 업로드합니다.</p>'; return; }
  const cards = await Promise.all(state.folders.map(async (f) => {
    const r = await folderReadiness(f);
    const div = document.createElement('div');
    div.className = 'folder' + (r.ready ? '' : ' not-ready');
    div.dataset.id = f.id;
    const drivePath = core.joinPath(f.driveSubPath || core.joinPath(state.config.flow.driveSubPath, state.config.device.name, f.label));
    div.innerHTML = `
      <div class="f-head"><span class="f-label"></span><span class="f-mode">${f.mode === 'handle' ? '지속 접근' : '실행 시 선택'}</span><span class="f-state ${r.ready ? 'ok' : 'warn'}"></span></div>
      <div class="f-meta"><span>Drive: <code class="f-path"></code></span><span>마지막 실행: ${fmtTime(f.lastRun)}</span>${f.lastResult ? `<span>업로드 ${f.lastResult.uploaded} · 실패 ${f.lastResult.failed} · 검사 ${f.lastResult.scanned}</span>` : ''}${f.fileCount != null ? `<span>파일 ${f.fileCount}개</span>` : ''}</div>
      <div class="f-actions"></div>`;
    div.querySelector('.f-label').textContent = f.label;
    div.querySelector('.f-path').textContent = drivePath;
    div.querySelector('.f-state').textContent = r.ready ? '준비됨' : r.reason;
    const actions = div.querySelector('.f-actions');
    const btn = (text, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls + ' small'; b.textContent = text; b.disabled = !!state.running; b.onclick = fn; actions.appendChild(b); return b; };
    if (f.mode === 'handle') {
      if (r.permission === 'prompt') btn('권한 승인', 'btn', async () => { const h = await handles.get(f.id); try { await h.requestPermission({ mode: 'read' }); } catch (e) { log('flow', 'error', e.message); } renderFolders(); });
      if (r.reselect) btn('폴더 다시 선택', 'btn', () => reselectFolder(f));
      btn('지금 업로드', r.ready ? 'btn' : 'btn-secondary', () => doFlow({ folderIds: [f.id] }));
    } else {
      btn(r.ready ? '선택한 파일 업로드' : '폴더 선택 후 업로드', 'btn', () => { if (r.ready) doFlow({ folderIds: [f.id] }); else pickOneshot(f, 'dir'); });
      btn('파일 선택', 'btn-secondary', () => pickOneshot(f, 'files'));
    }
    btn('경로', 'btn-secondary', () => { const p = prompt('Google Drive 안의 저장 경로 (원본 폴더 기준, 비우면 기본값)', f.driveSubPath || drivePath); if (p === null) return; f.driveSubPath = core.joinPath(p); saveFolders(); renderFolders(); });
    btn('제외', 'btn-danger', async () => { if (!confirm(`"${f.label}" 폴더를 목록에서 제외할까요? Drive와 GitHub의 파일은 그대로 남습니다.`)) return; removeFolder(f.id); });
    return div;
  }));
  list.innerHTML = '';
  for (const c of cards) list.appendChild(c);
}

function renderAutomation() {
  const cfg = state.config.automation;
  $('auto-toggle').checked = !!cfg.enabled;
  $('auto-interval').value = cfg.intervalMinutes;
  $('auto-keepawake').checked = !!cfg.keepAwake;
  $('auto-notify').checked = !!cfg.notify;
  const next = state.automation.nextRunAt;
  let text = cfg.enabled ? (next ? `다음 실행: ${fmtTime(next)}${Date.now() >= Date.parse(next) ? ' (지금)' : ''}` : '다음 실행: 곧') : '다음 실행: — (꺼짐)';
  if (state.automation.lastRunAt) text += ` · 마지막 자동 실행: ${fmtTime(state.automation.lastRunAt)}`;
  if (state.automation.lastBrake) text += ` · 마지막 중단: ${fmtTime(state.automation.lastBrake.at)}`;
  $('auto-next').textContent = text;
  renderChip('chip-automation', cfg.enabled ? (state.automation.lastBrake ? 'braked' : 'on') : 'off', cfg.enabled ? (state.automation.lastBrake ? '켜짐 · 중단됨' : `켜짐 · ${cfg.intervalMinutes}분`) : '꺼짐');
  renderAgentState();
}

function publicState() {
  const cfg = structuredClone(state.config);
  cfg.google.clientSecret = cfg.google.clientSecret ? '(저장됨)' : '';
  return {
    app: 'Drives Sync', version: core.VERSION, url: APP_URL, at: core.nowIso(),
    device: cfg.device, running: state.running ? { kind: state.running.kind, startedAt: state.running.startedAt } : null,
    bodyState: document.body.dataset.state,
    google: { connected: googleAuth.hasAny(), email: state.google.email, mode: googleAuth.mode, tokenValid: googleAuth.isValid() },
    github: { tokenStored: !!store.get(LS.ghToken, null), login: state.github.login, repo: `${cfg.github.owner}/${cfg.github.repo}`, branch: cfg.github.branch || '(default)', targetPath: cfg.github.targetPath },
    capabilities: { persistentFolders: supportsHandles, notifications: 'Notification' in window ? Notification.permission : 'unsupported', wakeLock: 'wakeLock' in navigator },
    config: cfg,
    folders: state.folders.map((f) => ({ id: f.id, label: f.label, mode: f.mode, driveSubPath: f.driveSubPath || null, lastRun: f.lastRun || null, lastResult: f.lastResult || null })),
    preflight: state.lastRuns.preflight ? { ok: state.lastRuns.preflight.ok, at: state.lastRuns.preflight.at, reasons: state.lastRuns.preflight.reasons } : null,
    lastRuns: { stock: brief(state.lastRuns.stock), flow: brief(state.lastRuns.flow), automation: brief(state.lastRuns.automation) },
    automation: automation.status(),
  };
}
function brief(r) {
  if (!r) return null;
  const { preflight: _p, plan: _pl, folders, ...rest } = r;
  return { ...rest, ...(Array.isArray(folders) ? { folders: folders.map((f) => ({ id: f.id, label: f.label, scanned: f.scanned, fresh: f.fresh, uploaded: f.uploaded, failed: f.failed && f.failed.length, error: f.error || null })) } : (folders !== undefined ? { folders } : {})) };
}
let agentStateTimer = null;
function renderAgentState() {
  if (agentStateTimer) return;
  agentStateTimer = setTimeout(() => { agentStateTimer = null; try { $('agent-state').textContent = JSON.stringify(publicState(), null, 1); } catch (e) { $('agent-state').textContent = String(e); } }, 80);
}

function renderForms() {
  const cfg = state.config;
  $('device-name').value = cfg.device.name;
  $('google-expected').value = cfg.google.expectedEmail;
  $('github-expected').value = cfg.github.expectedLogin;
  $('github-owner').value = cfg.github.owner;
  $('github-repo').value = cfg.github.repo;
  $('github-branch').value = cfg.github.branch;
  $('github-target').value = cfg.github.targetPath;
  $('stock-source-id').value = cfg.google.sourceFolderId;
  $('stock-source-name').value = cfg.google.sourceFolderName;
  for (const k of ['document', 'spreadsheet', 'presentation', 'drawing']) $(`export-${k}`).value = cfg.google.exports[k];
  $('flow-drive-sub').value = cfg.flow.driveSubPath;
  $('google-client-id').value = cfg.google.clientId;
  $('google-client-secret').value = cfg.google.clientSecret;
  $('limit-max-mb').value = Math.round(cfg.limits.maxFileBytes / 1048576);
  $('limit-batch-files').value = cfg.limits.batchFiles;
  $('limit-concurrency').value = cfg.limits.concurrency;
  $('origin-uri').textContent = location.origin;
  $('redirect-uri').textContent = APP_URL;
  $('app-version').textContent = 'v' + core.VERSION;
  $('flow-capability').textContent = supportsHandles
    ? '이 브라우저는 폴더 지속 접근(File System Access)을 지원합니다. 폴더를 한 번 선택해 두면 이후 실행과 자동화에서 새 파일을 스스로 찾습니다. 브라우저를 다시 열면 "권한 승인" 한 번이 필요할 수 있습니다.'
    : '이 브라우저(휴대폰 등)는 폴더 지속 접근을 지원하지 않습니다. 실행할 때마다 폴더나 파일을 직접 선택하면, 이미 올린 파일은 건너뛰고 새 파일만 업로드합니다. 자동화(기능 3)는 지속 접근을 지원하는 노트북 브라우저(Chrome, Edge)에서 켜세요.';
  $('flow-add-mode').value = supportsHandles ? 'handle' : 'oneshot';
  $('flow-add-mode').querySelector('option[value="handle"]').disabled = !supportsHandles;
}

/* ------------------------------------------------------------------ folder actions */
async function addFolder({ label, driveSubPath, mode }) {
  label = (label || '').trim();
  if (!label) throw new Error('폴더 이름(라벨)을 입력하세요.');
  if (state.folders.some((f) => f.label === label)) throw new Error('같은 이름의 폴더가 이미 있습니다.');
  const folder = { id: 'f-' + core.randomId(5), label, driveSubPath: core.joinPath(driveSubPath || ''), mode: mode === 'handle' && supportsHandles ? 'handle' : 'oneshot', addedAt: core.nowIso(), lastRun: null, lastResult: null };
  if (folder.mode === 'handle') {
    const h = await window.showDirectoryPicker({ mode: 'read' });
    await handles.set(folder.id, h);
    folder.fileCount = (await new HandleSource(h, label).list()).length;
    folder.dirName = h.name;
  }
  state.folders.push(folder);
  saveFolders();
  log('flow', 'info', `폴더 추가: "${label}" (${folder.mode === 'handle' ? '지속 접근' : '실행 시 선택'})`);
  renderFolders();
  renderAgentState();
  return folder;
}
async function reselectFolder(f) {
  try { const h = await window.showDirectoryPicker({ mode: 'read' }); await handles.set(f.id, h); f.dirName = h.name; saveFolders(); log('flow', 'info', `폴더 다시 선택: "${f.label}"`); } catch (e) { if (e.name !== 'AbortError') log('flow', 'error', e.message); }
  renderFolders();
}
function removeFolder(id) {
  const f = state.folders.find((x) => x.id === id);
  if (!f) return false;
  state.folders = state.folders.filter((x) => x.id !== id);
  saveFolders();
  handles.del(id);
  state.oneshot.delete(id);
  log('flow', 'info', `폴더 제외: "${f.label}" (Drive/GitHub의 파일은 유지)`);
  renderFolders();
  renderAgentState();
  return true;
}
let pendingOneshot = null;
function pickOneshot(f, kind) {
  pendingOneshot = f.id;
  const input = $(kind === 'dir' ? 'flow-oneshot-input' : 'flow-oneshot-files');
  input.value = '';
  input.click();
}
function onOneshotChosen(input) {
  const id = pendingOneshot;
  pendingOneshot = null;
  if (!id || !input.files || !input.files.length) return;
  state.oneshot.set(id, Array.from(input.files));
  const f = state.folders.find((x) => x.id === id);
  log('flow', 'info', `"${f ? f.label : id}": ${input.files.length}개 파일 선택됨 - 새 파일만 업로드합니다.`);
  doFlow({ folderIds: [id] });
}

/* ------------------------------------------------------------------ GitHub helpers used by the UI */
async function createTargetFolder() {
  return guarded('preflight', async (signal) => {
    const ctx = makeCtx('preflight', signal);
    const target = core.joinPath(state.config.github.targetPath);
    const readme = `# ${target.split('/').pop()}\n\nDrives Sync가 동기화 대상으로 쓰는 폴더입니다. 이 폴더의 파일은 자유롭게 열람하고 정리해도 됩니다. 앱은 파일을 추가하거나 갱신만 하고 삭제하지 않습니다.\n`;
    const res = await ctx.github.commitEntries({ message: `Drives Sync: create ${target}`, buildEntries: async () => [{ path: core.joinPath(target, 'README.md'), content: readme }] });
    log('preflight', 'info', `대상 폴더 생성 커밋 ${res.sha.slice(0, 7)}: ${target}/README.md`);
    await doPreflight();
    return { ok: true, commit: res.sha };
  });
}
async function resetManifest() {
  if (!confirm('저장소의 매니페스트를 비웁니다. 다음 Stock/Flow 실행에서 모든 파일을 다시 확인해 같은 경로에 덮어씁니다(삭제 없음). 계속할까요?')) return { ok: false };
  return guarded('preflight', async (signal) => {
    const ctx = makeCtx('preflight', signal);
    const pf = await core.preflight(ctx, { scope: 'stock' });
    if (!pf.ok) { renderPreflight(pf); showBanner(pf.reasons.join('\n'), 'bad'); return { ok: false, braked: true, reasons: pf.reasons }; }
    const path = core.joinPath(state.config.github.targetPath, core.MANIFEST_FILE);
    const res = await ctx.github.commitEntries({ message: 'Drives Sync: reset manifest', buildEntries: async () => [{ path, content: JSON.stringify(core.emptyManifest(state.config), null, 1) + '\n' }] });
    log('preflight', 'info', `매니페스트 초기화 커밋 ${res.sha.slice(0, 7)}`);
    return { ok: true, commit: res.sha };
  });
}

/* ------------------------------------------------------------------ wiring */
function bindConfigInputs() {
  const bind = (id, apply, event = 'change') => $(id).addEventListener(event, (e) => { apply(e.target.value); saveConfig(); renderStatus(); renderFolders(); });
  bind('device-name', (v) => { state.config.device.name = v.trim() || state.config.device.name; });
  bind('google-expected', (v) => { state.config.google.expectedEmail = v.trim(); });
  bind('github-expected', (v) => { state.config.github.expectedLogin = v.trim(); });
  bind('github-owner', (v) => { state.config.github.owner = v.trim(); });
  bind('github-repo', (v) => { state.config.github.repo = v.trim(); });
  bind('github-branch', (v) => { state.config.github.branch = v.trim(); });
  bind('github-target', (v) => { state.config.github.targetPath = core.joinPath(v); $('github-target').value = state.config.github.targetPath; });
  bind('stock-source-id', (v) => { const id = v.trim() || 'root'; state.config.google.sourceFolderId = id; $('stock-source-id').value = id; });
  bind('stock-source-name', (v) => { state.config.google.sourceFolderName = v.trim(); });
  for (const k of ['document', 'spreadsheet', 'presentation', 'drawing']) bind(`export-${k}`, (v) => { state.config.google.exports[k] = v; });
  bind('flow-drive-sub', (v) => { state.config.flow.driveSubPath = core.joinPath(v) || 'DrivesSync'; $('flow-drive-sub').value = state.config.flow.driveSubPath; });
  bind('google-client-id', (v) => { state.config.google.clientId = v.trim(); });
  bind('google-client-secret', (v) => { state.config.google.clientSecret = v.trim(); });
  bind('limit-max-mb', (v) => { state.config.limits.maxFileBytes = Math.min(100, Math.max(1, Number(v) || 100)) * 1048576; });
  bind('limit-batch-files', (v) => { state.config.limits.batchFiles = Math.min(200, Math.max(1, Number(v) || 20)); });
  bind('limit-concurrency', (v) => { state.config.limits.concurrency = Math.min(8, Math.max(1, Number(v) || 3)); });
  $('auto-interval').addEventListener('change', (e) => { state.config.automation.intervalMinutes = Math.max(1, Number(e.target.value) || 30); e.target.value = state.config.automation.intervalMinutes; saveConfig(); if (state.config.automation.enabled) automation.schedule(); renderAutomation(); });
  $('auto-keepawake').addEventListener('change', (e) => { state.config.automation.keepAwake = e.target.checked; saveConfig(); updateWakeLock(); });
  $('auto-notify').addEventListener('change', async (e) => {
    state.config.automation.notify = e.target.checked;
    if (e.target.checked && 'Notification' in window && Notification.permission === 'default') { const p = await Notification.requestPermission(); if (p !== 'granted') { state.config.automation.notify = false; e.target.checked = false; } }
    saveConfig();
  });
}

function bindButtons() {
  $('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('lobby-theme', next); } catch { /* ignore */ }
  });
  $('btn-google-connect').addEventListener('click', async () => {
    const b = $('btn-google-connect');
    b.disabled = true;
    try {
      const about = await googleAuth.connect({ consent: true });
      log('preflight', 'info', `Google Drive 연결: ${about.email}`);
      hideBanner();
      renderStatus();
      await doPreflight({ quiet: true });
    } catch (e) { log('preflight', 'error', e.message); showBanner(e.message, 'bad'); renderStatus(); } finally { b.disabled = false; }
  });
  $('btn-google-disconnect').addEventListener('click', async () => { await googleAuth.disconnect(); state.lastRuns.preflight = null; renderPreflight(null); log('preflight', 'info', 'Google Drive 연결 해제'); renderStatus(); });
  $('btn-github-save').addEventListener('click', async () => {
    const v = $('github-token').value.trim();
    if (!v) { showBanner('GitHub 토큰을 입력하세요.'); return; }
    store.set(LS.ghToken, v);
    $('github-token').value = '';
    state.github.login = null;
    log('preflight', 'info', 'GitHub 토큰 저장');
    renderStatus();
    await doPreflight({ quiet: true });
  });
  $('btn-preflight').addEventListener('click', () => guarded('preflight', () => doPreflight()));
  $('btn-create-target').addEventListener('click', createTargetFolder);
  $('btn-stock-run').addEventListener('click', () => doStock());
  $('btn-stock-dry').addEventListener('click', () => doStock({ dryRun: true }));
  $('btn-stock-stop').addEventListener('click', () => state.running && state.running.abort.abort());
  $('btn-flow-stop').addEventListener('click', () => state.running && state.running.abort.abort());
  $('btn-flow-run-all').addEventListener('click', () => doFlow());
  $('btn-flow-dry').addEventListener('click', () => doFlow({ dryRun: true }));
  $('btn-flow-add').addEventListener('click', () => { $('flow-add-form').hidden = false; $('flow-add-label').focus(); });
  $('flow-add-cancel').addEventListener('click', () => { $('flow-add-form').hidden = true; });
  $('flow-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await addFolder({ label: $('flow-add-label').value, driveSubPath: $('flow-add-path').value, mode: $('flow-add-mode').value });
      $('flow-add-form').hidden = true;
      $('flow-add-label').value = '';
      $('flow-add-path').value = '';
    } catch (err) { if (err.name !== 'AbortError') { log('flow', 'error', err.message); showBanner(err.message, 'bad'); } }
  });
  $('flow-oneshot-input').addEventListener('change', (e) => onOneshotChosen(e.target));
  $('flow-oneshot-files').addEventListener('change', (e) => onOneshotChosen(e.target));
  $('auto-toggle').addEventListener('change', async (e) => { if (e.target.checked) await automation.enable(); else automation.disable(); });
  $('btn-auto-check').addEventListener('click', () => guarded('preflight', async () => { const pf = await automationPrereqs(); if (!pf.ok) showBanner(pf.reasons.join('\n'), 'bad'); else hideBanner(); return pf; }));
  $('btn-auto-run-now').addEventListener('click', () => automation.runOnce('manual-automation'));
  $('btn-copy-state').addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(publicState(), null, 2)); log('app', 'info', '상태 JSON을 복사했습니다.'); } catch (e) { log('app', 'warn', `복사 실패: ${e.message}`); } });
  $('btn-export-logs').addEventListener('click', () => download(`drives-sync-logs-${Date.now()}.json`, JSON.stringify({ state: publicState(), logs: state.logs }, null, 1)));
  $('btn-clear-logs').addEventListener('click', () => { state.logs = []; store.del(LS.logs); for (const s of Object.keys(logEls)) renderLog(s); });
  $('btn-google-longrun').addEventListener('click', async () => { try { await googleAuth.startLongRun(); } catch (e) { showBanner(e.message, 'bad'); } });
  $('btn-google-longrun-clear').addEventListener('click', () => { googleAuth.clearRefresh(); log('app', 'info', '장기 인증을 지웠습니다.'); renderStatus(); });
  $('btn-config-export').addEventListener('click', () => { const cfg = structuredClone(state.config); cfg.google.clientSecret = ''; download('drives-sync-config.json', JSON.stringify({ config: cfg, folders: state.folders.map((f) => ({ ...f, mode: 'oneshot' })) }, null, 1)); });
  $('config-import').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.config) { const dev = state.config.device; state.config = normalizeConfig(core.withDefaults(data.config)); state.config.device = dev; saveConfig(); }
      renderForms(); renderStatus(); renderAutomation();
      log('app', 'info', '설정을 가져왔습니다 (폴더 접근 권한은 기기마다 다시 지정해야 합니다).');
    } catch (err) { showBanner(`설정 가져오기 실패: ${err.message}`, 'bad'); }
    e.target.value = '';
  });
  $('btn-manifest-reset').addEventListener('click', resetManifest);
  $('btn-reset-all').addEventListener('click', async () => {
    if (!confirm('이 기기의 앱 데이터(토큰, 설정, 폴더 지정, 로그)를 모두 지웁니다. 저장소와 Drive의 파일은 그대로입니다. 계속할까요?')) return;
    await googleAuth.disconnect().catch(() => null);
    for (const f of state.folders) await handles.del(f.id);
    for (const k of Object.values(LS)) store.del(k);
    location.reload();
  });
  $('install-btn').addEventListener('click', async () => { const p = state.installPrompt; if (!p) return; $('install-btn').hidden = true; await p.prompt(); state.installPrompt = null; });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; $('install-btn').hidden = false; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { automation.tick(); updateWakeLock(); } });
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------------------------------------------ agent API */
window.DrivesSync = {
  version: core.VERSION,
  getState: () => publicState(),
  preflight: ({ scope = 'stock' } = {}) => guarded('preflight', () => doPreflight({ scope })),
  runStock: (opts = {}) => doStock({ dryRun: !!opts.dryRun, trigger: opts.trigger || 'agent' }),
  runFlow: (opts = {}) => doFlow({ folderIds: opts.folderIds, dryRun: !!opts.dryRun, trigger: opts.trigger || 'agent', strict: !!opts.strict }),
  automation: { enable: (o) => automation.enable(o || {}), disable: () => automation.disable(), status: () => automation.status(), runNow: () => automation.runOnce('agent') },
  config: {
    get: () => publicState().config,
    set: (patch) => { const dev = state.config.device; state.config = normalizeConfig(core.withDefaults(core.deepMerge(state.config, patch || {}))); if (patch && patch.device) state.config.device = { ...dev, ...patch.device }; saveConfig(); renderForms(); renderStatus(); renderAutomation(); return publicState().config; },
  },
  folders: {
    list: () => publicState().folders,
    /** mode 'oneshot' works without a user gesture; 'handle' opens the folder picker and needs one. */
    add: async ({ label, driveSubPath, mode = 'oneshot' } = {}) => { const f = await addFolder({ label, driveSubPath, mode }); return { id: f.id, label: f.label, mode: f.mode, driveSubPath: f.driveSubPath }; },
    remove: (id) => removeFolder(id),
    update: (id, patch) => { const f = state.folders.find((x) => x.id === id); if (!f) return null; if (patch.label) f.label = String(patch.label); if (patch.driveSubPath !== undefined) f.driveSubPath = core.joinPath(patch.driveSubPath); saveFolders(); renderFolders(); return { id: f.id, label: f.label, driveSubPath: f.driveSubPath }; },
    readiness: async (id) => { const f = state.folders.find((x) => x.id === id); if (!f) return null; const r = await folderReadiness(f); return { ready: r.ready, reason: r.reason || null }; },
  },
  tokens: { setGitHub: (token) => { if (!token) store.del(LS.ghToken); else store.set(LS.ghToken, String(token).trim()); state.github.login = null; renderStatus(); return { ok: true }; } },
  logs: { get: (n = 200) => state.logs.slice(-n), clear: () => { state.logs = []; store.del(LS.logs); for (const s of Object.keys(logEls)) renderLog(s); return { ok: true }; } },
  on: (event, fn) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return () => listeners.get(event).delete(fn); },
};

/* ------------------------------------------------------------------ single-file edition helpers */
/** The one-file edition has no manifest.webmanifest, so it offers an equivalent one from memory. */
function installSingleFileManifest() {
  try {
    const dir = location.href.split(/[?#]/)[0].replace(/[^/]*$/, '');
    const manifest = {
      name: 'Drives Sync', short_name: 'Drives Sync', description: 'Google Drive, GitHub Drive 저장소, 기기 폴더를 한 방향으로 누적 동기화합니다.',
      start_url: location.href.split(/[?#]/)[0], scope: dir, display: 'standalone', lang: 'ko', background_color: '#f9f9f7', theme_color: '#2a78d6',
      icons: [
        { src: BUILD.icon192, sizes: '192x192', type: 'image/png' },
        { src: BUILD.icon512, sizes: '512x512', type: 'image/png' },
        { src: BUILD.iconMaskable || BUILD.icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ].filter((i) => i.src),
    };
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    document.head.appendChild(link);
  } catch { /* the page still works without an install manifest */ }
}
function showPreviewNote() {
  const note = document.createElement('div');
  note.className = 'banner';
  note.id = 'preview-note';
  note.innerHTML = '<span class="banner-text"><b>미리 보기입니다.</b> 화면, 설정, 사전 점검(브레이크)의 동작만 확인할 수 있습니다. </span>';
  note.querySelector('.banner-text').append(PREVIEW_REASON);
  document.querySelector('.wrap').prepend(note);
  // file saves are inert inside the preview host
  for (const id of ['btn-export-logs', 'btn-config-export']) { const b = $(id); b.disabled = true; b.title = '미리 보기에서는 파일 저장이 막혀 있습니다.'; }
  $('config-import').disabled = true;
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  if (!document.body.dataset.state) document.body.dataset.state = 'idle';
  if (BUILD.single) installSingleFileManifest();
  if (PREVIEW) showPreviewNote();
  renderForms();
  bindConfigInputs();
  bindButtons();
  for (const s of Object.keys(logEls)) renderLog(s);
  renderPreflight(state.lastRuns.preflight);
  if (state.lastRuns.stock) renderSummary('stock', state.lastRuns.stock);
  if (state.lastRuns.flow) renderSummary('flow', state.lastRuns.flow);
  renderAutomation();
  renderStatus();
  await renderFolders();
  try {
    if (await googleAuth.handleRedirect()) { log('app', 'info', 'Google 장기 인증을 저장했습니다.'); renderStatus(); }
  } catch (e) { log('app', 'error', e.message); showBanner(e.message, 'bad'); }
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !BUILD.single) navigator.serviceWorker.register('sw.js').catch((e) => log('app', 'warn', `서비스 워커 등록 실패: ${e.message}`));
  if (location.protocol === 'file:') showBanner('파일을 직접 열면(file://) Google 로그인이 되지 않습니다. GitHub Pages 주소에서 열거나, 이 파일이 있는 폴더에서 "python -m http.server 8000"을 실행해 http://localhost:8000 으로 여세요.');
  if (googleAuth.hasAny() && store.get(LS.ghToken, null)) await guarded('preflight', () => doPreflight({ quiet: true }));
  if (state.config.automation.enabled) { log('automation', 'info', '앱을 다시 열어 자동화를 재개합니다.'); automation.start(); updateWakeLock(); }
  log('app', 'info', `Drives Sync v${core.VERSION} 준비 (${state.config.device.name})`);
  renderAgentState();
}
boot();
