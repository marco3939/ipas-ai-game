// Threat #10a: keyCount claims a different number than Object.keys(payload).length.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = {
    ipas_progress_v1: JSON.stringify({ started: Date.now() }),
    ipas_settings_v1: JSON.stringify({ theme: 'dark' })
  };
  const envelope = H.validEnvelope(payload);
  envelope.keyCount = 99;  // lie
  // checksum still matches payload content (not keyCount), so this triggers schema-only fail
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('keyCount 不符') || t.includes('不符'),
    'expected keyCount-mismatch rejection, got: ' + t);
  console.log('PASS: keyCount mismatch rejected.');
})().catch(e => { console.error(e); process.exit(1); });
