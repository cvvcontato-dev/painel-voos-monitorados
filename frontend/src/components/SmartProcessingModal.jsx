import React, { useState, useEffect } from 'react';
import { Sparkles, Check, RefreshCw, AlertCircle, X, ShieldCheck } from 'lucide-react';

export default function SmartProcessingModal({
  isOpen,
  title = "Processando com Inteligência Artificial",
  subtitle = "Nosso sistema está analisando seu documento",
  steps = [
    { title: "Lendo dados da reserva com IA...", desc: "Interpretando comprovante, localizadores e cia aérea" },
    { title: "Formatando arte e itinerário...", desc: "Estruturando trechos, conexões, passageiros e valores" },
    { title: "Voucher e itinerário prontos!", desc: "Gerando documento oficial e link público seguro" }
  ],
  isComplete = false,
  error = null,
  onClose
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(15);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStepIndex(0);
      setProgressPercent(15);
      return;
    }

    if (error) return;

    if (isComplete) {
      setCurrentStepIndex(steps.length);
      setProgressPercent(100);
      const timer = setTimeout(() => {
        onClose?.();
      }, 750);
      return () => clearTimeout(timer);
    }

    // Progressão suave do tempo durante a espera da IA
    setCurrentStepIndex(0);
    setProgressPercent(20);

    const timer1 = setTimeout(() => {
      setCurrentStepIndex(1);
      setProgressPercent(55);
    }, 3200);

    const timer2 = setTimeout(() => {
      setCurrentStepIndex(2);
      setProgressPercent(85);
    }, 7200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isOpen, isComplete, error, steps.length, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 relative overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Barra superior de gradiente decorativa */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-500" />

        {/* Cabeçalho */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-sm">
            {error ? (
              <AlertCircle className="w-6 h-6 text-rose-500" />
            ) : isComplete ? (
              <Check className="w-6 h-6 text-emerald-500 animate-bounce" />
            ) : (
              <Sparkles className="w-6 h-6 animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                Inteligência Artificial
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {progressPercent}%
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1 leading-snug">
              {title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {error ? 'Ocorreu uma instabilidade na operação' : subtitle}
            </p>
          </div>

          {error && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Barra de Progresso Suave */}
        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mb-6 overflow-hidden">
          <div
            className={`h-full transition-all duration-700 ease-out rounded-full ${
              error
                ? 'bg-rose-500'
                : isComplete
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Lista de Etapas (1/3, 2/3, 3/3) */}
        {!error ? (
          <div className="space-y-4">
            {steps.map((st, idx) => {
              const isPast = isComplete || currentStepIndex > idx;
              const isCurrent = !isComplete && currentStepIndex === idx;
              const isFuture = !isComplete && currentStepIndex < idx;

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-3.5 p-3 rounded-2xl transition-all ${
                    isCurrent
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/50 shadow-sm'
                      : isPast
                      ? 'bg-slate-50/60 dark:bg-slate-800/20'
                      : 'opacity-40'
                  }`}
                >
                  {/* Ícone de status do passo */}
                  <div className="mt-0.5 shrink-0">
                    {isPast ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm shadow-emerald-500/20">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : isCurrent ? (
                      <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/30">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-700 text-slate-400 flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  {/* Conteúdo da etapa */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold leading-tight ${
                        isCurrent
                          ? 'text-indigo-950 dark:text-indigo-200'
                          : isPast
                          ? 'text-slate-800 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {idx + 1}/{steps.length} {st.title}
                    </p>
                    {st.desc && (
                      <p
                        className={`text-xs mt-0.5 leading-relaxed ${
                          isCurrent
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {st.desc}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Bloco de Erro */
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 space-y-3">
            <p className="text-xs leading-relaxed">{error}</p>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm cursor-pointer"
              >
                Fechar e tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* Rodapé Seguro */}
        {!error && (
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
              Processamento seguro & criptografado
            </span>
            <span>Clube do Voo AI</span>
          </div>
        )}
      </div>
    </div>
  );
}
