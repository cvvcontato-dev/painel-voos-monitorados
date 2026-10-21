import { useEffect, useRef, useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { sectionCls, btnPrimary } from './ui';

const h3 = 'text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider';
const CARRIER = { azul: 'Azul', gol: 'Gol', latam: 'LATAM' };

const sortNum = (a) => [...a].sort((x, y) => x - y);
const sameSet = (a, b) => a.length === b.length && sortNum(a).every((v, i) => v === sortNum(b)[i]);

// Resumo "Trechos: todos" / "Trechos marcados: ...". Exportado para reuso.
export function affectedSummary(groups, affected, total) {
  if (!Array.isArray(affected) || affected.length === 0 || affected.length >= total) return 'Trechos: todos';
  const labels = [];
  for (const g of groups || []) for (const t of g.trips || []) if (affected.includes(t.index)) labels.push(t.label);
  return `Trechos marcados: ${labels.join('; ') || affected.length}`;
}

function GroupCheck({ group, sel, disabled, onToggleGroup }) {
  const ref = useRef(null);
  const idx = group.trips.map(t => t.index);
  const n = idx.filter(i => sel.includes(i)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = n > 0 && n < idx.length; });
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
      <input ref={ref} type="checkbox" checked={idx.length > 0 && n === idx.length} disabled={disabled}
        onChange={() => onToggleGroup(idx, n !== idx.length)} />
      Marcar a reserva toda
    </label>
  );
}

// Seção "Trechos alterados". `onSave(affected)` devolve Promise<boolean> (true = salvo).
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
  const toggle = (i) => setSel(s => (s.includes(i) ? s.filter(x => x !== i) : [...s, i]));
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
          <div className="space-y-1">
            {(g.trips || []).map(t => (
              <label key={t.index} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input type="checkbox" checked={sel.includes(t.index)} onChange={() => toggle(t.index)} disabled={disabled} />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
          {(g.trips || []).length > 1 && (
            <div className="mt-1"><GroupCheck group={g} sel={sel} disabled={disabled} onToggleGroup={toggleGroup} /></div>
          )}
        </fieldset>
      ))}
      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${btnPrimary} disabled:opacity-50`} onClick={save} disabled={!canSave || disabled} aria-busy={busy === 'affected'}>
            {busy === 'affected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {needs ? 'Confirmar trechos' : 'Salvar trechos'}
          </button>
          {locked && <span className="text-xs text-amber-700 dark:text-amber-300">Salve ou cancele a correção antes de alterar os trechos.</span>}
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef} tabIndex={-1} className={`${sectionCls} space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-amber-400`} aria-label="Trechos alterados">
      <div className={h3}>Trechos alterados</div>
      {needs ? (
        <>
          <div role="status" aria-live="polite" className="flex gap-2 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Marque o(s) trecho(s) alterado(s) para continuar</span>
          </div>
          {body}
        </>
      ) : done ? (
        <div className="text-sm text-slate-700 dark:text-slate-300">{affectedSummary(groups, saved, total)}</div>
      ) : (
        <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer text-sm text-slate-700 dark:text-slate-300">{affectedSummary(groups, saved, total)}</summary>
          <div className="mt-3">{body}</div>
        </details>
      )}
    </div>
  );
}
