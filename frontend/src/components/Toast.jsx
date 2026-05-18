import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: 'bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300',
    error:   'bg-red-100 border-red-200 text-red-700 dark:bg-red-500/20 dark:border-red-500/40 dark:text-red-300',
    warning: 'bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-300',
    info:    'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
  };

  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl border backdrop-blur-xl shadow-2xl ${colors[type]} modal-animate`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="hover:opacity-70 cursor-pointer"><X className="w-4 h-4" /></button>
    </div>
  );
}
