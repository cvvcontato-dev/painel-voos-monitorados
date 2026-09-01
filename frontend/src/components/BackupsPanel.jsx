import { useState, useEffect, useCallback } from 'react';
import { Database, Download, RefreshCw, ShieldAlert } from 'lucide-react';
import api from '../hooks/useApi';

const fmtBytes = b => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fmtData = iso => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo'
});

export default function BackupsPanel({ onToast }) {
  const [backups, setBackups] = useState([]);
  const [retencao, setRetencao] = useState(14);
  const [carregando, setCarregando] = useState(true);
  const [rodando, setRodando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/api/backups');
      setBackups(data.backups || []);
      setRetencao(data.retencao || 14);
    } catch (e) {
      onToast?.(`Erro ao listar backups: ${e.response?.data?.error || e.message}`, 'error');
    } finally { setCarregando(false); }
  }, [onToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const rodarAgora = async () => {
    setRodando(true);
    try {
      const { data } = await api.post('/api/backups/run');
      onToast?.(`Backup criado: ${data.arquivo} (${fmtBytes(data.bytes)})`, 'success');
      carregar();
    } catch (e) {
      onToast?.(`Falha no backup: ${e.response?.data?.error || e.message}`, 'error');
    } finally { setRodando(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4" /> Backups do banco
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cópia automática diária às 03:00, mantendo as {retencao} mais recentes.
          </p>
        </div>
        <button
          onClick={rodarAgora}
          disabled={rodando}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${rodando ? 'animate-spin' : ''}`} />
          {rodando ? 'Gerando...' : 'Fazer backup agora'}
        </button>
      </div>

      <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-800 dark:text-amber-300 rounded-lg p-3">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          As cópias ficam no mesmo volume do servidor. Elas protegem contra erro de operação
          e falha da aplicação, mas <strong>não</strong> contra a perda do volume — baixe uma
          cópia de tempos em tempos e guarde fora do servidor.
        </span>
      </div>

      {carregando ? (
        <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">Carregando…</div>
      ) : backups.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
          Nenhum backup ainda. O primeiro é gerado automaticamente após o próximo início do servidor.
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-hidden">
          {backups.map((b, i) => (
            <div key={b.arquivo}
                 className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-slate-200 dark:border-slate-700/50' : ''}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {fmtData(b.criado_em)}
                  {i === 0 && <span className="ml-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">mais recente</span>}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate">
                  {b.arquivo} · {fmtBytes(b.bytes)}
                </div>
              </div>
              <a
                href={`/api/backups/${b.arquivo}`}
                download
                className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors"
                title="Baixar esta cópia"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
