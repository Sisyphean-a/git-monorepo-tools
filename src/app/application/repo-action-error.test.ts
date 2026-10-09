import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRepoActionError, readErrorMessage } from './repo-action-error.js';

const repo = { name: 'own-wails', path: 'E:/github/own-wails' };

test('preserves Wails string, Error, object and unknown rejection details', () => {
  for (const error of ['真实原因\nfile.ts', Error('真实原因\nfile.ts'), { message: '真实原因\nfile.ts' }]) {
    assert.equal(readErrorMessage(error), '真实原因\nfile.ts');
  }
  assert.match(readErrorMessage({ code: 42, detail: 'new failure' }), /new failure/);
  assert.match(readErrorMessage(undefined), /未提供错误详情/);
});

test('every built-in action retains its identity, repository and raw error', () => {
  for (const action of ['stage-all', 'unstage-all', 'generate', 'commit', 'pull', 'push', 'refresh', 'discard-all']) {
    const error = describeRepoActionError(action, 'unknown server rejection\nfull details', repo);
    assert.ok(error.title.includes('失败'));
    assert.equal(error.repoName, repo.name);
    assert.equal(error.repoPath, repo.path);
    assert.equal(error.detail, 'unknown server rejection\nfull details');
    assert.ok(error.suggestion.length > 0);
    assert.equal(error.kind, 'unknown');
  }
});

test('known failures explain distinct causes instead of replacing Git output', () => {
  const cases = [
    ['当前仓库有本地改动，请先提交或处理后再拉取\nfile.ts', 'local-changes'],
    ['Your local changes to the following files would be overwritten by merge', 'local-changes'],
    ['The following untracked working tree files would be overwritten by merge', 'local-changes'],
    ['当前仓库存在冲突，不能执行 pull', 'conflict'],
    ['CONFLICT (content): Merge conflict in file.ts', 'conflict'],
    ['当前仓库扫描失败：permission denied', 'scan'],
    ['There is no tracking information for the current branch.', 'upstream'],
    ['fatal: Not possible to fast-forward, aborting.', 'diverged'],
    ['! [rejected] master -> master (fetch first)', 'push-rejected'],
    ['fatal: Authentication failed', 'authentication'],
    ['Permission denied (publickey).', 'authentication'],
    ['Host key verification failed.', 'host-key'],
    ['fatal: unable to access: Could not resolve host: github.com', 'network'],
    ['fatal: SSL certificate problem: self-signed certificate', 'certificate'],
    ['git pull --ff-only 超时（1m0s）', 'timeout'],
    ['fatal: Unable to create index.lock: File exists.', 'lock'],
    ['Author identity unknown', 'identity'],
    ['nothing to commit, working tree clean', 'nothing-to-commit'],
    ['当前分支没有提交，fatal: ambiguous argument HEAD', 'no-head'],
    ['fatal: not a git repository', 'repository'],
    ['exec: "git": executable file not found in %PATH%', 'git-missing'],
    ['fatal: unable to unlink old file: Permission denied', 'filesystem'],
    ['remote: error: GH013: Repository rule violations found', 'remote-policy'],
    ['pre-commit hook failed', 'hook'],
    ['请先在设置中填写 AI API 密钥', 'ai-config'],
    ['操作已完成，但刷新仓库状态失败：permission denied', 'refresh-after-success'],
    ['已重置已跟踪文件，但清理未跟踪文件失败：Permission denied', 'partial-discard'],
    ['remote: error: GH013: Repository rule violations found\nerror: failed to push some refs', 'remote-policy'],
    ['fatal: unable to access: The requested URL returned error: 403', 'remote-policy'],
    ['fatal: unable to access: The requested URL returned error: 401', 'authentication'],
    ['fatal: unable to access: The requested URL returned error: 503', 'remote-server'],
    ['remote: Repository not found.\nfatal: Could not read from remote repository.', 'remote-access'],
    ['pre-commit hook failed\nerror: failed to push some refs', 'hook'],
  ];
  for (const [detail, kind] of cases) {
    const error = describeRepoActionError('pull', detail, repo);
    assert.equal(error.kind, kind, detail);
    assert.equal(error.detail, detail);
    assert.ok(error.reason && error.suggestion);
  }
});
