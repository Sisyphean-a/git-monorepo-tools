export function collectEmptyTerminalClosures(
  openedRepoIds: readonly string[],
  activeRepoId: string,
  visible: boolean,
  contentfulRepoIds: ReadonlySet<string>,
  closingRepoIds: ReadonlySet<string>,
): ReadonlySet<string> {
  let next: Set<string> | undefined;
  for (const repoId of openedRepoIds) {
    if ((!visible || repoId !== activeRepoId) && !contentfulRepoIds.has(repoId) && !closingRepoIds.has(repoId)) {
      (next ??= new Set(closingRepoIds)).add(repoId);
    }
  }
  return next ?? closingRepoIds;
}

export function retainExistingRepoIds<T>(
  current: string[],
  repoDetails: Readonly<Record<string, T>>,
): string[] {
  const next = current.filter(repoId => Boolean(repoDetails[repoId]));
  return next.length === current.length ? current : next;
}

export function retainExistingRepoIdSet<T>(
  current: ReadonlySet<string>,
  repoDetails: Readonly<Record<string, T>>,
): ReadonlySet<string> {
  for (const repoId of current) {
    if (!repoDetails[repoId]) {
      return new Set([...current].filter(id => Boolean(repoDetails[id])));
    }
  }
  return current;
}
