// Threat #15: another tab modifies localStorage during import — must abort before write.
// Strategy: confirm() handler triggers the synthetic 'storage' event before returning true.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const payload = { ipas_progress_v1: JSON.stringify({ started: Date.now() }) };
  const envelope = H.validEnvelope(payload);
  // Override window.confirm to dispatch a synthetic storage event mid-flow.
  const baseConfirm = env.sandbox.window.confirm;
  env.sandbox.window.confirm = (msg) => {
    env.confirms.push(String(msg));
    // Simulate another tab writing an ipas_ key
    const listeners = env.dom.events.get('storage') || [];
    listeners.forEach(fn => fn({ key: 'ipas_progress_v1' }));
    return true;
  };
  await H.runImport(env, envelope);
  const t = H.lastToast(env);
  console.log('toast:', t);
  H.assert(t.includes('另一分頁') || t.includes('已中止') || t.includes('中止'),
    'expected cross-tab abort, got: ' + t);
  // localStorage must not have been written:
  H.assert(env.localStorage.getItem('ipas_progress_v1') === null,
    'must NOT write payload when cross-tab abort triggered');
  console.log('PASS: cross-tab storage event aborted import.');
})().catch(e => { console.error(e); process.exit(1); });
