export interface FileSearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface FileSearchMatch {
  start: number;
  end: number;
}

export interface FileSearchResult {
  matches: FileSearchMatch[];
  error: string | null;
}

const wordCharacterPattern = /[\p{L}\p{N}_]/u;

export function findFileMatches(content: string, query: string, options: FileSearchOptions): FileSearchResult {
  if (!query) return { matches: [], error: null };

  let expression: RegExp;
  try {
    const source = options.useRegex ? query : escapeRegex(query);
    expression = new RegExp(source, `gu${options.caseSensitive ? '' : 'i'}${options.useRegex ? 'm' : ''}`);
  } catch {
    return { matches: [], error: '正则表达式无效' };
  }

  const matches: FileSearchMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = expression.exec(content)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!options.wholeWord || hasWholeWordBoundaries(content, start, end)) {
      matches.push({ start, end });
    }
    // Rule: 零宽正则同样是有效结果；手动前进一个 Unicode 字符以避免死循环。
    if (match[0].length === 0) expression.lastIndex = advanceStringIndex(content, expression.lastIndex);
  }

  return { matches, error: null };
}

function hasWholeWordBoundaries(content: string, start: number, end: number) {
  return !isWordCharacter(codePointBefore(content, start)) && !isWordCharacter(codePointAt(content, end));
}

function isWordCharacter(value: string) {
  return value !== '' && wordCharacterPattern.test(value);
}

function codePointBefore(content: string, index: number) {
  if (index <= 0) return '';
  const trailing = content.charCodeAt(index - 1);
  if (trailing >= 0xdc00 && trailing <= 0xdfff && index > 1) return content.slice(index - 2, index);
  return content[index - 1] ?? '';
}

function codePointAt(content: string, index: number) {
  if (index >= content.length) return '';
  const leading = content.charCodeAt(index);
  if (leading >= 0xd800 && leading <= 0xdbff) return content.slice(index, index + 2);
  return content[index] ?? '';
}

function advanceStringIndex(content: string, index: number) {
  if (index >= content.length) return index + 1;
  const leading = content.charCodeAt(index);
  if (leading < 0xd800 || leading > 0xdbff || index + 1 >= content.length) return index + 1;
  const trailing = content.charCodeAt(index + 1);
  return trailing >= 0xdc00 && trailing <= 0xdfff ? index + 2 : index + 1;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
