export type FileIconKind =
  | { kind: 'badge'; label: string; color: string; background: string }
  | { kind: 'git' | 'markdown' | 'image' | 'archive' | 'robot' | 'file'; color: string };

const badges: Record<string, [string, string, string]> = {
  ts: ['TS', '#fff', '#3178c6'], tsx: ['TS', '#fff', '#3178c6'],
  js: ['JS', '#252525', '#f7df1e'], jsx: ['JS', '#252525', '#f7df1e'], mjs: ['JS', '#252525', '#f7df1e'], cjs: ['JS', '#252525', '#f7df1e'],
  json: ['{}', '#fff', '#7bac3b'], jsonc: ['{}', '#fff', '#7bac3b'],
  go: ['GO', '#fff', '#00add8'], py: ['PY', '#fff', '#3776ab'],
  rs: ['RS', '#fff', '#a15a32'], java: ['J', '#fff', '#b07219'],
  html: ['<>', '#fff', '#e44d26'], css: ['#', '#fff', '#2776b8'], scss: ['S', '#fff', '#c6538c'],
  yaml: ['Y', '#fff', '#a44754'], yml: ['Y', '#fff', '#a44754'], toml: ['T', '#fff', '#9c4221'],
  sh: ['$', '#fff', '#529b46'], bash: ['$', '#fff', '#529b46'], ps1: ['PS', '#fff', '#3472a6'],
  vue: ['V', '#fff', '#42b883'], svelte: ['S', '#fff', '#ff3e00'],
};

export function fileIconKind(name: string): FileIconKind {
  const lower = name.toLowerCase();
  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') return { kind: 'git', color: '#f05032' };
  if (lower === 'agents.md') return { kind: 'robot', color: '#ec6a79' };
  if (lower === 'package.json' || lower === 'package-lock.json') return { kind: 'badge', label: 'JS', color: '#fff', background: '#76a642' };
  if (lower.startsWith('tsconfig') && lower.endsWith('.json')) return { kind: 'badge', label: 'TS', color: '#fff', background: '#3178c6' };
  if (lower.startsWith('eslint.config.')) return { kind: 'badge', label: 'ES', color: '#fff', background: '#5145a9' };
  const extension = lower.slice(lower.lastIndexOf('.') + 1);
  if (extension === 'md' || extension === 'mdx' || extension === 'markdown') return { kind: 'markdown', color: '#4297d5' };
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(extension)) return { kind: 'image', color: '#b77bd9' };
  if (['zip', 'tar', 'gz', '7z'].includes(extension)) return { kind: 'archive', color: '#c29b56' };
  const badge = badges[extension];
  if (badge) return { kind: 'badge', label: badge[0], color: badge[1], background: badge[2] };
  return { kind: 'file', color: '#8fa6bf' };
}

export function folderIconColor(name: string) {
  const lower = name.toLowerCase();
  if (lower === 'docs' || lower === 'doc') return '#4297d5';
  if (lower === 'node_modules') return '#83bd4a';
  if (lower === 'scripts') return '#8fa6bf';
  return '#c5a05b';
}
