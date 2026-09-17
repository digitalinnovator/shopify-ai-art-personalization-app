import { useEffect } from 'react';
import { useRevalidator } from 'react-router';

/**
 * Re-runs the current route's loaders every `intervalMs` while `active` is true, so screens that
 * show running jobs update on their own. Skips ticks while a revalidation is in flight or the tab
 * is hidden.
 */
export function useAutoRefresh(active: boolean, intervalMs = 4000): void {
  const revalidator = useRevalidator();
  useEffect(() => {
    if (!active) return;
    const handle = setInterval(() => {
      if (revalidator.state !== 'idle') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      void revalidator.revalidate();
    }, intervalMs);
    return () => clearInterval(handle);
  }, [active, intervalMs, revalidator]);
}
