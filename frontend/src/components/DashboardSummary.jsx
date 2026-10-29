import { useState, useEffect } from 'react';
import { TrendingDown, RefreshCw, Activity, Ticket, ChevronRight, AlertCircle } from 'lucide-react';

export default function DashboardSummary({ onTabChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/dashboard/summary', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Falha silenciosa em caso de offline/carregamento
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 60000); // atualiza a cada 1 min
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4 mb-4 md:mb-6 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 md:h-24 rounded-xl bg-slate-200/70 dark:bg-slate-800/50" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    {
      tab: 'precos',
      title: 'Alertas de Preço',
      value: data.precos?.alertas || 0,
      total: data.precos?.total || 0,
      detail: data.precos?.alertas > 0 ? `${data.precos.alertas} no alvo de compra` : `${data.precos?.total || 0} monitorados`,
      icon: TrendingDown,
      color: 'emerald',
      hasAlert: data.precos?.alertas > 0,
      alertBadge: 'Oportunidade'
    },
    {
      tab: 'alteracoes',
      title: 'Alterações de Voo',
      value: data.alteracoes?.pendentes || 0,
      detail: data.alteracoes?.pendentes > 0 ? `${data.alteracoes.pendentes} aguardando aviso` : 'Tudo em dia',
      icon: RefreshCw,
      color: data.alteracoes?.pendentes > 0 ? 'amber' : 'slate',
      hasAlert: data.alteracoes?.pendentes > 0,
      alertBadge: 'Pendente'
    },
    {
      tab: 'status',
      title: 'Radar de Voos',
      value: data.status?.ativos || 0,
      detail: data.status?.atencao > 0 ? `${data.status.atencao} voo(s) com atraso` : `${data.status?.ativos || 0} voos ativos`,
      icon: Activity,
      color: data.status?.atencao > 0 ? 'rose' : 'sky',
      hasAlert: data.status?.atencao > 0,
      alertBadge: 'Atenção'
    },
    {
      tab: 'vouchers',
      title: 'Vouchers & Itinerários',
      value: data.vouchers?.total || 0,
      detail: 'Acessar emissões',
      icon: Ticket,
      color: 'indigo',
      hasAlert: false
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4 mb-4 md:mb-6">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <button
            key={card.tab}
            type="button"
            onClick={() => onTabChange(card.tab)}
            className="group relative flex flex-col justify-between p-3 md:p-4 rounded-xl text-left transition-all duration-150 cursor-pointer border border-slate-200/80 bg-white/80 shadow-sm hover:shadow-md hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-indigo-500/60"
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                {card.title}
              </span>
              <div className={`p-1.5 rounded-lg shrink-0 ${
                card.color === 'emerald' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' :
                card.color === 'amber' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' :
                card.color === 'rose' ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400' :
                card.color === 'sky' ? 'bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400' :
                card.color === 'indigo' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400' :
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {card.value}
              </span>
              {card.hasAlert && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {card.alertBadge}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="truncate">{card.detail}</span>
              <ChevronRight className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-slate-400" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
