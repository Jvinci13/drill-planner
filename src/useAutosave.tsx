import { useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'pending' | 'saved' | 'error';

/**
 * Debounced save of `value` whenever it differs from `baseline` (the object as
 * loaded). Pending saves are flushed on unmount and page unload so navigating
 * away never loses edits.
 */
export function useAutosave<T>(value: T | undefined, baseline: T | undefined, save: (v: T) => Promise<unknown>, delay = 500) {
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<T | null>(null);
  const timer = useRef<number>();
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = () => {
    window.clearTimeout(timer.current);
    const v = pending.current;
    pending.current = null;
    if (v === null) return;
    saveRef
      .current(v)
      .then(() => setState('saved'))
      .catch(() => setState('error'));
  };

  useEffect(() => {
    if (value === undefined || value === baseline) return;
    pending.current = value;
    setState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, baseline]);

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    window.clearTimeout(timer.current);
    pending.current = null;
  };

  return { state, cancel };
}

export function SaveBadge({ state }: { state: SaveState }) {
  const text = { idle: '', pending: 'Saving…', saved: 'Saved', error: 'Save failed' }[state];
  return text ? <span className={`save-badge ${state}`}>{text}</span> : null;
}
