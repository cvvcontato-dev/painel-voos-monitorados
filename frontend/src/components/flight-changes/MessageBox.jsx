import { useState } from 'react';
import { Copy, MessageCircle, Mail, Loader2 } from 'lucide-react';
import { inputCls, labelCls, btnGhost, btnPrimary, validEmails } from './ui';

// Texto pronto (somente leitura) + copiar, WhatsApp e envio por e-mail.
// `idPrefix` garante ids únicos de label/campo. `readOnly` esconde o envio de e-mail.
export default function MessageBox({ idPrefix, title, text, disabled, busy, emailLabel, onSendEmail, showToast, readOnly, emailBlocked, children }) {
  const [emails, setEmails] = useState('');
  const off = disabled || !!busy;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Mensagem copiada', 'success');
      return;
    } catch { /* cai no fallback */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { showToast('Mensagem copiada', 'success'); return; }
    } catch { /* ignora */ }
    showToast('Não consegui copiar — selecione o texto manualmente', 'error');
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
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${btnGhost} disabled:opacity-50`} onClick={copy} disabled={!text}><Copy className="w-3.5 h-3.5" /> Copiar</button>
        <button type="button" className={`${btnGhost} disabled:opacity-50`} onClick={whatsapp} disabled={disabled || !text}><MessageCircle className="w-3.5 h-3.5" /> Abrir no WhatsApp</button>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className={labelCls} htmlFor={`${idPrefix}-em`}>E-mails (separe por vírgula)</label>
            <input id={`${idPrefix}-em`} className={`${inputCls} pii`} value={emails} placeholder="cliente@email.com"
              onChange={e => setEmails(e.target.value)} disabled={off} />
          </div>
          <button type="button" className={btnPrimary} onClick={send} disabled={off || emailBlocked || !emails.trim()}
            title={emailBlocked ? 'Salve ou cancele a correção antes de enviar' : undefined} aria-busy={busy === 'email'}>
            {busy === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} {emailLabel}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
