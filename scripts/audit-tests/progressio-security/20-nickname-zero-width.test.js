// Threat #13: nickname with zero-width / RTL override / control chars.
// sanitizeNickname must strip them BEFORE the regex check; if any survive, sanitize !== original
// and the import will reject.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  // ​ = zero-width space, ‮ = RTL override
  const evil = 'ali​ce‮';
  console.log('evil len:', evil.length);
  console.log('sanitizeNickname:', JSON.stringify(env.ProgressIO.sanitizeNickname(evil)));
  H.assert(env.ProgressIO.sanitizeNickname(evil) !== evil,
    'sanitize must alter zero-width / RTL input');

  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload, { nickname: evil });
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('不允許字元') || t.includes('nickname'),
    'expected nickname rejection on zero-width/RTL, got: ' + t);
  console.log('PASS: zero-width / RTL nickname rejected.');
})().catch(e => { console.error(e); process.exit(1); });
