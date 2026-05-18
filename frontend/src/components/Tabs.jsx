export default function Tabs({ active, onChange, tabs }) {
  return (
    <div className="flex gap-1 bg-white/80 border border-slate-200 rounded-xl p-1 mb-6 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50">
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer flex-1 justify-center ${
            active === t.value
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
