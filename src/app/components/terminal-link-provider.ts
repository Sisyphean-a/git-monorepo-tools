import type { IBufferLine, ILink, ILinkProvider, Terminal } from '@xterm/xterm';

export type TerminalLinkTarget =
  | { type: 'url'; value: string }
  | { type: 'local-path'; value: string };

type TerminalLinkCandidate = {
  start: number;
  end: number;
  text: string;
  target: TerminalLinkTarget;
};

export interface TerminalLinkOpener {
  openExternalURL(url: string): void | Promise<void>;
  openLocalPath(path: string): void | Promise<void>;
}

const urlPattern = /https?:\/\/[^\s<>"'`]+/gi;
const fileURLPattern = /file:\/\/(?:localhost)?\/[^\s<>"'`]+/gi;
const windowsPathPattern = /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s\\/:*?"<>|]*(?:[\\/][^\s\\/:*?"<>|]*)*/g;
const trailingPunctuationPattern = /[),.;:!?\]}]+$/;

export function findTerminalLinkCandidates(text: string): readonly TerminalLinkCandidate[] {
  const candidates = [
    ...findPatternMatches(text, urlPattern, targetFromURL),
    ...findPatternMatches(text, fileURLPattern, targetFromFileURL),
    ...findPatternMatches(text, windowsPathPattern, targetFromWindowsPath),
  ].sort((left, right) => left.start - right.start || right.end - left.end);

  const links: TerminalLinkCandidate[] = [];
  for (const candidate of candidates) {
    if (links.some(link => candidate.start < link.end && link.start < candidate.end)) {
      continue;
    }
    links.push(candidate);
  }
  return links;
}

function findPatternMatches(
  text: string,
  pattern: RegExp,
  targetFromText: (value: string) => TerminalLinkTarget | null,
): TerminalLinkCandidate[] {
  const matches: TerminalLinkCandidate[] = [];
  for (const match of text.matchAll(pattern)) {
    const original = match[0];
    const linkText = trimTerminalPunctuation(original);
    const target = targetFromText(linkText);
    if (
      !target
      || linkText.length === 0
      || match.index === undefined
      || (target.type === 'local-path' && isEmbeddedInFileURL(text, match.index))
    ) {
      continue;
    }
    matches.push({
      start: match.index,
      end: match.index + linkText.length,
      text: linkText,
      target,
    });
  }
  return matches;
}

function trimTerminalPunctuation(value: string) {
  let trimmed = value;
  while (trailingPunctuationPattern.test(trimmed)) {
    const character = trimmed.at(-1);
    if (!character || hasMatchingOpeningDelimiter(trimmed.slice(0, -1), character)) {
      break;
    }
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function hasMatchingOpeningDelimiter(value: string, closingDelimiter: string) {
  const openingDelimiter = closingDelimiter === ')' ? '('
    : closingDelimiter === ']' ? '['
      : closingDelimiter === '}' ? '{'
        : null;
  if (!openingDelimiter) return false;
  return [...value].filter(character => character === openingDelimiter).length
    > [...value].filter(character => character === closingDelimiter).length;
}

function isEmbeddedInFileURL(text: string, start: number) {
  return /file:\/\/(?:localhost)?\/$/i.test(text.slice(Math.max(0, start - 24), start));
}

function targetFromURL(value: string): TerminalLinkTarget | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return { type: 'url', value: url.toString() };
  } catch {
    return null;
  }
}

function targetFromFileURL(value: string): TerminalLinkTarget | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'file:'
      || (url.hostname !== '' && url.hostname !== 'localhost')
      || url.username !== ''
      || url.password !== ''
      || url.port !== ''
      || url.search !== ''
      || url.hash !== ''
    ) {
      return null;
    }
    const path = decodeURIComponent(url.pathname);
    const windowsPath = /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
    return /^[A-Za-z]:\//.test(windowsPath)
      ? { type: 'local-path', value: windowsPath }
      : null;
  } catch {
    return null;
  }
}

function targetFromWindowsPath(value: string): TerminalLinkTarget | null {
  return /^[A-Za-z]:[\\/]/.test(value) ? { type: 'local-path', value } : null;
}

export function createTerminalLinkProvider(
  terminal: Terminal,
  opener: TerminalLinkOpener,
  notify: (message: string) => void,
): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const bufferLine = terminal.buffer.active.getLine(bufferLineNumber - 1);
      if (!bufferLine) {
        callback(undefined);
        return;
      }
      const line = readBufferLine(bufferLine);
      const links = findTerminalLinkCandidates(line.text)
        .map(candidate => toTerminalLink(candidate, bufferLineNumber, line.columns, opener, notify));
      callback(links.length > 0 ? links : undefined);
    },
  };
}

type BufferLineText = {
  text: string;
  columns: readonly number[];
};

function readBufferLine(line: IBufferLine): BufferLineText {
  let text = '';
  const columns: number[] = [];
  for (let column = 0; column < line.length; column += 1) {
    const cell = line.getCell(column);
    if (!cell) continue;
    const chars = cell.getChars();
    const width = cell.getWidth();
    if (chars) {
      for (let index = 0; index < chars.length; index += 1) {
        columns[text.length + index] = column;
      }
      text += chars;
      columns[text.length] = column + Math.max(width, 1);
    }
  }

  const trimmedText = text.trimEnd();
  return {
    text: trimmedText,
    columns: columns.slice(0, trimmedText.length + 1),
  };
}

function toTerminalLink(
  candidate: TerminalLinkCandidate,
  bufferLineNumber: number,
  columns: readonly number[],
  opener: TerminalLinkOpener,
  notify: (message: string) => void,
): ILink {
  return {
    text: candidate.text,
    range: {
      start: { x: (columns[candidate.start] ?? candidate.start) + 1, y: bufferLineNumber },
      end: { x: columns[candidate.end] ?? candidate.end, y: bufferLineNumber },
    },
    decorations: {
      pointerCursor: true,
      underline: true,
    },
    activate: event => {
      if (!event.ctrlKey) {
        notify('按住 Ctrl 并单击以打开链接');
        return;
      }
      try {
        const opening = candidate.target.type === 'url'
          ? opener.openExternalURL(candidate.target.value)
          : opener.openLocalPath(candidate.target.value);
        void Promise.resolve(opening).catch(error => {
          notify(error instanceof Error ? error.message : '打开链接失败');
        });
      } catch (error) {
        notify(error instanceof Error ? error.message : '打开链接失败');
      }
    },
  };
}
