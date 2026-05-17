// Threat #20: ipas_user_nickname_v1 must be schema-validated (sanitizeNickname must accept the value as-is).
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  // The value stored under K_USER_NICKNAME is `JSON.stringify(name)` — i.e. `"name"` with quotes.
  // We inject an XSS-style nickname; validator should reject because sanitize would alter it.
  const xss = '<svg onload=x>';
  const payload = { ipas_user_nickname_v1: JSON.stringify(xss) };
  const envelope = H.validEnvelope(payload, { nickname: 'safe' });  // envelope nickname is safe to pass phase 4
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('schema 不符') || t.includes('竄改') || t.includes('user_nickname'),
    'expected nickname-store schema rejection, got: ' + t);
  H.assert(env.localStorage.getItem('ipas_user_nickname_v1') === null,
    'XSS nickname must NOT be stored');
  console.log('PASS: XSS in nickname-store value rejected.');
})().catch(e => { console.error(e); process.exit(1); });
