import { createHash } from 'node:crypto';

export function ensureAiSettings(aiSettings) {
  if (!aiSettings?.apiKey?.trim()) throw new Error('请先在设置中填写 AI API 密钥');
  if (!aiSettings?.baseUrl?.trim()) throw new Error('请先在设置中填写 AI 基础 URL');
  if (!aiSettings?.model?.trim()) throw new Error('请先在设置中填写 AI 模型');
  if (!aiSettings?.promptTemplate?.trim()) throw new Error('请先在设置中填写 AI 提示词模板');
}

export function buildAiContext(repo, aiSettings, buildDiffLines) {
  const sourceFiles = repo.detail.files.filter(file => aiSettings.stagedOnly ? file.staged : true);
  if (sourceFiles.length === 0) {
    throw new Error(aiSettings.stagedOnly ? '当前没有已暂存变更，无法生成 AI 提交信息' : '当前没有可用于生成的变更');
  }

  const paths = [...new Set(sourceFiles.map(file => file.path))];
  const blocks = [];
  let totalChars = 0;

  for (const file of sourceFiles) {
    const diffLines = buildDiffLines(repo.path, file, file.staged).map(line => line.content);
    if (diffLines.length === 0) continue;

    const block = [`### [${file.staged ? 'STAGED' : 'UNSTAGED'}] ${file.path} (${file.status})`, ...diffLines].join('\n');
    if (totalChars + block.length > aiSettings.maxDiffChars) {
      const remaining = Math.max(aiSettings.maxDiffChars - totalChars, 0);
      if (remaining > 0) {
        blocks.push(`${block.slice(0, remaining)}\n...[已按设置截断]`);
      }
      break;
    }

    blocks.push(block);
    totalChars += block.length + 2;
  }

  const diff = blocks.join('\n\n').trim();
  if (!diff) throw new Error('没有可发送给 AI 的 Diff 内容');
  return { paths, diff };
}

export async function requestAiCompletion(aiSettings, prompt) {
  const response = await fetch(`${aiSettings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiSettings.apiKey}`,
    },
    body: JSON.stringify({
      model: aiSettings.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是 Git 提交信息生成器。请严格按照用户要求输出 JSON。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  const payload = await response.json().catch(async () => ({ error: { message: await response.text() } }));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'AI 服务调用失败');
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI 未返回提交候选');
  }
  return content;
}

export function parseAiCandidates(raw, styleHint) {
  const parsed = JSON.parse(extractJsonBlock(raw));
  if (!Array.isArray(parsed?.candidates) || parsed.candidates.length === 0) {
    throw new Error('AI 返回的候选为空');
  }
  return parsed.candidates.map((candidate, index) => normalizeAiCandidate(candidate, index, styleHint));
}

function extractJsonBlock(raw) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 返回内容不是合法 JSON');
  }
  return raw.slice(start, end + 1);
}

function normalizeAiCandidate(candidate, index, styleHint) {
  const style = styleHint || (typeof candidate?.style === 'string' && candidate.style.trim() ? candidate.style.trim() : `AI 候选 ${index + 1}`);
  const title = typeof candidate?.title === 'string' && candidate.title.trim() ? candidate.title.trim() : 'chore: 更新变更';
  const full = typeof candidate?.full === 'string' && candidate.full.trim() ? candidate.full.trim() : title;
  const body = typeof candidate?.body === 'string' && candidate.body.trim() ? candidate.body.trim() : '基于真实 Git Diff 生成';
  const icon = typeof candidate?.icon === 'string' && candidate.icon.trim() ? candidate.icon.trim() : '✨';
  const id = `ai-${createHash('sha1').update(`${style}-${title}-${full}-${index}`).digest('hex').slice(0, 8)}`;
  return { id, style, icon, title, body, full };
}
