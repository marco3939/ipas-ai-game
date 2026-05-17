// MED-1: integer overflow in numeric fields (wrongCount = Number.MAX_VALUE).
// _isNonNegNum should accept finite numbers; very large numbers are technically finite,
// but the validator should at least reject NaN / Infinity. Verify both.
const H = require('./_harness');
(async () => {
  // Sub-case A: Infinity → JSON.stringify converts to null → typeof !== 'number' → reject
  {
    const env = H.createEnv();
    const wb = [{ qid: 'q1', wrongCount: Infinity }];
    const payload = { ipas_wrongbook_v1: JSON.stringify(wb) };
    const envelope = H.validEnvelope(payload);
    await H.runImport(env, envelope);
    const t = H.lastToast(env);
    console.log('[Infinity] toast:', t);
    H.assert(t.includes('schema 不符') || t.includes('竄改'),
      'Infinity must produce schema reject, got: ' + t);
  }
  // Sub-case B: NaN → same as Infinity via JSON
  {
    const env = H.createEnv();
    const wb = [{ qid: 'q1', wrongCount: NaN }];
    const payload = { ipas_wrongbook_v1: JSON.stringify(wb) };
    const envelope = H.validEnvelope(payload);
    await H.runImport(env, envelope);
    const t = H.lastToast(env);
    console.log('[NaN] toast:', t);
    H.assert(t.includes('schema 不符') || t.includes('竄改'),
      'NaN must produce schema reject, got: ' + t);
  }
  // Sub-case C: raw JSON injection 1e400 → parses to Infinity → reject via _isNum (Number.isFinite)
  {
    const env = H.createEnv();
    const validBase = H.validEnvelope({ ipas_wrongbook_v1: JSON.stringify([{ qid: 'q1', wrongCount: 1 }]) });
    // Replace the value string with one containing 1e400 (which parses to Infinity)
    const evilInner = '[{"qid":"q1","wrongCount":1e400}]';
    validBase.payload.ipas_wrongbook_v1 = evilInner;
    H.rehash(validBase);
    await H.runImport(env, validBase);
    const t = H.lastToast(env);
    console.log('[1e400] toast:', t);
    H.assert(t.includes('schema 不符') || t.includes('竄改'),
      '1e400 (parses to Infinity) must produce schema reject, got: ' + t);
  }
  console.log('PASS: integer overflow / Infinity / NaN in wrongCount rejected.');
})().catch(e => { console.error(e); process.exit(1); });
