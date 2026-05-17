// Threat #2 (top-level): envelope contains `__proto__` field. Must be stripped by reviver
// AND the unknown-envelope-key allowlist must reject if it survives.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  // Craft raw JSON manually so `__proto__` appears as a literal key in source text.
  const raw = JSON.stringify(envelope);
  const evil = raw.replace(/^\{/, '{"__proto__":{"polluted":true},');
  console.log('attack source (first 80 chars):', evil.slice(0, 80));
  await H.runImport(env, evil);
  console.log('toast:', H.lastToast(env));
  console.log('Object.prototype.polluted:', Object.prototype.polluted);
  H.assert(Object.prototype.polluted === undefined, 'prototype pollution leaked into Object.prototype!');
  // confirm should NOT appear (rejected at envelope phase) since reviver stripped __proto__ silently;
  // however the envelope schema may still pass if the parsed object only has whitelisted keys.
  // Either way the prototype must be clean — that's the strongest claim.
  console.log('PASS: top-level __proto__ did not pollute Object.prototype.');
})().catch(e => { console.error(e); process.exit(1); });
