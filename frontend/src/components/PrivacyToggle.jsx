import { Eye, EyeOff } from 'lucide-react';
import { usePrivacy } from '../hooks/usePrivacy';

export default function PrivacyToggle() {
  const { enabled, toggle } = usePrivacy();
  // Ícone e tooltip descrevem a AÇÃO (estado alvo), como no ThemeToggle.
  const label = enabled ? 'Mostrar dados dos clientes' : 'Ocultar dados dos clientes';
  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={enabled}
      className={`p-2.5 rounded-lg transition-colors cursor-pointer border ${
        enabled
          ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
          : `bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200
             dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white dark:border-slate-700/50`
      }`}
    >
      {enabled ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
    </button>
  );
}
