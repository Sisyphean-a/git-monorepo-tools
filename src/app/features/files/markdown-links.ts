export type MarkdownLinkClass = 'external' | 'repo' | 'ignored';

export type MarkdownLinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'repo-file'; path: string; fragment?: string }
  | { kind: 'ignored' };

const externalProtocols = new Set(['http', 'https', 'mailto']);

// Rule: 只有白名单协议可点击；javascript:、data: 等一律按不可用链接处理，且不写入渲染结果。
export function classifyMarkdownHref(href: string): MarkdownLinkClass {
  const raw = href.trim();
  if (!raw || raw === '#') return 'ignored';
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(raw)?.[1]?.toLowerCase();
  if (!scheme) return 'repo';
  return externalProtocols.has(scheme) ? 'external' : 'ignored';
}

// Flow: 相对路径以当前文件所在目录为基准解析，根路径以仓库根为基准，越出仓库或无法解析时返回 ignored。
export function resolveMarkdownLink(currentPath: string, href: string): MarkdownLinkTarget {
  const raw = href.trim();
  const hrefClass = classifyMarkdownHref(raw);
  if (hrefClass === 'external') return { kind: 'external', url: raw };
  if (hrefClass === 'ignored') return { kind: 'ignored' };

  const hashIndex = raw.indexOf('#');
  const pathPart = (hashIndex < 0 ? raw : raw.slice(0, hashIndex)).split('?')[0] ?? '';
  const fragment = hashIndex < 0 ? '' : decodePath(raw.slice(hashIndex + 1));
  if (!pathPart && !fragment) return { kind: 'ignored' };
  const decoded = decodePath(pathPart);
  const relative = !decoded ? currentPath : decoded.startsWith('/') ? decoded.slice(1) : `${dirnameOf(currentPath)}/${decoded}`;
  const normalized = normalizeRepoPath(relative);
  return normalized ? { kind: 'repo-file', path: normalized, ...(fragment ? { fragment } : {}) } : { kind: 'ignored' };
}

function normalizeRepoPath(candidate: string): string | null {
  const segments: string[] = [];
  for (const segment of candidate.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join('/') : null;
}

function dirnameOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
