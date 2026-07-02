export function shouldShowCleanIndicator(repo) {
    return (repo.status === 'clean'
        && repo.modified === 0
        && repo.ahead === 0
        && repo.behind === 0
        && repo.conflicts === 0);
}
