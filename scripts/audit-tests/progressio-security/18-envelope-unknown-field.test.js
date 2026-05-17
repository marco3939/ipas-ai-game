// Threat #11: envelope contains an unknown top-level field (strict allowlist).
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  envelope.attackerSlot = 'evil';
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('未知欄位') || t.includes('attackerSlot'),
    'expected unknown-envelope-field rejection, got: ' + t);
  console.log('PASS: unknown envelope field rejected.');
})().catch(e => { console.error(e); process.exit(1); });
