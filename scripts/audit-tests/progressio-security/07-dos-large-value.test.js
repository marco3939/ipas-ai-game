// Threat #3c: DoS via a single payload value > MAX_VALUE_SIZE (1 MB).
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  // Build a settings value that is 1.5 MB of JSON-string content.
  const bigJson = JSON.stringify({ blob: 'x'.repeat(1.5 * 1024 * 1024) });
  const payload = { ipas_settings_v1: bigJson };
  const envelope = H.validEnvelope(payload);
  console.log('value length:', bigJson.length);
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('大小上限') || t.includes('超過') || t.includes('內容過長'),
    'expected per-value size rejection, got: ' + t);
  console.log('PASS: oversized value rejected at phase 6.');
})().catch(e => { console.error(e); process.exit(1); });
