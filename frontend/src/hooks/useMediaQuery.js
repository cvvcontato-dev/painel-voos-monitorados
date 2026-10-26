import { useEffect, useState } from 'react';

/** true enquanto a media query casa; reage a mudanças (girar a tela, redimensionar). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Celular = abaixo do breakpoint `md` do Tailwind (768 px). */
export function useIsMobile() {
  return !useMediaQuery('(min-width: 768px)');
}
