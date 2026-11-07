import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blockedLabel, bridgeAngle, closingCounts, closingPhase, endingElapsed} from '../stage-model.ts';
import {verificationText} from '../evidence-model.ts';

test('counter follows 1, 2, 3 and hides absent or invalid data', () => {
  for (const n of [1, 2, 3]) assert.equal(blockedLabel(n), `已擋下 ${n} 次`);
  for (const n of [undefined, null, 0, -1, NaN, Infinity, '3', 1.5]) assert.equal(blockedLabel(n), '');
});

test('denied waits through eight seconds and retry never ends itself', () => {
  assert.equal(endingElapsed('denied', 7.99), null);
  assert.equal(endingElapsed('denied', 8), 0);
  assert.equal(endingElapsed('retry', 600), null);
  assert.equal(endingElapsed('blocked', 600), null);
  assert.equal(endingElapsed('locked', 4), 0);
});

test('bridge lifts its negative-x deck upward and stays at 66 degrees', () => {
  assert.equal(bridgeAngle('locked', 0, false), 0);
  const half = bridgeAngle('locked', 1, false);
  const full = bridgeAngle('locked', 4, false);
  assert.ok(half < 0 && half > full);
  assert.ok(-4.25 * Math.sin(full) > 0);
  assert.equal(full, -66 * Math.PI / 180);
  assert.equal(bridgeAngle('locked', 60, false), full);
  assert.equal(bridgeAngle('locked', 0, true), full);
  assert.equal(bridgeAngle('idle', 60, false), 0);
});

test('closing numbers use server counts, including zero, or skip the whole card', () => {
  const stage = {seq:1, state:'locked' as const, caption:''};
  assert.deepEqual(closingCounts({...stage, blockedCount:3, allowedCount:1}), [0, 3, 1]);
  assert.deepEqual(closingCounts({...stage, blockedCount:0, allowedCount:0}), [0, 0, 0]);
  assert.equal(closingCounts({...stage, blockedCount:3}), null);
  assert.equal(closingCounts({...stage, blockedCount:NaN, allowedCount:1}), null);
});

test('audit display uses a six-character fingerprint and the exact damaged position', () => {
  assert.deepEqual(verificationText({ok:true,count:12,head:'a1b2c3d4e5f6'}), {text:'紀錄完整：12 筆，指紋 a1b2c3',damaged:false});
  assert.deepEqual(verificationText({ok:false,count:12,head:'a1b2c3d4e5f6',brokenAt:7}), {text:'第 7 筆紀錄被改過',damaged:true});
  assert.match(verificationText({ok:true,count:0,head:'000000000000'}).text,/紀錄完整：0 筆/);
  assert.equal(verificationText({ok:false,count:12,head:''}).damaged,true);
  assert.doesNotMatch(verificationText({ok:true,count:12,head:'<script>'}).text,/紀錄完整/);
});

test('summary follows the wink, adds only 2.5 seconds, and missing counts skip it', () => {
  assert.equal(closingPhase(1.59,true),'settle');
  assert.equal(closingPhase(1.6,true),'numbers');
  assert.equal(closingPhase(4.09,true),'numbers');
  assert.equal(closingPhase(4.1,true),'brand');
  assert.equal(closingPhase(1.6,false),'brand');
  assert.equal(closingPhase(60,true),'brand');
});
