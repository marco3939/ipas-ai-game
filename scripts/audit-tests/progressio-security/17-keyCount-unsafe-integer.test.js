// Threat #10b: keyCount = Number.MAX_SAFE_INTEGER + 1 (Number.isSafeInteger must reject).
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  envelope.keyCount = Number.MAX_SAFE_INTEGER + 1;  // loses precision; isSafeInteger() === false
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('安全整數') || t.includes('竄改') || t.includes('合法'),
    'expected isSafeInteger rejection, got: ' + t);
  console.log('PASS: unsafe-integer keyCount rejected.');
})().catch(e => { console.error(e); process.exit(1); });
