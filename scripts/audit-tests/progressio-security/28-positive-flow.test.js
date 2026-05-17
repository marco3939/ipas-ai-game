// Positive flow: a clean envelope must import successfully and restore values.
const H = require('./_harness');
(async () => {
  const env = H.createEnv();
  const innerProgress = { started: Date.now() - 1000, sessions: 7, totalAnswered: 50, totalCorrect: 30 };
  const innerMastery = { 'q1': { attempts: 3, correct: 2, score: 100, streak: 1 } };
  const innerWb = [{ qid: 'q1', wrongCount: 1, drillCount: 0, mastered: false, userChoice: 'A', correctChoice: 'B', userText: 'foo', correctText: 'bar' }];
  const payload = {
    ipas_progress_v1: JSON.stringify(innerProgress),
    ipas_mastery_v1: JSON.stringify(innerMastery),
    ipas_wrongbook_v1: JSON.stringify(innerWb),
    ipas_user_nickname_v1: JSON.stringify('alice')
  };
  const envelope = H.validEnvelope(payload, { nickname: 'alice' });
  await H.runImport(env, envelope);
  console.log('confirms:', env.confirms.length);
  console.log('errors:', env.errors);
  console.log('toast:', H.lastToast(env));
  H.assert(H.lastToast(env).includes('已匯入'), 'expected success toast');
  const stored = env.localStorage.getItem('ipas_progress_v1');
  console.log('stored ipas_progress_v1:', stored);
  H.assert(stored !== null, 'progress must be persisted');
  const parsed = JSON.parse(stored);
  H.assert(parsed.totalCorrect === 30, 'totalCorrect must round-trip');
  console.log('PASS: positive flow import succeeded and round-tripped values.');
})().catch(e => { console.error(e); process.exit(1); });
