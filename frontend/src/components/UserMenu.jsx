import { useState, useRef, useEffect } from 'react';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';
import { logout } from '../api/authClient';

function initials(nome) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export default function UserMenu({ user, onToast }) {
  const [open, setOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      window.location.reload();
    }
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
                     bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200
                     dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700/50"
        >
          <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
            {initials(user.nome)}
          </div>
          <span className="text-sm font-medium hidden sm:block">{user.nome.split(' ')[0]}</span>
          <ChevronDown className="w-4 h-4 opacity-60" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border shadow-lg z-50
                          bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.nome}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
            </div>
            <div className="p-1">
              <button
                onClick={() => { setOpen(false); setChangePasswordOpen(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-slate-700 dark:text-slate-300
                           hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <KeyRound className="w-4 h-4" />
                Trocar senha
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-red-600 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        )}
      </div>

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onToast={onToast}
      />
    </>
  );
}
