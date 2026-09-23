import { Marked, type RendererObject, type Tokens } from 'marked';
import { classifyMarkdownHref } from './markdown-links.js';

export interface MarkdownRenderOptions {
  /** 代码块高亮器；返回 null 时按纯文本输出。 */
  highlight?: (code: string, language: string | null) => string | null;
}

// Guarantee: 渲染结果只由本模块产出的标签构成，仓库内容里的 HTML 与不安全协议不会进入输出。
export function renderMarkdown(content: string, options: MarkdownRenderOptions = {}): string {
  const headingCounts = new Map<string, number>();
  const renderer: RendererObject = {
    heading({ text, depth, tokens }) {
      const label = this.parser.parseInline(tokens);
      const slug = text.toLowerCase().trim().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
      const count = headingCounts.get(slug) ?? 0;
      headingCounts.set(slug, count + 1);
      const id = count ? `${slug}-${count}` : slug;
      return `<h${depth} id="${escapeHtml(id)}">${label}</h${depth}>`;
    },
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (classifyMarkdownHref(href) === 'ignored') return label;
      // Rule: 仓库内链接不带可用 href，点击后由组件按当前文件路径重新解析，避免渲染层猜测仓库上下文。
      const resolved = classifyMarkdownHref(href) === 'external' ? href : '#';
      return `<a href="${escapeHtml(resolved)}" data-md-href="${escapeHtml(href)}"${titleAttribute(title)} rel="noreferrer noopener">${label}</a>`;
    },
    image({ href, text }) {
      if (classifyMarkdownHref(href) === 'external') {
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}" loading="lazy">`;
      }
      return `<span class="file-preview-image-note" title="仓库内图片暂不预览">${escapeHtml(text)}</span>`;
    },
    code({ text, lang }) {
      const language = normalizeFenceLanguage(lang);
      const source = text.replace(/\n$/, '');
      const highlighted = options.highlight?.(source, language) ?? escapeHtml(source);
      return `<pre class="file-preview-code-block"><code class="hljs${language ? ` language-${escapeHtml(language)}` : ''}">${highlighted}</code></pre>\n`;
    },
  };

  const instance = new Marked<string, string>({ gfm: true, breaks: false });
  instance.use({ renderer });
  return instance.parse(content, { async: false });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleAttribute(title: string | null | undefined): string {
  return title ? ` title="${escapeHtml(title)}"` : '';
}

/** 代码块 info string 只取第一段，例如 "ts title=app.ts" 取 "ts"。 */
function normalizeFenceLanguage(lang: string | undefined): string | null {
  const name = lang?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return name && name !== 'plaintext' ? name : null;
}
