import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FileChange } from '../domain/types.js';
import { DiffFileList } from './diff-viewer-modal.js';

const noop = () => {};

function file(id: string): FileChange {
  return { id, status: 'M', path: `src/${id}.ts`, additions: 1, deletions: 1, size: '1 KB', staged: false };
}

function render(files: FileChange[], emptyMessage = '当前来源没有可显示的变更') {
  return renderToStaticMarkup(
    <DiffFileList
      files={files}
      loading={false}
      emptyMessage={emptyMessage}
      selectedFileId={null}
      reviewedIds={new Set()}
      onSelect={noop}
      onToggleReviewed={noop}
    />,
  );
}

test('空列表仍渲染滚动容器，视口尺寸测量不会因为节点缺失而失效', () => {
  const html = render([]);
  const scrollIndex = html.indexOf('overflow-y:auto');
  assert.ok(scrollIndex >= 0, '空列表必须保留滚动容器，否则高度测量只跑一次就永久失效');
  assert.ok(html.indexOf('当前来源没有可显示的变更') > scrollIndex, '空状态提示渲染在滚动容器内');
});

test('文件行按固定行高虚拟化，只有可见窗口渲染', () => {
  const files = Array.from({ length: 105 }, (_, index) => file(`f${index}`));
  const html = render(files);
  assert.match(html, /height:3780px/);
  const rows = (html.match(/aria-label="标记已查看"/g) ?? []).length;
  assert.ok(rows > 0 && rows < files.length, `渲染窗口应为可见子集，实际 ${rows}`);
});
