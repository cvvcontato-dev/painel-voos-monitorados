import { useEffect, useRef, useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { sectionCls, btnPrimary } from './ui';

const h3 = 'text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider';
const CARRIER = { azul: 'Azul', gol: 'Gol', latam: 'LATAM' };

const sortNum = (a) => [...a].sort((x, y) => x - y);
const sameSet = (a, b) => a.length === b.length && sortNum(a).every((v, i) => v === sortNum(b)[i]);

// Viagens de um grupo: usa `journeys`; sem elas (cache antigo) cada voo vira uma viagem.
export function journeysOf(g) {
  if (Array.isArray(g?.journeys) && g.journeys.length > 0) {
    return g.journeys.map((j, i) => ({ ...j, key: j.key || `j${i + 1}`, trips: Array.isArray(j.trips) ? j.trips : [], segments: j.segments || (j.trips || []).length || 1 }));
  }
  return (g?.trips || []).map(t => ({ key: `t${t.index}`, label: t.label, segments: 1, trips: [t] }));
}
const idxOf = (j) => j.trips.map(t => t.index);

// Resumo "Trechos: todos" / "Viagens marcadas: ...". Exportado para reuso.
export function affectedSummary(groups, affected, total) {
  if (!Array.isArray(affected) || affected.length === 0 || affected.length >= total) return 'Viagens: todas';
  const labels = [];
  for (const g of groups || []) for (const j of journeysOf(g)) {
    const ix = idxOf(j);
    if (ix.length > 0 && ix.every(i => affected.includes(i))) labels.push(j.label);
  }
  return `Viagens marcadas: ${labels.join('; ') || affected.length}`;
}

function GroupCheck({ journeys, sel, disabled, onToggleGroup }) {
  const ref = useRef(null);
  const idx = journeys.flatMap(idxOf);
  const n = idx.filter(i => sel.includes(i)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = n > 0 && n < idx.length; });
  return (
    <label className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-0 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
      <input ref={ref} type="checkbox" className="w-5 h-5 md:w-auto md:h-auto shrink-0" checked={idx.length > 0 && n === idx.length} disabled={disabled}
        onChange={() => onToggleGroup(idx, n !== idx.length)} />
      Marcar a reserva toda
    </label>
  );
}

function JourneyCheck({ journey, gid, sel, disabled, onToggle }) {
  const ref = useRef(null);
  const idx = idxOf(journey);
  const n = idx.filter(i => sel.includes(i)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = n > 0 && n < idx.length; });
  const conn = journey.segments > 1;
  const descId = `${gid}-${journey.key}-voos`;
  return (
    <div>
      <label className="flex items-center gap-2 min-h-[44px] md:min-h-0 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
        <input ref={ref} type="checkbox" className="w-5 h-5 md:w-auto md:h-auto shrink-0" checked={idx.length > 0 && n === idx.length} onChange={() => onToggle(idx, n !== idx.length)}
          disabled={disabled} aria-describedby={conn ? descId : undefined} />
        <span>{journey.label}</span>
        {conn && <span className="rounded-full border border-sky-300 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-800 dark:text-sky-200">com conexão</span>}
      </label>
      {conn && (
        <ul id={descId} className="ml-6 mt-0.5 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          {journey.trips.map(t => <li key={t.index}>{t.label}</li>)}
        </ul>
      )}
    </div>
  );
}

// Seção "Viagens alteradas". `onSave(affected)` devolve Promise<boolean> (true = salvo).
export default function AffectedTripsSection({ detail, busy, locked, focusTick, onSave }) {
  const groups = Array.isArray(detail.reservation_groups) ? detail.reservation_groups : [];
  const total = (detail.old?.trips || []).length;
  const saved = Array.isArray(detail.affected) ? detail.affected : [];
  const needs = !!detail.needs_affected;
  const done = detail.status === 'confirmado';
  const [sel, setSel] = useState(needs ? [] : saved);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const savedKey = saved.join(',');

  // Backend mudou a marcação (salvou/recarregou): alinha a tela.
  useEffect(() => { setSel(needs ? [] : saved); }, [savedKey, needs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Erro "escolha_trechos" de qualquer ação: abre, rola e foca a seção.
  useEffect(() => {
    if (!focusTick) return;
    setOpen(true);
    rootRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    rootRef.current?.focus?.({ preventScroll: true });
  }, [focusTick]);

  if (groups.length === 0) return null;

  const disabled = !!busy || !!locked || done;
  const changed = !sameSet(sel, saved);
  const canSave = needs ? sel.length >= 1 : changed && sel.length >= 1;
  const toggleGroup = (idx, on) => setSel(s => (on ? [...new Set([...s, ...idx])] : s.filter(x => !idx.includes(x))));

  async function save() {
    if (!canSave || disabled) return;
    if (!needs && detail.new && !window.confirm('O voucher novo será refeito com a nova marcação (sem nova leitura da imagem). Continuar?')) return;
    const ok = await onSave(sortNum(sel));
    if (!ok) setSel(needs ? [] : saved); // erro (ex.: 422): mantém a marcação anterior
  }

  const body = (
    <div className="space-y-3">
      {groups.map((g, gi) => (
        <fieldset key={`${g.locator || 'sem'}-${gi}`} className="rounded-lg border border-slate-200 dark:border-slate-700/60 px-3 py-2" disabled={disabled}>
          <legend className="px-1 text-sm font-medium text-slate-800 dark:text-slate-100">
            {g.locator ? <>Reserva <span className="pii">{g.locator}</span></> : 'Reserva sem localizador'}
            {g.carrier ? ` · ${CARRIER[g.carrier] || g.carrier}` : ''}
          </legend>
          <div className="space-y-1.5">
            {journeysOf(g).map(j => (
              <JourneyCheck key={j.key} journey={j} gid={`aff-${gi}`} sel={sel} disabled={disabled} onToggle={toggleGroup} />
            ))}
          </div>
          {journeysOf(g).length > 1 && (
            <div className="mt-1"><GroupCheck journeys={journeysOf(g)} sel={sel} disabled={disabled} onToggleGroup={toggleGroup} /></div>
          )}
        </fieldset>
      ))}
      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${btnPrimary} w-full md:w-auto disabled:opacity-50`} onClick={save} disabled={!canSave || disabled} aria-busy={busy === 'affected'}>
            {busy === 'affected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {needs ? 'Confirmar viagens' : 'Salvar viagens'}
          </button>
          {locked && <span className="text-xs text-amber-700 dark:text-amber-300">Salve ou cancele a correção antes de alterar as viagens.</span>}
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef} tabIndex={-1} className={`${sectionCls} space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-amber-400`} aria-label="Viagens alteradas">
      <div className={h3}>Viagens alteradas</div>
      {needs ? (
        <>
          <div role="status" aria-live="polite" className="flex gap-2 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Marque a(s) viagem(ns) alterada(s) para continuar</span>
          </div>
          {body}
        </>
      ) : done ? (
        <div className="text-sm text-slate-700 dark:text-slate-300">{affectedSummary(groups, saved, total)}</div>
      ) : (
        <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer py-3 md:py-0 text-sm text-slate-700 dark:text-slate-300">{affectedSummary(groups, saved, total)}</summary>
          <div className="mt-3">{body}</div>
        </details>
      )}
    </div>
  );
}
