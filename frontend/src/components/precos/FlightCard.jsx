import { useState } from 'react';
import {
  EllipsisVertical, CheckCircle2, Circle, Users, Mail, MessageSquare, TrendingDown, Clock,
  AlertTriangle, PiggyBank, LineChart as LineChartIcon, RefreshCw, ExternalLink, Bell,
  ShoppingBag, XCircle, Edit2, Trash2, ArrowUp, ArrowDown
} from 'lucide-react';
import BottomSheet, { SheetItem } from '../mobile/BottomSheet';

/**
 * Cartão de voo (celular). Recebe tudo já calculado por PrecosTab para NÃO duplicar regra de negócio:
 *  - d: valores derivados (hasPrice, isAlert, isBought, isClosed, chartOpen, falhas, desatualizado,
 *       diasSemCheck, statusStyle, priorityCls, economia, timeAgoText, ultimoErro, ultimaFalhaTexto)
 *  - busy: { checking, anyChecking, testing }
 *  - on: ações { toggleChart, toggleCheck, checkNow, testNotification, setStatus, edit, remove }
 *  - move: { up, down } ou null (só na ordenação manual sem filtro)
 *  - chart: nó do gráfico (já montado) quando aberto
 */
export default function FlightCard({ flight, d, fmt, busy, on, move, chart }) {
  const [sheet, setSheet] = useState(false);
  const fechar = () => setSheet(false);
  const rodar = (fn) => () => { fechar(); fn(); };

  // economiaDoVoo pode devolver null (sem preço de compra) ou NaN: nunca imprimir "NaN".
  const economia = d.isBought && Number.isFinite(d.economia) ? d.economia : null;

  const barra = d.isBought ? 'bg-emerald-400 dark:bg-emerald-500'
    : d.isClosed ? 'bg-slate-300 dark:bg-slate-600'
    : d.hasPrice ? (d.isAlert ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-amber-400 dark:bg-amber-500') : 'bg-transparent';
  const casca = d.isBought ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/60 dark:border-emerald-700/30'
    : d.isClosed ? 'bg-slate-50/80 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-700/30 opacity-70'
    : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/50';
  const rotulo = 'block text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500';

  // A folha de ações fica FORA do <article>: o cartão de "desistência" tem opacity, que criaria um contexto de
  // empilhamento (a folha ficaria translúcida e presa atrás de outros cartões).
  return (
    <>
    <article className={`relative border rounded-xl overflow-hidden ${casca}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${barra}`} />
      <div className="pl-4 pr-1 pt-1.5 pb-3">
        <div className="flex items-start gap-1">
          <button type="button" onClick={on.toggleChart} aria-expanded={!!d.chartOpen}
                  aria-label={`${d.chartOpen ? 'Ocultar' : 'Ver'} histórico de preços de ${flight.cliente}`}
                  className="flex-1 min-w-0 min-h-[44px] pt-1.5 text-left">
            <span className="block font-semibold text-slate-800 dark:text-slate-100 truncate pii">{flight.cliente}</span>
            <span className="flex items-center gap-1.5 mt-0.5 flex-wrap text-xs text-slate-500 dark:text-slate-400">
              <span>{flight.mes_viagem}</span>
              <span aria-hidden="true">·</span>
              <Users className="w-3 h-3 shrink-0" />
              <span>{flight.quantidade_pax || 1} pax</span>
              {flight.email_cliente && <Mail className="w-3 h-3 shrink-0" role="img" aria-label="Tem e-mail" />}
              {flight.telegram_chat_id && <MessageSquare className="w-3 h-3 shrink-0" role="img" aria-label="Tem Telegram" />}
            </span>
          </button>
          <button type="button" onClick={on.toggleCheck} aria-pressed={!!flight.check_diario}
                  aria-label="Check diário"
                  className={`w-11 h-11 flex items-center justify-center rounded-full shrink-0 ${flight.check_diario ? 'text-indigo-500 bg-indigo-500/10' : 'text-slate-300 dark:text-slate-600'}`}>
            {flight.check_diario ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
          </button>
          <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label={`Ações do voo de ${flight.cliente}`}
                  className="w-11 h-11 flex items-center justify-center rounded-lg shrink-0 text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700/50">
            <EllipsisVertical className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1 pr-2">
          <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${d.priorityCls}`}>{flight.prioridade}</span>
          {d.statusStyle && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded border ${d.statusStyle.cls}`}>
              {d.statusStyle.icon} {d.statusStyle.label}
            </span>
          )}
          {economia != null && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${economia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <PiggyBank className="w-3 h-3 shrink-0" />
              {economia >= 0 ? `economia ${fmt(economia)}` : `${fmt(Math.abs(economia))} acima do alvo`}
            </span>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3 pr-2">
          <div>
            <span className={rotulo}>Alvo</span>
            <div className="font-mono text-sm font-medium text-slate-600 dark:text-slate-300">{fmt(flight.preco_esperado)}</div>
          </div>
          <div className="min-w-0">
            <span className={rotulo}>Atual</span>
            {d.hasPrice ? (
              <>
                <div className={`font-mono text-base font-bold ${d.isAlert ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>{fmt(flight.preco_atual)}</div>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  {d.isAlert ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25 px-2 py-0.5 rounded-md"><TrendingDown className="w-3 h-3" /> ALERTA</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25 px-2 py-0.5 rounded-md"><Clock className="w-3 h-3" /> AGUARDAR</span>
                  )}
                  {d.timeAgoText && <span className="text-[11px] text-slate-400 dark:text-slate-500">{d.timeAgoText}</span>}
                </div>
              </>
            ) : <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>}
          </div>
        </div>

        {flight.status === 'ativo' && d.falhas > 0 && (
          <div className="flex items-start gap-1 text-xs font-semibold text-red-600 dark:text-red-400 mt-2 pr-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{d.falhas} {d.falhas === 1 ? 'falha seguida' : 'falhas seguidas'}{d.ultimoErro ? ` — ${d.ultimoErro}` : ''}{d.ultimaFalhaTexto ? ` (${d.ultimaFalhaTexto})` : ''}</span>
          </div>
        )}
        {d.desatualizado && (
          <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> desatualizado (sem verificação há {d.diasSemCheck} dias)
          </div>
        )}
      </div>

      {d.chartOpen && (
        <div className="border-t border-slate-200/80 dark:border-slate-700/50 bg-slate-50/60 dark:bg-slate-900/30 px-3 py-3">
          <div className="flex items-center gap-2 mb-2">
            <LineChartIcon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Histórico — últimos 60 dias</span>
          </div>
          {chart}
        </div>
      )}
    </article>

      <BottomSheet open={sheet} onClose={fechar} title={flight.cliente} titleClassName="pii">
        <SheetItem icon={<RefreshCw className={`w-5 h-5 ${busy.checking ? 'animate-spin' : ''}`} />} label="Verificar preço agora"
                   disabled={busy.anyChecking} onClick={rodar(on.checkNow)} />
        <SheetItem icon={<LineChartIcon className="w-5 h-5" />} label={d.chartOpen ? 'Ocultar histórico de preços' : 'Ver histórico de preços (60 dias)'} onClick={rodar(on.toggleChart)} />
        <SheetItem icon={<ExternalLink className="w-5 h-5" />} label="Abrir no Google Voos" href={flight.link_voo} onClick={fechar} />
        <SheetItem icon={<Bell className={`w-5 h-5 ${busy.testing ? 'animate-pulse' : ''}`} />} label="Enviar notificação de teste" hint="E-mail e Telegram"
                   disabled={busy.testing} onClick={rodar(on.testNotification)} />
        {flight.status !== 'passagem comprada' && <SheetItem icon={<ShoppingBag className="w-5 h-5" />} label="Marcar como passagem comprada" onClick={rodar(() => on.setStatus('passagem comprada'))} />}
        {flight.status !== 'encerrado' && <SheetItem icon={<XCircle className="w-5 h-5" />} label="Marcar como desistência" onClick={rodar(() => on.setStatus('encerrado'))} />}
        {(flight.status === 'passagem comprada' || flight.status === 'encerrado') && <SheetItem icon={<RefreshCw className="w-5 h-5" />} label="Reativar monitoramento" onClick={rodar(() => on.setStatus('ativo'))} />}
        <SheetItem icon={<Edit2 className="w-5 h-5" />} label="Editar" onClick={rodar(on.edit)} />
        {move && <SheetItem icon={<ArrowUp className="w-5 h-5" />} label="Mover para cima" disabled={!move.up} onClick={rodar(move.up || (() => {}))} />}
        {move && <SheetItem icon={<ArrowDown className="w-5 h-5" />} label="Mover para baixo" disabled={!move.down} onClick={rodar(move.down || (() => {}))} />}
        <SheetItem icon={<Trash2 className="w-5 h-5" />} label="Excluir" danger onClick={rodar(on.remove)} />
      </BottomSheet>
    </>
  );
}
