// Threat #4b: ipas_player_vEVIL — looks like a player key, but PR (案例 10 H6)
// tightened to exact match. Suffix attacks must be rejected.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  console.log('isAllowedKey(ipas_player_v1):', env.ProgressIO._isAllowedKey('ipas_player_v1'));
  console.log('isAllowedKey(ipas_player_vEVIL):', env.ProgressIO._isAllowedKey('ipas_player_vEVIL'));
  console.log('isAllowedKey(ipas_player_v1_evil):', env.ProgressIO._isAllowedKey('ipas_player_v1_evil'));
  H.assert(env.ProgressIO._isAllowedKey('ipas_player_v1') === true, 'exact player key must allow');
  H.assert(env.ProgressIO._isAllowedKey('ipas_player_vEVIL') === false, 'fuzzy suffix must reject');
  H.assert(env.ProgressIO._isAllowedKey('ipas_player_v1_evil') === false, 'underscore suffix must reject');
  const payload = { ipas_player_vEVIL: JSON.stringify({ hp: 999 }) };
  const envelope = H.validEnvelope(payload);
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('不允許') || t.includes('白名單'), 'expected whitelist rejection, got: ' + t);
  console.log('PASS: evil-suffix key rejected.');
})().catch(e => { console.error(e); process.exit(1); });
