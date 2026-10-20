import test from 'node:test';
import assert from 'node:assert/strict';
import { clampMapShare, nearestPanelStop, nearestCardIndex } from '../src/explorer-interactions.ts';

test('panel dragging stays in bounds and releases to the three named positions', () => {
  assert.equal(clampMapShare(-100), 20);
  assert.equal(clampMapShare(100), 65);
  assert.equal(nearestPanelStop(21), 20);
  assert.equal(nearestPanelStop(48), 50);
  assert.equal(nearestPanelStop(63), 65);
  assert.equal(nearestPanelStop(57), 50);
});
test('card settling handles gaps, end positions, and empty filtered views', () => {
  assert.equal(nearestCardIndex([], 100), -1);
  assert.equal(nearestCardIndex([150, 460, 770, 1080, 1390], 764), 2);
  assert.equal(nearestCardIndex([150, 460, 770, 1080, 1390], 1450), 4);
  assert.equal(nearestCardIndex([150, 460, 770, 1080, 1390], -30), 0);
});
