// Threat #9: exportedAt is not a valid ISO 8601 string.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload, { exportedAt: 'not-a-date-at-all' });
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('合法 ISO') || t.includes('合法') || t.includes('日期'),
    'expected malformed-date rejection, got: ' + t);
  console.log('PASS: malformed exportedAt rejected.');
})().catch(e => { console.error(e); process.exit(1); });
