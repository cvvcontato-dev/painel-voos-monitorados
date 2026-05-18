import { useState, useCallback, useEffect } from 'react';

function readInitialTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function persist(theme) {
  try {
    localStorage.setItem('theme', theme);
  } catch (e) {
    // Safari private mode: localStorage throws. Persistence is best-effort.
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      persist(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
