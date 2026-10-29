export default function Tabs({ active, onChange, tabs }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto bg-white/90 border border-slate-200/90 rounded-2xl p-1.5 mb-6 shadow-sm dark:bg-slate-900/50 dark:backdrop-blur-xl dark:border-slate-800/60">
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer flex-1 shrink-0 whitespace-nowrap justify-center select-none ${
            active === t.value
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-400 text-white shadow-md shadow-indigo-600/30 ring-1 ring-white/20'
              : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
