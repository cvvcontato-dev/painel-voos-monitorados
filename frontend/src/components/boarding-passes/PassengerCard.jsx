import { Plus, Trash2, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import { inputCls, labelCls, sectionCls, btnGhost, badgeFor } from './formState';

export default function PassengerCard({
  index, passenger, onChange, onSegmentChange, onSegmentParse, onAddSegment, onRemoveSegment, onCopy
}) {
  return (
    <div className={sectionCls}>
      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
        Passageiro {index + 1}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>Nome e sobrenome *</label>
          <input className={`${inputCls} pii`} value={passenger.name} placeholder="Maria Silva"
            onChange={e => onChange({ name: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>E-mail (opcional)</label>
          <input className={`${inputCls} pii`} type="email" value={passenger.email} placeholder="cliente@email.com"
            onChange={e => onChange({ email: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>WhatsApp (opcional)</label>
          <input className={`${inputCls} pii`} value={passenger.phone} placeholder="(75) 99999-9999"
            onChange={e => onChange({ phone: e.target.value })} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {passenger.segments.map((s, si) => {
          const badge = badgeFor(s.parsed);
          return (
            <div key={s.key}>
              <label className={labelCls}>Cartão de embarque — {s.label || `Trecho ${si + 1}`}</label>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={s.url}
                  placeholder="Cole aqui o link do cartão de embarque"
                  onChange={e => onSegmentChange(si, { url: e.target.value, parsed: null, error: null })}
                  onBlur={e => onSegmentParse(si, e.target.value)}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text');
                    if (text) setTimeout(() => onSegmentParse(si, text), 0);
                  }}
                />
                {passenger.segments.length > 1 && (
                  <button type="button" className={btnGhost} title="Remover trecho" onClick={() => onRemoveSegment(si)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {s.error && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {s.error}
                </p>
              )}
              {badge && (
                <div className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${
                  badge.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                }`}>
                  {badge.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  <span>{badge.text}</span>
                  {s.parsed?.cleanUrl && (
                    <button type="button" className="underline cursor-pointer inline-flex items-center gap-1"
                      onClick={() => onCopy(s.parsed.cleanUrl, 'Link limpo copiado')}>
                      <Copy className="w-3 h-3" /> copiar link limpo
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className={btnGhost} onClick={onAddSegment}>
          <Plus className="w-3.5 h-3.5" /> trecho
        </button>
      </div>
    </div>
  );
}
