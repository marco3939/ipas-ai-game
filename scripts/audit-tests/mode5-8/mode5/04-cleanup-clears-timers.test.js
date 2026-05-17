// 04-cleanup-clears-timers.test.js — Mode5 PR #27 H-1 verification
// Mode 5 uses _scheduleTimeout / _clearAllTimers (mirror of Mode 1).
// cleanup() must call _clearAllTimers — otherwise leaving Mode 5 with HP=0
// timer or victory timer pending will fire callbacks after view switch.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 5 cleanup clears timers (PR #27 H-1) tests ===');
const A = makeAssert();

// --- 1: _scheduleTimeout pushes into _pendingTimers ---
{
  const { Mode } = loadMode(5, { questions: [] });
  A.eq(Mode._pendingTimers, [], 'initial _pendingTimers empty');
  Mode._scheduleTimeout(() => {}, 1000);
  A.eq(Mode._pendingTimers.length, 1, '_scheduleTimeout pushes one id');
  Mode._scheduleTimeout(() => {}, 1000);
  A.eq(Mode._pendingTimers.length, 2, 'second _scheduleTimeout pushes two ids');
}

// --- 2: _clearAllTimers clears the list ---
{
  const { Mode } = loadMode(5, { questions: [] });
  Mode._scheduleTimeout(() => {}, 1000);
  Mode._scheduleTimeout(() => {}, 1000);
  Mode._scheduleTimeout(() => {}, 1000);
  A.eq(Mode._pendingTimers.length, 3, '3 timers pending');
  Mode._clearAllTimers();
  A.eq(Mode._pendingTimers, [], '_clearAllTimers empties the list');
}

// --- 3: cleanup() invokes _clearAllTimers ---
{
  const { Mode } = loadMode(5, { questions: [] });
  Mode._scheduleTimeout(() => {}, 1000);
  Mode._scheduleTimeout(() => {}, 1000);
  A.eq(Mode._pendingTimers.length, 2, '2 timers scheduled');
  Mode.cleanup();
  A.eq(Mode._pendingTimers, [], 'cleanup() clears all pending timers (PR #27 H-1)');
}

// --- 4: typeTimer is cleaned too ---
{
  const { Mode } = loadMode(5, { questions: [] });
  // Manually set _typeTimer like typeText would
  Mode._typeTimer = 123;
  Mode.cleanup();
  A.eq(Mode._typeTimer, null, 'cleanup also nulls _typeTimer');
}

// --- 5: start() also clears prior timers (defensive re-entry) ---
{
  const { Mode } = loadMode(5, {
    questions: [makeQ('q1', { node_id: 'N1' })],
  });
  Mode._scheduleTimeout(() => {}, 1000);
  Mode._scheduleTimeout(() => {}, 1000);
  A.ok(Mode._pendingTimers.length >= 2, 'two timers scheduled');
  Mode.start();
  A.eq(Mode._pendingTimers, [], 'start() clears prior timers (defensive)');
}

// --- 6: state NOT nulled by cleanup (deliberate design per comment) ---
{
  const { Mode } = loadMode(5, { questions: [makeQ('q1', { node_id: 'N1' })] });
  Mode.cachedBosses = [{ nodeId: 'N1', source: 'fallback', weak: 1 }];
  Mode.engageBoss(0);
  A.ok(Mode.state !== null, 'state populated after engageBoss');
  Mode.cleanup();
  A.ok(Mode.state !== null,
    'state NOT nulled by cleanup (deliberate, per code comment — avoids timer race)');
}

// --- 7: source contract — _scheduleTimeout cb filters self out of list ---
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'src', 'modes', 'mode5.js'), 'utf8');
  // The cb body must contain self-filter logic
  A.ok(/_pendingTimers\s*=\s*this\._pendingTimers\.filter\(x => x !== id\)/.test(src),
    'mode5 _scheduleTimeout cb self-filters from _pendingTimers (no leak)');
}

process.exit(A.summary('Mode5 cleanup'));
