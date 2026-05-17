// Threat #6a: tampered checksum.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  // overwrite checksum with a syntactically valid but wrong 64-hex string
  envelope.checksum = '0'.repeat(64);
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('checksum') || t.includes('竄改'),
    'expected checksum-mismatch rejection, got: ' + t);
  console.log('PASS: forged checksum rejected.');
})().catch(e => { console.error(e); process.exit(1); });
