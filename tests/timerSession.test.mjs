import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceTimerSession, createTimerSession, DEFAULT_TIMER_SETTINGS, normalizeTimerSettings, timerSessionGain, toggleTimerSession } from '../src/timerSession.js';

const start = (minutes = 1, settings = {}, now = 0) => toggleTimerSession(createTimerSession(minutes, settings), now, settings).state;

test('timer preferences normalize malformed values without enabling features', () => {
  for (const value of [undefined, null, [], 'bad', 3]) assert.deepEqual(normalizeTimerSettings(value), DEFAULT_TIMER_SETTINGS);
  assert.deepEqual(normalizeTimerSettings({ fadeOut: 'true', fadeSeconds: 22, useBreak: 1, breakMinutes: 31, repeat: 'false' }), DEFAULT_TIMER_SETTINGS);
  const settings = { fadeOut: true, fadeSeconds: 60, useBreak: true, breakMinutes: 30, repeat: true };
  assert.deepEqual(normalizeTimerSettings(settings), settings);
  assert.equal(createTimerSession(0).phaseDuration, 25 * 60);
  assert.equal(createTimerSession(180).phaseDuration, 180 * 60);
});

test('pause and resume preserve fractional time, including repeated short pauses', () => {
  let session = start();
  session = toggleTimerSession(session, 1100).state;
  assert.equal(session.remainingMs, 58900);
  assert.equal(session.running, false);
  session = toggleTimerSession(session, 9000).state;
  assert.equal(session.deadline, 67900);
  session = toggleTimerSession(session, 9100).state;
  assert.equal(session.remainingMs, 58800);
});

test('a session completes once; restarting and resetting restore full gain', () => {
  const settings = { fadeOut: true };
  const result = advanceTimerSession(start(1, settings), 61000);
  assert.equal(result.state.complete, true);
  assert.equal(result.state.remainingMs, 0);
  assert.equal(result.boundary.transitions, 1);
  assert.equal(timerSessionGain(result.state), 0);
  assert.equal(advanceTimerSession(result.state, 62000).boundary, null);
  const restarted = toggleTimerSession(result.state, 65000).state;
  assert.equal(restarted.phase, 'focus');
  assert.equal(restarted.deadline, 125000);
  assert.equal(timerSessionGain(restarted), 1);
  assert.equal(timerSessionGain(createTimerSession(1, settings)), 1);
});

test('fade is smooth in final focus seconds and holds while paused', () => {
  const settings = { fadeOut: true, fadeSeconds: 30 };
  const halfway = advanceTimerSession(start(1, settings), 45000).state;
  assert.equal(timerSessionGain(halfway), 0.5);
  const paused = toggleTimerSession(halfway, 45000).state;
  assert.equal(timerSessionGain(advanceTimerSession(paused, 150000).state), 0.5);
  assert.equal(timerSessionGain(advanceTimerSession(start(), 59000).state), 1);
});

test('focus automatically enters a full-volume break then stops without repeat', () => {
  const settings = { fadeOut: true, useBreak: true, breakMinutes: 2 };
  let result = advanceTimerSession(start(1, settings), 60000);
  assert.equal(result.state.phase, 'break');
  assert.equal(result.state.phaseDuration, 120);
  assert.equal(result.state.remainingMs, 120000);
  assert.equal(result.boundary.phase, 'focus');
  assert.equal(timerSessionGain(result.state), 1);
  result = advanceTimerSession(result.state, 180000);
  assert.equal(result.state.complete, true);
  assert.equal(result.boundary.phase, 'break');
  assert.equal(timerSessionGain(result.state), 0);
});

test('background catchup aggregates completed focus and break into one notification', () => {
  const result = advanceTimerSession(start(1, { useBreak: true, breakMinutes: 1 }), 600000);
  assert.equal(result.state.running, false);
  assert.equal(result.boundary.transitions, 2);
  assert.equal(result.boundary.complete, true);
});

test('repeat without a break catches up huge elapsed intervals without iterative replay', () => {
  const result = advanceTimerSession(start(1, { repeat: true }), 60_000_000_000 + 12345);
  assert.equal(result.state.running, true);
  assert.equal(result.state.phase, 'focus');
  assert.equal(result.state.remainingMs, 47655);
  assert.equal(result.boundary.transitions, 1_000_000);
  assert.equal(advanceTimerSession(result.state, 60_000_000_000 + 12345).boundary, null);
});

test('repeating focus-break cycles land in the correct phase at exact boundaries', () => {
  const session = start(1, { repeat: true, useBreak: true, breakMinutes: 2 });
  for (const [time, phase, remainingMs, transitions] of [
    [60000, 'break', 120000, 1],
    [180000, 'focus', 60000, 2],
    [240000, 'break', 120000, 3],
    [180_000_000 + 61000, 'break', 119000, 2001],
  ]) {
    const result = advanceTimerSession(session, time);
    assert.equal(result.state.phase, phase);
    assert.equal(result.state.remainingMs, remainingMs);
    assert.equal(result.boundary.transitions, transitions);
  }
});

test('options stay fixed through current break and apply when the next focus starts', () => {
  const current = { repeat: true, useBreak: true, breakMinutes: 2, fadeOut: true };
  const pending = { repeat: false, useBreak: true, breakMinutes: 1, fadeOut: false };
  let result = advanceTimerSession(start(1, current), 60000, pending);
  assert.equal(result.state.phaseDuration, 120);
  assert.equal(result.state.settings.fadeOut, true);
  result = advanceTimerSession(result.state, 180000, pending);
  assert.equal(result.state.phase, 'focus');
  assert.equal(result.state.settings.repeat, false);
  assert.equal(result.state.settings.fadeOut, false);
  result = advanceTimerSession(result.state, 400000, pending);
  assert.equal(result.state.complete, true);
  assert.equal(result.boundary.transitions, 2);
});

test('long catchup uses newly adopted cycle durations and remains constant work', () => {
  const current = { repeat: true, useBreak: true, breakMinutes: 2 };
  const pending = { repeat: true, useBreak: false };
  const result = advanceTimerSession(start(1, current), 60_000_000_000 + 10000, pending);
  assert.equal(result.state.phase, 'focus');
  assert.equal(result.state.remainingMs, 50000);
  assert.equal(result.boundary.transitions, 999999);
});

test('pausing at an expired deadline reports completion instead of resurrecting time', () => {
  const result = toggleTimerSession(start(), 60000);
  assert.equal(result.state.complete, true);
  assert.equal(result.state.running, false);
  assert.equal(result.boundary.transitions, 1);
});

test('idle setting changes apply on first start, but paused settings remain stable', () => {
  const idle = createTimerSession(1);
  const active = toggleTimerSession(idle, 0, { fadeOut: true }).state;
  assert.equal(active.settings.fadeOut, true);
  const paused = toggleTimerSession(active, 40000).state;
  const resumed = toggleTimerSession(paused, 90000, { fadeOut: false }).state;
  assert.equal(resumed.settings.fadeOut, true);
  assert.equal(resumed.deadline, 110000);
});
