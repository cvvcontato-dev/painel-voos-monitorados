import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, User } from 'lucide-react';
import api from '../hooks/useApi';
import UserModal from './UserModal';

const ROLE_BADGE = {
  admin: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20',
  user:  'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-700'
};

export default function UsersTab({ onToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function fetchUsers() {
    try {
      const res = await api.get('/api/users');
      setUsers(res.data);
    } catch {
      onToast('Erro ao carregar usuários', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/users/${deleteTarget.id}`, { data: { confirm_password: confirmPassword } });
      onToast('Usuário removido.', 'success');
      setDeleteTarget(null);
      setConfirmPassword('');
      fetchUsers();
    } catch (err) {
      const code = err.response?.data?.error;
      if (code === 'cannot_delete_self') onToast('Você não pode remover sua própria conta.', 'error');
      else if (code === 'cannot_delete_last_admin') onToast('Não é possível remover o último administrador.', 'error');
      else if (code === 'wrong_admin_password') onToast('Senha de confirmação incorreta.', 'error');
      else onToast('Erro ao remover usuário.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">Carregando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">{users.length} usuário(s) cadastrado(s)</p>
        <button
          onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo usuário
        </button>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-600/10 dark:bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                {u.role === 'admin' ? <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <User className="w-4 h-4 text-slate-500" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{u.nome}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2 py-0.5 rounded-full text-xs border ${ROLE_BADGE[u.role]}`}>
                {u.role === 'admin' ? 'Admin' : 'Usuário'}
              </span>
              <button onClick={() => { setEditTarget(u); setModalOpen(true); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setDeleteTarget(u)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="mt-4 p-4 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 space-y-3">
          <p className="text-sm text-red-700 dark:text-red-400">
            Remover <strong>{deleteTarget.nome}</strong>? Confirme com sua senha:
          </p>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Sua senha de admin"
            className="w-full px-3 py-2 rounded-lg border text-sm
                       bg-white border-slate-300 text-slate-900
                       dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100
                       focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-2">
            <button onClick={() => { setDeleteTarget(null); setConfirmPassword(''); }}
              className="flex-1 py-1.5 rounded-lg border text-sm font-medium
                         bg-white border-slate-300 text-slate-700 hover:bg-slate-50
                         dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={!confirmPassword || deleting}
              className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60
                         text-white text-sm font-medium transition-colors">
              {deleting ? 'Removendo…' : 'Confirmar remoção'}
            </button>
          </div>
        </div>
      )}

      <UserModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editTarget={editTarget}
        onSuccess={() => {
          setModalOpen(false);
          fetchUsers();
          onToast(editTarget ? 'Usuário atualizado.' : 'Usuário criado.', 'success');
        }}
        onToast={onToast}
      />
    </div>
  );
}
