import { useId, useRef, useState } from 'react';
import { TrendingDown, TrendingUp, Minus, LineChart as LineChartIcon } from 'lucide-react';

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

// Geometria do SVG (viewBox fixo; o SVG escala via width:100%)
const VW = 720, VH = 200;
const PAD_L = 60, PAD_R = 14, PAD_T = 14, PAD_B = 26;
const PLOT_W = VW - PAD_L - PAD_R;
const PLOT_H = VH - PAD_T - PAD_B;

export default function PriceHistoryChart({ data, targetPrice, loading, error }) {
  const gradId = useId();
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

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

  const points = (data || [])
    .map(d => ({ preco: Number(d.preco), date: parseUtc(d.verificado_em) }))
    .filter(p => Number.isFinite(p.preco) && p.date && !isNaN(p.date));

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

  // O alvo só entra no domínio quando está perto dos preços — evita achatar a curva.
  const showTarget = targetPrice != null && targetPrice >= minP * 0.6 && targetPrice <= maxP * 1.4;

  let lo = showTarget ? Math.min(minP, targetPrice) : minP;
  let hi = showTarget ? Math.max(maxP, targetPrice) : maxP;
  const rawSpan = hi - lo;
  const span = rawSpan > 0 ? rawSpan : Math.max(hi * 0.1, 1);
  lo = Math.max(0, lo - span * 0.12);
  hi = hi + span * 0.12;
  const domain = hi - lo || 1;

  const n = points.length;
  const x = i => PAD_L + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const y = v => PAD_T + (1 - (v - lo) / domain) * PLOT_H;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.preco).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  // 4 marcações no eixo Y
  const yTicks = Array.from({ length: 4 }, (_, i) => lo + (domain * i) / 3);

  // Até 5 rótulos no eixo X, sempre incluindo o primeiro e o último
  const xTickCount = Math.min(5, n);
  const xTickIdx = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i / (xTickCount - 1 || 1)) * (n - 1))
  );

  const minIdx = precos.indexOf(minP);
  const hovered = hoverIdx != null ? points[hoverIdx] : null;

  const handleMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    // posição do cursor → coordenada do viewBox → índice do ponto
    const vbX = ((e.clientX - rect.left) / rect.width) * VW;
    const frac = (vbX - PAD_L) / PLOT_W;
    const idx = Math.round(frac * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  };

  const belowTarget = targetPrice != null && current <= targetPrice;

  return (
    <div>
      {/* Resumo numérico */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Stat label="Menor" value={fmt(minP)} tone="emerald" />
        <Stat label="Médio" value={fmt(avgP)} />
        <Stat label="Maior" value={fmt(maxP)} />
        <Stat
          label="Atual"
          value={fmt(current)}
          tone={belowTarget ? 'emerald' : undefined}
          badge={
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
              deltaPct > 0.5 ? 'text-red-600 dark:text-red-400'
              : deltaPct < -0.5 ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 dark:text-slate-500'}`}>
              {deltaPct > 0.5 ? <TrendingUp className="w-2.5 h-2.5" />
                : deltaPct < -0.5 ? <TrendingDown className="w-2.5 h-2.5" />
                : <Minus className="w-2.5 h-2.5" />}
              {Math.abs(deltaPct).toFixed(1)}%
            </span>
          }
        />
      </div>

      {/* Gráfico */}
      <div
        ref={wrapRef}
        className="relative"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-auto select-none" role="img"
             aria-label={`Histórico de preços: menor ${fmt(minP)}, maior ${fmt(maxP)}, atual ${fmt(current)}`}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grade + rótulos do eixo Y */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD_L} x2={VW - PAD_R} y1={y(t)} y2={y(t)}
                className="stroke-slate-200 dark:stroke-slate-700/60" strokeWidth="1"
              />
              <text
                x={PAD_L - 8} y={y(t) + 4} textAnchor="end"
                className="fill-slate-400 dark:fill-slate-500" fontSize="13"
              >
                {fmtCompact(t)}
              </text>
            </g>
          ))}

          {/* Área + linha */}
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path
            d={linePath} fill="none" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round"
            className="stroke-indigo-500 dark:stroke-indigo-400"
          />

          {/* Linha do preço-alvo */}
          {showTarget && (
            <g>
              <line
                x1={PAD_L} x2={VW - PAD_R} y1={y(targetPrice)} y2={y(targetPrice)}
                className="stroke-emerald-500 dark:stroke-emerald-400"
                strokeWidth="1.5" strokeDasharray="6 4"
              />
              <text
                x={VW - PAD_R} y={y(targetPrice) - 6} textAnchor="end"
                className="fill-emerald-600 dark:fill-emerald-400" fontSize="12" fontWeight="600"
              >
                alvo {fmtCompact(targetPrice)}
              </text>
            </g>
          )}

          {/* Melhor preço do período */}
          <circle cx={x(minIdx)} cy={y(minP)} r="4"
                  className="fill-emerald-500 stroke-white dark:stroke-slate-800" strokeWidth="2" />

          {/* Rótulos do eixo X */}
          {xTickIdx.map((idx, i) => (
            <text
              key={i} x={x(idx)} y={VH - 6}
              textAnchor={i === 0 ? 'start' : i === xTickIdx.length - 1 ? 'end' : 'middle'}
              className="fill-slate-400 dark:fill-slate-500" fontSize="12"
            >
              {daysAgoLabel(points[idx].date)}
            </text>
          ))}

          {/* Cursor de hover */}
          {hovered && (
            <g>
              <line
                x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD_T} y2={PAD_T + PLOT_H}
                className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1" strokeDasharray="3 3"
              />
              <circle cx={x(hoverIdx)} cy={y(hovered.preco)} r="5"
                      className="fill-indigo-500 stroke-white dark:stroke-slate-800" strokeWidth="2" />
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full
                       bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5
                       shadow-lg whitespace-nowrap z-10"
            style={{
              left: `${Math.min(92, Math.max(8, (x(hoverIdx) / VW) * 100))}%`,
              top: `${(y(hovered.preco) / VH) * 100}%`,
              marginTop: '-8px',
            }}
          >
            <div className="font-semibold font-mono">{fmt(hovered.preco)}</div>
            <div className="text-[10px] text-slate-300 dark:text-slate-400">
              {hovered.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {daysAgoLabel(hovered.date)}
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
        {n} verificações nos últimos 60 dias
        {showTarget ? ' · linha tracejada = preço-alvo' : ''}
        {' · ponto verde = melhor preço'}
      </p>
    </div>
  );
}

function Stat({ label, value, tone, badge }) {
  return (
    <div className="bg-white/70 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/50 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono text-sm font-bold ${
          tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'
        }`}>{value}</span>
        {badge}
      </div>
    </div>
  );
}
