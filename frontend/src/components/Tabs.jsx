export default function Tabs({ active, onChange, tabs }) {
  return (
    <div className="flex gap-1 bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-xl p-1 mb-6">
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer flex-1 justify-center ${
            active === t.value
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
