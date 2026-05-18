import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Settings, Activity } from 'lucide-react';
import logo from './assets/logo.png';
import Tabs from './components/Tabs';
import Toast from './components/Toast';
import SettingsModal from './components/SettingsModal';
import PrecosTab from './components/PrecosTab';
import StatusTab from './components/StatusTab';
import { useTheme } from './hooks/useTheme';
import ThemeToggle from './components/ThemeToggle';

const TABS = [
  { value: 'precos', label: 'Preços', icon: <DollarSign className="w-4 h-4" /> },
  { value: 'status', label: 'Status', icon: <Activity className="w-4 h-4" /> }
];

function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'precos');
  const [toast, setToast] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const showToast = useCallback((message, type = 'info') => setToast({ message, type }), []);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Clube do Voo" className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500/30 shadow-lg shadow-indigo-500/20" />
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-transparent dark:from-white dark:to-slate-400">Monitoramento de Voos Prime</h1>
            <p className="text-slate-600 text-sm mt-1 dark:text-slate-400">Painel administrativo de passagens aéreas monitoradas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={()=>setSettingsOpen(true)} className="p-2.5 rounded-lg transition-colors cursor-pointer border
                                                                  bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200
                                                                  dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white dark:border-slate-700/50" title="Configurações">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <Tabs active={activeTab} onChange={setActiveTab} tabs={TABS} />

      {activeTab === 'precos' ? <PrecosTab showToast={showToast} /> : <StatusTab showToast={showToast} />}

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onToast={showToast} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default App;
