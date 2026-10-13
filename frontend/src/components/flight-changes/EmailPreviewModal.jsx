import { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import * as api from '../../api/flightChangeClient';
import { errorMessage } from '../../api/flightChangeClient';
import { btnGhost } from './ui';

// Modal com o modelo do e-mail (assunto + HTML em iframe sandbox, sem scripts).
export default function EmailPreviewModal({ id, kind, onClose, showToast }) {
  const [data, setData] = useState(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancel = false;
    api.emailPreview(id, kind)
      .then(d => { if (!cancel) setData(d); })
      .catch(e => { if (!cancel) { showToast(errorMessage(e, 'Não consegui carregar o modelo do e-mail'), 'error'); onCloseRef.current(); } });
    return () => { cancel = true; };
  }, [id, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); }
      else if (e.key === 'Tab') { // o botão de fechar é o único controle: mantém o foco nele
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="email-preview-title"
        className="relative w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div id="email-preview-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100 pii break-words">
            {data ? `Assunto: ${data.subject}` : 'Modelo do e-mail'}
          </div>
          <button ref={closeRef} type="button" className={btnGhost} onClick={onClose} aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        {data ? (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 flex justify-center">
            <iframe sandbox="" srcDoc={data.html} title="Modelo do e-mail" className="bg-white border-0 rounded w-full max-w-[640px]" style={{ height: '70vh' }} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center" aria-busy="true"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
        )}
      </div>
    </div>
  );
}
