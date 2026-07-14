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
    return repos.map(repo => (repo.id === nextRepo.id ? nextRepo : repo));
}
