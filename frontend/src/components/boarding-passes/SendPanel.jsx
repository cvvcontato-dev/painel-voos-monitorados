import { Mail, MessageCircle, Copy, Sparkles } from 'lucide-react';
import { sectionCls, btnPrimary, btnGhost } from './formState';

const EMAIL_STATUS = {
  sent: { text: 'E-mail enviado', cls: 'text-emerald-700 dark:text-emerald-400' },
  partial: { text: 'E-mail enviado parcialmente', cls: 'text-amber-700 dark:text-amber-400' },
  failed: { text: 'Falha no envio do e-mail', cls: 'text-rose-600 dark:text-rose-400' }
};

export default function SendPanel({
  messages, dirty, saved, busy, emailStatus, useOriginal, onToggleOriginal, onPrepare, onEmail, onCopy
}) {
  const status = EMAIL_STATUS[emailStatus];
  const stale = dirty && saved;
  return (
    <div className={`${sectionCls} lg:sticky lg:top-4 space-y-4`}>
      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Envio</div>

      <div className="flex flex-col gap-2">
        <button type="button" className={btnPrimary} disabled={!!busy} onClick={onPrepare}>
          <Sparkles className="w-4 h-4" /> {busy === 'prepare' ? 'Preparando…' : 'Preparar mensagens'}
        </button>
        <button type="button" className={btnPrimary} disabled={!!busy} onClick={onEmail}>
          <Mail className="w-4 h-4" /> {busy === 'email' ? 'Enviando…' : 'Enviar e-mail(s)'}
        </button>
        {status && <p className={`text-xs ${status.cls}`}>{status.text}</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400">Uma cópia oculta de cada e-mail vai para a agência.</p>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
        <input type="checkbox" checked={useOriginal} onChange={e => onToggleOriginal(e.target.checked)} />
        Usar links originais (se o painel estiver fora do ar)
      </label>

      {stale && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Há alterações não salvas. Clique em <strong>Preparar mensagens</strong> para atualizar.
        </p>
      )}

      {messages.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Preencha os passageiros e clique em <strong>Preparar mensagens</strong> para ver o WhatsApp.
        </p>
      ) : (
        messages.map((m, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700/60 rounded-lg p-3">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              <span className="pii">{m.label}</span>
              <span className="text-slate-400"> · </span>
              <span className={m.phone ? 'pii text-slate-400' : 'text-slate-400'}>{m.phone ? `+${m.phone}` : 'sem número'}</span>
            </div>
            <pre className="pii mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-300 font-sans">
              {m.text}
            </pre>
            <div className="flex gap-2 mt-2">
              <a href={m.waUrl} target="_blank" rel="noreferrer"
                className={`${btnGhost} ${stale ? 'pointer-events-none opacity-50' : ''}`}>
                <MessageCircle className="w-3.5 h-3.5" /> Abrir WhatsApp
              </a>
              <button type="button" className={btnGhost} disabled={stale} onClick={() => onCopy(m.text, 'Mensagem copiada')}>
                <Copy className="w-3.5 h-3.5" /> Copiar mensagem
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
