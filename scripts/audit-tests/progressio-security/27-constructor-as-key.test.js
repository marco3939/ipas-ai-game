// Threat #21: `constructor` / `prototype` used as a payload key (DANGEROUS_KEYS list).
const H = require('./_harness');
(async () => {
  for (const danger of ['constructor', 'prototype']) {
    const env = H.createEnv();
    const valid = H.validEnvelope({ ipas_progress_v1: JSON.stringify({ started: Date.now() }) });
    const raw = JSON.stringify(valid);
    const evil = raw.replace('"payload":{', `"payload":{"${danger}":"x",`);
    await H.runImport(env, evil);
    const t = H.lastToast(env);
    console.log(`[${danger}] toast:`, t);
    // Defense-in-depth: reviver strips constructor/prototype before validation. The key claim
    // is that these dangerous strings must NEVER reach localStorage.
    H.assert(env.localStorage.getItem(danger) === null, `[${danger}] dangerous key must NOT be stored`);
    for (let i = 0; i < env.localStorage.length; i++) {
      const k = env.localStorage.key(i);
      H.assert(k !== danger, `[${danger}] dangerous key leaked to localStorage`);
    }
  }
  // Also verify _secureReviver behaviour directly:
  const env2 = H.createEnv();
  const stripped = JSON.parse('{"constructor":"x","ok":1}', env2.ProgressIO._secureReviver.bind(env2.ProgressIO));
  console.log('after reviver:', stripped);
  H.assert(stripped.constructor !== 'x', 'reviver must drop constructor');
  console.log('PASS: constructor / prototype scrubbed by reviver and never reach localStorage.');
})().catch(e => { console.error(e); process.exit(1); });
