// Threat #6b: missing checksum field entirely.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  delete envelope.checksum;
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('checksum') || t.includes('缺少'),
    'expected missing-checksum rejection, got: ' + t);
  console.log('PASS: missing checksum rejected.');
})().catch(e => { console.error(e); process.exit(1); });
