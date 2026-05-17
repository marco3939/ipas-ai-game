// Threat #14: app field is not 'ipas-ai-game' (someone tries to feed a foreign-app progress file).
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  envelope.app = 'evil-game';
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('不是 IPAS') || t.includes('app 標記不符'),
    'expected app-mismatch rejection, got: ' + t);
  console.log('PASS: foreign-app file rejected.');
})().catch(e => { console.error(e); process.exit(1); });
