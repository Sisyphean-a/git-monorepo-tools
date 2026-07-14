export function mergeRepoSnapshotUpdate(snapshot, update) {
    const nextRepo = update.repo;
    const repoDetails = {
        ...snapshot.repoDetails,
        [nextRepo.id]: nextRepo,
    };
    const repos = replaceRepoInList(snapshot.repos, nextRepo);
    return {
        ...snapshot,
        scannedAt: update.scannedAt,
        repos,
        repoDetails,
        selectedRepoId: snapshot.selectedRepoId || nextRepo.id,
        commitCandidates: {
            ...snapshot.commitCandidates,
            [nextRepo.id]: update.commitCandidates,
        },
    };
}
export function replaceRepoInList(repos, nextRepo) {
    const pinnedRepoPath = repos[0]?.path ?? '';
    return repos
        .map(repo => (repo.id === nextRepo.id ? nextRepo : repo))
        .sort((left, right) => compareRepos(left, right, pinnedRepoPath));
}
export function compareRepos(left, right, pinnedRepoPath) {
    if (pinnedRepoPath) {
        if (left.path === pinnedRepoPath)
            return -1;
        if (right.path === pinnedRepoPath)
            return 1;
    }
    if (left.modified !== right.modified)
        return right.modified - left.modified;
    if (left.name !== right.name)
        return left.name.localeCompare(right.name);
    return left.path.localeCompare(right.path);
}
