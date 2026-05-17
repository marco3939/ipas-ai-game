// Threat #8: exportedAt set to the far future (must reject; tolerates +5 min skew).
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const envelope = H.validEnvelope(payload, { exportedAt: future });
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('未來時間') || t.includes('竄改'),
    'expected future-time rejection, got: ' + t);
  console.log('PASS: future exportedAt rejected.');
})().catch(e => { console.error(e); process.exit(1); });
