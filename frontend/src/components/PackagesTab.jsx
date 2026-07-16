import { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, FileText, Trash2, Plus, X, RefreshCw, Mail, ChevronDown, ChevronUp, Save, Package as PackageIcon
} from 'lucide-react';
import * as api from '../api/packageClient';

const inputCls =
  "w-full px-3 py-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border text-sm " +
  "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
  "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";
const labelCls = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";
const sectionCls = "border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 bg-white/70 dark:bg-slate-900/30";

const KIND_LABEL = { flight: 'Voo', hotel: 'Hotel', car: 'Carro', tour: 'Passeio', transfer: 'Transfer' };
const ADDON_OPTS = ['car', 'tour', 'transfer'];

let _seq = 0;
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `it-${Date.now()}-${_seq++}`;
}

export default function PackagesTab({ showToast }) {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [current, setCurrent] = useState(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [combining, setCombining] = useState(false);
  const [errorIndex, setErrorIndex] = useState(-1);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState([
    { id: newId(), file: null, kind: 'flight', fixed: true },
    { id: newId(), file: null, kind: 'hotel', fixed: true },
  ]);
  const iframeRef = useRef(null);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    try { setList(await api.list()); } catch (e) { showToast?.('Falha ao listar pacotes', 'error'); }
  }
  async function select(id) {
    setSelectedId(id);
    try {
      const r = await api.get(id);
      setCurrent(r);
      setTitleDraft(r?.title || r?.package?.title || '');
    } catch (e) { showToast?.('Falha ao abrir pacote', 'error'); }
  }

  // --- upload multi-tipo ---
  function addItem() { setItems(x => (x.length >= 12 ? x : [...x, { id: newId(), file: null, kind: 'car' }])); }
  function removeItem(id) { setItems(x => x.filter(it => it.id !== id)); }
  function setFile(id, file) { setItems(x => x.map(it => it.id === id ? { ...it, file } : it)); }
  function setKind(id, kind) { setItems(x => x.map(it => it.id === id ? { ...it, kind } : it)); }
  function move(id, dir) {
    setItems(x => {
      const i = x.findIndex(it => it.id === id); const to = i + dir;
      if (i < 0 || to < 0 || to >= x.length) return x;
      const c = [...x]; const [it] = c.splice(i, 1); c.splice(to, 0, it); return c;
    });
  }
  const valid = items.length >= 2 && items.every(it => it.file)
    && items.some(it => it.kind === 'flight') && items.some(it => it.kind === 'hotel');

  async function onCombine() {
    if (!valid) return;
    setCombining(true); setErrorIndex(-1);
    try {
      const r = await api.uploadPackage(items.map(({ file, kind }) => ({ file, kind })));
      await refresh();
      if (r?.id) await select(r.id);
      showToast?.('Pacote gerado com sucesso', 'success');
      setItems([
        { id: newId(), file: null, kind: 'flight', fixed: true },
        { id: newId(), file: null, kind: 'hotel', fixed: true },
      ]);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.detail;
      const m = /#(\d+)/.exec(msg || ''); if (m) setErrorIndex(parseInt(m[1], 10) - 1);
      showToast?.(msg || 'Falha ao gerar pacote', 'error');
    } finally { setCombining(false); }
  }

  async function saveTitle() {
    if (!current) return;
    setSavingTitle(true);
    try {
      const pkg = { ...current.package, title: titleDraft };
      const r = await api.update(current.id, pkg);
      setCurrent(c => ({ ...c, title: titleDraft, package: r.package }));
      await refresh();
      if (iframeRef.current) iframeRef.current.src = `/api/packages/${current.id}/preview?t=${Date.now()}`;
      showToast?.('Título salvo', 'success');
    } catch (e) { showToast?.('Falha ao salvar título', 'error'); }
    finally { setSavingTitle(false); }
  }

  async function onDelete(id) {
    if (!window.confirm('Excluir este pacote?')) return;
    try {
      await api.remove(id);
      if (selectedId === id) { setSelectedId(null); setCurrent(null); }
      await refresh();
      showToast?.('Pacote excluído', 'success');
    } catch (e) { showToast?.('Falha ao excluir', 'error'); }
  }

  async function onSendEmail() {
    if (!current || !emailTo.trim()) return;
    setSending(true);
    try {
      const r = await api.sendEmail(current.id, emailTo, emailMsg);
      showToast?.(`E-mail enviado (${r.sent})`, 'success');
      setEmailOpen(false); setEmailTo(''); setEmailMsg('');
    } catch (err) {
      showToast?.(err?.response?.data?.error || 'Falha ao enviar e-mail', 'error');
    } finally { setSending(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Coluna esquerda: upload + lista */}
      <div className="flex flex-col gap-4">
        {/* Upload */}
        <div className={sectionCls}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
            <PackageIcon className="w-4 h-4" /> Montar pacote
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
            Voo e hotel são obrigatórios. Adicione carro, passeio ou transfer. 2 a 12 serviços. Processa em 15–40s.
          </p>
          <div className="flex flex-col gap-2">
            {items.map((it, idx) => {
              const rowErr = errorIndex === idx;
              return (
                <div key={it.id} className={`flex items-center gap-2 flex-wrap p-2 rounded-lg border ${rowErr ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700/60'}`}>
                  <span className="text-[11px] font-mono text-slate-400 w-5 text-center">{idx + 1}</span>
                  <input
                    type="file" accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => setFile(it.id, e.target.files?.[0] || null)}
                    disabled={combining}
                    className="text-xs text-slate-700 dark:text-slate-300 flex-1 min-w-[150px]"
                  />
                  <select
                    value={it.kind} onChange={(e) => setKind(it.id, e.target.value)}
                    disabled={combining || it.fixed}
                    className={inputCls + ' !w-auto !py-1 text-xs'}
                    title={it.fixed ? 'Serviço obrigatório' : 'Tipo do serviço'}
                  >
                    {it.fixed
                      ? <option value={it.kind}>{KIND_LABEL[it.kind]}</option>
                      : ADDON_OPTS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(it.id, -1)} disabled={combining || idx === 0} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer" title="Subir"><ChevronUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(it.id, 1)} disabled={combining || idx === items.length - 1} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer" title="Descer"><ChevronDown className="w-4 h-4" /></button>
                    {!it.fixed && (
                      <button type="button" onClick={() => removeItem(it.id)} disabled={combining} className="p-1 rounded text-slate-400 hover:text-red-600 cursor-pointer" title="Remover"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
            <button type="button" onClick={addItem} disabled={combining || items.length >= 12}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-300 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Adicionar serviço
            </button>
            <button type="button" onClick={onCombine} disabled={!valid || combining}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all ${(!valid || combining) ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25 cursor-pointer'}`}>
              <UploadCloud className="w-4 h-4" /> {combining ? 'Processando…' : 'Gerar pacote'}
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><FileText className="w-4 h-4" /> Pacotes ({list.length})</h3>
            <button onClick={refresh} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer" title="Atualizar"><RefreshCw className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
            {list.length === 0 && <p className="text-xs text-slate-400">Nenhum pacote ainda.</p>}
            {list.map(p => (
              <div key={p.id} onClick={() => select(p.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedId === p.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.title || `Pacote #${p.id}`}</div>
                    <div className="text-[11px] text-slate-500">{p.holder} · {p.summary?.hotels || 0} hotel(s) · {p.summary?.addons || 0} adicional(is)</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(p.id); }} className="p-1 rounded text-slate-400 hover:text-red-600 cursor-pointer" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Coluna direita: editor + preview */}
      <div className={sectionCls}>
        {!current ? (
          <div className="text-sm text-slate-400 text-center py-16">Selecione ou gere um pacote para ver o preview.</div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className={labelCls}>Título do pacote</label>
                <input className={inputCls} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
              </div>
              <button onClick={saveTitle} disabled={savingTitle} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm cursor-pointer disabled:opacity-50"><Save className="w-4 h-4" /> {savingTitle ? '…' : 'Salvar'}</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEmailOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer"><Mail className="w-4 h-4" /> Enviar por e-mail</button>
            </div>
            <div className="border border-slate-200 dark:border-slate-700/60 rounded-lg overflow-hidden bg-white" style={{ height: 620 }}>
              <iframe ref={iframeRef} title="preview" src={`/api/packages/${current.id}/preview`} className="w-full h-full" />
            </div>
          </div>
        )}
      </div>

      {/* Modal de e-mail */}
      {emailOpen && current && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEmailOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Enviar pacote por e-mail</h3>
              <button onClick={() => setEmailOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <label className={labelCls}>Destinatários (separados por vírgula)</label>
            <input className={inputCls + ' mb-3'} value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="cliente@email.com" />
            <label className={labelCls}>Mensagem (opcional)</label>
            <textarea className={inputCls + ' mb-4'} rows={3} value={emailMsg} onChange={(e) => setEmailMsg(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEmailOpen(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">Cancelar</button>
              <button onClick={onSendEmail} disabled={sending || !emailTo.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer disabled:opacity-50">{sending ? 'Enviando…' : 'Enviar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
