'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseStudio, seedStudio, STORAGE_KEY, type Studio } from '@/lib/studio';

export function useStudio() {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const data = raw ? parseStudio(raw) : seedStudio();
        if (!raw) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setStudio(data);
        setError('');
      } catch (e) { setError(e instanceof Error ? e.message : 'This browser could not save your studio data.'); }
    }
    read();
    const sync = (event: StorageEvent) => { if (event.key === STORAGE_KEY) read(); };
    window.addEventListener('storage', sync);
    window.addEventListener('focus', read);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', read); };
  }, []);
  const mutate = useCallback((change: (current: Studio) => Studio) => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('Studio data is missing. Reload to reconnect before saving.');
    const current = parseStudio(raw);
    const next = change(current);
    next.revision = Math.max(next.revision, current.revision + 1);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error('Your browser could not save this change. Free some browser storage and try again.'); }
    setStudio(next);
    return next;
  }, []);
  return { studio, error, mutate };
}

export type MutateStudio = ReturnType<typeof useStudio>['mutate'];
