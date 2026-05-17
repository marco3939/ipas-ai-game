// Threat #5: a payload value that is not valid JSON (or is non-string).
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: 'this is not JSON {{{' };
  const envelope = H.validEnvelope(payload);
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('無法 parse') || t.includes('JSON') || t.includes('checksum'),
    'expected JSON-parse rejection, got: ' + t);
  console.log('PASS: non-JSON value rejected.');
})().catch(e => { console.error(e); process.exit(1); });
