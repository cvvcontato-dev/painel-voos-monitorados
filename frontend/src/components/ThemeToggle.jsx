import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';
  // Icon and tooltip describe the ACTION (target state), not current state.
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className="p-2.5 rounded-lg transition-colors cursor-pointer border
                 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200
                 dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white dark:border-slate-700/50"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
