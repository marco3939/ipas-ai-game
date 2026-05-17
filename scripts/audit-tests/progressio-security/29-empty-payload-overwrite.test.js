// MED-2: an envelope claims keyCount=0 / empty payload — must reject (not silently wipe store).
// Also: tiny single-key import must still work and not nuke other keys silently outside the
// rollback snapshot's reach.
const H = require('./_harness');
(async () => {
  // Sub-case A: empty payload
  {
    const env = H.createEnv();
    const envelope = H.validEnvelope({}, {});
    await H.runImport(env, envelope);
    const t = H.lastToast(env);
    console.log('[empty payload] toast:', t);
    H.assert(t.includes('payload 為空') || t.includes('為空') || t.includes('payload'),
      'empty payload must reject; got: ' + t);
  }
  // Sub-case B: 1-key payload should replace all ipas_* keys (whole-store overwrite is by design)
  // but we verify the existing data IS swapped, not silently kept.
  {
    const env = H.createEnv({ seed: {
      'ipas_progress_v1': JSON.stringify({ started: 1000, sessions: 999 }),
      'ipas_settings_v1': JSON.stringify({ theme: 'dark' })
    }});
    const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now(), sessions: 1 }) };
    const envelope = H.validEnvelope(payload);
    await H.runImport(env, envelope);
    console.log('[after 1-key import] keys:', Object.keys(env.localStorage._dump()));
    // ipas_settings_v1 should be removed because import wipes all ipas_* allowed keys first
    H.assert(env.localStorage.getItem('ipas_settings_v1') === null,
      'expected ipas_settings_v1 cleared as part of atomic overwrite');
    H.assert(env.localStorage.getItem('ipas_progress_v1') !== null,
      'new progress must be written');
  }
  console.log('PASS: empty payload rejected; 1-key payload overwrites whole store atomically.');
})().catch(e => { console.error(e); process.exit(1); });
