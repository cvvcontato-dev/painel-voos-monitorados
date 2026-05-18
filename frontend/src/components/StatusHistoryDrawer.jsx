import { useEffect, useState } from 'react';
import axios from 'axios';
import { X, CheckCircle2, AlertTriangle, XCircle, Clock, Archive, AlertOctagon } from 'lucide-react';

const EVENT_META = {
  check_ok:           { icon: CheckCircle2, color: 'text-emerald-400', label: 'Verificação OK' },
  cancelado:          { icon: XCircle,      color: 'text-red-400',     label: 'Cancelado' },
  atrasado:           { icon: AlertTriangle,color: 'text-amber-400',   label: 'Atrasado' },
  reagendado:         { icon: Clock,        color: 'text-amber-400',   label: 'Reagendado' },
  portao_alterado:    { icon: AlertTriangle,color: 'text-slate-400',   label: 'Portão alterado' },
  terminal_alterado:  { icon: AlertTriangle,color: 'text-slate-400',   label: 'Terminal alterado' },
  arquivado_auto:     { icon: Archive,      color: 'text-slate-500',   label: 'Arquivado automaticamente' },
  erro_api:           { icon: AlertOctagon, color: 'text-orange-400',  label: 'Erro na consulta da API' }
};

function fmtLocal(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function StatusHistoryDrawer({ flightId, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!flightId) { setData(null); return; }
    axios.get(`/api/monitored-flights/${flightId}`)
      .then(r => setData(r.data))
      .catch(() => setData({ flight: null, history: [] }));
  }, [flightId]);

  if (!flightId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-slate-900 border-l border-slate-700/50 shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl flex justify-between items-center p-6 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">
            Histórico {data?.flight && <span className="text-slate-400 font-normal text-sm">— {data.flight.numero_voo} / {data.flight.data_voo}</span>}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {!data ? (
            <p className="text-slate-400 text-sm">Carregando…</p>
          ) : data.history.length === 0 ? (
            <p className="text-slate-400 text-sm">Nenhum evento registrado ainda.</p>
          ) : (
            <ol className="relative border-l border-slate-700 ml-3 space-y-6">
              {data.history.map(ev => {
                const meta = EVENT_META[ev.evento] || { icon: AlertTriangle, color: 'text-slate-400', label: ev.evento };
                const Icon = meta.icon;
                const payload = ev.payload_json ? JSON.parse(ev.payload_json) : null;
                return (
                  <li key={ev.id} className="ml-6">
                    <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 bg-slate-900 rounded-full ring-4 ring-slate-900 ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="text-xs text-slate-500">{fmtLocal(ev.verificado_em)} {ev.notificado ? <span className="ml-2 text-emerald-400">• notificado</span> : ''}</div>
                    <div className={`text-sm font-semibold ${meta.color}`}>{meta.label}</div>
                    {Array.isArray(payload) && payload.length > 0 && (
                      <ul className="mt-1 text-xs text-slate-400 space-y-0.5">
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
