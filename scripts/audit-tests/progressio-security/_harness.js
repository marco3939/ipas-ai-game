// Shared harness: load ProgressIO module from src/index.html into a sandboxed VM context.
// Provides: createEnv() -> { ProgressIO, localStorage, toasts, confirms, downloads, sandbox }
//           makeFile(text, name)   - synthesize a File-like object accepted by importProgress
//           sha256(text)            - oracle SHA-256 (using Node's crypto) for valid-checksum payloads
//           extractProgressIOSource(src) - extract the const ProgressIO = { ... }; block

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const INDEX_HTML = path.resolve(__dirname, '../../../src/index.html');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function extractProgressIOSource() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const lines = html.split('\n');
  // Locate the line `const ProgressIO = {` and the next line whose trimmed value is `};`
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('const ProgressIO = {')) { startLine = i; break; }
  }
  if (startLine < 0) throw new Error('could not locate `const ProgressIO = {` in src/index.html');
  // The const declaration is unique at column 0, so the matching closer is the next line whose trim equals `};`
  let endLine = -1;
  for (let i = startLine + 1; i < lines.length; i++) {
    // column-0 `};` closes the top-level const; inner sub-objects are indented.
    if (lines[i] === '};') { endLine = i; break; }
  }
  if (endLine < 0) throw new Error('could not find closing `};` for ProgressIO');
  return lines.slice(startLine, endLine + 1).join('\n');
}

// In-memory localStorage stand-in (sync mirror of browser API).
function makeLocalStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
    _dump() { return Object.fromEntries(map); },
    _restore(obj) { map.clear(); for (const [k, v] of Object.entries(obj || {})) map.set(k, v); }
  };
}

// File stand-in matching what FileReader.readAsText would yield.
class FakeFile {
  constructor(text, name = 'test.json') {
    this._text = String(text);
    // size in bytes (UTF-8 encoded); matches browser File.size semantics.
    this.size = Buffer.byteLength(this._text, 'utf8');
    this.name = name;
    this.type = 'application/json';
    this.__progressio_test_file = true;
  }
}

// Make `file instanceof File` work in the sandbox by exposing FakeFile as `File`.
class FileReaderStub {
  constructor() { this.onload = null; this.onerror = null; this.result = null; }
  readAsText(file) {
    // Async to mirror real FileReader and exercise import's await.
    queueMicrotask(() => {
      try {
        if (!(file && file.__progressio_test_file)) {
          this.result = null;
          if (this.onerror) this.onerror({});
          return;
        }
        this.result = file._text;
        if (this.onload) this.onload({});
      } catch (e) {
        if (this.onerror) this.onerror(e);
      }
    });
  }
}

function makeDOM() {
  // Minimal DOM surface used by ProgressIO during import/export.
  const elements = new Map();
  const events = new Map();
  const body = {
    appendChild(_) {},
    insertBefore(_, __) {}
  };
  const doc = {
    body,
    head: { appendChild() {} },
    createElement(tag) {
      const el = { tag, style: {}, click() { this._clicked = true; }, remove() {}, set href(v) { this._href = v; }, get href() { return this._href; }, set download(v) { this._download = v; }, get download() { return this._download; } };
      return el;
    },
    getElementById(id) { return elements.get(id) || null; },
    set firstChild(_) {},
    get firstChild() { return null; }
  };
  return { doc, elements, events };
}

function makeSubtle({ unavailable = false, brokenHash = false } = {}) {
  if (unavailable) return undefined;
  return {
    async digest(algo, buf) {
      if (algo !== 'SHA-256') throw new Error('unsupported algo: ' + algo);
      const text = Buffer.from(buf).toString('utf8');
      const hex = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
      if (brokenHash) return new ArrayBuffer(0);
      // Convert hex to Uint8Array buffer that matches browser shape.
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
      return out.buffer;
    }
  };
}

