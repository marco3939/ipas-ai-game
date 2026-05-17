// Threat #19: _busy guard — two import calls in flight must result in the second
// being short-circuited (toast "進度匯入/出中,請稍候").
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  // Manually set _busy to simulate an in-flight import.
  env.ProgressIO._busy = true;
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('匯入/出中') || t.includes('稍候'),
    'expected _busy short-circuit, got: ' + t);
  // _busy should still be true (we set it; the rejected call must not have toggled it off).
  H.assert(env.ProgressIO._busy === true, '_busy must not be cleared by rejected concurrent call');
  console.log('PASS: _busy blocks concurrent import.');
})().catch(e => { console.error(e); process.exit(1); });
