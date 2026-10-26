import { useState } from 'react';
import { inputCls, labelCls, btnPrimary, btnGhost, isoToLocalInput, localInputToIso, isoToDateLabel, sameIsoDate } from './ui';

// Mini-formulário para corrigir o que a IA leu no voucher novo.
export default function CorrectionForm({ unified, saving, onSave, onCancel, onNoChange, showToast }) {
  const [trips, setTrips] = useState(() =>
    (unified?.trips || []).map(t => ({
      flightNumber: t.flightNumber || '',
      dep: isoToLocalInput(t.departure?.datetime),
      arr: isoToLocalInput(t.arrival?.datetime),
      from: t.departure?.airport || '',
      to: t.arrival?.airport || ''
    }))
  );
  const patch = (i, p) => setTrips(ts => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));

  function submit(e) {
    e.preventDefault();
    if (saving) return;
    const out = JSON.parse(JSON.stringify(unified));
    for (let i = 0; i < trips.length; i++) {
      const f = trips[i];
      const orig = out.trips[i];
      const label = `Trecho ${i + 1}`;
      if (!/^[A-Z]{3}$/.test(f.from) || !/^[A-Z]{3}$/.test(f.to)) { showToast(`${label}: os aeroportos devem ter 3 letras.`, 'error'); return; }
      if (!f.dep || !f.arr) { showToast(`${label}: informe partida e chegada.`, 'error'); return; }
      if (f.flightNumber.trim() !== (orig.flightNumber || '')) orig.flightNumber = f.flightNumber.trim();
      // Só reescreve o horário se o usuário mudou (preserva segundos/offset originais).
      const depChanged = f.dep !== isoToLocalInput(orig.departure?.datetime);
      const arrChanged = f.arr !== isoToLocalInput(orig.arrival?.datetime);
      const oldDep = orig.departure?.datetime;
      orig.departure = { ...orig.departure, airport: f.from, ...(depChanged ? { datetime: localInputToIso(f.dep) } : {}) };
      // dateLabel acompanha a data de partida, mas só se o dia/mês/ano mudou.
      if (depChanged && !sameIsoDate(oldDep, orig.departure.datetime)) {
        const lbl = isoToDateLabel(orig.departure.datetime);
        if (lbl) orig.dateLabel = lbl;
      }
      orig.arrival = { ...orig.arrival, airport: f.to, ...(arrChanged ? { datetime: localInputToIso(f.arr) } : {}) };
    }
    if (JSON.stringify(out) === JSON.stringify(unified)) { onNoChange?.(); return; }
    onSave(out);
  }

  return (
    <form onSubmit={submit} className="space-y-3 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 md:max-h-96 md:overflow-y-auto" aria-busy={saving}>
      {trips.map((t, i) => (
        <fieldset key={i} className="grid sm:grid-cols-2 gap-2" disabled={saving}>
          <legend className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Trecho {i + 1}{unified.trips[i]?.direction ? ` — ${unified.trips[i].direction}` : ''}
          </legend>
          <div>
            <label className={labelCls} htmlFor={`cf-fn-${i}`}>Voo</label>
            <input id={`cf-fn-${i}`} className={inputCls} value={t.flightNumber} onChange={e => patch(i, { flightNumber: e.target.value })} />
          </div>
          <div />
          <div>
            <label className={labelCls} htmlFor={`cf-fo-${i}`}>Origem (3 letras)</label>
            <input id={`cf-fo-${i}`} className={inputCls} maxLength={3} value={t.from} onChange={e => patch(i, { from: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`cf-fd-${i}`}>Destino (3 letras)</label>
            <input id={`cf-fd-${i}`} className={inputCls} maxLength={3} value={t.to} onChange={e => patch(i, { to: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`cf-fp-${i}`}>Partida</label>
            <input id={`cf-fp-${i}`} type="datetime-local" className={inputCls} value={t.dep} onChange={e => patch(i, { dep: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`cf-fc-${i}`}>Chegada</label>
            <input id={`cf-fc-${i}`} type="datetime-local" className={inputCls} value={t.arr} onChange={e => patch(i, { arr: e.target.value })} />
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <button type="submit" className={`${btnPrimary} flex-1 md:flex-none`} disabled={saving}>{saving ? 'Salvando…' : 'Salvar correções'}</button>
        <button type="button" className={`${btnGhost} flex-1 md:flex-none`} onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  );
}
