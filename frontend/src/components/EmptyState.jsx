import React from 'react';

/**
 * Componente de Empty State Ilustrado e Elegante.
 * Traz ilustrações vetoriais com luz ambiente da marca, textos humanizados e ações diretas.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  hint,
  className = ''
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 md:p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700/80 bg-gradient-to-b from-slate-50/60 to-slate-100/30 dark:from-slate-800/20 dark:to-slate-900/40 relative overflow-hidden ${className}`}>
      {/* Luz ambiente de fundo (Glow da marca) */}
      <div className="absolute -top-12 -left-12 w-36 h-36 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-36 h-36 bg-indigo-400/10 rounded-full blur-2xl pointer-events-none" />

      {/* Ícone com Medalhão Ilustrado */}
      <div className="relative mb-4">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-indigo-600/15 to-indigo-400/20 dark:from-indigo-600/30 dark:to-indigo-400/40 border border-indigo-600/20 dark:border-indigo-400/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-lg shadow-indigo-600/5">
          {Icon ? <Icon className="w-8 h-8 md:w-10 md:h-10 stroke-[1.75]" /> : null}
        </div>
        {/* Ponto de destaque */}
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-600" />
        </span>
      </div>

      {/* Título e Descrição */}
      <h3 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100 mb-1.5">
        {title}
      </h3>
      {description && (
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed mb-4">
          {description}
        </p>
      )}

      {/* Botão de Ação Opcional */}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-400 hover:from-indigo-700 hover:to-indigo-500 shadow-md shadow-indigo-600/20 active:scale-[0.98] transition-all min-h-[44px] cursor-pointer"
        >
          {actionLabel}
        </button>
      )}

      {/* Dica / Atalho de Teclado */}
      {hint && (
        <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <span>💡</span>
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
}
