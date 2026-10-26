import { useState } from 'react';
import { Copy, MessageCircle, Mail, Loader2, Eye } from 'lucide-react';
import { inputCls, labelCls, btnGhost, btnPrimary, validEmails, copyText } from './ui';

// Texto pronto (somente leitura) + copiar, WhatsApp e envio por e-mail.
// `idPrefix` garante ids únicos de label/campo. `readOnly` esconde o envio de e-mail.
export default function MessageBox({ idPrefix, title, text, busy, emailLabel, onSendEmail, showToast, readOnly, blocked, onPreview, previewDisabled, previewTitle, children }) {
  const [emails, setEmails] = useState('');
  const off = !!busy;
  const blockTitle = blocked ? 'Salve ou cancele a correção antes de usar a mensagem' : undefined;

  async function copy() {
    if (await copyText(text)) showToast('Mensagem copiada', 'success');
    else showToast('Não consegui copiar — selecione o texto manualmente', 'error');
  }

  function whatsapp() {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  async function send() {
    if (!validEmails(emails)) { showToast('Informe e-mails válidos, separados por vírgula.', 'error'); return; }
    await onSendEmail(emails.trim());
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-msg`}>{title}</label>
        <textarea id={`${idPrefix}-msg`} readOnly rows={9} value={text || ''} className={`${inputCls} font-mono text-xs max-h-72 overflow-y-auto pii`} />
      </div>
      {blocked && <div className="text-xs text-amber-700 dark:text-amber-300">Correção não salva — a mensagem abaixo é a da última versão salva</div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${btnGhost} flex-1 md:flex-none disabled:opacity-50`} onClick={copy} disabled={!text || blocked} title={blockTitle}><Copy className="w-3.5 h-3.5" /> Copiar</button>
        <button type="button" className={`${btnGhost} flex-1 md:flex-none disabled:opacity-50`} onClick={whatsapp} disabled={!text || blocked} title={blockTitle}><MessageCircle className="w-3.5 h-3.5" /> Abrir no WhatsApp</button>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-0 w-full md:w-auto md:min-w-[200px]">
            <label className={labelCls} htmlFor={`${idPrefix}-em`}>E-mails (separe por vírgula)</label>
            <input id={`${idPrefix}-em`} className={`${inputCls} pii`} value={emails} placeholder="cliente@email.com"
              onChange={e => setEmails(e.target.value)} disabled={off} />
          </div>
          <button type="button" className={`${btnPrimary} w-full md:w-auto`} onClick={send} disabled={off || blocked || !emails.trim()}
            title={blocked ? 'Salve ou cancele a correção antes de enviar' : undefined} aria-busy={busy === 'email'}>
            {busy === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} {emailLabel}
          </button>
          {onPreview && (
            <button type="button" className={`${btnGhost} w-full md:w-auto disabled:opacity-50`} onClick={onPreview} disabled={previewDisabled} title={previewTitle}>
              <Eye className="w-3.5 h-3.5" /> Ver modelo do e-mail
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
