import { useState } from 'react';
import { RefreshCw, History, Pause, Play, Edit2, Trash2, ExternalLink, Hand, EllipsisVertical } from 'lucide-react';
import BottomSheet, { SheetItem } from '../mobile/BottomSheet';

/**
 * Cartão de voo monitorado (celular). StatusTab calcula tudo e passa pronto:
 *  - f: voo; style: { color, icon, label } do status; dataBr, partida, estimada, proxima: textos prontos
 *  - busy: { checking }; on: { checkNow, history, toggle, edit, remove }
 */
export default function StatusFlightCard({ f, style, dataBr, partida, estimada, proxima, busy, on }) {
  const [sheet, setSheet] = useState(false);
  const fechar = () => setSheet(false);
  const rodar = (fn) => () => { fechar(); fn(); };
  return (
    <>
      <article className="rounded-xl border p-3 bg-white border-slate-200/80 dark:bg-slate-800/60 dark:border-slate-700/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-base font-semibold text-slate-800 dark:text-slate-100">{f.numero_voo}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{dataBr} · {f.origem || '?'} → {f.destino || '?'}</div>
          </div>
          <span className={`shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full border ${style.color}`}>{style.icon} {style.label}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
          <span>
            Partida <strong className="font-semibold">{partida}</strong>
            {estimada && <span className="text-amber-700 dark:text-amber-400"> → {estimada}</span>}
          </span>
          {f.override_ativo === 1 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 px-1.5 py-0.5 rounded" title="Horário definido manualmente — não é atualizado pela API">
              <Hand className="w-3 h-3" /> Manual
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {f.monitoramento_ativo ? `Próx. check ${proxima}` : 'Monitoramento pausado'}
        </div>

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={on.checkNow} disabled={busy.checking}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-medium disabled:opacity-50
                             border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-300">
            <RefreshCw className={`w-4 h-4 ${busy.checking ? 'animate-spin' : ''}`} /> Checar agora
          </button>
          <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label={`Mais ações do voo ${f.numero_voo}`}
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <EllipsisVertical className="w-5 h-5" />
          </button>
        </div>
      </article>

      <BottomSheet open={sheet} onClose={fechar} title={`Voo ${f.numero_voo}`}>
        {f.link_gerenciamento && <SheetItem icon={<ExternalLink className="w-5 h-5" />} label="Abrir gerenciamento da reserva" href={f.link_gerenciamento} onClick={fechar} />}
        <SheetItem icon={<History className="w-5 h-5" />} label="Histórico" onClick={rodar(on.history)} />
        <SheetItem icon={f.monitoramento_ativo ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                   label={f.monitoramento_ativo ? 'Pausar monitoramento' : 'Reativar monitoramento'} onClick={rodar(on.toggle)} />
        <SheetItem icon={<Edit2 className="w-5 h-5" />} label="Editar" onClick={rodar(on.edit)} />
        <SheetItem icon={<Trash2 className="w-5 h-5" />} label="Remover" danger onClick={rodar(on.remove)} />
      </BottomSheet>
    </>
  );
}
