// Threat #2 + Bug A: nested __proto__ inside the STRINGIFIED value of an allowed key.
// Sequence:
//   1. Construct an "outer" envelope that passes app/version/checksum/schema.
//   2. The value for ipas_progress_v1 is a JSON string containing  "__proto__":{"started":1}
//   3. After import, ProgressIO MUST re-serialize the reviver-cleaned object and store that
//      (Bug A guard). The localStorage entry must NOT contain the literal `"__proto__"` substring.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  // Construct payload value with embedded __proto__ key
  const evilInner = '{"started":' + (Date.now() - 1000) + ',"__proto__":{"polluted":true},"sessions":1}';
  const payload = { ipas_progress_v1: evilInner };
  const envelope = H.validEnvelope(payload);
  console.log('inner value contains __proto__:', evilInner.includes('__proto__'));
  await H.runImport(env, envelope);
  console.log('confirm shown:', env.confirms.length);
  console.log('Object.prototype.polluted:', Object.prototype.polluted);
  H.assert(Object.prototype.polluted === undefined, 'Object.prototype polluted!');
  const stored = env.localStorage.getItem('ipas_progress_v1');
  console.log('stored value:', stored);
  if (stored != null) {
    H.assert(!stored.includes('__proto__'),
      'Bug A: stored value still contains "__proto__" — re-serialization defense missing.');
    console.log('PASS: Bug A re-serialization stripped __proto__ from localStorage value.');
  } else {
    // If import was rejected outright, that's also OK
    console.log('Import was rejected (toast:', H.lastToast(env), ') — no pollution possible.');
    console.log('PASS: nested __proto__ either rejected or stripped.');
  }
})().catch(e => { console.error(e); process.exit(1); });
