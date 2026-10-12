import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Plus, Star, Trash2, Search, Library, Info, ImageOff } from 'lucide-react';
import {
  getBackgroundBank, uploadBackground, setDefaultBackground, deleteBackground
} from '../api/promoClient';

const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);

const inputCls = 'w-full px-3.5 py-2.5 text-sm rounded-lg border bg-white text-slate-900 placeholder-slate-400 border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700';

/**
 * Banco de fundos: uma biblioteca de fotos por destino. A foto marcada com ⭐ é a
 * que a tela de promoções seleciona automaticamente quando aquele destino aparece.
 */
export default function BackgroundBank({ isOpen, onClose, showToast }) {
  const [groups, setGroups] = useState([]);
  const [maxPer, setMaxPer] = useState(12);
  const [loading, setLoading] = useState(true);
  const [newDest, setNewDest] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(null);          // 'new' | 'add:<slug>' | 'def:<id>' | 'del:<id>'
  const newFileRef = useRef(null);
  const addFileRef = useRef(null);
  const addTargetRef = useRef(null);               // destino que receberá o próximo arquivo escolhido

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBackgroundBank();
      setGroups(res.destinations || []);
      setMaxPer(res.max_per_destination || 12);
    } catch (err) {
      showToast(`Erro ao carregar o banco: ${err.message}`, 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Envia vários arquivos em sequência para o mesmo destino e resume o resultado.
  const sendFiles = async (destination, files) => {
    let ok = 0; const erros = [];
    for (const file of files) {
      try { await uploadBackground({ destination, file }); ok += 1; }
      catch (err) { erros.push(`${file.name}: ${err.message}`); }
    }
    if (ok) showToast(`${ok} foto${ok > 1 ? 's' : ''} salva${ok > 1 ? 's' : ''} em "${destination}".`, 'success');
    if (erros.length) showToast(erros.slice(0, 2).join(' | '), 'error');
    return ok;
  };

  const onNewFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const dest = newDest.trim();
    if (!files.length) return;
    if (!dest) { showToast('Digite o nome do destino antes de escolher as fotos.', 'error'); return; }
    setBusy('new');
    const ok = await sendFiles(dest, files);
    if (ok) setNewDest('');
    await load();
    setBusy(null);
  };

  const openAddFor = (group) => { addTargetRef.current = group; addFileRef.current?.click(); };

  const onAddFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const group = addTargetRef.current;
    if (!files.length || !group) return;
    setBusy(`add:${group.slug}`);
    await sendFiles(group.label, files);
    await load();
    setBusy(null);
  };

  const makeDefault = async (img) => {
    setBusy(`def:${img.id}`);
    try { await setDefaultBackground(img.id); await load(); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(null); }
  };

  const remove = async (group, img) => {
    const so = group.images.length === 1;
    const msg = so
      ? `Excluir a única foto de "${group.label}"? O destino sai do banco.`
      : `Excluir esta foto de "${group.label}"?${img.is_default ? '\nEla é a padrão — a foto mais antiga restante assume.' : ''}`;
    if (!window.confirm(msg)) return;
    setBusy(`del:${img.id}`);
    try { await deleteBackground(img.id); await load(); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(null); }
  };

  if (!isOpen) return null;

  const q = filter.trim().toLowerCase();
  const visible = q ? groups.filter((g) => g.label.toLowerCase().includes(q)) : groups;
  const totalFotos = groups.reduce((n, g) => n + g.images.length, 0);
  const sugestoes = groups.map((g) => g.label);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-200 dark:border-slate-700/50 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Library className="w-5 h-5 text-indigo-500" /> Banco de fundos
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Guarde as fotos de cada destino. A foto marcada com <Star className="w-3.5 h-3.5 inline -mt-0.5 fill-amber-400 text-amber-400" /> é
              selecionada automaticamente sempre que esse destino aparecer numa promoção.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Novo destino / enviar fotos */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-500/25 dark:bg-indigo-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-2">Adicionar fotos a um destino</p>
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <input
                list="bg-bank-destinos"
                value={newDest}
                onChange={(e) => setNewDest(e.target.value)}
                placeholder="Nome do destino (ex.: Porto de Galinhas)"
                maxLength={80}
                className={inputCls}
              />
              <datalist id="bg-bank-destinos">{sugestoes.map((s) => <option key={s} value={s} />)}</datalist>
              <button
                type="button"
                onClick={() => newFileRef.current?.click()}
                disabled={busy === 'new' || !newDest.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 whitespace-nowrap"
              >
                <Upload className={`w-4 h-4 ${busy === 'new' ? 'animate-pulse' : ''}`} />
                {busy === 'new' ? 'Enviando...' : 'Escolher fotos'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              JPG, PNG ou WebP, até 8 MB cada, no máximo {maxPer} fotos por destino. Prefira fotos em pé (retrato) e sem texto — a arte é 1080×1620.
              Variações como "Porto de Galinhas (Ipojuca)" caem no mesmo destino.
            </p>
            <input ref={newFileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onNewFiles} />
            <input ref={addFileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onAddFiles} />
          </div>

          {/* Lista */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {groups.length === 0 ? 'Nenhum destino salvo' : `${groups.length} destino${groups.length > 1 ? 's' : ''} · ${totalFotos} foto${totalFotos > 1 ? 's' : ''}`}
              </p>
              {groups.length > 6 && (
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar destinos" className={`${inputCls} pl-9 py-2`} />
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
                <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /> Carregando...
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500 text-center">
                <ImageOff className="w-9 h-9 mb-2 opacity-40" />
                <p className="text-sm">
                  {groups.length === 0
                    ? 'O banco está vazio. Adicione fotos acima ou salve sugestões direto da tela de promoções.'
                    : 'Nenhum destino corresponde ao filtro.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {visible.map((g) => (
                  <section key={g.slug} className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/30 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                        {g.label} <span className="text-xs font-normal text-slate-400 dark:text-slate-500">· {g.images.length}/{maxPer}</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => openAddFor(g)}
                        disabled={busy === `add:${g.slug}` || g.images.length >= maxPer}
                        className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={g.images.length >= maxPer ? 'Limite de fotos atingido' : `Adicionar fotos a ${g.label}`}
                      >
                        <Plus className="w-3.5 h-3.5" /> {busy === `add:${g.slug}` ? 'Enviando...' : 'Adicionar foto'}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {g.images.map((img) => (
                        <div key={img.id} className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 group ${img.is_default ? 'border-amber-400' : 'border-slate-200 dark:border-slate-700'}`}>
                          <img src={img.thumb} alt={`Foto de ${g.label}`} loading="lazy" className="w-full h-full object-cover" />
                          {img.is_default && (
                            <span className="absolute top-1 left-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-400 text-amber-950">
                              <Star className="w-2.5 h-2.5 fill-amber-950" /> Padrão
                            </span>
                          )}
                          <span className="absolute bottom-1 left-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white">
                            {img.origin === 'pexels' ? 'Pexels' : 'Envio'} · {fmtBytes(img.bytes)}
                          </span>
                          <div className="absolute top-1 right-1 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                            {!img.is_default && (
                              <button
                                type="button"
                                title="Usar como foto padrão"
                                aria-label="Usar como foto padrão"
                                disabled={busy === `def:${img.id}`}
                                onClick={() => makeDefault(img)}
                                className="p-1.5 rounded-md bg-amber-400 text-amber-950 hover:bg-amber-300 cursor-pointer disabled:opacity-50"
                              >
                                <Star className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Excluir foto"
                              aria-label="Excluir foto"
                              disabled={busy === `del:${img.id}`}
                              onClick={() => remove(g, img)}
                              className="p-1.5 rounded-md bg-black/60 text-white hover:bg-red-600 cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 px-6 py-3 border-t border-slate-200 dark:border-slate-700/50 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            As fotos ficam no volume persistente do servidor e sobrevivem a novos deploys, mas{' '}
            <strong>não entram no backup do banco de dados</strong> (Configurações › Backup).
            Se perder o volume, será preciso enviá-las de novo.
          </span>
        </div>
      </div>
    </div>
  );
}
