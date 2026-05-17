// Threat #12: version field does not equal EXPORT_VERSION.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  envelope.version = 99;
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('版本不相容') || t.includes('v99'),
    'expected version-mismatch rejection, got: ' + t);
  console.log('PASS: version mismatch rejected.');
})().catch(e => { console.error(e); process.exit(1); });
