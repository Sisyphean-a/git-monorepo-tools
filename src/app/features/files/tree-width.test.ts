import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTreeWidth, filePreviewWidthMin, treeResizerWidth, treeWidthDefault, treeWidthMax, treeWidthMin } from './tree-width.js';

test('宽度在上下限之间夹取', () => {
  assert.equal(clampTreeWidth(400, 1200), 400);
  assert.equal(clampTreeWidth(10, 1200), treeWidthMin);
  assert.equal(clampTreeWidth(900, 1200), 1200 - filePreviewWidthMin - treeResizerWidth);
  assert.ok(treeWidthDefault >= treeWidthMin);
});

test('容器尚未测量时只守下限', () => {
  assert.equal(treeWidthMax(0), Number.POSITIVE_INFINITY);
  assert.equal(clampTreeWidth(treeWidthDefault, 0), treeWidthDefault);
  assert.equal(clampTreeWidth(40, 0), treeWidthMin);
});

// Guard: 容器窄到放不下侧栏下限与预览下限时，必须保住可读的侧栏，而不是把宽度算成负数。
test('容器不足时下限优先', () => {
  assert.equal(treeWidthMax(400), treeWidthMin);
  assert.equal(clampTreeWidth(300, 400), treeWidthMin);
});

test('拉到上限时预览区仍不少于下限', () => {
  for (const containerWidth of [560, 700, 900, 1440, 2560]) {
    const width = clampTreeWidth(Number.MAX_SAFE_INTEGER, containerWidth);
    assert.ok(containerWidth - width - treeResizerWidth >= filePreviewWidthMin);
  }
});
