import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function checkFormatting(root) {
  const files = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(file => file && existsSync(resolve(root, file))))].sort();
  const issues = [];
  for (const file of files) {
    // Rule: Wails 绑定保持生成器原样；Markdown 的行尾空格可能表示硬换行，不套用源码空白规则。
    if (file.startsWith('frontend/wailsjs/') || !/\.(go|tsx?|[cm]?js|json|css|html|ya?ml)$/.test(file)) continue;
    const lines = readFileSync(resolve(root, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/[\t ]+$/.test(line)) issues.push(`${file}:${index + 1}: 行尾空白`);
    });
    if (lines.length > 2 && lines.at(-1) === '' && lines.at(-2) === '') issues.push(`${file}: 文件末尾多余空行`);
  }
  const goFiles = files.filter(file => file.endsWith('.go'));
  if (goFiles.length) {
    const unformatted = execFileSync('gofmt', ['-l', ...goFiles], { cwd: root, encoding: 'utf8' }).trim();
    if (unformatted) issues.push(...unformatted.split(/\r?\n/).map(file => `${file}: 需要 gofmt`));
  }
  return issues;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const issues = checkFormatting(fileURLToPath(new URL('../', import.meta.url)));
  if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('源码格式检查通过');
  }
}
