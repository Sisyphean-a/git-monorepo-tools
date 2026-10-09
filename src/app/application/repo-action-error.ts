import type { Repo } from '../domain/types.js';

export interface RepoActionFailure {
  title: string;
  repoName: string;
  repoPath: string;
  kind: string;
  reason: string;
  suggestion: string;
  detail: string;
}

export function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error !== null && typeof error === 'object') {
    try {
      const record = error as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message.trim() && Object.keys(record).every(key => key === 'message')) {
        return record.message;
      }
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
      if (typeof record.message === 'string' && record.message.trim()) return record.message;
    } catch {
      // Failure: 非 JSON 错误仍保留可打印表示，不冒充已知原因。
      return String(error);
    }
  }
  return error == null || error === '' ? '后端未提供错误详情，请查看仓库日志或在终端重试以取得诊断信息。' : String(error);
}

const actionLabels: Record<string, string> = {
  'stage-all': '全部暂存', 'stage-file': '暂存文件',
  'unstage-all': '全部取消暂存', 'unstage-file': '取消暂存文件',
  generate: '生成提交信息', commit: '提交', pull: 'Pull（拉取）', push: 'Push（推送）',
  refresh: '刷新', 'discard-all': '放弃更改', 'terminate': '终止命令',
};

// Rule: 分类只解释已识别的证据；未知错误保留原文，不猜测原因，也不自动改变 Git 状态。
const failureRules: readonly [RegExp, string, string, string][] = [
  [/已重置已跟踪文件，但清理未跟踪文件失败/i, 'partial-discard', '已跟踪文件已经重置，但未跟踪文件未能全部清理。', '先核对变更列表与原始错误；已丢弃的已跟踪改动不会自动恢复。处理未跟踪文件的权限或占用问题后，由你决定是否继续清理。'],
  [/操作已完成，但刷新仓库状态失败/i, 'refresh-after-success', 'Git 操作已经完成，但无法取得操作后的仓库状态。', '先刷新并核对仓库状态，不要直接重复提交或放弃更改。'],
  [/扫描失败|读取未跟踪文件.*失败/i, 'scan', '仓库状态读取失败，无法安全判断是否可执行此操作。', '按原始错误排查文件权限、路径或 Git 环境，再点击刷新；不要跳过状态检查。'],
  [/本地改动|local changes.*overwritten|untracked working tree files.*overwritten|unstaged changes|uncommitted changes|index contains uncommitted changes/is, 'local-changes', '本地工作树或暂存区有未提交改动，拉取可能覆盖它们。', '检查变更列表，先提交或自行备份/暂存保存（stash）后再拉取。即使文本 diff 为空，换行符、文件模式或索引状态仍可能被 Git 判为修改；不会自动丢弃或 stash。'],
  [/冲突|CONFLICT|unmerged files|unresolved conflict|not possible because you have unmerged|MERGE_HEAD exists|rebase.*in progress/i, 'conflict', '仓库存在冲突或尚未结束的合并/变基。', '打开冲突工具或终端，检查 git status；解决冲突并完成原操作，或由你决定中止它，再重试。'],
  [/没有 upstream|no upstream|no tracking information|has no upstream branch|couldn't find remote ref/i, 'upstream', '当前分支没有可用的远端跟踪分支，或远端分支已不存在。', '检查分支与远端；在终端明确配置跟踪分支后刷新。不要盲目推送到不确定的远端分支。'],
  [/not possible to fast-forward|divergent branches|已分叉|已分歧|refusing to merge unrelated histories/i, 'diverged', '本地与远端历史不能按当前拉取策略直接合并。', '先查看历史确认两端提交；由你选择合适的 merge 或 rebase 策略。默认 ff-only 不会自动改写历史。'],
  [/non-fast-forward|\[rejected\]|fetch first/i, 'push-rejected', '远端拒绝推送，可能包含本地尚未整合的提交。', '查看原始拒绝原因，先刷新远端并检查历史；需要时整合远端提交后重试，不要直接强制推送。'],
  [/host key verification failed|remote host identification has changed/i, 'host-key', 'SSH 服务器身份验证未通过。', '先核实远端服务器指纹与地址，再处理 known_hosts；不要关闭身份校验。'],
  [/authentication failed|permission denied \(publickey|could not read username|terminal prompts disabled|invalid username or (?:password|token)|HTTP.*\b401\b|requested URL returned error:\s*401|access denied/i, 'authentication', '远端认证失败，凭据失效或当前账号没有访问权限。', '检查远端 URL、账号权限、访问令牌或 SSH 密钥，在系统凭据管理器/终端完成认证后重试。'],
  [/SSL certificate|certificate verify failed|server certificate verification failed/i, 'certificate', 'HTTPS 证书校验失败。', '检查系统时间、证书链和代理证书配置；不要关闭 SSL 校验。'],
  [/超时|timed? out|timeout/i, 'timeout', '操作超过配置的 Git 超时时间，或网络请求超时。', '检查网络、代理与远端可达性；确实需要更长时间时调整 Git 操作超时，再核对状态后重试。'],
  [/could not resolve host|could not resolve hostname|could not resolve proxy|failed to connect|connection (?:refused|reset|closed)|network is unreachable|unable to look up|proxy.*(?:failed|407)/i, 'network', '无法正常连接远端或代理。', '检查远端地址、DNS、网络与设置中的代理；在终端确认连接恢复后重试。'],
  [/\.lock.*(?:file exists|already exists)|another git process|cannot lock ref|unable to create.*\.lock/is, 'lock', 'Git 索引或引用被锁定，可能有其他 Git 进程正在操作。', '等待或检查其他 Git 进程；只有确认没有运行中的操作后，才人工处理遗留锁文件。'],
  [/author identity unknown|committer identity unknown|please tell me who you are|unable to auto-detect email/i, 'identity', 'Git 尚未配置提交作者身份。', '在仓库或全局配置 user.name 和 user.email 后重新提交。'],
  [/nothing to commit|no changes added to commit|没有已暂存变更|没有可用于生成的变更|没有可发送给 AI 的 Diff/i, 'nothing-to-commit', '没有可提交或可生成提交信息的内容。', '先刷新并检查暂存区，暂存真正的内容变更；仅换行规范化/索引状态异常可能没有文本 diff。'],
  [/ambiguous argument.*HEAD|invalid reference.*HEAD|does not have any commits|bad revision.*HEAD|unborn branch/i, 'no-head', '仓库尚无提交，或 HEAD 无法解析。', '新仓库请先暂存并完成首次提交；若已有历史，请在终端检查 HEAD 和引用，不要直接重置。'],
  [/not a git repository|未找到仓库|仓库路径与标识不匹配|dubious ownership/i, 'repository', '仓库路径、Git 元数据或所有权检查不通过。', '确认项目路径和 .git 是否有效；按原始错误核对所有权，重新扫描或刷新。'],
  [/exec:.*git.*(?:not found|cannot find)|git.*not recognized|找不到.*git/i, 'git-missing', '应用无法启动 Git。', '安装 Git 并确认 PATH 中可找到它，然后重启应用。'],
  [/GH\d+:|repository rule violations|protected branch|pre-receive hook declined|remote rejected|remote:.*(?:denied|forbidden)|HTTP.*\b403\b|requested URL returned error:\s*403/i, 'remote-policy', '远端权限、分支保护或仓库规则拒绝了操作。', '查看远端返回的具体规则；使用允许的分支或提交方式，必要时联系仓库管理员。'],
  [/repository not found|could not read from remote repository/i, 'remote-access', '远端仓库不可访问，可能是地址不存在或当前账号无权访问。', '确认远端 URL 与仓库是否存在，并检查账号或 SSH 密钥的仓库访问权限。'],
  [/requested URL returned error:\s*5\d\d|HTTP.*\b5\d\d\b/i, 'remote-server', '远端服务返回服务器错误。', '确认远端服务状态与代理响应；服务恢复后核对仓库状态再重试。'],
  [/hook.*(?:failed|declined)|(?:pre-commit|commit-msg).*failed|gpg failed|failed to sign/i, 'hook', '本地 Git 钩子检查或提交签名失败。', '按原始输出修复检查项或签名配置后重试；不要默认绕过检查。'],
  [/AI.*(?:密钥|基础 URL|模型)|AI 设置|API.*key.*missing/i, 'ai-config', '生成提交信息所需的 AI 配置不完整。', '在设置的 AI 提交页检查 API 密钥、基础 URL 和模型后重试。'],
  [/permission denied|access is denied|拒绝访问|no space left|read-only file system|unable to unlink|cannot stat|could not open|cannot open|缺少文件/i, 'filesystem', '本地文件操作失败，可能涉及权限、占用、路径或磁盘空间。', '检查原始错误对应的文件、访问权限、占用程序与磁盘空间；处理后刷新并重试。'],
  [/提交信息不能为空/i, 'commit-message', '提交信息为空。', '填写提交信息后重试。'],
  [/Wails 绑定|不支持 Wails/i, 'bridge', '桌面后端绑定不可用，操作未能正常交付。', '重启桌面应用；若仍发生，请重新构建匹配的前后端并保留原始错误。'],
];

export function describeRepoActionError(action: string, error: unknown, repo: Pick<Repo, 'name' | 'path'>): RepoActionFailure {
  const detail = readErrorMessage(error);
  const rule = failureRules.find(([pattern]) => pattern.test(detail));
  return {
    title: `${actionLabels[action] ?? action}失败`,
    repoName: repo.name,
    repoPath: repo.path,
    kind: rule?.[1] ?? 'unknown',
    reason: rule?.[2] ?? '未能自动判定失败原因，下面保留了后端返回的原始信息。',
    suggestion: rule?.[3] ?? '按原始错误检查仓库日志或在终端重试；反馈问题时附上操作名称、仓库路径和原始错误，不要尝试强制覆盖本地状态。',
    detail,
  };
}
