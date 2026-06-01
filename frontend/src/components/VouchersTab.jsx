import { useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  UploadCloud, FileText, Save, Download, Trash2, Plus, X, RefreshCw, Settings as SettingsIcon, ChevronDown, ChevronUp, Mail
} from 'lucide-react';
import * as api from '../api/voucherClient';

const inputCls =
  "w-full px-3 py-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border text-sm " +
  "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
  "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";

const labelCls = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";

const sectionCls =
  "border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 bg-white/70 dark:bg-slate-900/30";

export default function VouchersTab({ showToast }) {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ contact_phone: '', contact_email: '', contact_site: '', contact_extra: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  // Modo de upload: 'single' (1 voucher) ou 'merge' (ida + volta separados)
  const [uploadMode, setUploadMode] = useState('single');
  const [outboundFile, setOutboundFile] = useState(null);
  const [returnFile, setReturnFile] = useState(null);
  const [merging, setMerging] = useState(false);
  const fileInputRef = useRef(null);
  const outboundInputRef = useRef(null);
  const returnInputRef = useRef(null);
  const iframeRef = useRef(null);

  const { register, control, handleSubmit, reset } = useForm({
    defaultValues: { reservation: {}, passengers: [], trips: [] },
  });
  const passengers = useFieldArray({ control, name: 'passengers' });
  const trips = useFieldArray({ control, name: 'trips' });

  useEffect(() => { refresh(); loadSettings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSettings() {
    try {
      const s = await api.getSettings();
      setSettings({
        contact_phone: s?.contact_phone || '',
        contact_email: s?.contact_email || '',
        contact_site: s?.contact_site || '',
        contact_extra: s?.contact_extra || '',
      });
    } catch (err) {
      // silencioso — settings ainda podem não existir
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const s = await api.updateSettings(settings);
      setSettings({
        contact_phone: s?.contact_phone || '',
        contact_email: s?.contact_email || '',
        contact_site: s?.contact_site || '',
        contact_extra: s?.contact_extra || '',
      });
      // Recarrega o preview para refletir as novas infos de contato
      if (selectedId && iframeRef.current) {
        iframeRef.current.src = `/voucher-preview/${selectedId}?ts=${Date.now()}`;
      }
      showToast?.('Configurações salvas', 'success');
    } catch (err) {
      showToast?.(err?.response?.data?.error || 'Falha ao salvar configurações', 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  async function refresh() {
    try {
      const data = await api.list();
      setList(Array.isArray(data) ? data : (data.items || []));
    } catch (err) {
      showToast?.(err?.response?.data?.detail || 'Falha ao listar vouchers', 'error');
    }
  }

  async function select(id) {
    setLoading(true);
    try {
      const v = await api.get(id);
      const unified = v.unified || v;
      setSelectedId(id);
      setCurrent(unified);
      reset({
        reservation: unified.reservation || {},
        passengers: unified.passengers || [],
        trips: unified.trips || [],
      });
    } catch (err) {
      showToast?.(err?.response?.data?.detail || 'Falha ao carregar voucher', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const r = await api.upload(file);
      await refresh();
      if (r?.id) await select(r.id);
      showToast?.('Voucher importado com sucesso', 'success');
    } catch (err) {
      // Prefere a mensagem do servidor (ex.: "Gemini com alta demanda…"); cai pra mensagem genérica.
      const serverMsg = err?.response?.data?.error || err?.response?.data?.detail;
      showToast?.(serverMsg || 'Falha no upload do voucher', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function onMergeUpload() {
    if (!outboundFile || !returnFile) return;
    setMerging(true);
    try {
      const r = await api.uploadMerge(outboundFile, returnFile);
      await refresh();
      if (r?.id) await select(r.id);
      showToast?.('Vouchers combinados com sucesso', 'success');
      setOutboundFile(null);
      setReturnFile(null);
      if (outboundInputRef.current) outboundInputRef.current.value = '';
      if (returnInputRef.current) returnInputRef.current.value = '';
    } catch (err) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.detail;
      showToast?.(serverMsg || 'Falha ao combinar vouchers', 'error');
    } finally {
      setMerging(false);
    }
  }

  async function onSave(data) {
    if (!selectedId) return;
    try {
      const payload = { ...(current || {}), ...data };
      if (current?.templateStyle) payload.templateStyle = current.templateStyle;
      const r = await api.update(selectedId, payload);
      setCurrent(r.unified || data);
      if (iframeRef.current) {
        iframeRef.current.src = `/voucher-preview/${selectedId}?ts=${Date.now()}`;
      }
      showToast?.('Voucher salvo', 'success');
    } catch (err) {
      showToast?.(err?.response?.data?.detail || 'Falha ao salvar voucher', 'error');
    }
  }

  async function changeTemplate(newStyle) {
    if (!selectedId || !current) return;
    const updated = { ...current, templateStyle: newStyle };
    try {
      const r = await api.update(selectedId, updated);
      setCurrent(r.unified || updated);
      if (iframeRef.current) {
        iframeRef.current.src = `/voucher-preview/${selectedId}?ts=${Date.now()}`;
      }
      showToast?.('Modelo alterado', 'success');
    } catch (err) {
      showToast?.(err?.response?.data?.detail || 'Falha ao alterar modelo', 'error');
    }
  }

  async function handleSendEmail() {
    if (!emailRecipients.trim() || sendingEmail || !selectedId) return;
    setSendingEmail(true);
    try {
      const result = await api.sendEmail(selectedId, emailRecipients, emailMessage);
      showToast?.(`E-mail enviado para ${result.sent} destinatário(s)`, 'success');
      setEmailModalOpen(false);
      setEmailRecipients('');
      setEmailMessage('');
    } catch (e) {
      showToast?.(`Erro ao enviar: ${e?.response?.data?.error || e.message}`, 'error');
    } finally {
      setSendingEmail(false);
    }
  }

  async function onDelete() {
    if (!selectedId) return;
    if (!window.confirm('Excluir este voucher?')) return;
    try {
      await api.remove(selectedId);
      setSelectedId(null);
      setCurrent(null);
      reset({ reservation: {}, passengers: [], trips: [] });
      await refresh();
      showToast?.('Voucher excluído', 'success');
    } catch (err) {
      showToast?.(err?.response?.data?.detail || 'Falha ao excluir voucher', 'error');
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-220px)]">
      {/* Coluna esquerda: lista + editor */}
      <div className="lg:w-1/2 flex flex-col gap-4 min-w-0">
        {/* Configurações da agência */}
        <div className={sectionCls}>
          <button
            type="button"
            onClick={() => setSettingsOpen(o => !o)}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4" /> Configurações da agência
            </h3>
            {settingsOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
          {settingsOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exibidos no rodapé de todos os vouchers gerados.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input
                    className={inputCls}
                    value={settings.contact_phone}
                    onChange={e => setSettings(s => ({ ...s, contact_phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input
                    className={inputCls}
                    value={settings.contact_email}
                    onChange={e => setSettings(s => ({ ...s, contact_email: e.target.value }))}
                    placeholder="contato@clubedovoo.com.br"
                  />
                </div>
                <div>
                  <label className={labelCls}>Site</label>
                  <input
                    className={inputCls}
                    value={settings.contact_site}
                    onChange={e => setSettings(s => ({ ...s, contact_site: e.target.value }))}
                    placeholder="www.clubedovoo.com.br"
                  />
                </div>
                <div>
                  <label className={labelCls}>Texto adicional</label>
                  <input
                    className={inputCls}
                    value={settings.contact_extra}
                    onChange={e => setSettings(s => ({ ...s, contact_extra: e.target.value }))}
                    placeholder="CNPJ, endereço, etc."
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={savingSettings}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all
                              ${savingSettings ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25 cursor-pointer'}`}
                >
                  <Save className="w-4 h-4" />
                  {savingSettings ? 'Salvando…' : 'Salvar configurações'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Upload */}
        <div className={sectionCls}>
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <UploadCloud className="w-4 h-4" /> Importar voucher
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  PDF, PNG, JPEG ou WebP — extração automática dos dados.
                </p>
              </div>
              {/* Modo */}
              <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="uploadMode"
                    value="single"
                    checked={uploadMode === 'single'}
                    onChange={() => setUploadMode('single')}
                    disabled={uploading || merging}
                  />
                  Voucher único
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="uploadMode"
                    value="merge"
                    checked={uploadMode === 'merge'}
                    onChange={() => setUploadMode('merge')}
                    disabled={uploading || merging}
                  />
                  Ida + volta separados
                </label>
              </div>
            </div>

            {uploadMode === 'single' ? (
              <div className="flex justify-end">
                <label
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium cursor-pointer transition-all
                              ${uploading ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25'}`}
                >
                  <UploadCloud className="w-4 h-4" />
                  {uploading ? 'Enviando…' : 'Selecionar arquivo'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={onUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Voucher de IDA</label>
                    <input
                      ref={outboundInputRef}
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      onChange={(e) => setOutboundFile(e.target.files?.[0] || null)}
                      disabled={merging}
                      className="text-xs text-slate-700 dark:text-slate-300"
                    />
                    {outboundFile && (
                      <p className="text-[11px] text-slate-500 mt-1 truncate">{outboundFile.name}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Voucher de VOLTA</label>
                    <input
                      ref={returnInputRef}
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      onChange={(e) => setReturnFile(e.target.files?.[0] || null)}
                      disabled={merging}
                      className="text-xs text-slate-700 dark:text-slate-300"
                    />
                    {returnFile && (
                      <p className="text-[11px] text-slate-500 mt-1 truncate">{returnFile.name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Os dois vouchers serão lidos e combinados em um único itinerário. Pode levar 10–20s.
                  </p>
                  <button
                    type="button"
                    onClick={onMergeUpload}
                    disabled={!outboundFile || !returnFile || merging}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all
                                ${(!outboundFile || !returnFile || merging)
                                  ? 'bg-indigo-300 cursor-not-allowed'
                                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25 cursor-pointer'}`}
                  >
                    <UploadCloud className="w-4 h-4" />
                    {merging ? 'Processando…' : 'Combinar e gerar voucher'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Vouchers ({list.length})
            </h3>
            <button
              onClick={refresh}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum voucher ainda. Faça upload acima.</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {list.map(v => (
                <button
                  key={v.id}
                  onClick={() => select(v.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    selectedId === v.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700 dark:hover:border-indigo-500'
                  }`}
                >
                  #{v.id} · {v.carrier || v.airline || 'sem cia'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Editor */}
        {loading && (
          <div className={sectionCls}>
            <p className="text-sm text-slate-500 dark:text-slate-400">Carregando voucher…</p>
          </div>
        )}

        {current && !loading && (
          <form onSubmit={handleSubmit(onSave)} className="space-y-4">
            <div className={sectionCls}>
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 text-sm">Reserva</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Localizador</label>
                  <input {...register('reservation.locator')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <input {...register('reservation.status')} className={inputCls} />
                </div>
              </div>
            </div>

            <div className={sectionCls}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Passageiros</h4>
                <button
                  type="button"
                  onClick={() => passengers.append({ order: passengers.fields.length + 1, name: '', type: 'adulto' })}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> adicionar
                </button>
              </div>
              {passengers.fields.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum passageiro.</p>
              )}
              <div className="space-y-2">
                {passengers.fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2 items-center">
                    <input
                      {...register(`passengers.${i}.order`, { valueAsNumber: true })}
                      type="number"
                      className={`${inputCls} w-16`}
                    />
                    <input {...register(`passengers.${i}.name`)} className={`${inputCls} flex-1`} placeholder="Nome completo" />
                    <select {...register(`passengers.${i}.type`)} className={`${inputCls} w-32`}>
                      <option value="adulto">adulto</option>
                      <option value="crianca">criança</option>
                      <option value="bebe">bebê</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => passengers.remove(i)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30 cursor-pointer"
                      title="Remover"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={sectionCls}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Trechos</h4>
                <button
                  type="button"
                  onClick={() => trips.append({
                    direction: 'ida', dateLabel: '', flightNumber: '',
                    departure: { airport: '', datetime: '' },
                    arrival: { airport: '', datetime: '' },
                  })}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> adicionar
                </button>
              </div>
              {trips.fields.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum trecho.</p>
              )}
              <div className="space-y-3">
                {trips.fields.map((f, i) => (
                  <div key={f.id} className="border border-slate-200 dark:border-slate-700/60 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <select {...register(`trips.${i}.direction`)} className={`${inputCls} w-28`}>
                        <option value="ida">ida</option>
                        <option value="volta">volta</option>
                        <option value="multi">multi</option>
                      </select>
                      <input {...register(`trips.${i}.dateLabel`)} className={`${inputCls} flex-1`} placeholder="12 SET 2026" />
                      <input {...register(`trips.${i}.flightNumber`)} className={`${inputCls} w-28`} placeholder="AD 4001" />
                      <button
                        type="button"
                        onClick={() => trips.remove(i)}
                        className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30 cursor-pointer"
                        title="Remover trecho"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Origem (IATA)</label>
                        <input {...register(`trips.${i}.departure.airport`)} className={inputCls} placeholder="GRU" />
                      </div>
                      <div>
                        <label className={labelCls}>Embarque (ISO)</label>
                        <input {...register(`trips.${i}.departure.datetime`)} className={inputCls} placeholder="2026-09-12T08:30:00" />
                      </div>
                      <div>
                        <label className={labelCls}>Destino (IATA)</label>
                        <input {...register(`trips.${i}.arrival.airport`)} className={inputCls} placeholder="REC" />
                      </div>
                      <div>
                        <label className={labelCls}>Chegada (ISO)</label>
                        <input {...register(`trips.${i}.arrival.datetime`)} className={inputCls} placeholder="2026-09-12T11:45:00" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={current.templateStyle || 'institucional'}
                onChange={e => changeTemplate(e.target.value)}
                className={`${inputCls} w-auto`}
                title="Modelo do voucher"
              >
                <option value="institucional">Modelo institucional</option>
                <option value="compacto">Modelo compacto</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-lg shadow-indigo-500/25 cursor-pointer transition-all"
              >
                <Save className="w-4 h-4" /> Salvar
              </button>
              <a
                href={api.exportUrl(selectedId, 'pdf')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium shadow-lg shadow-emerald-500/25 cursor-pointer transition-all"
              >
                <Download className="w-4 h-4" /> PDF
              </a>
              <a
                href={api.exportUrl(selectedId, 'png')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium shadow-lg shadow-teal-500/25 cursor-pointer transition-all"
              >
                <Download className="w-4 h-4" /> PNG
              </a>
              <button
                type="button"
                onClick={() => setEmailModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-lg shadow-indigo-500/25 cursor-pointer transition-all ml-auto"
              >
                <Mail className="w-4 h-4" /> Enviar por e-mail
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium shadow-lg shadow-rose-500/25 cursor-pointer transition-all"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Coluna direita: preview */}
      <div className="lg:w-1/2 min-w-0">
        <div className="sticky top-4 h-[calc(100vh-180px)] rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden bg-slate-100 dark:bg-slate-900/40">
          {selectedId ? (
            <iframe
              ref={iframeRef}
              src={`/voucher-preview/${selectedId}`}
              className="w-full h-full border-0"
              title="Preview do voucher"
            />
          ) : (
            <div className="h-full flex items-center justify-center p-8 text-center">
              <div className="text-slate-500 dark:text-slate-400 text-sm">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
                Faça upload de um voucher para começar.
              </div>
            </div>
          )}
        </div>
      </div>

      {emailModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !sendingEmail && setEmailModalOpen(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Enviar voucher por e-mail</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Destinatários</label>
                <input
                  type="text"
                  value={emailRecipients}
                  onChange={e => setEmailRecipients(e.target.value)}
                  placeholder="cliente@exemplo.com, outro@exemplo.com"
                  disabled={sendingEmail}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Múltiplos e-mails separados por vírgula.</p>
              </div>
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Mensagem personalizada (opcional)</label>
                <textarea
                  value={emailMessage}
                  onChange={e => setEmailMessage(e.target.value)}
                  placeholder="Olá! Segue o voucher conforme combinado…"
                  rows={5}
                  disabled={sendingEmail}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  disabled={sendingEmail}
                  className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                >Cancelar</button>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={sendingEmail || !emailRecipients.trim()}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >{sendingEmail ? 'Enviando…' : 'Enviar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
