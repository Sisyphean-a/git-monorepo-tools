import test from 'node:test';
import assert from 'node:assert/strict';
import type { ILink } from '@xterm/xterm';
import { createTerminalLinkProvider, findTerminalLinkCandidates } from './terminal-link-provider.js';

test('finds HTTP(S) links without terminal punctuation', () => {
  const links = findTerminalLinkCandidates('Open https://example.test/path?q=1).');

  assert.deepEqual(links, [{
    start: 5,
    end: 34,
    text: 'https://example.test/path?q=1',
    target: { type: 'url', value: 'https://example.test/path?q=1' },
  }]);
});

test('finds local file URLs and Windows absolute paths', () => {
  const links = findTerminalLinkCandidates('file://localhost/C:/work/hello%20world.txt C:\\work\\report.txt:18:4');

  assert.deepEqual(links.map(link => link.target), [
    { type: 'local-path', value: 'C:/work/hello world.txt' },
    { type: 'local-path', value: 'C:\\work\\report.txt' },
  ]);
  assert.deepEqual(links.map(link => link.text), [
    'file://localhost/C:/work/hello%20world.txt',
    'C:\\work\\report.txt',
  ]);
});


test('keeps balanced URL delimiters while trimming terminal punctuation', () => {
  const links = findTerminalLinkCandidates('Read https://example.test/Foo_(bar)).');

  assert.deepEqual(links.map(link => link.target), [
    { type: 'url', value: 'https://example.test/Foo_(bar)' },
  ]);
});

test('rejects unsupported and malformed file URL targets', () => {
  const links = findTerminalLinkCandidates('ftp://example.test file://server/share.txt file:///C:/work/file.txt?query=1');

  assert.deepEqual(links, []);
});

test('link provider only opens a link after Ctrl+click', async () => {
  const openedURLs: string[] = [];
  const notifications: string[] = [];
  const provider = createTerminalLinkProvider(terminalWithLine('https://example.test'), {
    openExternalURL: url => {
      openedURLs.push(url);
    },
    openLocalPath: () => {
      assert.fail('unexpected local path open');
    },
  }, message => {
    notifications.push(message);
  });

  let links: readonly ILink[] | undefined;
  provider.provideLinks(1, nextLinks => {
    links = nextLinks;
  });
  assert.equal(links?.length, 1);
  const link = links?.[0];
  assert.ok(link);

  link.activate({ ctrlKey: false } as MouseEvent, link.text);
  assert.deepEqual(openedURLs, []);
  assert.deepEqual(notifications, ['按住 Ctrl 并单击以打开链接']);

  link.activate({ ctrlKey: true } as MouseEvent, link.text);
  await Promise.resolve();
  assert.deepEqual(openedURLs, ['https://example.test/']);
  assert.equal(link.range.start.x, 1);
  assert.equal(link.range.end.x, 20);
});

test('link provider reports a synchronous opener failure', () => {
  const notifications: string[] = [];
  const provider = createTerminalLinkProvider(terminalWithLine('https://example.test'), {
    openExternalURL: () => {
      throw new Error('浏览器不可用');
    },
    openLocalPath: () => assert.fail('unexpected local path open'),
  }, message => {
    notifications.push(message);
  });

  let links: readonly ILink[] | undefined;
  provider.provideLinks(1, nextLinks => {
    links = nextLinks;
  });
  const link = links?.[0];
  assert.ok(link);

  link.activate({ ctrlKey: true } as MouseEvent, link.text);
  assert.deepEqual(notifications, ['浏览器不可用']);
});

test('link provider opens Windows paths with Ctrl+click and covers wide characters', async () => {
  const openedPaths: string[] = [];
  const text = 'C:\\目录\\报告.txt';
  const provider = createTerminalLinkProvider(terminalWithLine(text), {
    openExternalURL: () => assert.fail('unexpected URL open'),
    openLocalPath: path => {
      openedPaths.push(path);
    },
  }, () => {});

  let links: readonly ILink[] | undefined;
  provider.provideLinks(1, nextLinks => {
    links = nextLinks;
  });
  const link = links?.[0];
  assert.ok(link);

  link.activate({ ctrlKey: true } as MouseEvent, link.text);
  await Promise.resolve();
  assert.deepEqual(openedPaths, [text]);
  assert.equal(link.range.end.x, [...text].reduce((columns, character) => columns + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0));
});

function terminalWithLine(text: string) {
  const cells: Array<{ chars: string; width: number }> = [];
  for (const character of [...text]) {
    const width = /[^\u0000-\u00ff]/.test(character) ? 2 : 1;
    cells.push({ chars: character, width });
    if (width === 2) {
      cells.push({ chars: '', width: 0 });
    }
  }
  return {
    buffer: {
      active: {
        getLine: (index: number) => index === 0
          ? {
            length: cells.length,
            getCell: (column: number) => ({
              getChars: () => cells[column]?.chars ?? '',
              getWidth: () => cells[column]?.width ?? 1,
            }),
          }
          : undefined,
      },
    },
  } as never;
}
