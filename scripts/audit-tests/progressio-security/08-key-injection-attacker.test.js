// Threat #4a: attacker-supplied key outside ipas_* namespace (e.g. "attacker_key").
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { attacker_key: JSON.stringify({ x: 1 }) };
  const envelope = H.validEnvelope(payload);
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('不在白名單') || t.includes('不允許的 key'),
    'expected key-whitelist rejection, got: ' + t);
  H.assert(env.localStorage.getItem('attacker_key') === null, 'attacker_key must NOT be stored');
  console.log('PASS: non-ipas attacker key rejected.');
})().catch(e => { console.error(e); process.exit(1); });
