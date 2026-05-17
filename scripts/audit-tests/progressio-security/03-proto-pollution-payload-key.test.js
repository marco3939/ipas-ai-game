// Threat #2 (payload key): payload contains `__proto__` as a key directly.
// Defense: _isAllowedKey + DANGEROUS_KEYS check in phase 6.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  // Build an envelope whose payload string literally contains "__proto__" as a key.
  // We bypass JSON.stringify's normal encoding by injecting a raw fragment.
  const valid = H.validEnvelope({ ipas_progress_v1: JSON.stringify({ started: Date.now() }) });
  // Craft attacker payload: append __proto__ key into payload object
  const rawEnvelope = JSON.stringify(valid);
  // Insert "__proto__" key inside the payload object literal
  const evil = rawEnvelope.replace('"payload":{', '"payload":{"__proto__":"x",');
  console.log('attack snippet:', evil.match(/"payload":\{[^,]+,/)[0]);
  await H.runImport(env, evil);
  const t = H.lastToast(env);
  console.log('toast:', t);
  // Defense-in-depth: reviver strips __proto__ pre-validation, so import may still succeed
  // for the remaining clean keys — but the dangerous key must NEVER reach localStorage and
  // must NEVER pollute Object.prototype.
  H.assert(Object.prototype['__proto__polluted'] === undefined, 'Object.prototype must not be polluted');
  H.assert(env.localStorage.getItem('__proto__') === null, '__proto__ key must NOT be stored');
  // Iterate all stored keys and confirm none of them are __proto__ / constructor / prototype.
  for (let i = 0; i < env.localStorage.length; i++) {
    const k = env.localStorage.key(i);
    console.log('stored key:', k);
    H.assert(k !== '__proto__' && k !== 'constructor' && k !== 'prototype',
      'dangerous key ' + k + ' leaked to localStorage');
  }
  // The legit clean key may have been imported (reviver dropped __proto__), confirm that's the case
  // OR rejected — either is defensible.
  console.log('PASS: __proto__ payload key did not pollute prototype or localStorage.');
})().catch(e => { console.error(e); process.exit(1); });
