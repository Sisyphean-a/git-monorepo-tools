/**
 * Rule: 每个仓库同一时刻至多有一个可终止的运行中会话，登记随后必须清除。
 * Failure: 没有登记终止器时显式拒绝，避免界面把“没有命令在跑”当作终止成功。
 */
export function createCommandTerminators() {
  const terminators = new Map<string, () => Promise<void>>();

  return {
    register(repoId: string, terminate: () => Promise<void>) {
      terminators.set(repoId, terminate);
    },
    clear(repoId: string) {
      terminators.delete(repoId);
    },
    terminate(repoId: string) {
      const terminate = terminators.get(repoId);
      if (!terminate) {
        return Promise.reject(new Error('当前没有正在运行的命令'));
      }
      return terminate();
    },
  };
}

export type CommandTerminators = ReturnType<typeof createCommandTerminators>;
