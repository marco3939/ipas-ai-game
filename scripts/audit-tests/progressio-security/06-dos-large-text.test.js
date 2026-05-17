// Threat #3b: DoS via text.length > MAX_TEXT_LENGTH (4M chars) — file.size could be under
// 2 MB if it claims a tiny size, but text length might balloon. Defense at phase 2.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  // Build a long-text file but lie about size so it passes phase 1.
  const longText = 'x'.repeat(env.ProgressIO.MAX_TEXT_LENGTH + 10);
  const f = H.makeFile(longText, 'long.json');
  f.size = 1024;  // pretend small
  await env.ProgressIO.importProgress(f);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('過長') || t.includes('內容過長'),
    'expected text-length rejection, got: ' + t);
  console.log('PASS: oversized text rejected at phase 2.');
})().catch(e => { console.error(e); process.exit(1); });
