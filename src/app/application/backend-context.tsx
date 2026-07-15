import { createContext, useContext, type ReactNode } from 'react';
import type { AppBackend } from './ports';

const BackendContext = createContext<AppBackend | null>(null);

export function BackendProvider({ backend, children }: { backend: AppBackend; children: ReactNode }) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

export function useAppBackend() {
  const backend = useContext(BackendContext);
  if (!backend) {
    throw new Error('应用后端尚未注入');
  }
  return backend;
}
