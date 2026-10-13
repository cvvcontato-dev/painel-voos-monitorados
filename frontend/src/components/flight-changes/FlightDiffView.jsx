import { ArrowRight } from 'lucide-react';

const CAMPO = {
  partida: 'Partida', chegada: 'Chegada', voo: 'Voo', origem: 'Origem', destino: 'Destino', classe: 'Classe',
  departure: 'Partida', arrival: 'Chegada', flightNumber: 'Voo', origin: 'Origem', destination: 'Destino', cabinClass: 'Classe'
};
const campoLabel = (c) => CAMPO[c] || CAMPO[String(c || '').toLowerCase()] || String(c || '');

const tripStyle = {
  igual: { box: 'border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400', tag: 'Sem alteração' },
  alterado: { box: 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-slate-800 dark:text-slate-100', tag: 'Alterado' },
  novo: { box: 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-slate-800 dark:text-slate-100', tag: 'Novo trecho' },
  removido: { box: 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-slate-800 dark:text-slate-100', tag: 'Trecho removido' }
};

const noteCls = {
  amber: 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10',
  green: 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10',
  red: 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10'
};

export function tripSummary(t) {
  if (!t) return '';
  const o = t.departure?.airport || '?';
  const d = t.arrival?.airport || '?';
  return `${t.direction ? t.direction + ': ' : ''}${o} → ${d}${t.dateLabel ? ' · ' + t.dateLabel : ''}${t.flightNumber ? ' · ' + t.flightNumber : ''}`;
}

function Trip({ t }) {
  const st = tripStyle[t.status] || tripStyle.igual;
  const ref = t.new || t.old;
  const changes = Array.isArray(t.changes) ? t.changes : [];
  const body = (
    <>
      <div className="font-medium text-sm">{tripSummary(ref) || t.direction || 'Trecho'}</div>
      {changes.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-sm">
          {changes.map((c, i) => (
            <li key={`${c.campo}-${i}`}>
              <span className="font-medium">{campoLabel(c.campo)}:</span>{' '}
              <span className="line-through opacity-70">{String(c.antes ?? '—')}</span>{' '}
              <ArrowRight className="inline w-3.5 h-3.5 -mt-0.5" />{' '}
              <span className="font-semibold">{String(c.depois ?? '—')}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  if (t.status === 'igual') {
    return (
      <details className={`rounded-lg border px-3 py-2 ${st.box}`}>
        <summary className="cursor-pointer text-xs">{st.tag} — {tripSummary(ref) || 'Trecho'}</summary>
        <div className="mt-1">{body}</div>
      </details>
    );
  }
  return (
    <div className={`rounded-lg border px-3 py-2 ${st.box}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold opacity-80">{st.tag}</div>
      {body}
    </div>
  );
}

function Note({ tone, children }) {
  return <div className={`rounded-lg border px-3 py-2 text-sm text-slate-800 dark:text-slate-100 ${noteCls[tone]}`}>{children}</div>;
}

const names = (l) => l.map(p => p?.name || String(p)).join(', ');

export default function FlightDiffView({ diff }) {
  if (!diff) return null;
  const add = diff.passengers?.adicionados || [];
  const rem = diff.passengers?.removidos || [];
  return (
    <div className="space-y-2">
      {(diff.trips || []).map((t, i) => <Trip key={`${t.direction || 't'}-${i}`} t={t} />)}
      {diff.locatorChanged && (
        <Note tone="amber">
          <span className="font-medium">Localizador:</span>{' '}
          <span className="line-through opacity-70">{diff.locatorChanged.antes}</span>{' '}
          <ArrowRight className="inline w-3.5 h-3.5 -mt-0.5" />{' '}
          <span className="font-semibold">{diff.locatorChanged.depois}</span>
        </Note>
      )}
      {add.length > 0 && <Note tone="green"><span className="font-medium">Passageiros adicionados:</span> {names(add)}</Note>}
      {rem.length > 0 && <Note tone="red"><span className="font-medium">Passageiros removidos:</span> {names(rem)}</Note>}
      {diff.baggageChanged && <Note tone="amber"><span className="font-medium">Bagagem alterada</span> em relação ao voucher antigo.</Note>}
    </div>
  );
}
