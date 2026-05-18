import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { changePassword, logout } from '../api/authClient';

function PasswordField({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 rounded-lg border text-sm
                     bg-white border-slate-300 text-slate-900 placeholder-slate-400
                     dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-400
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordModal({ isOpen, onClose, onToast }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  function reset() { setCurrent(''); setNext(''); setConfirm(''); setError(null); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (next !== confirm) { setError('As senhas novas não coincidem.'); return; }
    if (next.length < 8) { setError('A nova senha deve ter pelo menos 8 caracteres.'); return; }
    setLoading(true);
    setError(null);
    try {
      await changePassword({ current_password: current, new_password: next });
      onToast('Senha alterada. Faça login novamente.', 'success');
      reset();
      onClose();
      await logout().catch(() => {});
      window.location.reload();
    } catch (err) {
      const code = err.response?.data?.error;
      if (code === 'wrong_current_password') setError('Senha atual incorreta.');
      else if (code === 'password_too_short') setError('Nova senha muito curta (mín. 8 caracteres).');
      else setError('Erro ao alterar senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Trocar senha</h2>
          <button onClick={() => { reset(); onClose(); }} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField label="Senha atual" value={current} onChange={setCurrent} placeholder="••••••••" />
          <PasswordField label="Nova senha" value={next} onChange={setNext} placeholder="Mín. 8 caracteres" />
          <PasswordField label="Confirmar nova senha" value={confirm} onChange={setConfirm} placeholder="••••••••" />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => { reset(); onClose(); }}
              className="flex-1 py-2 rounded-lg border text-sm font-medium
                         bg-white border-slate-300 text-slate-700 hover:bg-slate-50
                         dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60
                         text-white text-sm font-medium transition-colors">
              {loading ? 'Salvando…' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
