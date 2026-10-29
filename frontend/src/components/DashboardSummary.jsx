import { useState, useEffect } from 'react';
import { TrendingDown, RefreshCw, Activity, Ticket, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 md:h-28 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const precosTotal = data.precos?.total || 1;
  const precosAlertas = data.precos?.alertas || 0;
  const precosPct = Math.min(Math.round((precosAlertas / Math.max(precosTotal, 1)) * 100), 100);

  const alteracoesPendentes = data.alteracoes?.pendentes || 0;
  const statusAtencao = data.status?.atencao || 0;
  const statusAtivos = data.status?.ativos || 0;
  const vouchersTotal = data.vouchers?.total || 0;

  const cards = [
    {
      tab: 'precos',
      title: 'Alertas de Preço',
      value: precosAlertas,
      detail: precosAlertas > 0 ? `${precosAlertas} no alvo de compra` : `${precosTotal} voos monitorados`,
      icon: TrendingDown,
      color: 'emerald',
      progress: precosAlertas > 0 ? Math.max(precosPct, 20) : 100,
      progressBarColor: precosAlertas > 0 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700',
      hasAlert: precosAlertas > 0,
      alertBadge: 'Oportunidade',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
    },
    {
      tab: 'alteracoes',
      title: 'Alterações de Voo',
      value: alteracoesPendentes,
      detail: alteracoesPendentes > 0 ? `${alteracoesPendentes} aguardando aviso` : 'Tudo em dia',
      icon: RefreshCw,
      color: alteracoesPendentes > 0 ? 'amber' : 'brand',
      progress: alteracoesPendentes > 0 ? 100 : 100,
      progressBarColor: alteracoesPendentes > 0 ? 'bg-amber-500 animate-pulse' : 'bg-[#00569e]',
      hasAlert: alteracoesPendentes > 0,
      alertBadge: 'Aviso Pendente',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
    },
    {
      tab: 'status',
      title: 'Radar de Voos',
      value: statusAtivos,
      detail: statusAtencao > 0 ? `${statusAtencao} voo(s) com atraso` : `${statusAtivos} voos pontuais`,
      icon: Activity,
      color: statusAtencao > 0 ? 'rose' : 'sky',
      progress: statusAtivos > 0 ? Math.max(Math.round(((statusAtivos - statusAtencao) / statusAtivos) * 100), 20) : 100,
      progressBarColor: statusAtencao > 0 ? 'bg-rose-500' : 'bg-sky-500',
      hasAlert: statusAtencao > 0,
      alertBadge: `${statusAtencao} Atrasado`,
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
    },
    {
      tab: 'vouchers',
      title: 'Vouchers & Itinerários',
      value: vouchersTotal,
      detail: 'Acessar emissões VIP',
      icon: Ticket,
      color: 'brand',
      progress: 100,
      progressBarColor: 'bg-gradient-to-r from-[#00569e] to-[#3871c1]',
      hasAlert: false
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <button
            key={card.tab}
            type="button"
            onClick={() => onTabChange(card.tab)}
            className="group relative flex flex-col justify-between p-3.5 md:p-4 rounded-2xl text-left transition-all duration-200 cursor-pointer border border-slate-200/80 bg-white/90 shadow-sm hover:shadow-lg hover:border-[#3871c1]/60 hover:-translate-y-0.5 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-[#3871c1]/50 overflow-hidden"
          >
            {/* Linha superior: Título e Ícone */}
            <div className="flex items-center justify-between w-full mb-1.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate tracking-tight">
                {card.title}
              </span>
              <div className={`p-1.5 md:p-2 rounded-xl shrink-0 transition-transform group-hover:scale-110 ${
                card.color === 'emerald' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900' :
                card.color === 'amber' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-100 dark:border-amber-900' :
                card.color === 'rose' ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-100 dark:border-rose-900' :
                card.color === 'sky' ? 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400 border border-sky-100 dark:border-sky-900' :
                'bg-blue-50 text-[#00569e] dark:bg-blue-950/60 dark:text-sky-300 border border-blue-100 dark:border-blue-900'
              }`}>
                <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </div>
            </div>

            {/* Valor principal e Badge */}
            <div className="flex items-baseline gap-2 my-1">
              <span className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {card.value}
              </span>
              {card.hasAlert && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${card.badgeClass}`}>
                  {card.alertBadge}
                </span>
              )}
            </div>

            {/* Detalhe e Seta */}
            <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="truncate font-medium">{card.detail}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-[#00569e] dark:text-sky-400" />
            </div>

            {/* Micro-barra de Progresso estilo Stripe/Linear */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${card.progressBarColor}`}
                style={{ width: `${card.progress}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
