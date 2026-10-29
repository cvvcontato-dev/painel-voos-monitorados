import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Settings, Eye, EyeOff, UploadCloud, Image as ImageIcon, Check } from 'lucide-react';
import api from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import UsersTab from './UsersTab';
import BackupsPanel from './BackupsPanel';
import useBackClose from '../hooks/useBackClose';

export default function SettingsModal({ isOpen, onClose, onToast }) {
  useBackClose(isOpen, onClose);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [showToken, setShowToken] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const { currentUser } = useAuth();
  const [innerTab, setInnerTab] = useState('geral');
  const [logoUrl, setLogoUrl] = useState('/voucher-assets/agency-logo.png');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const logoInputRef = useRef(null);

  const fetchLogo = useCallback(() => {
    api.get('/api/settings/logo').then(r => {
      if (r.data?.url) setLogoUrl(r.data.url);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchLogo();
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
      }).catch(() => {
        onToast('Erro ao carregar configurações', 'error');
        onClose();
      });
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (form.check_interval_hours) payload.check_interval_hours = parseInt(form.check_interval_hours);
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

  const handleSaveLogo = async () => {
    if (!logoFile) return;
    setSavingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', logoFile);
      const res = await api.post('/api/settings/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onToast('Logo da agência atualizada com sucesso!', 'success');
      setLogoUrl(res.data.url || `/voucher-assets/agency-logo.png?v=${Date.now()}`);
      setLogoFile(null);
      setLogoPreview(null);
      // Dispara evento global para que outros componentes atualizem o logo se necessário
      window.dispatchEvent(new CustomEvent('agency:logo-updated'));
    } catch (err) {
      onToast(err.response?.data?.error || 'Erro ao atualizar logo', 'error');
    } finally {
      setSavingLogo(false);
    }
  };

  if (!isOpen) return null;

  const inputCls = "w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border text-sm " +
                   "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
                   "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-500 dark:border-slate-700";
  const labelCls = "text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider";

  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center md:p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full md:max-w-lg bg-white border border-slate-200 dark:bg-slate-900 md:dark:bg-slate-900/90 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl md:rounded-2xl overflow-hidden modal-animate h-[100dvh] md:h-auto md:max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 md:static bg-white dark:bg-slate-900 md:bg-transparent md:dark:bg-transparent flex justify-between items-center px-4 py-2 md:p-6 border-b border-slate-200 dark:border-slate-700/50">
          <h2 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" /> Configurações do Sistema
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="w-11 h-11 -mr-2 md:w-auto md:h-auto md:mr-0 flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-4 md:px-6 pt-2 md:pt-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto md:overflow-visible">
          <button onClick={() => setInnerTab('geral')}
            className={`min-h-[44px] md:min-h-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${innerTab === 'geral' ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}>
            Geral
          </button>
          <button onClick={() => setInnerTab('marca')}
            className={`min-h-[44px] md:min-h-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${innerTab === 'marca' ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}>
            Marca & Logo
          </button>
          {currentUser?.role === 'admin' && (
            <button onClick={() => setInnerTab('usuarios')}
              className={`min-h-[44px] md:min-h-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${innerTab === 'usuarios' ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}>
              Usuários
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button onClick={() => setInnerTab('backups')}
              className={`min-h-[44px] md:min-h-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${innerTab === 'backups' ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}>
              Backup
            </button>
          )}
        </div>

        {innerTab === 'geral' ? (
          <>
            {!settings ? (
              <div className="p-6 text-center text-slate-400 text-sm">Carregando…</div>
            ) : (
              <div className="p-4 md:p-6 space-y-6">
                {/* Scheduler */}
                <div>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-3 uppercase tracking-wider">Agendador</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><label className={labelCls}>Intervalo (h)</label>
                      <input type="number" min="1" value={form.check_interval_hours || ''} onChange={e => setForm({...form, check_interval_hours: e.target.value})} className={inputCls} /></div>
                    <div><label className={labelCls}>Consultas simultâneas</label>
                      <input type="number" min="1" max="10" value={1} readOnly title="Os preços são consultados um por vez para reduzir a carga e evitar sobreposição." className={inputCls} /></div>
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
                    <button type="button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? 'Ocultar token' : 'Mostrar token'} className="absolute right-3 top-2.5 max-md:right-0 max-md:top-0 max-md:w-11 max-md:h-11 max-md:flex max-md:items-center max-md:justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer">
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
                        <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-2.5 max-md:right-0 max-md:top-0 max-md:w-11 max-md:h-11 max-md:flex max-md:items-center max-md:justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer">
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div><label className={labelCls}>Remetente (From)</label>
                      <input value={form.email_from || ''} onChange={e => setForm({...form, email_from: e.target.value})} className={inputCls} placeholder="noreply@exemplo.com" /></div>
                  </div>
                </div>
              </div>
            )}
            <div className="sticky bottom-0 z-10 md:static bg-white dark:bg-slate-900 md:bg-transparent md:dark:bg-transparent p-4 md:p-6 border-t border-slate-200 dark:border-slate-700/50 flex justify-end gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6">
              <button onClick={onClose} className="flex-1 md:flex-none min-h-[44px] md:min-h-0 px-5 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 md:flex-none min-h-[44px] md:min-h-0 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          </>
        ) : innerTab === 'marca' ? (
          <div className="p-4 md:p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-indigo-400 mb-1 uppercase tracking-wider">Identidade Visual da Agência</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Esta logo é utilizada automaticamente nos Stories de depoimentos, nos Vouchers, nos e-mails e nos itinerários públicos.
              </p>

              <div className="flex flex-col sm:flex-row gap-6 items-center">
                {/* Visualizador da Logo */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-36 h-36 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden shadow-inner">
                    <img
                      src={logoPreview || logoUrl}
                      alt="Logo da Agência"
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400">Visualização em fundo escuro</span>
                </div>

                {/* Ações de Upload */}
                <div className="flex-1 space-y-3 w-full">
                  <div
                    onClick={() => logoInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl p-4 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-800/30"
                  >
                    <UploadCloud className="w-6 h-6 mx-auto text-indigo-500 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {logoFile ? logoFile.name : 'Clique para selecionar nova imagem de logo'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">PNG com fundo transparente (recomendado), JPG, WebP ou SVG</p>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setLogoFile(file);
                          setLogoPreview(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden"
                    />
                  </div>

                  {logoFile && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveLogo}
                        disabled={savingLogo}
                        className="flex-1 min-h-[44px] py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        {savingLogo ? 'Enviando...' : 'Salvar Nova Logo'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                        className="min-h-[44px] py-2.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : innerTab === 'backups' ? (
          <div className="p-4 md:p-6">
            <BackupsPanel onToast={onToast} />
          </div>
        ) : (
          <div className="p-4 md:p-6">
            <UsersTab onToast={onToast} />
          </div>
        )}
      </div>
    </div>
  );
}
