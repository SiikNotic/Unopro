import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the OS asks for reduced motion or the player turned animations off in Settings. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'off') return true;
  return !!window.matchMedia?.(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    const update = () => setReduced(prefersReducedMotion());
    media?.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => {
      media?.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  return reduced;
}
