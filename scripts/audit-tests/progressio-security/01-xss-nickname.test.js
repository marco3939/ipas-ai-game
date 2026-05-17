// Threat #1: XSS via nickname field embedded in envelope.
// Defense: parsed.nickname must pass sanitizeNickname() — < > " ' etc are reject-listed.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now(), sessions: 1, totalAnswered: 0, totalCorrect: 0 }) };
  // <=20 chars so length check passes; sanitize must catch the angle brackets.
  const envelope = H.validEnvelope(payload, { nickname: '<img onerror=x>' });
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  console.log('confirm shown:', env.confirms.length);
  H.assert(t.includes('不允許字元') || t.includes('nickname'),
    'expected nickname sanitize/length rejection but got: ' + t);
  H.assert(env.confirms.length === 0, 'must NOT reach confirm step when nickname is malicious');
  // Confirm sanitizeNickname strips < > directly.
  const cleaned = env.ProgressIO.sanitizeNickname('<img onerror=x>');
  console.log('sanitizeNickname(<img onerror=x>):', JSON.stringify(cleaned));
  H.assert(cleaned === '', 'sanitizeNickname must drop angle-bracket payload');
  console.log('PASS: XSS-style nickname rejected before confirm.');
})().catch(e => { console.error(e); process.exit(1); });
