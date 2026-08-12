import { useId, useMemo } from 'react';
import { TrendingDown, TrendingUp, Minus, LineChart as LineChartIcon } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtCompact = v => 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);

/** SQLite grava datetime('now') como "YYYY-MM-DD HH:MM:SS" em UTC, sem sufixo Z. */
function parseUtc(s) {
  if (!s) return null;
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z');
}

function daysAgoLabel(date) {
  const d = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (d <= 0) return 'Hoje';
  if (d === 1) return 'Ontem';
  return `Há ${d}d`;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-xl
                    dark:border-slate-700 dark:bg-slate-800">
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
        {p.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {p.label}
      </div>
      <div className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{fmt(p.preco)}</div>
    </div>
  );
}

export default function PriceHistoryChart({ data, targetPrice, loading, error }) {
  const uid = useId().replace(/:/g, '');

  const points = useMemo(() => (data || [])
    .map(d => ({ preco: Number(d.preco), date: parseUtc(d.verificado_em) }))
    .filter(p => Number.isFinite(p.preco) && p.date && !isNaN(p.date))
    .map(p => ({ ...p, label: daysAgoLabel(p.date) })), [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-12 text-slate-400 dark:text-slate-500 text-sm">
        <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        Carregando histórico...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-sm text-red-600 dark:text-red-400">
        Não foi possível carregar o histórico: {error}
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500">
        <LineChartIcon className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">Nenhum preço registrado nos últimos 60 dias.</p>
        <p className="text-xs mt-1 opacity-80">O histórico é gravado a cada verificação (08h e 20h).</p>
      </div>
    );
  }

  if (points.length === 1) {
    const p = points[0];
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400">
        <LineChartIcon className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">Apenas 1 registro até agora: <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{fmt(p.preco)}</span></p>
        <p className="text-xs mt-1 opacity-80">O gráfico aparece a partir da segunda verificação.</p>
      </div>
    );
  }

  const precos = points.map(p => p.preco);
  const minP = Math.min(...precos);
  const maxP = Math.max(...precos);
  const avgP = precos.reduce((a, b) => a + b, 0) / precos.length;
  const current = precos[precos.length - 1];
  const first = precos[0];
  const deltaPct = first > 0 ? ((current - first) / first) * 100 : 0;
  const minIdx = precos.indexOf(minP);

  // O alvo só entra no domínio quando está perto dos preços — evita achatar a curva.
  const showTarget = targetPrice != null && targetPrice >= minP * 0.6 && targetPrice <= maxP * 1.4;

  let lo = showTarget ? Math.min(minP, targetPrice) : minP;
  let hi = showTarget ? Math.max(maxP, targetPrice) : maxP;
  const rawSpan = hi - lo;
  const span = rawSpan > 0 ? rawSpan : Math.max(hi * 0.1, 1);
  lo = Math.max(0, lo - span * 0.12);
  hi = hi + span * 0.12;

  const belowTarget = targetPrice != null && current <= targetPrice;
  const rising = deltaPct > 0.5;
  const falling = deltaPct < -0.5;
  const TrendIcon = rising ? TrendingUp : falling ? TrendingDown : Minus;
  const trendCls = rising ? 'text-red-600 dark:text-red-400'
    : falling ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-slate-400 dark:text-slate-500';

  // Vários gráficos podem estar expandidos ao mesmo tempo — ids de defs por instância.
  const gradId = `phc-grad-${uid}`;
  const gridId = `phc-dots-${uid}`;
  const glowId = `phc-glow-${uid}`;
  const dotShadowId = `phc-dotshadow-${uid}`;

  // Só o melhor preço e o ponto atual ganham marcador fixo.
  const renderDot = ({ cx, cy, index }) => {
    const isMin = index === minIdx;
    const isLast = index === points.length - 1;
    if (!isMin && !isLast) return <g key={`d-${index}`} />;
    return (
      <circle
        key={`d-${index}`} cx={cx} cy={cy} r={isMin ? 5 : 4}
        fill={isMin ? 'var(--phc-target)' : 'var(--phc-accent)'}
        stroke="var(--phc-dot-stroke)" strokeWidth={2}
        filter={`url(#${dotShadowId})`}
      />
    );
  };

  return (
    <div className="price-history-chart">
      {/* Cabeçalho: preço atual + tendência */}
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold mb-0.5">
            Preço atual
          </div>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className={`text-2xl font-bold font-mono ${
              belowTarget ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'
            }`}>{fmt(current)}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${trendCls}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              {Math.abs(deltaPct).toFixed(1)}%
              <span className="text-slate-400 dark:text-slate-500 font-normal">vs início do período</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
          <span>Menor: <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{fmt(minP)}</span></span>
          <span>Médio: <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{fmt(avgP)}</span></span>
          <span>Maior: <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{fmt(maxP)}</span></span>
          {targetPrice != null && (
            <span>Alvo: <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{fmt(targetPrice)}</span></span>
          )}
        </div>
      </div>

      {/* Gráfico */}
      <div className="h-64 w-full" role="img"
           aria-label={`Histórico de preços: menor ${fmt(minP)}, maior ${fmt(maxP)}, atual ${fmt(current)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--phc-accent)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--phc-accent)" stopOpacity={0} />
              </linearGradient>
              <pattern id={gridId} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1" fill="var(--phc-dot-grid)" fillOpacity="0.3" />
              </pattern>
              <filter id={dotShadowId} x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="rgba(0,0,0,0.45)" />
              </filter>
              <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
                <feDropShadow dx="0" dy="5" stdDeviation="10" floodColor="var(--phc-accent)" floodOpacity="0.35" />
              </filter>
            </defs>

            <rect x="0" y="0" width="100%" height="100%" fill={`url(#${gridId})`} style={{ pointerEvents: 'none' }} />

            <CartesianGrid strokeDasharray="4 8" stroke="var(--phc-grid)" horizontal vertical={false} />

            <XAxis
              dataKey="label"
              axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--phc-tick)' }}
              tickMargin={10} minTickGap={48} interval="preserveStartEnd"
            />
            <YAxis
              domain={[lo, hi]}
              axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--phc-tick)' }}
              tickFormatter={fmtCompact} tickMargin={8} width={72} tickCount={4}
            />

            <Tooltip
              content={<ChartTooltip />}
              cursor={{ strokeDasharray: '3 3', stroke: 'var(--phc-tick)', strokeOpacity: 0.6 }}
            />

            {showTarget && (
              <ReferenceLine
                y={targetPrice}
                stroke="var(--phc-target)" strokeDasharray="6 4" strokeWidth={1.5}
                label={{
                  value: `alvo ${fmtCompact(targetPrice)}`,
                  position: 'insideTopRight',
                  fill: 'var(--phc-target)', fontSize: 11, fontWeight: 600,
                }}
              />
            )}

            <Area
              type="monotone" dataKey="preco"
              fill={`url(#${gradId})`} stroke="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone" dataKey="preco"
              stroke="var(--phc-accent)" strokeWidth={2}
              filter={`url(#${glowId})`}
              isAnimationActive={false}
              dot={renderDot}
              activeDot={{
                r: 6, fill: 'var(--phc-accent)',
                stroke: 'var(--phc-dot-stroke)', strokeWidth: 2,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
        {points.length} verificações nos últimos 60 dias
        {showTarget ? ' · linha tracejada = preço-alvo' : ''}
        {' · ponto verde = melhor preço'}
      </p>
    </div>
  );
}
