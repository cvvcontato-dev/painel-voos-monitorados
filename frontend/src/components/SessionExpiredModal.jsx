export default function SessionExpiredModal() {
  function handleReturn() {
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⏱</span>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Sessão expirada</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Sua sessão expirou ou foi encerrada. Faça login novamente para continuar.
        </p>
        <button
          onClick={handleReturn}
          className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors"
        >
          Voltar ao login
        </button>
      </div>
    </div>
  );
}
