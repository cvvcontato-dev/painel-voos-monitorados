import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon, RefreshCw, Ban, Check, Upload, Search, Star, BookmarkPlus, X, Library
} from 'lucide-react';
import {
  listBackgrounds, uploadBackground, saveBackgroundFromUrl, setDefaultBackground
} from '../api/promoClient';

const SOURCE_LABEL = { library: 'Banco', pexels: 'Pexels', local: 'Local' };

const tileCls = (active) =>
  `relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
    active
      ? 'border-indigo-500 ring-2 ring-indigo-500/40'
      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'
  }`;

// Botão de ação sobre a miniatura. Fica dentro de um elemento clicável, então
// precisa impedir que o clique também selecione a foto.
function TileAction({ title, onClick, disabled, children, tone = 'dark' }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`p-1.5 rounded-md backdrop-blur-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
        tone === 'gold'
          ? 'bg-amber-400 text-amber-950 hover:bg-amber-300'
          : 'bg-black/60 text-white hover:bg-black/80'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Seletor do fundo da arte. A foto padrão do destino (do banco de fundos) já vem
 * selecionada; sem ela, mostra sugestões do Pexels. O operador pode buscar outro
 * termo, enviar a própria foto ou salvar uma sugestão no banco do destino.
 */
export default function BackgroundPicker({ destination, country, selectedBg, onSelectBg, showToast }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('pexels');      // curated | curated+pexels | pexels | search
  const [term, setTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [busy, setBusy] = useState(null);          // 'upload' | 'save:<url>' | 'def:<id>'
  const fileRef = useRef(null);
  const selectedRef = useRef(selectedBg);
  selectedRef.current = selectedBg;

  const dest = (destination || '').trim();
  const withPexels = mode === 'curated+pexels';

  /**
   * select: 'default' escolhe a padrão do destino (ou a 1ª opção);
   *         'keep' mantém a escolha atual enquanto ela ainda estiver na grade;
   *         uma URL seleciona essa foto.
   */
  const load = useCallback(async ({ includePexels = false, query = '', select = 'default' } = {}) => {
    setLoading(true);
    try {
      const res = await listBackgrounds(dest, country, { includePexels, query });
      const opts = res.options || [];
      const fallback = res.default_url ?? opts[0]?.url ?? null;
      setOptions(opts);
      setMode(res.mode || 'pexels');
      setActiveSearch(query);
      if (select === 'default') onSelectBg(fallback);
      else if (select === 'keep') {
        const atual = selectedRef.current;
        if (atual !== null && !opts.some((o) => o.url === atual)) onSelectBg(fallback);
      } else onSelectBg(select);
    } catch {
      // Fundos são opcionais — não bloquear o fluxo nem poluir com erros.
      setOptions([]);
      setMode('pexels');
      if (select === 'default') onSelectBg(null);
    } finally {
      setLoading(false);
    }
  }, [dest, country, onSelectBg]);

  // Só ao abrir a etapa: o destino pode ser editado no formulário sem refazer a busca
  // a cada tecla — "Atualizar fundos" busca de novo com o nome corrigido.
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requireDestination = () => {
    if (dest) return true;
    showToast('Informe o destino antes de usar o banco de fundos.', 'error');
    return false;
  };

  const doSearch = (e) => {
    e.preventDefault();
    const q = term.trim();
    if (q.length < 2) return;
    load({ query: q });
  };

  const clearSearch = () => { setTerm(''); load({ includePexels: false }); };

  const saveToBank = async (opt) => {
    if (!requireDestination()) return;
    setBusy(`save:${opt.url}`);
    try {
      const img = await saveBackgroundFromUrl({ destination: dest, url: opt.url });
      showToast(
        img.is_default
          ? `Foto salva no banco de "${dest}" e definida como padrão.`
          : `Foto salva no banco de "${dest}". Use a ⭐ para torná-la a padrão.`,
        'success'
      );
      // Sai da busca, mostra o banco com a foto nova selecionada e mantém as sugestões
      // restantes visíveis — assim dá para salvar várias em sequência.
      await load({ includePexels: true, select: img.url });
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setBusy(null); }
  };

  const makeDefault = async (opt) => {
    setBusy(`def:${opt.id}`);
    try {
      await setDefaultBackground(opt.id);
      showToast(`Esta passa a ser a foto padrão de "${opt.destination || dest}".`, 'success');
      await load({ includePexels: withPexels, select: 'keep' });
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setBusy(null); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !requireDestination()) return;
    setBusy('upload');
    try {
      const img = await uploadBackground({ destination: dest, file });
      showToast(
        img.is_default
          ? `Foto salva como padrão de "${dest}" — será selecionada automaticamente nas próximas promoções.`
          : `Foto salva no banco de "${dest}". Use a ⭐ para torná-la a padrão.`,
        'success'
      );
      await load({ includePexels: withPexels, select: img.url });
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setBusy(null); }
  };

  const savedCount = options.filter((o) => o.source === 'library').length;

  return (
    <div className="border-t border-slate-200 dark:border-slate-700/50 pt-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" /> Fundo da arte
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy === 'upload'}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer disabled:opacity-50"
            title={`Enviar uma foto sua e guardá-la no banco de ${dest || 'este destino'}`}
          >
            <Upload className={`w-3.5 h-3.5 ${busy === 'upload' ? 'animate-pulse' : ''}`} />
            {busy === 'upload' ? 'Enviando...' : 'Enviar foto'}
          </button>
          <button
            type="button"
            onClick={() => load({ includePexels: withPexels })}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar fundos
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
      </div>

      {/* Busca livre */}
      <form onSubmit={doSearch} className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar outra foto no Pexels (ex.: dunas, centro histórico, cachoeira)"
            maxLength={80}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-white text-slate-900 placeholder-slate-400 border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700"
          />
        </div>
        <button
          type="submit"
          disabled={loading || term.trim().length < 2}
          className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Buscar
        </button>
      </form>

      {/* Contexto: de onde vêm as fotos exibidas */}
      {!loading && (
        <div className="text-xs mb-3 flex items-center gap-2 flex-wrap text-slate-500 dark:text-slate-400">
          {mode === 'curated' && (
            <>
              <Library className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                {savedCount > 1 ? `${savedCount} fotos` : 'Foto'} do banco de <strong className="text-slate-700 dark:text-slate-200">{dest || 'este destino'}</strong> — a padrão já está selecionada.
              </span>
              <button type="button" onClick={() => load({ includePexels: true, select: 'keep' })}
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 underline cursor-pointer">
                Ver sugestões do Pexels
              </button>
            </>
          )}
          {mode === 'curated+pexels' && (
            <>
              <Library className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Fotos do banco e sugestões do Pexels.</span>
              <button type="button" onClick={() => load({ includePexels: false, select: 'keep' })}
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 underline cursor-pointer">
                Ocultar sugestões
              </button>
            </>
          )}
          {mode === 'pexels' && (
            <span>
              Nenhuma foto salva para <strong className="text-slate-700 dark:text-slate-200">{dest || 'este destino'}</strong> ainda.
              Salve uma sugestão (<BookmarkPlus className="w-3 h-3 inline -mt-0.5" />) ou envie a sua: ela será usada automaticamente da próxima vez.
            </span>
          )}
          {mode === 'search' && (
            <>
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span>Resultados para “<strong className="text-slate-700 dark:text-slate-200">{activeSearch}</strong>”.</span>
              <button type="button" onClick={clearSearch}
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 underline cursor-pointer">
                <X className="w-3 h-3" /> Limpar busca
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
          <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          Buscando fotos do destino...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {/* Sem fundo */}
            <button
              type="button"
              onClick={() => onSelectBg(null)}
              className={`${tileCls(selectedBg === null)} flex flex-col items-center justify-center gap-1 bg-slate-50 dark:bg-slate-800/50`}
            >
              <Ban className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Sem fundo</span>
              {selectedBg === null && (
                <span className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5"><Check className="w-3 h-3" /></span>
              )}
            </button>

            {options.map((opt) => {
              const active = selectedBg === opt.url;
              const isLibrary = opt.source === 'library';
              const isPexels = opt.source === 'pexels';
              return (
                <div
                  key={opt.url}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onClick={() => onSelectBg(opt.url)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectBg(opt.url); } }}
                  className={tileCls(active)}
                >
                  <img src={opt.thumb} alt={`Fundo (${SOURCE_LABEL[opt.source] || opt.source})`} loading="lazy" className="w-full h-full object-cover" />

                  <span className="absolute bottom-1 left-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/60 text-white flex items-center gap-1">
                    {isLibrary && opt.is_default && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />}
                    {isLibrary && opt.is_default ? 'Padrão' : (SOURCE_LABEL[opt.source] || opt.source)}
                  </span>

                  {active && (
                    <span className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5"><Check className="w-3 h-3" /></span>
                  )}

                  {/* Ações: aparecem ao passar o mouse/foco; sempre visíveis em telas pequenas */}
                  {(isPexels || (isLibrary && !opt.is_default)) && (
                    <div className="absolute top-1 left-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                      {isPexels && (
                        <TileAction
                          title={`Salvar no banco de ${dest || 'este destino'}`}
                          disabled={busy === `save:${opt.url}`}
                          onClick={() => saveToBank(opt)}
                        >
                          <BookmarkPlus className={`w-3.5 h-3.5 ${busy === `save:${opt.url}` ? 'animate-pulse' : ''}`} />
                        </TileAction>
                      )}
                      {isLibrary && !opt.is_default && (
                        <TileAction
                          title="Usar como foto padrão deste destino"
                          tone="gold"
                          disabled={busy === `def:${opt.id}`}
                          onClick={() => makeDefault(opt)}
                        >
                          <Star className="w-3.5 h-3.5" />
                        </TileAction>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {options.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
              {mode === 'search'
                ? 'Nenhuma foto encontrada para essa busca. Tente outro termo.'
                : 'Nenhuma foto encontrada — será usado o fundo padrão. Você pode buscar outro termo ou enviar a sua.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
