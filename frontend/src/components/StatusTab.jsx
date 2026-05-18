import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plane, Plus, Edit2, Trash2, RefreshCw, Pause, Play, Clock, Activity, AlertTriangle, History } from 'lucide-react';
import StatusModal from './StatusModal';
import StatusHistoryDrawer from './StatusHistoryDrawer';

const API_URL = '/api/monitored-flights';

const STATUS_STYLES = {
  scheduled: { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: '🟢', label: 'Programado' },
  active:    { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: '🟢', label: 'Em voo' },
  delayed:   { color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       icon: '🟡', label: 'Atrasado' },
  cancelled: { color: 'bg-red-500/10 text-red-400 border-red-500/20',             icon: '🔴', label: 'Cancelado' },
  diverted:  { color: 'bg-red-500/10 text-red-400 border-red-500/20',             icon: '🔴', label: 'Desviado' },
  landed:    { color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',       icon: '⚫', label: 'Pousou' }
};

function formatTimeShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function untilNow(iso) {
  if (!iso) return '—';
  const diffMin = Math.round((new Date(iso) - Date.now()) / 60000);
  if (diffMin < -1) return 'vencido';
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `em ${diffMin}min`;
  return `em ${Math.floor(diffMin/60)}h${diffMin%60 ? (diffMin%60)+'min' : ''}`;
}

export default function StatusTab({ showToast }) {
  const [flights, setFlights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [checkingId, setCheckingId] = useState(null);

  const fetchFlights = useCallback(async () => {
    try { setFlights((await axios.get(API_URL)).data); }
    catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchFlights(); }, [fetchFlights]);
  useEffect(() => {
    const t = setInterval(fetchFlights, 30000);
    return () => clearInterval(t);
  }, [fetchFlights]);

  const handleSubmit = async (data) => {
    try {
      if (editing) {
        await axios.put(`${API_URL}/${editing.id}`, data);
        showToast('Voo atualizado', 'success');
      } else {
        await axios.post(API_URL, data);
        showToast('Voo monitorado', 'success');
      }
      setModalOpen(false); setEditing(null);
      fetchFlights();
    } catch (e) {
      showToast(e.response?.data?.error || 'Erro ao salvar', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remover este voo do monitoramento?')) return;
    try { await axios.delete(`${API_URL}/${id}`); fetchFlights(); showToast('Removido', 'success'); }
    catch (e) { showToast('Erro ao remover', 'error'); }
  };

  const handleToggle = async (id) => {
    try { await axios.post(`${API_URL}/${id}/toggle`); fetchFlights(); }
    catch (e) { showToast('Erro ao alternar', 'error'); }
  };

  const handleCheckNow = async (id) => {
    setCheckingId(id);
    try {
      const { data } = await axios.post(`${API_URL}/${id}/check-now`);
      if (data.sucesso) showToast(`Status: ${data.status_atual}`, 'success');
      else showToast(data.erro || 'Falha ao consultar', 'error');
      fetchFlights();
    } catch (e) { showToast('Erro ao consultar', 'error'); }
    finally { setCheckingId(null); }
  };

  const stats = {
    total: flights.length,
    ativos: flights.filter(f => f.monitoramento_ativo).length,
    alertas24h: 0,
    proximaCheck: flights
      .filter(f => f.monitoramento_ativo && f.proxima_verificacao)
      .map(f => f.proxima_verificacao)
      .sort()[0]
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95">
          <Plus className="w-5 h-5" /> Monitorar Voo
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Plane className="w-5 h-5" />} label="Total" value={stats.total} />
        <StatCard icon={<Activity className="w-5 h-5" />} label="Ativos" value={`${stats.ativos} / ${stats.total}`} />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Alertas (24h)" value={stats.alertas24h} />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Próx. check" value={untilNow(stats.proximaCheck)} />
      </div>

      <main className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4 font-semibold">Cliente</th>
                <th className="px-4 py-4 font-semibold">Voo</th>
                <th className="px-4 py-4 font-semibold">Data</th>
                <th className="px-4 py-4 font-semibold">Trecho</th>
                <th className="px-4 py-4 font-semibold">Status</th>
                <th className="px-4 py-4 font-semibold">Partida</th>
                <th className="px-4 py-4 font-semibold">Próx. check</th>
                <th className="px-6 py-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">Carregando...</td></tr>
              ) : flights.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                  <Plane className="w-12 h-12 mx-auto text-slate-600 mb-3 opacity-50" />Nenhum voo sendo monitorado.
                </td></tr>
              ) : flights.map(f => {
                const style = STATUS_STYLES[f.status_atual] || { color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: '⚪', label: f.status_atual || '—' };
                return (
                  <tr key={f.id} className="hover:bg-slate-800/30 group">
                    <td className="px-6 py-4 font-semibold text-slate-200">{f.cliente}</td>
                    <td className="px-4 py-4 font-mono text-slate-300">{f.numero_voo}</td>
                    <td className="px-4 py-4 text-slate-300">{f.data_voo}</td>
                    <td className="px-4 py-4 text-slate-300">{f.origem || '?'}→{f.destino || '?'}</td>
                    <td className="px-4 py-4">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${style.color}`}>
                        {style.icon} {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300 text-sm">
                      <div>{formatTimeShort(f.partida_programada)} {f.partida_estimada && f.partida_estimada !== f.partida_programada && <span className="text-amber-400">→ {formatTimeShort(f.partida_estimada)}</span>}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs">{f.monitoramento_ativo ? untilNow(f.proxima_verificacao) : <span className="text-slate-600">pausado</span>}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleCheckNow(f.id)} disabled={checkingId === f.id} className="p-2 text-slate-400 hover:text-amber-400 bg-slate-800 hover:bg-amber-500/20 rounded-lg cursor-pointer disabled:opacity-50" title="Checar agora">
                          <RefreshCw className={`w-4 h-4 ${checkingId === f.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={() => setHistoryId(f.id)} className="p-2 text-slate-400 hover:text-purple-400 bg-slate-800 hover:bg-purple-500/20 rounded-lg cursor-pointer" title="Histórico">
                          <History className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggle(f.id)} className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer" title={f.monitoramento_ativo ? 'Pausar' : 'Reativar'}>
                          {f.monitoramento_ativo ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { setEditing(f); setModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-400 bg-slate-800 hover:bg-blue-500/20 rounded-lg cursor-pointer" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(f.id)} className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-red-500/20 rounded-lg cursor-pointer" title="Remover">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      <StatusModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} editing={editing} onSubmit={handleSubmit} />
      <StatusHistoryDrawer flightId={historyId} onClose={() => setHistoryId(null)} />
    </>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
      <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20">{icon}</div>
      <div><div className="text-xs text-slate-400 font-medium">{label}</div><div className="text-lg font-bold text-white">{value}</div></div>
    </div>
  );
}
