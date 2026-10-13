import { useEffect, useState } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'drill'; id: string }
  | { name: 'sessions' }
  | { name: 'session'; id: string };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'drill' && parts[1]) return { name: 'drill', id: parts[1] };
  if (parts[0] === 'session' && parts[1]) return { name: 'session', id: parts[1] };
  if (parts[0] === 'sessions') return { name: 'sessions' };
  return { name: 'library' };
}

/** Current route plus a counter that changes on every navigation (used as a remount key). */
export function useRoute() {
  const [state, setState] = useState(() => ({ route: parse(location.hash), nav: 0 }));
  useEffect(() => {
    const on = () => setState((s) => ({ route: parse(location.hash), nav: s.nav + 1 }));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return state;
}

export function go(path: string) {
  location.hash = path;
}

/** Swap the current URL without adding a history entry or remounting (e.g. new → saved id). */
export function replace(path: string) {
  history.replaceState(null, '', `#${path}`);
}
