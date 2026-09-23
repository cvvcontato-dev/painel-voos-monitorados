import { FolderOpen, Trash2 } from 'lucide-react';
import { sectionCls, btnGhost } from './formState';

const STATUS = {
  not_sent: 'E-mail não enviado',
  sent: 'E-mail enviado',
  partial: 'E-mail parcial',
  failed: 'E-mail falhou'
};

// SQLite grava datetime('now') em UTC, sem fuso: "YYYY-MM-DD HH:MM:SS".
function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

export default function HistoryList({ items, activeId, onOpen, onDelete }) {
  if (!items.length) return null;
  return (
    <div className={sectionCls}>
      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Histórico</div>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700/60">
        {items.map(it => (
          <li key={it.id}
            className={`py-3 px-2 -mx-2 rounded-lg flex items-start justify-between gap-3 ${
              it.id === activeId ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''
            }`}>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{it.title}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {fmtDateTime(it.createdAt)} · {STATUS[it.emailStatus] || ''}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {it.passengers.map((p, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                    p.opened
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    <span className="pii">{p.name}</span> · {p.opened ? 'abriu ✓' : 'ainda não abriu'}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button type="button" className={btnGhost} onClick={() => onOpen(it.id)} title="Abrir">
                <FolderOpen className="w-3.5 h-3.5" /> Abrir
              </button>
              <button type="button" className={btnGhost} onClick={() => onDelete(it.id)} title="Apagar">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
