const WAILS_REPO_ACTIONS = new Set([
    'stage-all',
    'unstage-all',
    'stage-file',
    'unstage-file',
    'commit',
    'pull',
    'push',
]);
function buildSnapshotRequest(settings) {
    return {
        scanRoots: settings?.scanRoots ?? [],
        concurrency: settings?.gitBehavior.concurrency ?? 5,
        pullStrategy: settings?.gitBehavior.pullStrategy ?? 'ff-only',
        pushStrategy: settings?.gitBehavior.pushStrategy ?? 'upstream-only',
    };
}
function getWailsBindings() {
    if (typeof window === 'undefined') {
        throw new Error('当前环境不支持 Wails 绑定');
    }
    const binding = window.go?.main?.App;
    if (!binding) {
        throw new Error('Wails 绑定不可用');
    }
    if (typeof binding.GetSnapshot !== 'function'
        || typeof binding.MutateRepo !== 'function'
        || typeof binding.RunBatch !== 'function'
        || typeof binding.GetRepoLog !== 'function'
        || typeof binding.GenerateCommitMessage !== 'function'
        || typeof binding.OpenFolder !== 'function'
        || typeof binding.OpenTerminal !== 'function'
        || typeof binding.OpenConflicts !== 'function'
        || typeof binding.PickFolder !== 'function') {
        throw new Error('Wails 绑定不完整');
    }
    return binding;
}
export async function fetchSnapshot(settings) {
    return getWailsBindings().GetSnapshot(buildSnapshotRequest(settings));
}
export async function mutateRepo(repoId, action, settings, body) {
    const binding = getWailsBindings();
    if (!WAILS_REPO_ACTIONS.has(action)) {
        throw new Error(`未迁移的仓库动作：${action}`);
    }
    return binding.MutateRepo(repoId, action, buildSnapshotRequest(settings), (body ?? {}));
}
export async function runBatch(operation, settings) {
    return getWailsBindings().RunBatch(operation, buildSnapshotRequest(settings));
}
export async function fetchRepoLog(repoId, settings) {
    return getWailsBindings().GetRepoLog(repoId, buildSnapshotRequest(settings));
}
export async function invokeLocalRepoAction(action, path) {
    const binding = getWailsBindings();
    if (action === 'open-folder') {
        return binding.OpenFolder(path);
    }
    if (action === 'open-terminal') {
        return binding.OpenTerminal(path);
    }
    return binding.OpenConflicts(path);
}
export async function generateCommitMessage(repoId, settings) {
    return getWailsBindings().GenerateCommitMessage(repoId, buildSnapshotRequest(settings), settings.aiCommit);
}
export async function pickFolder() {
    const path = await getWailsBindings().PickFolder();
    return path || null;
}
