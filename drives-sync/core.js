/* Drives Sync - core engine.
   Shared by the web app (app.js), the window.DrivesSync agent API and the Node agent CLI
   (agent/drives-sync-cli.mjs). Runs in any modern browser and in Node 18+. No dependencies.

   One-way, additive synchronisation:
     Stock Matching   Google Drive folder  -> GitHub repository folder   (never deletes)
     Flow Matching    device folder        -> Google Drive -> GitHub     (never deletes)
   Every operation starts with a preflight; if any check fails the operation is "braked":
   nothing is written and the reasons are returned to whoever asked (person or agent). */

export const VERSION = '1.0.0';
export const MANIFEST_DIR = '.drives-sync';
export const MANIFEST_FILE = '.drives-sync/manifest.json';

export const GOOGLE_SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive';
export const GOOGLE_SCOPE_DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
export const GOOGLE_SCOPE_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';
export const GOOGLE_SCOPES = [GOOGLE_SCOPE_DRIVE, GOOGLE_SCOPE_EMAIL];

export const GOOGLE_FOLDER = 'application/vnd.google-apps.folder';
export const GOOGLE_SHORTCUT = 'application/vnd.google-apps.shortcut';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GITHUB_API = 'https://api.github.com';

/** Export formats for Google-native documents (they have no bytes of their own). */
export const GOOGLE_EXPORTS = {
  'application/vnd.google-apps.document': {
    key: 'document', label: 'Google 문서', default: 'docx',
    formats: {
      docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
      pdf: { mime: 'application/pdf', ext: 'pdf' },
      md: { mime: 'text/markdown', ext: 'md' },
      txt: { mime: 'text/plain', ext: 'txt' },
      html: { mime: 'text/html', ext: 'html' },
    },
  },
  'application/vnd.google-apps.spreadsheet': {
    key: 'spreadsheet', label: 'Google 스프레드시트', default: 'xlsx',
    formats: {
      xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
      pdf: { mime: 'application/pdf', ext: 'pdf' },
      csv: { mime: 'text/csv', ext: 'csv' },
    },
  },
  'application/vnd.google-apps.presentation': {
    key: 'presentation', label: 'Google 프레젠테이션', default: 'pptx',
    formats: {
      pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
      pdf: { mime: 'application/pdf', ext: 'pdf' },
      txt: { mime: 'text/plain', ext: 'txt' },
    },
  },
  'application/vnd.google-apps.drawing': {
    key: 'drawing', label: 'Google 드로잉', default: 'png',
    formats: {
      png: { mime: 'image/png', ext: 'png' },
      svg: { mime: 'image/svg+xml', ext: 'svg' },
      pdf: { mime: 'application/pdf', ext: 'pdf' },
    },
  },
  'application/vnd.google-apps.script': {
    key: 'script', label: 'Apps Script', default: 'json',
    formats: { json: { mime: 'application/vnd.google-apps.script+json', ext: 'json' } },
  },
  'application/vnd.google-apps.jam': {
    key: 'jam', label: 'Jamboard', default: 'pdf',
    formats: { pdf: { mime: 'application/pdf', ext: 'pdf' } },
  },
};

export const DEFAULT_CONFIG = {
  google: {
    clientId: '',
    clientSecret: '',
    expectedEmail: 'honggusangjoon@gmail.com',
    sourceFolderId: 'root',          // 'root' = the whole "My Drive"
    sourceFolderName: '내 드라이브 전체',
    exports: { document: 'docx', spreadsheet: 'xlsx', presentation: 'pptx', drawing: 'png', script: 'json', jam: 'pdf' },
  },
  github: {
    owner: 'hongguqaz',
    repo: 'Drive',
    branch: '',                      // '' = the repository's default branch
    targetPath: 'fin-lab/FinResearchRaw',
    expectedLogin: 'hongguqaz',
  },
  flow: {
    driveSubPath: 'DrivesSync',      // under the Stock source folder: DrivesSync/<device>/<folder label>
  },
  limits: {
    maxFileBytes: 100 * 1024 * 1024, // GitHub refuses larger blobs
    exportMaxBytes: 10 * 1024 * 1024, // Google export limit
    batchFiles: 20,
    batchBytes: 48 * 1024 * 1024,
    concurrency: 3,
    uploadChunkBytes: 16 * 1024 * 1024, // multiple of 256 KiB
  },
  automation: { enabled: false, intervalMinutes: 30, keepAwake: false, notify: false },
  device: { id: '', name: '' },
};

/* ------------------------------------------------------------------ small helpers */

export function nowIso() { return new Date().toISOString(); }

export function deepMerge(base, patch) {
  if (patch === undefined || patch === null) return base;
  if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object' || typeof patch !== 'object' || base === null) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
}

export function withDefaults(config) { return deepMerge(structuredClone(DEFAULT_CONFIG), config || {}); }

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

export function abortError() {
  const e = new Error('중지되었습니다.');
  e.name = 'AbortError';
  return e;
}

export function throwIfAborted(signal) { if (signal && signal.aborted) throw abortError(); }

/** Run async jobs with at most `n` in flight. */
export function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '?';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

export async function blobToBase64(blob) {
  if (typeof Buffer !== 'undefined') return Buffer.from(await blob.arrayBuffer()).toString('base64');
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error || new Error('파일을 읽을 수 없습니다.'));
    r.onload = () => resolve(String(r.result).split(',', 2)[1] || '');
    r.readAsDataURL(blob);
  });
}

export function utf8ToBase64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64UrlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomId(len = 16) {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A path segment that git, Windows and macOS all accept. */
export function sanitizeSegment(name) {
  let s = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (!s || s === '.' || s === '..') s = '_';
  if (s.startsWith('.git')) s = '_' + s;
  return s.length > 180 ? s.slice(0, 180) : s;
}

export function splitPath(p) { return String(p ?? '').split('/').map((s) => s.trim()).filter((s) => s && s !== '.'); }

export function joinPath(...parts) { return parts.flatMap(splitPath).join('/'); }

export function isSyncNoise(name) {
  return /^(\.DS_Store|Thumbs\.db|desktop\.ini|\.~lock\..*#|~\$.*|.*\.(tmp|crdownload|part|partial|download|swp))$/i.test(name) || name.startsWith('._');
}

const MIME_BY_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  svg: 'image/svg+xml', mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html', xml: 'application/xml',
  zip: 'application/zip', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  hwp: 'application/x-hwp', hwpx: 'application/hwp+zip',
};

export function guessMime(name, fallback = 'application/octet-stream') {
  const ext = String(name).split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || fallback;
}

export class HttpError extends Error {
  constructor(status, url, body, message) {
    super(message || `HTTP ${status} (${shortUrl(url)})`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

/** Thrown when a brake stops an operation before anything is written. */
export class BrakeError extends Error {
  constructor(reasons, preflight) {
    const list = Array.isArray(reasons) ? reasons : [reasons];
    super('작업이 중단되었습니다: ' + list.join(' / '));
    this.name = 'BrakeError';
    this.reasons = list;
    this.preflight = preflight || null;
  }
}

function shortUrl(url) {
  try { const u = new URL(url); return u.host + u.pathname; } catch { return String(url); }
}

function noop() {}

/** fetch with retries for network errors, 429 and 5xx. */
export async function fetchRetry(fetchImpl, url, init = {}, { retries = 3, signal, log = noop, label } = {}) {
  let attempt = 0;
  for (;;) {
    throwIfAborted(signal);
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw abortError();
      if (attempt >= retries) throw new HttpError(0, url, null, `네트워크 오류 (${shortUrl(url)}): ${e.message}`);
      attempt++;
      log('warn', `네트워크 오류, ${attempt}번째 재시도: ${label || shortUrl(url)}`);
      await sleep(1000 * 2 ** (attempt - 1), signal);
      continue;
    }
    if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504 || res.status === 500) && attempt < retries) {
      attempt++;
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60000) : 1000 * 2 ** (attempt - 1);
      log('warn', `HTTP ${res.status}, ${Math.round(wait / 1000)}초 후 재시도: ${label || shortUrl(url)}`);
      await sleep(wait, signal);
      continue;
    }
    return res;
  }
}

