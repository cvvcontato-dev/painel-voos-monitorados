import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../hooks/useApi';

export default function UserModal({ isOpen, onClose, editTarget, onSuccess, onToast }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (editTarget) {
      setNome(editTarget.nome);
      setEmail(editTarget.email);
      setRole(editTarget.role);
    } else {
      setNome(''); setEmail(''); setPassword(''); setRole('user');
    }
    setConfirmPassword(''); setError(null);
  }, [editTarget, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (editTarget) {
        await api.put(`/api/users/${editTarget.id}`, { nome, role, confirm_password: confirmPassword });
      } else {
        await api.post('/api/users', { nome, email, password, role, confirm_password: confirmPassword });
      }
      onSuccess();
    } catch (err) {
      const code = err.response?.data?.error;
      if (code === 'wrong_admin_password') setError('Senha de confirmação incorreta.');
      else if (code === 'email_already_exists') setError('Este e-mail já está cadastrado.');
      else if (code === 'password_too_short') setError('Senha deve ter pelo menos 8 caracteres.');
      else setError('Erro ao salvar usuário. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm bg-white border-slate-300 text-slate-900 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {editTarget ? 'Editar usuário' : 'Novo usuário'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Nome</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} required className={inputCls} />
          </div>

          {!editTarget && (
            <div>
              <label className={labelCls}>E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={inputCls} />
            </div>
          )}

          {!editTarget && (
            <div>
              <label className={labelCls}>Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className={inputCls} placeholder="Mín. 8 caracteres" />
            </div>
          )}

          <div>
            <label className={labelCls}>Papel</label>
            <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Sua senha (confirmação)</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className={inputCls} placeholder="Confirme com sua senha de admin" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border text-sm font-medium bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium transition-colors">
              {loading ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
