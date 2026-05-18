import { useState, useEffect } from 'react';
import { X, Settings, Eye, EyeOff } from 'lucide-react';
import api from '../hooks/useApi';

export default function SettingsModal({ isOpen, onClose, onToast }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [showToken, setShowToken] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.get('/api/settings').then(r => {
        setSettings(r.data);
        setForm({
          check_interval_hours: r.data.check_interval_hours,
          max_concurrent_scrapers: r.data.max_concurrent_scrapers,
          alert_reset_threshold: r.data.alert_reset_threshold,
          telegram_bot_token: '',
          email_host: r.data.email_host || 'smtp.gmail.com',
          email_port: r.data.email_port || 465,
          email_user: '',
          email_pass: '',
          email_from: ''
        });
      });
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (form.check_interval_hours) payload.check_interval_hours = parseInt(form.check_interval_hours);
      if (form.max_concurrent_scrapers) payload.max_concurrent_scrapers = parseInt(form.max_concurrent_scrapers);
      if (form.alert_reset_threshold) payload.alert_reset_threshold = parseFloat(form.alert_reset_threshold);
      if (form.telegram_bot_token) payload.telegram_bot_token = form.telegram_bot_token;
      if (form.email_host) payload.email_host = form.email_host;
      if (form.email_port) payload.email_port = form.email_port;
      if (form.email_user) payload.email_user = form.email_user;
      if (form.email_pass) payload.email_pass = form.email_pass;
      if (form.email_from) payload.email_from = form.email_from;

      await api.put('/api/settings', payload);
      onToast('Configurações salvas com sucesso!', 'success');
      onClose();
    } catch (e) {
      onToast('Erro ao salvar configurações', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !settings) return null;

  const inputCls = "w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border text-sm " +
                   "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
                   "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-500 dark:border-slate-700";
  const labelCls = "text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white border border-slate-200 dark:bg-slate-900/90 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden modal-animate max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700/50">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" /> Configurações do Sistema
          </h2>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Scheduler */}
          <div>
            <h3 className="text-sm font-semibold text-indigo-400 mb-3 uppercase tracking-wider">Agendador</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={labelCls}>Intervalo (h)</label>
                <input type="number" min="1" value={form.check_interval_hours || ''} onChange={e => setForm({...form, check_interval_hours: e.target.value})} className={inputCls} /></div>
              <div><label className={labelCls}>Scrapers</label>
                <input type="number" min="1" max="10" value={form.max_concurrent_scrapers || ''} onChange={e => setForm({...form, max_concurrent_scrapers: e.target.value})} className={inputCls} /></div>
              <div><label className={labelCls}>Reset %</label>
                <input type="number" step="0.01" value={form.alert_reset_threshold || ''} onChange={e => setForm({...form, alert_reset_threshold: e.target.value})} className={inputCls} /></div>
            </div>
          </div>

          {/* Telegram */}
          <div>
            <h3 className="text-sm font-semibold text-indigo-400 mb-3 uppercase tracking-wider">Telegram</h3>
            <label className={labelCls}>Bot Token {settings.telegram_bot_token_set && <span className="text-emerald-600 dark:text-emerald-400 ml-1">✓ configurado</span>}</label>
            <div className="relative">
              <input type={showToken ? 'text' : 'password'} value={form.telegram_bot_token} onChange={e => setForm({...form, telegram_bot_token: e.target.value})} className={inputCls} placeholder={settings.telegram_bot_token_set ? '••••••••' : 'Cole o token aqui'} />
              <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer">
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Email */}
          <div>
            <h3 className="text-sm font-semibold text-indigo-400 mb-3 uppercase tracking-wider">E-mail (SMTP)</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className={labelCls}>Host</label>
                <input value={form.email_host || ''} onChange={e => setForm({...form, email_host: e.target.value})} className={inputCls} /></div>
              <div><label className={labelCls}>Porta</label>
                <input type="number" value={form.email_port || ''} onChange={e => setForm({...form, email_port: e.target.value})} className={inputCls} /></div>
            </div>
            <div className="space-y-3">
              <div><label className={labelCls}>Usuário {settings.email_user_set && <span className="text-emerald-600 dark:text-emerald-400 ml-1">✓</span>}</label>
                <input value={form.email_user} onChange={e => setForm({...form, email_user: e.target.value})} className={inputCls} placeholder={settings.email_user_set ? '••••••••' : 'email@exemplo.com'} /></div>
              <div><label className={labelCls}>Senha {settings.email_pass_set && <span className="text-emerald-600 dark:text-emerald-400 ml-1">✓</span>}</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={form.email_pass} onChange={e => setForm({...form, email_pass: e.target.value})} className={inputCls} placeholder={settings.email_pass_set ? '••••••••' : 'Senha do app'} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div><label className={labelCls}>Remetente (From)</label>
                <input value={form.email_from || ''} onChange={e => setForm({...form, email_from: e.target.value})} className={inputCls} placeholder="noreply@exemplo.com" /></div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95 disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  );
}