async function readError(res) {
  let body = null;
  try {
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }
  } catch { /* ignore */ }
  const msg = body && typeof body === 'object'
    ? (body.error && (body.error.message || body.error)) || body.message || res.statusText
    : (body || res.statusText);
  return new HttpError(res.status, res.url, body, `HTTP ${res.status} (${shortUrl(res.url)}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
}

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? '?' + s : '';
}

/* ------------------------------------------------------------------ Google OAuth helpers */

export async function pkcePair() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const verifier = base64UrlEncode(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

export function googleAuthUrl({ clientId, redirectUri, scopes = GOOGLE_SCOPES, state, codeChallenge, loginHint }) {
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
  });
  if (state) p.set('state', state);
  if (codeChallenge) { p.set('code_challenge', codeChallenge); p.set('code_challenge_method', 'S256'); }
  if (loginHint) p.set('login_hint', loginHint);
  return `${GOOGLE_AUTH_URL}?${p}`;
}

export async function googleTokenRequest(fetchImpl, params, { signal } = {}) {
  const res = await fetchRetry(fetchImpl, GOOGLE_TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(),
  }, { signal, retries: 1 });
  if (!res.ok) throw await readError(res);
  return res.json();
}

export async function googleTokenInfo(fetchImpl, accessToken, { signal } = {}) {
  const res = await fetchRetry(fetchImpl, GOOGLE_TOKENINFO_URL + qs({ access_token: accessToken }), {}, { signal, retries: 1 });
  if (!res.ok) throw await readError(res);
  return res.json();
}

/** Google auth from a refresh token (browser long-running mode and the Node CLI). */
export class RefreshTokenGoogleAuth {
  constructor({ clientId, clientSecret, refreshToken, accessToken, expiresAt, scope, fetch: fetchImpl, onUpdate }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.accessToken = accessToken || null;
    this.expiresAt = expiresAt || 0;
    this.scope = scope || '';
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.onUpdate = onUpdate || noop;
    this.mode = 'refresh';
  }
  describe() { return '장기 인증 (refresh token)'; }
  async getAccessToken() {
    if (!this.refreshToken) return null;
    if (this.accessToken && Date.now() < this.expiresAt - 60000) return { token: this.accessToken, scope: this.scope };
    const data = await googleTokenRequest(this.fetch, {
      client_id: this.clientId, client_secret: this.clientSecret, refresh_token: this.refreshToken, grant_type: 'refresh_token',
    });
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    if (data.scope) this.scope = data.scope;
    this.onUpdate({ accessToken: this.accessToken, expiresAt: this.expiresAt, scope: this.scope });
    return { token: this.accessToken, scope: this.scope };
  }
}

/** Google auth from a plain access token (e.g. GOOGLE_ACCESS_TOKEN in an agent's environment). */
export class StaticGoogleAuth {
  constructor({ accessToken, scope, fetch: fetchImpl }) {
    this.accessToken = accessToken || null;
    this.scope = scope || '';
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.mode = 'static';
  }
  describe() { return '액세스 토큰'; }
  async getAccessToken() {
    if (!this.accessToken) return null;
    if (!this.scope) {
      try { const info = await googleTokenInfo(this.fetch, this.accessToken); this.scope = info.scope || ''; } catch { this.scope = ''; }
    }
    return { token: this.accessToken, scope: this.scope };
  }
}

export class StaticGitHubAuth {
  constructor(token) { this.token = token || null; }
  async getToken() { return this.token; }
}

/* ------------------------------------------------------------------ Google Drive client */

function driveQuote(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

export class GoogleDrive {
  constructor(auth, { fetch: fetchImpl, log, signal, chunkBytes } = {}) {
    this.auth = auth;
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.log = log || noop;
    this.signal = signal;
    this.chunkBytes = chunkBytes || DEFAULT_CONFIG.limits.uploadChunkBytes;
    this._folderCache = new Map();
    this._rootId = null;
  }

  async _headers(extra = {}) {
    const t = await this.auth.getAccessToken();
    if (!t) throw new BrakeError('Google Drive에 로그인되어 있지 않습니다.');
    return { Authorization: `Bearer ${t.token}`, ...extra };
  }

  async api(path, { method = 'GET', query, body, headers, raw = false, retries = 3 } = {}) {
    const url = (path.startsWith('http') ? path : `${DRIVE_API}/${path}`) + qs(query);
    const init = { method, headers: await this._headers(headers) };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json; charset=UTF-8';
      init.body = JSON.stringify(body);
    }
    const res = await fetchRetry(this.fetch, url, init, { retries, signal: this.signal, log: this.log });
    if (!res.ok) throw await readError(res);
    if (raw) return res;
    if (res.status === 204) return null;
    return res.json();
  }

  async about() {
    const data = await this.api('about', { query: { fields: 'user(emailAddress,displayName,permissionId),storageQuota(limit,usage)' } });
    return { email: data.user?.emailAddress || '', name: data.user?.displayName || '', quota: data.storageQuota || null };
  }

  async getFile(id, fields = 'id,name,mimeType,modifiedTime,size,md5Checksum,parents') {
    return this.api(`files/${encodeURIComponent(id)}`, { query: { fields } });
  }

  async rootId() {
    if (!this._rootId) this._rootId = (await this.getFile('root', 'id')).id;
    return this._rootId;
  }

  /** Every non-trashed file the account can see, in one paged listing. */
  async listAll({ onPage } = {}) {
    const files = [];
    let pageToken;
    do {
      throwIfAborted(this.signal);
      const data = await this.api('files', {
        query: {
          q: 'trashed = false', spaces: 'drive', pageSize: 1000, pageToken,
          fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,md5Checksum,parents)',
          includeItemsFromAllDrives: 'false', supportsAllDrives: 'false',
        },
      });
      files.push(...(data.files || []));
      pageToken = data.nextPageToken;
      if (onPage) onPage(files.length);
    } while (pageToken);
    return files;
  }

  async listChildren(parentId, { foldersOnly = false } = {}) {
    const out = [];
    let pageToken;
    let q = `'${driveQuote(parentId)}' in parents and trashed = false`;
    if (foldersOnly) q += ` and mimeType = '${GOOGLE_FOLDER}'`;
    do {
      const data = await this.api('files', { query: { q, pageSize: 1000, pageToken, fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,md5Checksum)' } });
      out.push(...(data.files || []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  }

  async findChild(parentId, name, { folder = false } = {}) {
    let q = `name = '${driveQuote(name)}' and '${driveQuote(parentId)}' in parents and trashed = false`;
    if (folder) q += ` and mimeType = '${GOOGLE_FOLDER}'`;
    const data = await this.api('files', { query: { q, pageSize: 10, fields: 'files(id,name,mimeType,modifiedTime,size,md5Checksum)' } });
    const files = data.files || [];
    files.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
    return files[0] || null;
  }

  async ensureFolder(parentId, name) {
    const key = `${parentId}/${name}`;
    if (this._folderCache.has(key)) return this._folderCache.get(key);
    let f = await this.findChild(parentId, name, { folder: true });
    if (!f) {
      f = await this.api('files', { method: 'POST', query: { fields: 'id,name' }, body: { name, mimeType: GOOGLE_FOLDER, parents: [parentId] } });
      this.log('info', `Drive 폴더 생성: ${name}`);
    }
    this._folderCache.set(key, f.id);
    return f.id;
  }

  async ensureFolderPath(parentId, segments) {
    let id = parentId;
    for (const seg of segments) id = await this.ensureFolder(id, seg);
    return id;
  }

  async download(id) {
    const res = await this.api(`files/${encodeURIComponent(id)}`, { query: { alt: 'media' }, raw: true });
    return res.blob();
  }

  async export(id, mimeType) {
    const res = await this.api(`files/${encodeURIComponent(id)}/export`, { query: { mimeType }, raw: true });
    return res.blob();
  }

  /** Resumable upload; creates a new file, or replaces the content of `fileId`. */
  async uploadFile({ parentId, name, blob, mimeType, fileId, modifiedTime }) {
    const type = mimeType || blob.type || guessMime(name);
    const fields = 'id,name,mimeType,md5Checksum,modifiedTime,size';
    const meta = fileId ? {} : { name, parents: [parentId] };
    if (modifiedTime) meta.modifiedTime = modifiedTime;
    const initUrl = (fileId ? `${DRIVE_UPLOAD}/${encodeURIComponent(fileId)}` : DRIVE_UPLOAD) + qs({ uploadType: 'resumable', fields });
    const init = await fetchRetry(this.fetch, initUrl, {
      method: fileId ? 'PATCH' : 'POST',
      headers: await this._headers({ 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type }),
      body: JSON.stringify(meta),
    }, { signal: this.signal, log: this.log, label: `upload init ${name}` });
    if (!init.ok) throw await readError(init);
    const session = init.headers.get('location') || init.headers.get('Location');
    if (!session) throw new Error(`업로드 세션을 시작하지 못했습니다: ${name}`);

    const total = blob.size;
    if (total === 0) {
      const res = await fetchRetry(this.fetch, session, { method: 'PUT', headers: { 'Content-Type': type, 'Content-Length': '0' } }, { signal: this.signal, log: this.log });
      if (!res.ok) throw await readError(res);
      return res.json();
    }
    let start = 0;
    let failures = 0;
    while (start < total) {
      throwIfAborted(this.signal);
      const end = Math.min(start + this.chunkBytes, total);
      let res;
      try {
        res = await this.fetch(session, {
          method: 'PUT', signal: this.signal,
          headers: await this._headers({ 'Content-Type': type, 'Content-Range': `bytes ${start}-${end - 1}/${total}` }),
          body: await blob.slice(start, end).arrayBuffer(),
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw abortError();
        res = null;
      }
      if (res && res.status === 308) {
        const range = res.headers.get('range') || res.headers.get('Range');
        const m = range && /bytes=\d+-(\d+)/.exec(range);
        start = m ? Number(m[1]) + 1 : end;
        failures = 0;
        continue;
      }
      if (res && res.ok) return res.json();
      if (res && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw await readError(res);
      if (++failures > 5) throw new Error(`업로드가 반복해서 실패했습니다: ${name}`);
      this.log('warn', `업로드 중단(${res ? 'HTTP ' + res.status : '네트워크'}), 이어서 재시도: ${name}`);
      await sleep(1000 * 2 ** failures, this.signal);
      // ask the session where to resume
      let status = null;
      try {
        status = await this.fetch(session, { method: 'PUT', signal: this.signal, headers: await this._headers({ 'Content-Range': `bytes */${total}` }) });
      } catch (e) { if (e && e.name === 'AbortError') throw abortError(); }
      if (status && status.ok) return status.json();
      if (status && status.status === 308) {
        const range = status.headers.get('range') || status.headers.get('Range');
        const m = range && /bytes=\d+-(\d+)/.exec(range);
        start = m ? Number(m[1]) + 1 : 0;
      } else if (status && status.status === 404) {
        throw new Error(`업로드 세션이 만료되었습니다: ${name}`);
      }
    }
    throw new Error(`업로드가 완료되지 않았습니다: ${name}`);
  }
}

/** Files under `sourceId`, walking the parent links of a full listing. */
export function collectUnder(files, sourceId) {
  const byParent = new Map();
  for (const f of files) {
    for (const p of f.parents || []) {
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(f);
    }
  }
  const items = [];
  let folders = 0;
  const seen = new Set();
  const stack = [{ id: sourceId, dir: [] }];
  while (stack.length) {
    const { id, dir } = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const children = (byParent.get(id) || []).slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    for (const f of children) {
      if (f.mimeType === GOOGLE_FOLDER) { folders++; stack.push({ id: f.id, dir: [...dir, f.name] }); } else items.push({ file: f, dir });
    }
  }
  items.sort((a, b) => a.dir.join('/').localeCompare(b.dir.join('/')) || a.file.name.localeCompare(b.file.name) || a.file.id.localeCompare(b.file.id));
  return { items, folders };
}

/* ------------------------------------------------------------------ GitHub client */

export class GitHubRepo {
  constructor(auth, { owner, repo, branch, fetch: fetchImpl, log, signal } = {}) {
    this.auth = auth;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch || '';
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.log = log || noop;
    this.signal = signal;
    this._info = null;
  }

  get fullName() { return `${this.owner}/${this.repo}`; }
  get base() { return `${GITHUB_API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`; }

  async _headers(extra = {}) {
    const token = await this.auth.getToken();
    if (!token) throw new BrakeError('GitHub 토큰이 없습니다.');
    return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra };
  }

  async api(path, { method = 'GET', body, headers, raw = false, retries = 3, allow = [] } = {}) {
    const url = path.startsWith('http') ? path : (path.startsWith('/') ? GITHUB_API + path : (path ? `${this.base}/${path}` : this.base));
    const init = { method, headers: await this._headers(headers) };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    const res = await fetchRetry(this.fetch, url, init, { retries, signal: this.signal, log: this.log });
    if (!res.ok && !allow.includes(res.status)) throw await readError(res);
    if (raw) return res;
    if (res.status === 204 || res.status === 404) return null;
    return res.json();
  }

  async user() { return this.api('/user'); }

  /** GET /user plus the scopes GitHub reports for classic tokens (X-OAuth-Scopes; empty for fine-grained tokens). */
  async userWithScopes() {
    const res = await this.api('/user', { raw: true });
    const scopes = (res.headers.get('x-oauth-scopes') || '').split(',').map((x) => x.trim()).filter(Boolean);
    return { user: await res.json(), scopes };
  }

  async repoInfo() {
    if (!this._info) this._info = await this.api('');
    return this._info;
  }

  async resolveBranch() {
    if (this.branch) return this.branch;
    const info = await this.repoInfo();
    this.branch = info.default_branch;
    return this.branch;
  }

  async branchHead() {
    const branch = await this.resolveBranch();
    const ref = await this.api(`git/ref/${encodeURI('heads/' + branch)}`);
    const commit = await this.api(`git/commits/${ref.object.sha}`);
    return { branch, commitSha: ref.object.sha, treeSha: commit.tree.sha };
  }

  _contentsUrl(path, ref) {
    const p = splitPath(path).map(encodeURIComponent).join('/');
    return `contents/${p}${qs({ ref })}`;
  }

  async contents(path, ref) {
    return this.api(this._contentsUrl(path, ref || await this.resolveBranch()), { allow: [404] });
  }

  async readText(path, ref) {
    const res = await this.api(this._contentsUrl(path, ref || await this.resolveBranch()), { raw: true, allow: [404], headers: { Accept: 'application/vnd.github.raw+json' } });
    if (res.status === 404) return null;
    return res.text();
  }

  async createBlobBase64(base64) { return (await this.api('git/blobs', { method: 'POST', body: { content: base64, encoding: 'base64' } })).sha; }

  async createBlobText(text) { return (await this.api('git/blobs', { method: 'POST', body: { content: text, encoding: 'utf-8' } })).sha; }

  /** A harmless write: an unreferenced blob, garbage-collected by GitHub. Proves Contents: write. */
  async probeWrite() { return this.createBlobText(`Drives Sync write check ${nowIso()}\n`); }

  async createTree(baseTree, tree) { return (await this.api('git/trees', { method: 'POST', body: { base_tree: baseTree, tree } })).sha; }

  async createCommit(message, tree, parents) { return this.api('git/commits', { method: 'POST', body: { message, tree, parents } }); }

  async updateRef(sha) {
    const branch = await this.resolveBranch();
    const res = await this.api(`git/refs/${encodeURI('heads/' + branch)}`, { method: 'PATCH', body: { sha, force: false }, raw: true, allow: [422, 409] });
    if (res.status === 422 || res.status === 409) return false;
    return true;
  }

  /**
   * One commit on the branch. `buildEntries({head, attempt})` returns tree entries
   * ({path, sha} for blobs already created, or {path, content} for text). When another
   * writer moved the branch in between, it is called again against the new head.
   */
  async commitEntries({ message, buildEntries, maxAttempts = 4 }) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      throwIfAborted(this.signal);
      const head = await this.branchHead();
      const entries = await buildEntries({ head, attempt });
      const tree = entries.map((e) => (e.content !== undefined
        ? { path: e.path, mode: '100644', type: 'blob', content: e.content }
        : { path: e.path, mode: '100644', type: 'blob', sha: e.sha }));
      const treeSha = await this.createTree(head.treeSha, tree);
      const commit = await this.createCommit(message, treeSha, [head.commitSha]);
      if (await this.updateRef(commit.sha)) return { sha: commit.sha, url: commit.html_url, branch: head.branch, files: entries.length, attempt };
      this.log('warn', `브랜치가 그 사이 바뀌어 커밋을 다시 만듭니다 (${attempt + 1}/${maxAttempts})`);
      await sleep(500 * (attempt + 1), this.signal);
    }
    throw new Error('브랜치가 계속 바뀌어 커밋하지 못했습니다. 잠시 후 다시 시도하세요.');
  }
}

/* ------------------------------------------------------------------ manifest */

export function emptyManifest(config) {
  const at = nowIso();
  return {
    app: 'Drives Sync', version: 1, createdAt: at, updatedAt: at,
    source: { account: config.google.expectedEmail, folderId: config.google.sourceFolderId || 'root' },
    target: { repo: `${config.github.owner}/${config.github.repo}`, path: config.github.targetPath },
    files: {},        // Google Drive file id -> { path, fingerprint, kind, size, modifiedTime, syncedAt, by }
    stock: { lastRun: null, runs: [] },
    devices: {},      // device id -> { name, folders: { folder id -> { label, drivePath, lastRun, uploaded: { relPath -> {...} } } } }
  };
}

export async function loadManifest(github, targetPath, config) {
  const path = joinPath(targetPath, MANIFEST_FILE);
  const text = await github.readText(path);
  if (!text) return { manifest: emptyManifest(config), existed: false, path };
  try {
    const manifest = JSON.parse(text);
    manifest.files ||= {};
    manifest.stock ||= { lastRun: null, runs: [] };
    manifest.devices ||= {};
    return { manifest, existed: true, path };
  } catch (e) {
    throw new Error(`매니페스트(${path})가 손상되었습니다: ${e.message}. 설정에서 매니페스트를 초기화하거나 파일을 고치세요.`);
  }
}

function manifestText(manifest) { return JSON.stringify(manifest, null, 1) + '\n'; }

/** Serialises batched commits. Each entry carries an `apply(manifest)` that records it;
    `eachApply(manifest)` (the run's own bookkeeping) is applied in every commit, so the
    last batch always carries the final state and no extra manifest-only commit is needed. */
class Committer {
  constructor(ctx, { manifest, manifestPath, message, eachApply }) {
    this.ctx = ctx;
    this.manifest = manifest;
    this.manifestPath = manifestPath;
    this.message = message;
    this.eachApply = eachApply || noop;
    this.pending = [];
    this.pendingBytes = 0;
    this.chain = Promise.resolve();
    this.commits = [];
    this.committed = 0;
  }

  add(entry) {
    this.pending.push(entry);
    this.pendingBytes += entry.size || 0;
    const { batchFiles, batchBytes } = this.ctx.config.limits;
    if (this.pending.length >= batchFiles || this.pendingBytes >= batchBytes) return this.flush();
    return this.chain;
  }

  flush() {
    const batch = this.pending;
    this.pending = [];
    this.pendingBytes = 0;
    if (!batch.length) return this.chain;
    this.chain = this.chain.then(() => this._commit(batch));
    return this.chain;
  }

  async _commit(batch) {
    const ctx = this.ctx;
    const res = await ctx.github.commitEntries({
      message: `${this.message} (+${batch.length})`,
      buildEntries: async ({ attempt }) => {
        if (attempt > 0) {
          const reloaded = await loadManifest(ctx.github, ctx.config.github.targetPath, ctx.config);
          this.manifest = reloaded.manifest;
        }
        for (const e of batch) e.apply(this.manifest);
        this.eachApply(this.manifest);
        this.manifest.updatedAt = nowIso();
        return [...batch.map((e) => ({ path: e.path, sha: e.sha })), { path: this.manifestPath, content: manifestText(this.manifest) }];
      },
    });
    this.committed += batch.length;
    this.commits.push({ sha: res.sha, url: res.url, files: batch.length });
    ctx.log('info', `GitHub 커밋 ${res.sha.slice(0, 7)}: 파일 ${batch.length}개`, { url: res.url });
    ctx.progress({ phase: 'commit', committed: this.committed });
  }
}

/* ------------------------------------------------------------------ GitHub token helpers */

export function githubTokenKind(token) {
  const t = String(token || '');
  if (t.startsWith('github_pat_')) return 'fine-grained';
  if (t.startsWith('ghp_')) return 'classic';
  if (t.startsWith('gho_')) return 'oauth';
  if (t.startsWith('ghs_') || t.startsWith('ghu_')) return 'app';
  return 'unknown';
}

export const GITHUB_TOKEN_KIND_LABEL = { 'fine-grained': 'fine-grained 토큰', classic: 'classic 토큰', oauth: 'OAuth 토큰', app: 'GitHub App 토큰', unknown: '토큰' };

export const GITHUB_NEW_CLASSIC_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo&description=Drives%20Sync';
export const GITHUB_TOKENS_URL = 'https://github.com/settings/personal-access-tokens';

/** What to do when GitHub answers "Resource not accessible by personal access token". */
export function githubPermissionHelp({ kind, scopes = [], repo, need = '읽기' }) {
  if (kind === 'classic') {
    return `classic 토큰에 'repo' 범위(scope)가 없어 ${repo} 저장소를 ${need === '쓰기' ? '쓸' : '읽을'} 수 없습니다${scopes.length ? ` (현재 범위: ${scopes.join(', ')})` : ''}. ${GITHUB_NEW_CLASSIC_TOKEN_URL} 에서 repo에 체크한 새 토큰을 만들어 입력하세요.`;
  }
  return `이 토큰에는 ${repo} 저장소의 Contents(${need}) 권한이 없습니다. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens (${GITHUB_TOKENS_URL}) 에서 이 토큰을 열어 ① Repository access에 ${repo}가 포함되어 있는지 확인하고 ② Repository permissions → Contents를 "Read and write"로 바꾼 뒤 맨 아래 저장(Update)을 누르세요. 토큰 값은 그대로이므로 다시 입력할 필요 없이 "사전 점검 실행"만 다시 누르면 됩니다.`;
}

/* ------------------------------------------------------------------ context + preflight */

/**
 * ctx = { config, google: GoogleDrive, github: GitHubRepo, googleAuth, githubAuth, log, progress, signal, env }
 */
export function createContext({ config, googleAuth, githubAuth, fetch: fetchImpl, log, progress, signal, env } = {}) {
  const cfg = withDefaults(config);
  const f = fetchImpl || globalThis.fetch.bind(globalThis);
  const logger = log || noop;
  return {
    config: cfg,
    googleAuth,
    githubAuth,
    google: new GoogleDrive(googleAuth, { fetch: f, log: logger, signal, chunkBytes: cfg.limits.uploadChunkBytes }),
    github: new GitHubRepo(githubAuth, { owner: cfg.github.owner, repo: cfg.github.repo, branch: cfg.github.branch, fetch: f, log: logger, signal }),
    log: logger,
    progress: progress || noop,
    signal,
    env: env || {},
  };
}

/**
 * The brake. scope: 'stock' (read Drive, write GitHub), 'flow' (also write Drive),
 * 'automation' (flow + the caller's extra checks). Never throws for a failed check.
 */
export async function preflight(ctx, { scope = 'stock', extraChecks = [] } = {}) {
  const cfg = ctx.config;
  const checks = [];
  const add = (id, label, ok, detail, extra = {}) => { checks.push({ id, label, ok: !!ok, detail, ...extra }); return ok; };

  // ---- Google Drive
  let gtoken = null;
  let gerr = null;
  try { gtoken = ctx.googleAuth ? await ctx.googleAuth.getAccessToken() : null; } catch (e) { gerr = e; }
  if (!gtoken) {
    add('google.token', 'Google Drive 로그인', false, gerr
      ? `Google 토큰을 갱신할 수 없습니다: ${gerr.message}. 다시 로그인하세요.`
      : '이 기기에 Google Drive가 로그인되어 있지 않습니다. "Google Drive 연결"로 로그인하세요.', { needLogin: true });
  } else {
    add('google.token', 'Google Drive 로그인', true, `토큰 확인 (${ctx.googleAuth.describe ? ctx.googleAuth.describe() : '토큰'})`);
    try {
      const about = await ctx.google.about();
      const expected = (cfg.google.expectedEmail || '').trim();
      if (!about.email) add('google.account', 'Google 계정 일치', false, 'Google 계정 이메일을 확인할 수 없습니다.');
      else if (expected && about.email.toLowerCase() !== expected.toLowerCase()) {
        add('google.account', 'Google 계정 일치', false,
          `다른 Google 계정(${about.email})이 로그인되어 있습니다. 설정된 동기화 계정은 ${expected}입니다. 연결을 해제하고 올바른 계정으로 다시 연결하세요.`,
          { mismatch: true, actual: about.email, expected });
      } else add('google.account', 'Google 계정 일치', true, about.email, { actual: about.email });
    } catch (e) {
      add('google.account', 'Google 계정 일치', false, e.status === 401
        ? 'Google 토큰이 만료되었거나 취소되었습니다. 다시 로그인하세요.'
        : `Google 계정을 확인할 수 없습니다: ${e.message}`, { needLogin: e.status === 401 });
    }
    const scopes = String(gtoken.scope || '').split(/\s+/).filter(Boolean);
    const full = scopes.includes(GOOGLE_SCOPE_DRIVE);
    const readonly = full || scopes.includes(GOOGLE_SCOPE_DRIVE_READONLY);
    if (scope === 'stock') add('google.scope', 'Drive 읽기 권한', readonly || scopes.length === 0, readonly ? '읽기 권한 확인' : (scopes.length ? '토큰에 Drive 읽기 권한이 없습니다. 다시 연결하면서 권한을 승인하세요.' : '권한 범위를 알 수 없어 실제 호출로 확인합니다.'));
    else add('google.scope', 'Drive 쓰기 권한', full, full ? '쓰기 권한 확인' : '토큰에 Drive 쓰기 권한이 없습니다(업로드 불가). 다시 연결하면서 "Google Drive의 모든 파일 보기, 수정, 생성, 삭제" 권한을 승인하세요.');
    try {
      const id = cfg.google.sourceFolderId || 'root';
      const f = await ctx.google.getFile(id, 'id,name,mimeType');
      if (f.mimeType !== GOOGLE_FOLDER) add('google.source', 'Drive 원본 폴더', false, `원본(${f.name})이 폴더가 아닙니다.`);
      else add('google.source', 'Drive 원본 폴더', true, `${id === 'root' ? '내 드라이브 전체' : f.name} (${f.id})`);
    } catch (e) {
      add('google.source', 'Drive 원본 폴더', false, `원본 폴더에 접근할 수 없습니다 (${cfg.google.sourceFolderId || 'root'}): ${e.message}`);
    }
  }

  // ---- GitHub
  const ghToken = ctx.githubAuth ? await ctx.githubAuth.getToken() : null;
  if (!ghToken) {
    add('github.token', 'GitHub 로그인', false, '이 기기에 GitHub 토큰이 저장되어 있지 않습니다. GitHub 토큰(fine-grained, Contents: Read and write)을 입력하세요.', { needLogin: true });
  } else {
    const kind = githubTokenKind(ghToken);
    add('github.token', 'GitHub 로그인', true, `토큰 확인 (${GITHUB_TOKEN_KIND_LABEL[kind]})`);
    const expected = (cfg.github.expectedLogin || '').trim();
    let scopes = [];
    try {
      const { user: u, scopes: s } = await ctx.github.userWithScopes();
      scopes = s;
      if (expected && u.login.toLowerCase() !== expected.toLowerCase()) {
        add('github.account', 'GitHub 계정 일치', false, `다른 GitHub 계정(${u.login})의 토큰입니다. 설정된 계정은 ${expected}입니다.`, { mismatch: true, actual: u.login, expected });
      } else add('github.account', 'GitHub 계정 일치', true, u.login, { actual: u.login });
    } catch (e) {
      if (e.status === 401) add('github.account', 'GitHub 계정 일치', false, 'GitHub 토큰이 유효하지 않거나 만료되었습니다(401). 새 토큰을 입력하세요.', { needLogin: true });
      else if (e.status === 403 && ctx.env.githubActions) add('github.account', 'GitHub 계정 일치', true, 'GitHub Actions 토큰 (계정 조회 불가, 저장소 권한으로 확인)');
      else add('github.account', 'GitHub 계정 일치', false, `GitHub 계정을 확인할 수 없습니다: ${e.message}`);
    }
    let info = null;
    try {
      info = await ctx.github.repoInfo();
      const branch = await ctx.github.resolveBranch();
      add('github.repo', 'GitHub 저장소', true, `${info.full_name} (${info.private ? 'private' : 'public'}), 브랜치 ${branch}`);
    } catch (e) {
      const classicHint = kind === 'classic' && !scopes.includes('repo') ? ` classic 토큰에 repo 범위가 없습니다(현재: ${scopes.join(', ') || '없음'}). ${GITHUB_NEW_CLASSIC_TOKEN_URL} 에서 repo에 체크한 토큰을 만드세요.` : '';
      add('github.repo', 'GitHub 저장소', false, e.status === 404
        ? `저장소 ${ctx.github.fullName}에 접근할 수 없습니다(404). 토큰의 Repository access에 이 저장소가 포함되어 있는지, 이름이 맞는지 확인하세요.${classicHint}`
        : `저장소를 확인할 수 없습니다: ${e.message}${classicHint}`);
    }
    if (info) {
      const repo = info.full_name;
      const help = (need) => githubPermissionHelp({ kind, scopes, repo, need });
      if (kind === 'classic') {
        const hasRepo = scopes.includes('repo') || (!info.private && scopes.includes('public_repo'));
        add('github.scope', 'GitHub 토큰 범위', hasRepo, hasRepo ? scopes.join(', ') : `classic 토큰에 repo 범위(scope)가 없습니다 (현재: ${scopes.join(', ') || '없음'}). ${GITHUB_NEW_CLASSIC_TOKEN_URL} 에서 repo에 체크한 새 토큰을 만들어 입력하세요.`, { permission: !hasRepo });
      }
      let readOk = false;
      try {
        const head = await ctx.github.branchHead();
        readOk = true;
        add('github.branch', 'GitHub 브랜치', true, `${head.branch} @ ${head.commitSha.slice(0, 7)}`);
      } catch (e) {
        if (e.status === 403) add('github.branch', 'GitHub 브랜치', false, help('읽기'), { permission: true });
        else if (e.status === 404) add('github.branch', 'GitHub 브랜치', false, `브랜치 ${ctx.github.branch || '(기본)'}을(를) 찾을 수 없습니다(404). 브랜치 이름을 확인하세요. 비워 두면 저장소의 기본 브랜치를 씁니다.`);
        else add('github.branch', 'GitHub 브랜치', false, `브랜치를 확인할 수 없습니다: ${e.message}`);
      }
      const target = joinPath(cfg.github.targetPath);
      if (!target) add('github.target', 'GitHub 대상 폴더', false, '대상 폴더 경로가 비어 있습니다(저장소 루트 전체 동기화는 허용하지 않습니다).');
      else if (!readOk) add('github.target', 'GitHub 대상 폴더', false, '브랜치를 읽지 못해 확인하지 못했습니다. 위의 브랜치 항목 문제를 먼저 해결하세요.');
      else {
        try {
          const c = await ctx.github.contents(target);
          if (c === null) add('github.target', 'GitHub 대상 폴더', false, `대상 폴더가 저장소에 없습니다: ${target}. 경로를 확인하거나 먼저 폴더를 만드세요.`, { missingTarget: true });
          else if (!Array.isArray(c)) add('github.target', 'GitHub 대상 폴더', false, `대상 경로가 폴더가 아니라 파일입니다: ${target}`);
          else add('github.target', 'GitHub 대상 폴더', true, `${target}/ (항목 ${c.length}개)`);
        } catch (e) {
          if (e.status === 403) add('github.target', 'GitHub 대상 폴더', false, help('읽기'), { permission: true });
          else add('github.target', 'GitHub 대상 폴더', false, `대상 폴더를 확인할 수 없습니다: ${e.message}`);
        }
      }
      try { await ctx.github.probeWrite(); add('github.write', 'GitHub 쓰기 권한', true, 'Contents: Read and write 확인'); } catch (e) {
        if (e.status === 403 || e.status === 404) add('github.write', 'GitHub 쓰기 권한', false, help('쓰기'), { permission: true });
        else add('github.write', 'GitHub 쓰기 권한', false, `쓰기 권한을 확인할 수 없습니다: ${e.message}`);
      }
    }
  }

  for (const c of extraChecks) add(c.id, c.label, c.ok, c.detail, c.extra || {});

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0, scope, at: nowIso(), checks,
    reasons: failed.map((c) => `${c.label}: ${c.detail}`),
    needLogin: failed.some((c) => c.needLogin), mismatch: failed.some((c) => c.mismatch), missingTarget: failed.some((c) => c.missingTarget), permission: failed.some((c) => c.permission),
  };
}

function braked(pf, extraReasons = []) {
  const reasons = [...(pf ? pf.reasons : []), ...extraReasons];
  return { ok: false, braked: true, reasons, preflight: pf || null, at: nowIso() };
}

/* ------------------------------------------------------------------ Stock Matching: Drive -> GitHub */

function exportPlanFor(file, cfg) {
  const ex = GOOGLE_EXPORTS[file.mimeType];
  if (!ex) return null;
  const chosen = (cfg.google.exports && cfg.google.exports[ex.key]) || ex.default;
  const fmt = ex.formats[chosen] || ex.formats[ex.default];
  return { key: ex.key, format: fmt, label: ex.label };
}

/** Decide what a Stock run would do, without touching anything. */
export function planStock(items, manifest, cfg) {
  const targetPath = joinPath(cfg.github.targetPath);
  const toSync = [];
  const skipped = [];
  let unchanged = 0;
  const used = new Map();
  for (const [id, m] of Object.entries(manifest.files)) if (m && m.path) used.set(m.path, id);

  for (const item of items) {
    const f = item.file;
    if (f.mimeType === GOOGLE_SHORTCUT) { skipped.push({ id: f.id, name: f.name, reason: '바로가기(shortcut)는 건너뜀' }); continue; }
    let kind = 'binary';
    let name = f.name;
    let mime = null;
    let size = Number(f.size || 0);
    let fingerprint;
    if (f.mimeType.startsWith('application/vnd.google-apps.')) {
      const plan = exportPlanFor(f, cfg);
      if (!plan) { skipped.push({ id: f.id, name: f.name, reason: `내보내기를 지원하지 않는 Google 형식 (${f.mimeType.replace('application/vnd.google-apps.', '')})` }); continue; }
      kind = 'export';
      mime = plan.format.mime;
      if (!name.toLowerCase().endsWith('.' + plan.format.ext)) name = `${name}.${plan.format.ext}`;
      size = 0;
      fingerprint = `${f.modifiedTime}|${mime}`;
    } else {
      if (size > cfg.limits.maxFileBytes) { skipped.push({ id: f.id, name: f.name, reason: `크기 초과 (${formatBytes(size)} > ${formatBytes(cfg.limits.maxFileBytes)})` }); continue; }
      fingerprint = f.md5Checksum || `${f.modifiedTime}|${size}`;
    }
    let path = joinPath(targetPath, ...item.dir.map(sanitizeSegment), sanitizeSegment(name));
    if (used.has(path) && used.get(path) !== f.id) {
      const dot = path.lastIndexOf('.');
      const slash = path.lastIndexOf('/');
      const suffix = ` [${f.id.slice(-6)}]`;
      path = dot > slash ? path.slice(0, dot) + suffix + path.slice(dot) : path + suffix;
    }
    used.set(path, f.id);
    const prev = manifest.files[f.id];
    if (prev && prev.fingerprint === fingerprint && prev.path === path) { unchanged++; continue; }
    toSync.push({ file: f, dir: item.dir, path, kind, mime, size, fingerprint, previous: prev ? { path: prev.path } : null });
  }
  return { toSync, skipped, unchanged, total: items.length };
}

export async function runStockMatching(ctx, { dryRun = false, trigger = 'manual' } = {}) {
  const cfg = ctx.config;
  const started = nowIso();
  const t0 = Date.now();
  ctx.log('info', `Stock Matching 시작 (${trigger})`);
  const pf = await preflight(ctx, { scope: 'stock' });
  if (!pf.ok) {
    ctx.log('brake', '사전 점검 실패로 작업을 진행하지 않습니다.', { reasons: pf.reasons });
    return braked(pf);
  }
  const targetPath = joinPath(cfg.github.targetPath);
  const { manifest, existed, path: manifestPath } = await loadManifest(ctx.github, targetPath, cfg);
  ctx.log('info', existed ? `매니페스트 로드: 기록된 파일 ${Object.keys(manifest.files).length}개` : '매니페스트가 없어 새로 만듭니다.');

  ctx.progress({ phase: 'list', detail: 'Google Drive 파일 목록을 읽는 중' });
  const rootId = await ctx.google.rootId();
  const sourceId = !cfg.google.sourceFolderId || cfg.google.sourceFolderId === 'root' ? rootId : cfg.google.sourceFolderId;
  const all = await ctx.google.listAll({ onPage: (n) => ctx.progress({ phase: 'list', listed: n, detail: `Drive 목록 ${n}개` }) });
  const { items, folders } = collectUnder(all, sourceId);
  const plan = planStock(items, manifest, cfg);
  ctx.log('info', `Drive 파일 ${items.length}개 (폴더 ${folders}개): 동기화 대상 ${plan.toSync.length}, 변경 없음 ${plan.unchanged}, 건너뜀 ${plan.skipped.length}`);
  for (const s of plan.skipped) ctx.log('warn', `건너뜀: ${s.name} - ${s.reason}`);
  for (const t of plan.toSync) if (t.previous && t.previous.path !== t.path) ctx.log('info', `이동/이름 변경 감지: ${t.previous.path} -> ${t.path} (이전 파일은 그대로 둡니다)`);

  const summary = {
    ok: true, dryRun, trigger, startedAt: started, listed: items.length, folders, planned: plan.toSync.length, unchanged: plan.unchanged,
    skipped: plan.skipped, synced: 0, failed: [], bytes: 0, commits: [],
  };
  if (dryRun) {
    summary.plan = plan.toSync.map((t) => ({ id: t.file.id, name: t.file.name, path: t.path, kind: t.kind, size: t.size }));
    summary.durationMs = Date.now() - t0;
    return summary;
  }
  if (!plan.toSync.length) {
    ctx.log('info', '동기화할 변경이 없습니다.');
    summary.durationMs = Date.now() - t0;
    summary.finishedAt = nowIso();
    return summary;
  }

  const device = cfg.device.name || cfg.device.id || 'unknown';
  const committer = new Committer(ctx, {
    manifest, manifestPath, message: `Drives Sync (Stock): Google Drive -> ${targetPath}`,
    eachApply: (m) => {
      m.stock.lastRun = nowIso();
      const run = { startedAt: started, at: m.stock.lastRun, by: device, trigger, synced: summary.synced, failed: summary.failed.length, listed: items.length };
      const runs = (m.stock.runs || []).filter((r) => r.startedAt !== started);
      m.stock.runs = [...runs.slice(-19), run];
    },
  });
  const limit = pLimit(cfg.limits.concurrency);
  let done = 0;
  const total = plan.toSync.length;
  const chunks = [];
  for (let i = 0; i < plan.toSync.length; i += cfg.limits.batchFiles) chunks.push(plan.toSync.slice(i, i + cfg.limits.batchFiles));

  for (const chunk of chunks) {
    throwIfAborted(ctx.signal);
    const results = await Promise.all(chunk.map((t) => limit(async () => {
      throwIfAborted(ctx.signal);
      ctx.progress({ phase: 'transfer', done, total, current: t.path });
      try {
        const blob = t.kind === 'export' ? await ctx.google.export(t.file.id, t.mime) : await ctx.google.download(t.file.id);
        if (blob.size > cfg.limits.maxFileBytes) throw new Error(`크기 초과 (${formatBytes(blob.size)})`);
        const sha = await ctx.github.createBlobBase64(await blobToBase64(blob));
        const size = blob.size;
        return {
          path: t.path, sha, size,
          apply: (m) => { m.files[t.file.id] = { path: t.path, fingerprint: t.fingerprint, kind: t.kind, size, modifiedTime: t.file.modifiedTime, name: t.file.name, syncedAt: nowIso(), by: device }; },
        };
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        ctx.log('error', `실패: ${t.path} - ${e.message}`);
        summary.failed.push({ id: t.file.id, name: t.file.name, path: t.path, error: e.message });
        return null;
      } finally { done++; }
    })));
    for (const r of results) if (r) { summary.synced++; summary.bytes += r.size; await committer.add(r); }
    ctx.progress({ phase: 'transfer', done, total });
  }
  await committer.flush();
  summary.commits = committer.commits;
  summary.finishedAt = nowIso();
  summary.durationMs = Date.now() - t0;
  ctx.log('info', `Stock Matching 완료: ${summary.synced}개 동기화, ${summary.failed.length}개 실패, ${formatBytes(summary.bytes)}, 커밋 ${summary.commits.length}개`);
  return summary;
}

/* ------------------------------------------------------------------ Flow Matching: device folder -> Drive -> GitHub */

/**
 * folders: [{ id, label, driveSubPath, source: { list(): Promise<[{relPath, name, size, lastModified, read(): Promise<Blob>}]> } }]
 * Uploads what is new since the folder's last run (by path + size + mtime), never deletes.
 */
export async function runFlowMatching(ctx, { folders = [], dryRun = false, trigger = 'manual', extraChecks = [] } = {}) {
  const cfg = ctx.config;
  const started = nowIso();
  const t0 = Date.now();
  ctx.log('info', `Flow Matching 시작 (${trigger}): 폴더 ${folders.length}개`);
  const checks = [...extraChecks];
  if (!folders.length) checks.push({ id: 'flow.folders', label: '기기 폴더 지정', ok: false, detail: '업로드할 기기 폴더가 지정되지 않았습니다. 기능 2에서 폴더를 추가하세요.' });
  const pf = await preflight(ctx, { scope: 'flow', extraChecks: checks });
  if (!pf.ok) {
    ctx.log('brake', '사전 점검 실패로 작업을 진행하지 않습니다.', { reasons: pf.reasons });
    return braked(pf);
  }
  const targetPath = joinPath(cfg.github.targetPath);
  const { manifest, path: manifestPath } = await loadManifest(ctx.github, targetPath, cfg);
  const deviceId = cfg.device.id || 'device';
  const deviceName = cfg.device.name || deviceId;
  const dev = (manifest.devices[deviceId] ||= { name: deviceName, folders: {} });
  dev.name = deviceName;
  const rootId = await ctx.google.rootId();
  const sourceId = !cfg.google.sourceFolderId || cfg.google.sourceFolderId === 'root' ? rootId : cfg.google.sourceFolderId;
  const committer = new Committer(ctx, {
    manifest, manifestPath, message: `Drives Sync (Flow): ${deviceName} -> Google Drive -> ${targetPath}`,
    eachApply: (m) => {
      const d = (m.devices[deviceId] ||= { name: deviceName, folders: {} });
      d.name = deviceName;
      for (const fd of folders) {
        const st = (d.folders[fd.id] ||= { label: fd.label, lastRun: null, uploaded: {} });
        st.label = fd.label;
        st.lastRun = nowIso();
        st.lastTrigger = trigger;
      }
    },
  });
  const limit = pLimit(cfg.limits.concurrency);
  const summary = { ok: true, dryRun, trigger, startedAt: started, device: deviceName, folders: [], uploaded: 0, failed: 0, bytes: 0, commits: [] };

  const processFolder = async (fd) => {
    const res = { id: fd.id, label: fd.label, scanned: 0, fresh: 0, uploaded: 0, failed: [], skipped: [], bytes: 0 };
    const state = (dev.folders[fd.id] ||= { label: fd.label, lastRun: null, uploaded: {} });
    state.label = fd.label;
    const driveSub = splitPath(fd.driveSubPath || joinPath(cfg.flow.driveSubPath, deviceName, fd.label));
    state.drivePath = driveSub.join('/');
    let entries;
    try { entries = await fd.source.list(); } catch (e) {
      ctx.log('error', `폴더를 읽을 수 없습니다 (${fd.label}): ${e.message}`);
      res.error = e.message;
      return res;
    }
    res.scanned = entries.length;
    const fresh = [];
    for (const e of entries) {
      if (isSyncNoise(e.name)) continue;
      if (e.size > cfg.limits.maxFileBytes) { res.skipped.push({ relPath: e.relPath, reason: `크기 초과 (${formatBytes(e.size)})` }); continue; }
      const prev = state.uploaded[e.relPath];
      if (prev && prev.size === e.size && prev.mtime === e.lastModified) continue;
      fresh.push(e);
    }
    res.fresh = fresh.length;
    ctx.log('info', `[${fd.label}] 파일 ${entries.length}개 중 새 파일 ${fresh.length}개 (Drive: ${driveSub.join('/')})`);
    if (dryRun) { res.plan = fresh.map((e) => ({ relPath: e.relPath, size: e.size })); return res; }
    let done = 0;
    await Promise.all(fresh.map((e) => limit(async () => {
      throwIfAborted(ctx.signal);
      ctx.progress({ phase: 'upload', folder: fd.label, done, total: fresh.length, current: e.relPath });
      try {
        const relDir = splitPath(e.relPath).slice(0, -1);
        const parentId = await ctx.google.ensureFolderPath(sourceId, [...driveSub, ...relDir]);
        const existing = await ctx.google.findChild(parentId, e.name);
        const blob = await e.read();
        const mime = blob.type || guessMime(e.name);
        const up = await ctx.google.uploadFile({ parentId, name: e.name, blob, mimeType: mime, fileId: existing ? existing.id : undefined, modifiedTime: new Date(e.lastModified).toISOString() });
        const ghPath = joinPath(targetPath, ...driveSub.map(sanitizeSegment), ...relDir.map(sanitizeSegment), sanitizeSegment(e.name));
        const sha = await ctx.github.createBlobBase64(await blobToBase64(blob));
        const size = blob.size;
        const fingerprint = up.md5Checksum || `${up.modifiedTime}|${size}`;
        await committer.add({
          path: ghPath, sha, size,
          apply: (m) => {
            m.files[up.id] = { path: ghPath, fingerprint, kind: 'binary', size, modifiedTime: up.modifiedTime, name: e.name, syncedAt: nowIso(), by: deviceName, via: 'flow' };
            const d = (m.devices[deviceId] ||= { name: deviceName, folders: {} });
            const st = (d.folders[fd.id] ||= { label: fd.label, drivePath: driveSub.join('/'), lastRun: null, uploaded: {} });
            st.uploaded[e.relPath] = { size, mtime: e.lastModified, driveFileId: up.id, path: ghPath, at: nowIso() };
          },
        });
        res.uploaded++;
        res.bytes += size;
        ctx.log('info', `[${fd.label}] 업로드: ${e.relPath} (${formatBytes(size)})${existing ? ' - Drive의 기존 파일을 갱신' : ''}`);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        ctx.log('error', `[${fd.label}] 실패: ${e.relPath} - ${err.message}`);
        res.failed.push({ relPath: e.relPath, error: err.message });
      } finally { done++; }
    })));
    return res;
  };

  const results = await Promise.all(folders.map(processFolder));
  await committer.flush();
  const finishedAt = nowIso();
  for (const r of results) {
    summary.folders.push(r);
    summary.uploaded += r.uploaded;
    summary.failed += r.failed.length;
    summary.bytes += r.bytes;
    if (r.error) summary.ok = false;
  }
  summary.commits = committer.commits;
  summary.finishedAt = finishedAt;
  summary.durationMs = Date.now() - t0;
  ctx.log('info', `Flow Matching 완료: ${summary.uploaded}개 업로드, ${summary.failed}개 실패, ${formatBytes(summary.bytes)}, 커밋 ${summary.commits.length}개`);
  return summary;
}

/* ------------------------------------------------------------------ Matching Automation prerequisites */

/** Everything Flow needs plus what unattended runs need. Pure check, writes nothing. */
export async function automationPreflight(ctx, { folders = [], intervalMinutes, extraChecks = [] } = {}) {
  const checks = [...extraChecks];
  if (!folders.length) checks.push({ id: 'flow.folders', label: '기기 폴더 지정', ok: false, detail: '자동화할 기기 폴더가 없습니다. 기능 2에서 폴더를 추가하세요.' });
  else checks.push({ id: 'flow.folders', label: '기기 폴더 지정', ok: true, detail: folders.map((f) => f.label).join(', ') });
  const mins = Number(intervalMinutes);
  if (!Number.isFinite(mins) || mins < 1) checks.push({ id: 'automation.interval', label: '실행 주기', ok: false, detail: '실행 주기(분)가 정의되지 않았습니다. 1분 이상으로 설정하세요.' });
  else checks.push({ id: 'automation.interval', label: '실행 주기', ok: true, detail: `${mins}분마다` });
  const pf = await preflight(ctx, { scope: 'automation', extraChecks: checks });
  return pf;
}

/* ------------------------------------------------------------------ folder sources */

/** A source from a static list of {relPath, size, lastModified, read} entries (tests, one-shot pickers). */
export function listFolderSource(name, entries) {
  return { kind: 'list', name, list: async () => entries.map((e) => ({ ...e, name: e.name || splitPath(e.relPath).pop() })) };
}
