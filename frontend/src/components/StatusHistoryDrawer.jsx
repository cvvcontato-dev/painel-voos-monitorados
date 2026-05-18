import { useEffect, useState } from 'react';
import api from '../hooks/useApi';
import { X, CheckCircle2, AlertTriangle, XCircle, Clock, Archive, AlertOctagon } from 'lucide-react';

const EVENT_META = {
  check_ok:           { icon: CheckCircle2, color: 'text-emerald-700 dark:text-emerald-400', label: 'Verificação OK' },
  cancelado:          { icon: XCircle,      color: 'text-red-700 dark:text-red-400',         label: 'Cancelado' },
  atrasado:           { icon: AlertTriangle,color: 'text-amber-700 dark:text-amber-400',     label: 'Atrasado' },
  reagendado:         { icon: Clock,        color: 'text-amber-700 dark:text-amber-400',     label: 'Reagendado' },
  portao_alterado:    { icon: AlertTriangle,color: 'text-slate-600 dark:text-slate-400',     label: 'Portão alterado' },
  terminal_alterado:  { icon: AlertTriangle,color: 'text-slate-600 dark:text-slate-400',     label: 'Terminal alterado' },
  arquivado_auto:     { icon: Archive,      color: 'text-slate-500 dark:text-slate-500',     label: 'Arquivado automaticamente' },
  erro_api:           { icon: AlertOctagon, color: 'text-orange-700 dark:text-orange-400',   label: 'Erro na consulta da API' }
};

function fmtLocal(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function StatusHistoryDrawer({ flightId, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!flightId) { setData(null); return; }
    api.get(`/api/monitored-flights/${flightId}`)
      .then(r => setData(r.data))
      .catch(() => setData({ flight: null, history: [] }));
  }, [flightId]);

  if (!flightId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/80" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-white border-l border-slate-200 shadow-2xl h-full overflow-y-auto dark:bg-slate-900 dark:border-slate-700/50">
        <div className="sticky top-0 bg-white/95 backdrop-blur-xl flex justify-between items-center p-6 border-b border-slate-200 dark:bg-slate-900/95 dark:border-slate-700/50">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Histórico {data?.flight && <span className="text-slate-600 font-normal text-sm dark:text-slate-400">— {data.flight.numero_voo} / {data.flight.data_voo}</span>}
          </h2>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900 cursor-pointer dark:text-slate-400 dark:hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {!data ? (
            <p className="text-slate-600 text-sm dark:text-slate-400">Carregando…</p>
          ) : data.history.length === 0 ? (
            <p className="text-slate-600 text-sm dark:text-slate-400">Nenhum evento registrado ainda.</p>
          ) : (
            <ol className="relative border-l border-slate-200 ml-3 space-y-6 dark:border-slate-700">
              {data.history.map(ev => {
                const meta = EVENT_META[ev.evento] || { icon: AlertTriangle, color: 'text-slate-600 dark:text-slate-400', label: ev.evento };
                const Icon = meta.icon;
                let payload = null;
                try { payload = ev.payload_json ? JSON.parse(ev.payload_json) : null; } catch (_) {}
                return (
                  <li key={ev.id} className="ml-6">
                    <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 bg-white ring-4 ring-white rounded-full dark:bg-slate-900 dark:ring-slate-900 ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="text-xs text-slate-500">{fmtLocal(ev.verificado_em)} {ev.notificado ? <span className="ml-2 text-emerald-600 dark:text-emerald-400">• notificado</span> : ''}</div>
                    <div className={`text-sm font-semibold ${meta.color}`}>{meta.label}</div>
                    {Array.isArray(payload) && payload.length > 0 && (
                      <ul className="mt-1 text-xs text-slate-600 space-y-0.5 dark:text-slate-400">
                        {payload.map((p, i) => (
                          <li key={i}><b>{p.campo}:</b> {p.antes || '—'} → {p.depois || '—'}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