function createEnv(opts = {}) {
  const source = extractProgressIOSource();
  const localStorageMock = makeLocalStorage();
  if (opts.seed) localStorageMock._restore(opts.seed);
  const toasts = [];
  const confirms = [];
  const downloads = [];
  const errors = [];
  const warns = [];
  const dom = makeDOM();
  const fileInput = { value: '', files: [], click() { this._clicked = true; } };
  dom.elements.set('progressio-file-input', fileInput);
  const subtle = makeSubtle(opts.crypto || {});

  // Storage mock to satisfy `Storage.K_USER_NICKNAME` access by ProgressIO.getNickname()/setNickname().
  const Storage = {
    K_USER_NICKNAME: 'ipas_user_nickname_v1',
    get(k, d) { try { const v = localStorageMock.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorageMock.setItem(k, JSON.stringify(v)); } catch (_) {} },
    del(k) { localStorageMock.removeItem(k); }
  };

  const window = {
    confirm(msg) { confirms.push(String(msg)); return opts.confirm !== false; },
    prompt(msg, def) { return opts.promptReturn === undefined ? null : opts.promptReturn; },
    addEventListener(ev, fn) {
      if (!dom.events.has(ev)) dom.events.set(ev, []);
      dom.events.get(ev).push(fn);
    },
    location: {
      reload() { /* no-op in tests */ }
    }
  };
  // Self-reference (some module code uses both window and global names).

  const URLStub = {
    createObjectURL(_) { return 'blob:test'; },
    revokeObjectURL(_) {}
  };
  class BlobStub {
    constructor(parts, opts) {
      this._parts = parts; this.type = (opts && opts.type) || '';
      this.size = parts.reduce((n, p) => n + Buffer.byteLength(String(p), 'utf8'), 0);
      this._content = parts.map(String).join('');
      downloads.push({ content: this._content, size: this.size, type: this.type });
    }
  }

  const sandbox = {
    console: {
      log: (...a) => console.log(...a),
      warn: (...a) => { warns.push(a.map(String).join(' ')); },
      error: (...a) => { errors.push(a.map(String).join(' ')); }
    },
    localStorage: localStorageMock,
    Storage,
    File: FakeFile,
    FileReader: FileReaderStub,
    document: dom.doc,
    window,
    URL: URLStub,
    Blob: BlobStub,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && typeof t.unref === 'function') t.unref(); return t; },
    clearTimeout: (t) => clearTimeout(t),
    queueMicrotask,
    crypto: { subtle },
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    Array,
    Object,
    Number,
    JSON,
    Math,
    Date,
    String,
    RegExp,
    Error,
    Promise,
    Map,
    Set,
    Symbol,
    showToast: (msg, t) => toasts.push({ msg: String(msg), ms: t }),
    refreshHome: () => {},
    Number_isSafeInteger: Number.isSafeInteger.bind(Number),
    location: { reload() { /* swallowed for tests */ } }
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  // Replace top-level `const ProgressIO = {` with `globalThis.ProgressIO = {`
  // so the binding is visible on the sandbox object (vm runs in script mode, not module).
  const patched = source.replace(/^const ProgressIO = \{/m, 'globalThis.ProgressIO = {');
  vm.runInContext(patched, sandbox, { filename: 'ProgressIO.injected.js' });
  if (typeof sandbox.ProgressIO !== 'object' || sandbox.ProgressIO === null) {
    throw new Error('ProgressIO did not initialize in sandbox');
  }
  return { ProgressIO: sandbox.ProgressIO, localStorage: localStorageMock, toasts, confirms, downloads, errors, warns, sandbox, dom, fileInput };
}

function makeFile(text, name = 'test.json') {
  return new FakeFile(text, name);
}

// Build a structurally valid envelope (caller may mutate to construct attacks).
function validEnvelope(payloadObj, opts = {}) {
  const payload = {};
  for (const [k, v] of Object.entries(payloadObj)) {
    payload[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  const checksum = sha256(JSON.stringify(payload));
  return {
    app: 'ipas-ai-game',
    version: 1,
    exportedAt: opts.exportedAt || new Date(Date.now() - 60_000).toISOString(),
    nickname: opts.nickname === undefined ? 'tester' : opts.nickname,
    keyCount: Object.keys(payload).length,
    checksum,
    payload
  };
}

function rehash(env) {
  env.checksum = sha256(JSON.stringify(env.payload));
  env.keyCount = Object.keys(env.payload).length;
  return env;
}

async function runImport(env, fileTextOrEnv, name = 'attack.json') {
  const text = typeof fileTextOrEnv === 'string' ? fileTextOrEnv : JSON.stringify(fileTextOrEnv);
  const f = makeFile(text, name);
  await env.ProgressIO.importProgress(f);
}

function lastToast(env) {
  return env.toasts.length ? env.toasts[env.toasts.length - 1].msg : '';
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
}

module.exports = {
  createEnv,
  makeFile,
  sha256,
  validEnvelope,
  rehash,
  runImport,
  lastToast,
  assert,
  extractProgressIOSource
};
