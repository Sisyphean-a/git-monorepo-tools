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
