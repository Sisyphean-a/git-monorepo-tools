export type PreviewKind = 'markdown' | 'code' | 'text';

/** 超过该大小不再高亮或渲染 Markdown：高亮 1 MiB 代码会产出 6 MB 以上的 HTML 与十几万个节点。 */
export const maxPreviewRenderBytes = 256 * 1024;

// Rule: 只使用 highlight.js common 已注册的语言 id；未识别的扩展名按纯文本展示，不做猜测式高亮。
export const languageByExtension: Readonly<Record<string, string>> = {
  bash: 'bash',
  sh: 'bash',
  zsh: 'bash',
  shell: 'shell',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  css: 'css',
  diff: 'diff',
  patch: 'diff',
  go: 'go',
  graphql: 'graphql',
  gql: 'graphql',
  ini: 'ini',
  conf: 'ini',
  cfg: 'ini',
  toml: 'ini',
  properties: 'ini',
  java: 'java',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  kt: 'kotlin',
  kts: 'kotlin',
  less: 'less',
  lua: 'lua',
  m: 'objectivec',
  mm: 'objectivec',
  pl: 'perl',
  pm: 'perl',
  php: 'php',
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  r: 'r',
  rb: 'ruby',
  rake: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sql: 'sql',
  swift: 'swift',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  vb: 'vbnet',
  wat: 'wasm',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  xsl: 'xml',
  plist: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
};

const markdownExtensions = new Set(['md', 'markdown', 'mdx']);
const namedLanguages = new Map([
  ['makefile', 'makefile'],
  ['gnumakefile', 'makefile'],
]);

export function isMarkdownPath(filePath: string): boolean {
  return markdownExtensions.has(extensionOf(filePath));
}

export function languageForPath(filePath: string): string | null {
  const name = fileNameOf(filePath).toLowerCase();
  const named = namedLanguages.get(name);
  if (named) return named;
  const extension = extensionOf(filePath);
  if (markdownExtensions.has(extension)) return 'markdown';
  return languageByExtension[extension] ?? null;
}

export function detectPreviewKind(filePath: string): PreviewKind {
  if (isMarkdownPath(filePath)) return 'markdown';
  return languageForPath(filePath) ? 'code' : 'text';
}

function fileNameOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

function extensionOf(filePath: string): string {
  const name = fileNameOf(filePath);
  const index = name.lastIndexOf('.');
  // 隐藏文件（.gitignore）与无扩展名文件都没有可映射的语言。
  if (index <= 0) return '';
  return name.slice(index + 1).toLowerCase();
}
