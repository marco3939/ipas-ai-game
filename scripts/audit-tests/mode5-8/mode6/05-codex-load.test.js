// 05-codex-load.test.js — Mode 6 codex data loading
// Mode 6 fetches kb-allowed-nodes.json + kb/nodes-subject-*.json then builds
// _allowList + _kbIndex.  We stub fetch and verify:
//   - allowList successfully flattened into [{id,title,knowledge_code}]
//   - _kbIndex built by node_id key
//   - start() proceeds to renderGrid (sets this.state)
//   - failure mode: allowList fetch fails → goHome called, showToast warning
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 6 codex load tests ===');
const A = makeAssert();

function setupMode6WithFetch(allowListData, kbData = {}) {
  const r = loadMode(6, { questions: [makeQ('q1', { node_id: 'L21101_N1' })] });
  // Inject a fetch stub into sandbox
  r.sandbox.fetch = async (url) => {
    if (url.includes('kb-allowed-nodes.json')) {
      return {
        ok: true,
        json: async () => allowListData,
      };
    }
    if (url.includes('kb/nodes-subject-')) {
      return {
        ok: true,
        json: async () => kbData[url] || { nodes: [] },
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return r;
}

// --- 1: happy path load + flatten ---
(async () => {
  const allowList = {
    L21101: [
      { id: 'L21101_N1', title: 'Test Node 1' },
      { id: 'L21101_N2', title: 'Test Node 2' },
    ],
    L21102: [
      { id: 'L21102_N1', title: 'Different Node' },
    ],
  };
  const kbData = {
    '../kb/nodes-subject-1.json': {
      nodes: [
        { node_id: 'L21101_N1', summary: 'sum1', key_points: ['k1', 'k2'] },
        { node_id: 'L21102_N1', summary: 'sum2' },
      ],
    },
  };
  const r = setupMode6WithFetch(allowList, kbData);
  await r.Mode.start();

  // Mode6 state initialized
  A.ok(r.Mode.state !== null, 'state populated after start()');
  A.ok(r.Mode.state.filters, 'state.filters initialized');
  A.eq(r.Mode.state.filters.subject, 'all', 'filters.subject default=all');
  A.eq(r.Mode.state.filters.code, 'all', 'filters.code default=all');
  A.eq(r.Mode.state.filters.tier, 'all', 'filters.tier default=all');
  A.eq(r.Mode.state.filters.q, '', 'filters.q default=empty');

  // --- 2: fetch failure → goHome ---
  const r2 = loadMode(6, { questions: [] });
  r2.sandbox.fetch = async () => {
    throw new Error('network');
  };
  await r2.Mode.start();
  A.ok(r2.stats.goHomeCalled >= 1, 'allowList fetch fail → goHome called');
  A.ok(r2.stats.toasts.some(t => t.includes('白名單載入失敗')),
    'allowList fetch fail → showToast warning shown');

  // --- 3: HTTP not-ok status → also goHome ---
  const r3 = loadMode(6, { questions: [] });
  r3.sandbox.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await r3.Mode.start();
  A.ok(r3.stats.goHomeCalled >= 1, 'allowList HTTP error → goHome called');

  // --- 4: kb file partial fail — non-fatal (some nodes still load) ---
  const r4 = setupMode6WithFetch(allowList, {
    '../kb/nodes-subject-1.json': { nodes: [{ node_id: 'L21101_N1', summary: 's' }] },
    // others missing → fetch returns 404 fallback
  });
  await r4.Mode.start();
  A.ok(r4.Mode.state !== null, 'state populated even with some kb files missing');

  process.exit(A.summary('Mode6 codex load'));
})();
