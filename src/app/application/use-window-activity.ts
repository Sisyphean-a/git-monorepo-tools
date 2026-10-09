import { useEffect, useState } from 'react';

type ActivityEnvironment = {
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document: Pick<Document, 'visibilityState' | 'hasFocus' | 'addEventListener' | 'removeEventListener'>;
};

export function readWindowActivity(environment: ActivityEnvironment) {
  return environment.document.visibilityState === 'visible' && environment.document.hasFocus();
}

export function observeWindowActivity(environment: ActivityEnvironment, notify: (active: boolean) => void) {
  const update = () => notify(readWindowActivity(environment));
  const blur = () => notify(false);
  environment.window.addEventListener('focus', update);
  environment.window.addEventListener('blur', blur);
  environment.document.addEventListener('visibilitychange', update);
  update();
  return () => {
    environment.window.removeEventListener('focus', update);
    environment.window.removeEventListener('blur', blur);
    environment.document.removeEventListener('visibilitychange', update);
  };
}

export function useWindowActivity() {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && readWindowActivity({ window, document }));
  useEffect(() => observeWindowActivity({ window, document }, setActive), []);
  return active;
}
