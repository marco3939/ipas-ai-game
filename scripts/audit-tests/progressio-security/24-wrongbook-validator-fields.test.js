// Threat #18: wrongbook validator must check the 4 PR #16 fields:
//   userChoice / correctChoice (type+length 10)
//   userText / correctText     (type+length 2000)
// Build wrongbook entries that violate each and ensure validator rejects.
const H = require('./_harness');
(async () => {
  // case A: userChoice wrong type
  for (const [label, entry, expectField] of [
    ['userChoice number', { qid: 'q1', userChoice: 123 }, 'userChoice'],
    ['userChoice too long', { qid: 'q1', userChoice: 'X'.repeat(11) }, 'userChoice'],
    ['correctChoice array', { qid: 'q1', correctChoice: ['A'] }, 'correctChoice'],
    ['correctChoice too long', { qid: 'q1', correctChoice: 'A'.repeat(11) }, 'correctChoice'],
    ['userText too long', { qid: 'q1', userText: 'x'.repeat(2001) }, 'userText'],
    ['correctText too long', { qid: 'q1', correctText: 'x'.repeat(2001) }, 'correctText'],
    ['userText non-string', { qid: 'q1', userText: {} }, 'userText'],
  ]) {
    const env = H.createEnv();
    const wb = [entry];
    const payload = { ipas_wrongbook_v1: JSON.stringify(wb) };
    const envelope = H.validEnvelope(payload);
    await H.runImport(env, envelope);
    const t = H.lastToast(env);
    console.log(`[${label}] toast:`, t);
    H.assert(t.includes('schema 不符') || t.includes('竄改') || t.includes('wrongbook'),
      `[${label}] expected schema rejection, got: ${t}`);
    H.assert(env.localStorage.length === 0, `[${label}] must NOT write`);
  }
  console.log('PASS: wrongbook validator catches all 4 PR #16 fields (type + length).');
})().catch(e => { console.error(e); process.exit(1); });
