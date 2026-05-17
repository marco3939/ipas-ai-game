// Threat #4c: ipas_sm2_ with empty suffix. Defense: prefix matcher requires length > prefix.length.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  console.log('isAllowedKey(ipas_sm2_):', env.ProgressIO._isAllowedKey('ipas_sm2_'));
  console.log('isAllowedKey(ipas_sm2_q0001):', env.ProgressIO._isAllowedKey('ipas_sm2_q0001'));
  H.assert(env.ProgressIO._isAllowedKey('ipas_sm2_') === false, 'empty SM2 suffix must reject');
  H.assert(env.ProgressIO._isAllowedKey('ipas_sm2_q0001') === true, 'valid SM2 key must allow');
  const payload = { 'ipas_sm2_': JSON.stringify({ ef: 2.5 }) };
  const envelope = H.validEnvelope(payload);
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('不允許') || t.includes('白名單'), 'expected whitelist rejection, got: ' + t);
  console.log('PASS: empty SM2 suffix rejected.');
})().catch(e => { console.error(e); process.exit(1); });
