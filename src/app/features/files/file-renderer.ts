import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import { languageForPath } from './file-preview-kind.js';
import { escapeHtml, renderMarkdown } from './markdown.js';
import './file-preview.css';

export interface FilePreviewRenderInput {
  path: string;
  content: string;
  kind: 'markdown' | 'code';
}

/** 懒加载渲染器的公开面：组件通过动态 import 取得后调用。 */
export interface FilePreviewRenderer {
  renderFilePreviewHtml(input: FilePreviewRenderInput): string;
}

// Guarantee: 只有净化后的 Markdown HTML 与 highlight.js 生成的标签会进入 DOM。
export function renderFilePreviewHtml(input: FilePreviewRenderInput): string {
  if (input.kind === 'markdown') {
    const html = renderMarkdown(input.content, { highlight: highlightCode });
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }
  return highlightCode(input.content, languageForPath(input.path));
}

function highlightCode(code: string, language: string | null): string {
  const registered = resolveLanguage(language);
  if (!registered) return escapeHtml(code);
  // Failure 容忍：仓库里可能存在语法不完整的片段，忽略非法标记而不是抛出异常。
  return hljs.highlight(code, { language: registered, ignoreIllegals: true }).value;
}

function resolveLanguage(name: string | null): string | null {
  if (!name) return null;
  if (hljs.getLanguage(name)) return name;
  // 代码块常用别名（ts、yml）复用扩展名映射，避免再维护一张别名表。
  return languageForPath(`file.${name}`);
}
