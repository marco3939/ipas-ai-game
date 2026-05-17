// Threat #17: SubtleCrypto not available (old browser / non-HTTPS). MUST hard reject
// rather than silently bypass checksum verification.
const H = require('./_harness');
(async () => {
  const env = H.createEnv({ crypto: { unavailable: true } });
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  // Build an envelope with a syntactically-valid 64-hex checksum.
  const envelope = {
    app: 'ipas-ai-game', version: 1,
    exportedAt: new Date(Date.now() - 60_000).toISOString(),
    nickname: 'tester',
    keyCount: 1,
    checksum: 'a'.repeat(64),   // hex shape valid; verification would normally fail or skip
    payload
  };
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('SubtleCrypto') || t.includes('無法計算') || t.includes('HTTPS'),
    'expected hard reject when SubtleCrypto unavailable, got: ' + t);
  H.assert(env.localStorage.length === 0, 'must NOT write anything when crypto unavailable');
  console.log('PASS: SubtleCrypto unavailable → hard reject (no silent bypass).');
})().catch(e => { console.error(e); process.exit(1); });
