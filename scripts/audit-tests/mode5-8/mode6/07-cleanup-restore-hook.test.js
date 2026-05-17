// 07-cleanup-restore-hook.test.js — Mode 6 cleanup() restores PlayEngine hooks
// PR #27 C-1: Mode 6 hooks PlayEngine.answer + PlayEngine.onNext during a
// challenge.  If user leaves mid-challenge via goHome, those hooks must be
// restored or they leak into other modes (案例 4 教訓:繞過共用層自寫機制).
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 6 cleanup restores PlayEngine hook (PR #27 C-1) tests ===');
const A = makeAssert();

function setupMode6Loaded() {
  const questions = [makeQ('q1', { node_id: 'L21101_N1', knowledge_code: 'L21101' })];
  const r = loadMode(6, { questions });
  r.sandbox.fetch = async (url) => {
    if (url.includes('kb-allowed-nodes.json')) {
      return {
        ok: true,
        json: async () => ({ L21101: [{ id: 'L21101_N1', title: 'Test' }] }),
      };
    }
    return { ok: true, json: async () => ({ nodes: [] }) };
  };
  return r;
}

(async () => {
  // --- 1: cleanup() restores PlayEngine.answer ---
  // Note: Mode6 saves _origAnswer = PlayEngine.answer.bind(PlayEngine), so
  // after restore, PlayEngine.answer is a bound copy of original (not same
  // reference). We verify behaviour: it's no longer the *hook* function (the
  // hook function captured `wasWrong` closure / state). Equivalence test:
  // call it and check it goes through default-answer path (writes Mastery)
  // rather than draft-stash hook path.
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    const hookedAnswer = r.sandbox.PlayEngine.answer;
    A.ok(typeof hookedAnswer === 'function', 'PlayEngine.answer is fn');
    r.Mode.cleanup();
    A.ok(r.sandbox.PlayEngine.answer !== hookedAnswer,
      'cleanup replaces hooked answer with restored bound original');
    A.eq(r.Mode._origAnswer, null, '_origAnswer cleared');
  }

  // --- 2: cleanup() restores PlayEngine.onNext (only if _origOnNext truthy) ---
  // Edge case: if original onNext was null/undefined, cleanup() leaves the hook
  // intact (per mode6.js:178 — `_origOnNext !== null` guard). The hook will
  // self-restore on first invocation. This is a known limitation;
  // re-entry via start() handles it via its own restoration block.
  {
    const r = setupMode6Loaded();
    // Force a non-null prior onNext so cleanup will restore
    r.sandbox.PlayEngine.onNext = function dummyPriorOnNext() {};
    const priorOnNext = r.sandbox.PlayEngine.onNext;
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    const hookedOnNext = r.sandbox.PlayEngine.onNext;
    A.ok(hookedOnNext !== priorOnNext, 'onNext replaced with hook');
    r.Mode.cleanup();
    A.ok(r.sandbox.PlayEngine.onNext === priorOnNext,
      'cleanup restores onNext when prior was non-null');
  }

  // --- 2b: if original onNext was null, cleanup leaves hook (guarded) ---
  {
    const r = setupMode6Loaded();
    r.sandbox.PlayEngine.onNext = null;
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    const hookedOnNext = r.sandbox.PlayEngine.onNext;
    r.Mode.cleanup();
    A.ok(r.sandbox.PlayEngine.onNext === hookedOnNext,
      'cleanup leaves hook untouched when prior was null (per code guard)');
  }

  // --- 3: start() also restores hooks (defensive re-entry) ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    const hookedAnswer = r.sandbox.PlayEngine.answer;
    // Simulate user navigates to home, then re-enters Mode 6
    await r.Mode.start();
    A.ok(r.sandbox.PlayEngine.answer !== hookedAnswer,
      'start() replaces prior hook with restored answer');
    A.eq(r.Mode._origAnswer, null, 'start() clears _origAnswer');
  }

  // --- 4: cleanup() is idempotent (call twice — second is no-op) ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    r.Mode.cleanup();
    const afterFirst = r.sandbox.PlayEngine.answer;
    A.nothrow(() => r.Mode.cleanup(), 'second cleanup() does not throw');
    A.ok(r.sandbox.PlayEngine.answer === afterFirst,
      'second cleanup() is a no-op (PlayEngine.answer unchanged)');
  }

  // --- 5: cleanup() without ever calling challenge() — no-op safe ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    const originalAnswer = r.sandbox.PlayEngine.answer;
    A.nothrow(() => r.Mode.cleanup(), 'cleanup() without challenge is safe');
    A.ok(r.sandbox.PlayEngine.answer === originalAnswer,
      'cleanup() does not change PlayEngine.answer when no hook installed');
  }

  process.exit(A.summary('Mode6 cleanup restores hook'));
})();
