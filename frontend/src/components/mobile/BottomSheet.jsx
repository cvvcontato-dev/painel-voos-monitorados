import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useMediaQuery';

/**
 * Folha que sobe da parte de baixo (só no celular: `md:hidden`).
 * Fecha com Esc, toque no fundo ou no X; trava a rolagem do fundo; devolve o foco ao fechar.
 */
export default function BottomSheet({ open, onClose, title, titleClassName = '', children }) {
  const closeBtn = useRef(null);
  const anterior = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;           // evita re-rodar o efeito (e roubar foco) a cada render do pai
  const mobile = useIsMobile();

  // A folha só existe no celular: se a tela passar de 768 px (girar o aparelho) com ela aberta, fecha,
  // senão o fundo ficaria sem rolagem e o Esc preso por uma folha invisível.
  useEffect(() => { if (open && !mobile) onCloseRef.current(); }, [open, mobile]);

  useEffect(() => {
    if (!open) return undefined;
    anterior.current = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (anterior.current && document.contains(anterior.current)) anterior.current.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/60" onClick={onClose} />
      <div className="sheet-animate absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t shadow-2xl
                      bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700
                      pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b
                        bg-white/95 border-slate-100 dark:bg-slate-900/95 dark:border-slate-800 backdrop-blur">
          <h2 className={`text-base font-semibold text-slate-900 dark:text-slate-100 truncate ${titleClassName}`}>{title}</h2>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Fechar"
                  className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-2">{children}</div>
      </div>
    </div>
  );
}

/** Linha de ação da folha: ≥ 52 px de altura. Use `href` para link externo. */
export function SheetItem({ icon, label, onClick, href, danger = false, disabled = false, active = false, hint }) {
  const cls = `w-full min-h-[52px] flex items-center gap-3 px-3 rounded-xl text-left text-[15px] transition-colors
    ${danger ? 'text-red-600 dark:text-red-400 active:bg-red-50 dark:active:bg-red-500/10'
             : active ? 'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10'
             : 'text-slate-800 dark:text-slate-100 active:bg-slate-100 dark:active:bg-slate-800'}
    ${disabled ? 'opacity-40 pointer-events-none' : ''}`;
  const corpo = (
    <>
      <span className="shrink-0 w-6 flex justify-center">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{hint}</span>}
      </span>
    </>
  );
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>{corpo}</a>;
  }
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{corpo}</button>;
}
