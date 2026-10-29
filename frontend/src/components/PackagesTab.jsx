import { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, FileText, Trash2, Plus, X, RefreshCw, Mail, ChevronDown, ChevronUp, Save, Check, Package as PackageIcon
} from 'lucide-react';
import * as api from '../api/packageClient';
import useBackClose from '../hooks/useBackClose';
import SmartProcessingModal from './SmartProcessingModal';
import useSmartProgress from '../hooks/useSmartProgress';
import EmptyState from './EmptyState';

const inputCls =
  "w-full px-3 py-2 min-h-[44px] md:min-h-0 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border text-sm " +
  "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
  "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";
const labelCls = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";
const sectionCls = "border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 bg-white/70 dark:bg-slate-900/30";

const KIND_LABEL = { flight: 'Voo', hotel: 'Hotel', car: 'Carro', tour: 'Passeio', transfer: 'Transfer' };
// Linhas adicionais podem ser de qualquer tipo — inclusive voo extra (ida+volta
// em vouchers separados) ou hotel extra (viagem multi-cidade).
const ALL_OPTS = ['flight', 'hotel', 'car', 'tour', 'transfer'];

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
  useBackClose(emailOpen, () => setEmailOpen(false));
  const [emailTo, setEmailTo] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [sending, setSending] = useState(false);
  const smartProgress = useSmartProgress();
  const [items, setItems] = useState([
    { id: newId(), file: null, kind: 'flight' },
    { id: newId(), file: null, kind: 'hotel' },
  ]);
  const iframeRef = useRef(null);
  const fileInputRefs = useRef({});

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
    smartProgress.start({
      title: 'Montando Pacote de Viagem com IA',
      subtitle: `Processando ${items.length} itens (voos, hotéis, passeios)...`,
      steps: [
        { title: 'Lendo comprovantes com IA...', desc: 'Extraindo dados de voos, reservas de hotéis e serviços' },
        { title: 'Formatando arte e itinerário...', desc: 'Organizando cronologia, passageiros e acomodações' },
        { title: 'Pacote completo pronto!', desc: 'Gerando itinerário oficial e link seguro' }
      ]
    });
    try {
      const r = await api.uploadPackage(items.map(({ file, kind }) => ({ file, kind })));
      await refresh();
      if (r?.id) await select(r.id);
      smartProgress.complete();
      showToast?.('Pacote gerado com sucesso', 'success');
      setItems([
        { id: newId(), file: null, kind: 'flight' },
        { id: newId(), file: null, kind: 'hotel' },
      ]);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.detail;
      const m = /#(\d+)/.exec(msg || ''); if (m) setErrorIndex(parseInt(m[1], 10) - 1);
      smartProgress.fail(msg || 'Falha ao gerar pacote');
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
            Voo e hotel são obrigatórios. Use "+ Adicionar serviço" para incluir mais voos (ida/volta separados),
            mais hotéis, ou adicionais (carro, passeio, transfer). 2 a 12 serviços. Processa em 15–40s.
          </p>
          <div className="flex flex-col gap-2">
            {items.map((it, idx) => {
              const rowErr = errorIndex === idx;
              return (
                <div key={it.id} className={`flex items-center gap-2 flex-wrap p-2.5 rounded-xl border transition-all ${rowErr ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/40'}`}>
                  <span className="text-xs font-mono font-bold text-slate-400 w-5 text-center shrink-0">{idx + 1}</span>

                  {/* Botão explícito para anexar o voucher */}
                  {!it.file ? (
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[it.id]?.click()}
                      disabled={combining}
                      className="flex-1 min-w-[210px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-blue-300 hover:border-[#00569e] bg-blue-50/60 hover:bg-blue-50/90 text-xs font-semibold text-[#00569e] dark:border-blue-800 dark:bg-blue-950/40 dark:hover:bg-blue-950/70 dark:text-blue-300 transition-all cursor-pointer min-h-[44px] md:min-h-[38px]"
                    >
                      <UploadCloud className="w-4 h-4 shrink-0 text-[#00569e] dark:text-blue-400" />
                      <span className="truncate">Clique para anexar voucher ({KIND_LABEL[it.kind] || 'Serviço'})</span>
                    </button>
                  ) : (
                    <div className="flex-1 min-w-[210px] flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-300 min-h-[44px] md:min-h-[38px]">
                      <div className="flex items-center gap-2 min-w-0 truncate font-medium">
                        <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate">{it.file.name}</span>
                        <span className="text-[10px] text-emerald-600/80 font-mono shrink-0">({Math.round(it.file.size / 1024)} KB)</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[it.id]?.click()}
                          className="px-2 py-0.5 rounded text-[11px] font-semibold text-[#00569e] hover:bg-blue-100/60 dark:text-blue-300 cursor-pointer"
                          title="Trocar arquivo"
                        >
                          Trocar
                        </button>
                        <button
                          type="button"
                          onClick={() => setFile(it.id, null)}
                          className="p-1 rounded hover:bg-emerald-200/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 cursor-pointer"
                          title="Remover arquivo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Input de arquivo real oculto */}
                  <input
                    ref={el => (fileInputRefs.current[it.id] = el)}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => setFile(it.id, e.target.files?.[0] || null)}
                    disabled={combining}
                    className="hidden"
                  />

                  {/* Dropdown de tipo de serviço 100% interativo e funcional */}
                  <select
                    value={it.kind}
                    onChange={(e) => setKind(it.id, e.target.value)}
                    disabled={combining}
                    className={inputCls + ' !w-auto !py-2 md:!py-1 min-h-[44px] md:min-h-[38px] text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700'}
                    title="Alterar tipo do serviço"
                  >
                    {ALL_OPTS.map(k => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(it.id, -1)} disabled={combining || idx === 0} className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer" title="Subir"><ChevronUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(it.id, 1)} disabled={combining || idx === items.length - 1} className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer" title="Descer"><ChevronDown className="w-4 h-4" /></button>
                    {items.length > 2 && (
                      <button type="button" onClick={() => removeItem(it.id)} disabled={combining} className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer" title="Remover"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
            <button type="button" onClick={addItem} disabled={combining || items.length >= 12}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-xs font-medium border border-indigo-300 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Adicionar serviço
            </button>
            <button type="button" onClick={onCombine} disabled={!valid || combining}
              className={`inline-flex items-center gap-2 px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg text-white text-sm font-medium transition-all ${(!valid || combining) ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25 cursor-pointer'}`}>
              <UploadCloud className="w-4 h-4" /> {combining ? 'Processando…' : 'Gerar pacote'}
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><FileText className="w-4 h-4" /> Pacotes ({list.length})</h3>
            <button onClick={refresh} className="flex items-center justify-center min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer" title="Atualizar"><RefreshCw className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
            {list.length === 0 ? (
              <EmptyState
                icon={PackageIcon}
                title="Nenhum pacote montado ainda"
                description="Crie propostas completas de viagem unindo voos, hospedagem e adicionais em um roteiro profissional."
                hint="Faça upload dos vouchers avulsos acima para consolidar."
              />
            ) : (
              list.map(p => (
                <div key={p.id} onClick={() => select(p.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedId === p.id ? 'border-[#00569e] bg-blue-50/70 dark:bg-slate-800/90 shadow-sm ring-1 ring-[#00569e]/30' : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:border-[#3871c1]/50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate pii">{p.title || `Pacote #${p.id}`}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5"><span className="pii font-medium">{p.holder}</span> · {p.summary?.hotels || 0} hotel(s) · {p.summary?.addons || 0} adicional(is)</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(p.id); }} className="flex items-center justify-center min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-1.5 rounded-lg shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Coluna direita: editor + preview */}
      <div className={sectionCls}>
        {!current ? (
          <EmptyState
            icon={PackageIcon}
            title="Selecione um pacote"
            description="Escolha um pacote da lista ao lado para ver o preview detalhado, editar diárias ou gerar o PDF oficial."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className={labelCls}>Título do pacote</label>
                <input className={inputCls} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
              </div>
              <button onClick={saveTitle} disabled={savingTitle} className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm cursor-pointer disabled:opacity-50"><Save className="w-4 h-4" /> {savingTitle ? '…' : 'Salvar'}</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEmailOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer"><Mail className="w-4 h-4" /> Enviar por e-mail</button>
            </div>
            <div className="border border-slate-200 dark:border-slate-700/60 rounded-lg overflow-hidden bg-white" style={{ height: 620 }}>
              <iframe ref={iframeRef} title="preview" src={`/api/packages/${current.id}/preview`} className="w-full h-full" />
            </div>
          </div>
        )}
      </div>

      {/* Modal de e-mail */}
      {emailOpen && current && (
        <div className="fixed inset-0 bg-black/40 flex items-stretch md:items-center justify-center z-50 p-0 md:p-4" onClick={() => setEmailOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-none md:rounded-xl p-5 w-full max-w-none md:max-w-md h-[100dvh] md:h-auto overflow-y-auto flex flex-col md:block shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Enviar pacote por e-mail</h3>
              <button onClick={() => setEmailOpen(false)} className="flex items-center justify-center min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Fechar"><X className="w-4 h-4" /></button>
            </div>
            <label className={labelCls}>Destinatários (separados por vírgula)</label>
            <input className={inputCls + ' mb-3'} value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="cliente@email.com" />
            <label className={labelCls}>Mensagem (opcional)</label>
            <textarea className={inputCls + ' mb-4 md:mb-4 flex-1 md:flex-none'} rows={3} value={emailMsg} onChange={(e) => setEmailMsg(e.target.value)} />
            <div className="flex justify-end gap-2 sticky bottom-0 md:static bg-white dark:bg-slate-900 pt-2 pb-[env(safe-area-inset-bottom)] md:pt-0 md:pb-0">
              <button onClick={() => setEmailOpen(false)} className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">Cancelar</button>
              <button onClick={onSendEmail} disabled={sending || !emailTo.trim()} className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer disabled:opacity-50">{sending ? 'Enviando…' : 'Enviar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de Carregamento Inteligente com IA */}
      <SmartProcessingModal {...smartProgress} />
    </div>
  );
}
