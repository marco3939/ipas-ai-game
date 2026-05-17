// Threat #3a: DoS via file.size > MAX_FILE_SIZE (2 MB).
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  // Forge a File whose .size exceeds the cap but contents are tiny.
  const huge = H.makeFile('{}', 'huge.json');
  huge.size = 3 * 1024 * 1024;  // claim 3 MB
  await env.ProgressIO.importProgress(huge);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('檔案過大') || t.includes('上限'),
    'expected file-size rejection, got: ' + t);
  H.assert(env.confirms.length === 0, 'should not reach confirm');
  console.log('PASS: oversized file rejected at phase 1.');
})().catch(e => { console.error(e); process.exit(1); });
