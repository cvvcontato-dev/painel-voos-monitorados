import { useState, useRef } from 'react';
import {
  UploadCloud, Sparkles, ArrowLeft, RefreshCw, Copy, Download,
  Plus, AlertTriangle, Info, Image as ImageIcon, Ban, Check
} from 'lucide-react';
import { extractPrint, renderMessage, renderImage, listBackgrounds } from '../api/promoClient';

const fmtBRL = (v) => {
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
};

// Promoção em branco usada quando o print não pôde ser lido (kind unprocessable).
const BLANK_PROMOTION = (promo_id) => ({
  promo_id: promo_id || '',
  origin_city: '', destination_city: '', destination_country: '', travel_month_label: '', availability_note: '',
  display_availability: '', nights: '', passengers: '', hotel_name: '', hotel_stars: '',
  hotel_rating_value: '', hotel_rating_text: '', flight_type: 'Direto', airlines: [],
  baggage: ['carry_on'], meal_plan: 'Café da Manhã', total_price: '', installments: '', installment_amount: '',
  taxes_included: false, customization_text: '', cta_text: '',
});

const MEAL_OPTIONS = ['Café da Manhã', 'Meia Pensão', 'Pensão Completa'];

const inputCls = "w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border " +
  "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
  "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";

const lowConfCls = "border-amber-400 focus:ring-amber-500 dark:border-amber-500/60";

export default function PromocoesTab({ showToast }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'review' | 'result'
  const [loading, setLoading] = useState(false);
  const [promotion, setPromotion] = useState(null);
  const [meta, setMeta] = useState({ low_confidence_fields: [], validation_warnings: [], agency_commission_detected: null });
  const [printUrl, setPrintUrl] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [backgrounds, setBackgrounds] = useState([]);
  const [selectedBg, setSelectedBg] = useState(null);
  const [loadingBg, setLoadingBg] = useState(false);
  const fileInputRef = useRef(null);

  const lowConf = (name) => (meta.low_confidence_fields || []).includes(name);

  // ── Backgrounds ─────────────────────────────────────────────────
  const fetchBackgrounds = async (destination) => {
    if (!destination) return;
    setLoadingBg(true);
    try {
      const res = await listBackgrounds(destination);
      const options = res.options || [];
      setBackgrounds(options);
      setSelectedBg(options[0]?.url ?? null);
    } catch {
      // Backgrounds são opcionais — não bloquear o fluxo nem poluir com erros.
      setBackgrounds([]);
      setSelectedBg(null);
    } finally {
      setLoadingBg(false);
    }
  };

  // ── Step 1: Upload ──────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPrintUrl(localUrl);
    setLoading(true);
    try {
      const res = await extractPrint(file);
      setPromotion(res.promotion);
      setMeta(res._meta || { low_confidence_fields: [], validation_warnings: [], agency_commission_detected: null });
      setStep('review');
      fetchBackgrounds(res.promotion?.destination_city);
    } catch (err) {
      if (err.kind === 'unprocessable') {
        // Não conseguiu ler o print: vai para revisão com formulário em branco.
        setPromotion(BLANK_PROMOTION());
        setMeta({ low_confidence_fields: [], validation_warnings: [], agency_commission_detected: null });
        setStep('review');
        showToast(err.message, 'error');
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  // ── Field updaters ──────────────────────────────────────────────
  const setField = (name, value) => setPromotion((p) => ({ ...p, [name]: value }));
  const toggleBaggage = (kind) => setPromotion((p) => {
    const cur = Array.isArray(p.baggage) ? p.baggage : [];
    return { ...p, baggage: cur.includes(kind) ? cur.filter((b) => b !== kind) : [...cur, kind] };
  });

  // ── Step 2 → 3: Generate ────────────────────────────────────────
  const generate = async () => {
    setLoading(true);
    try {
      const [msgRes, imgRes] = await Promise.all([
        renderMessage(promotion),
        renderImage(promotion, selectedBg),
      ]);
      setMessageText(msgRes.message_text || '');
      setImageUrl(imgRes.image_url || '');
      setStep('result');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const regenerate = generate;

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      showToast('Mensagem copiada', 'success');
    } catch {
      showToast('Não foi possível copiar', 'error');
    }
  };

  const reset = () => {
    setStep('upload');
    setPromotion(null);
    setMeta({ low_confidence_fields: [], validation_warnings: [], agency_commission_detected: null });
    setPrintUrl(null);
    setMessageText('');
    setImageUrl('');
    setBackgrounds([]);
    setSelectedBg(null);
    setLoadingBg(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-5xl mx-auto">
      <Stepper step={step} />

      {step === 'upload' && (
        <UploadStep
          loading={loading}
          fileInputRef={fileInputRef}
          onSelect={(e) => handleFile(e.target.files?.[0])}
          onDrop={onDrop}
        />
      )}

      {step === 'review' && promotion && (
        <ReviewStep
          promotion={promotion}
          meta={meta}
          printUrl={printUrl}
          loading={loading}
          lowConf={lowConf}
          setField={setField}
          toggleBaggage={toggleBaggage}
          backgrounds={backgrounds}
          selectedBg={selectedBg}
          loadingBg={loadingBg}
          onSelectBg={setSelectedBg}
          onRefreshBg={() => fetchBackgrounds(promotion.destination_city)}
          onBack={reset}
          onGenerate={generate}
        />
      )}

      {step === 'result' && (
        <ResultStep
          imageUrl={imageUrl}
          messageText={messageText}
          loading={loading}
          onCopy={copyMessage}
          onRegenerate={regenerate}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ── Stepper indicator ─────────────────────────────────────────────
function Stepper({ step }) {
  const steps = [
    { id: 'upload', label: 'Enviar print' },
    { id: 'review', label: 'Revisar' },
    { id: 'result', label: 'Resultado' },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center justify-center gap-3 mb-6">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${
            i === idx
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/25'
              : i < idx
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20'
                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50'
          }`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-white/20">{i + 1}</span>
            {s.label}
          </div>
          {i < steps.length - 1 && <div className="w-8 h-px bg-slate-300 dark:bg-slate-700" />}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────
function UploadStep({ loading, fileInputRef, onSelect, onDrop }) {
  return (
    <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl p-8">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="flex flex-col items-center justify-center gap-4 py-16 px-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500/60 transition-colors cursor-pointer text-center"
      >
        {loading ? (
          <>
            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-600 dark:text-slate-400">Lendo o print da promoção...</p>
          </>
        ) : (
          <>
            <div className="bg-indigo-500/10 p-4 rounded-2xl text-indigo-400 border border-indigo-500/20">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-white">Envie o print da promoção</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Arraste uma imagem aqui ou clique para selecionar (PNG ou JPG)</p>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={onSelect}
          disabled={loading}
        />
      </label>
    </div>
  );
}

// ── Step 2: Review ────────────────────────────────────────────────
function ReviewStep({ promotion, meta, printUrl, loading, lowConf, setField, toggleBaggage, backgrounds, selectedBg, loadingBg, onSelectBg, onRefreshBg, onBack, onGenerate }) {
  const warnings = meta.validation_warnings || [];
  const commission = meta.agency_commission_detected;

  return (
    <div className="space-y-4">
      {/* Callouts */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm mb-2">
            <AlertTriangle className="w-4 h-4" /> Avisos de validação
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-amber-700 dark:text-amber-300/90">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {commission ? (
        <div className="bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/25 rounded-xl p-4 flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Comissão detectada ({fmtBRL(commission)}) — não aparecerá na arte nem na mensagem.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4">
        {/* Print preview */}
        <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl p-4 self-start">
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> Print enviado
          </div>
          {printUrl ? (
            <img src={printUrl} alt="Print da promoção" className="w-full rounded-lg border border-slate-200 dark:border-slate-700/50" />
          ) : (
            <div className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">Nenhuma imagem</div>
          )}
        </div>

        {/* Editable form */}
        <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Cidade de origem" name="origin_city" lowConf={lowConf}>
              <input className={`${inputCls} ${lowConf('origin_city') ? lowConfCls : ''}`} value={promotion.origin_city ?? ''} onChange={(e) => setField('origin_city', e.target.value)} />
            </Field>
            <Field label="Cidade de destino" name="destination_city" lowConf={lowConf}>
              <input className={`${inputCls} ${lowConf('destination_city') ? lowConfCls : ''}`} value={promotion.destination_city ?? ''} onChange={(e) => setField('destination_city', e.target.value)} />
            </Field>
            <Field label="País de destino" name="destination_country" lowConf={lowConf}>
              <input className={inputCls} value={promotion.destination_country ?? ''} onChange={(e) => setField('destination_country', e.target.value)} />
            </Field>
            <Field label="Mês da viagem" name="travel_month_label" lowConf={lowConf}>
              <input className={`${inputCls} ${lowConf('travel_month_label') ? lowConfCls : ''}`} value={promotion.travel_month_label ?? ''} onChange={(e) => setField('travel_month_label', e.target.value)} />
            </Field>
            <Field label="Disponibilidade (texto)" name="display_availability" lowConf={lowConf}>
              <input className={`${inputCls} ${lowConf('display_availability') ? lowConfCls : ''}`} value={promotion.display_availability ?? ''} onChange={(e) => setField('display_availability', e.target.value)} />
            </Field>
            <Field label="Noites" name="nights" lowConf={lowConf}>
              <input type="number" className={`${inputCls} ${lowConf('nights') ? lowConfCls : ''}`} value={promotion.nights ?? ''} onChange={(e) => setField('nights', e.target.value)} />
            </Field>
            <Field label="Passageiros" name="passengers" lowConf={lowConf}>
              <input type="number" className={`${inputCls} ${lowConf('passengers') ? lowConfCls : ''}`} value={promotion.passengers ?? ''} onChange={(e) => setField('passengers', e.target.value)} />
            </Field>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700/50 pt-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold mb-3">Hotel</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nome do hotel" name="hotel_name" lowConf={lowConf}>
                <input className={`${inputCls} ${lowConf('hotel_name') ? lowConfCls : ''}`} value={promotion.hotel_name ?? ''} onChange={(e) => setField('hotel_name', e.target.value)} />
              </Field>
              <Field label="Plano de refeições" name="meal_plan" lowConf={lowConf}>
                <select className={`${inputCls} appearance-none`} value={promotion.meal_plan || 'Café da Manhã'} onChange={(e) => setField('meal_plan', e.target.value)}>
                  {MEAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Estrelas" name="hotel_stars" lowConf={lowConf}>
                <input type="number" className={`${inputCls} ${lowConf('hotel_stars') ? lowConfCls : ''}`} value={promotion.hotel_stars ?? ''} onChange={(e) => setField('hotel_stars', e.target.value)} />
              </Field>
              <Field label="Nota de avaliação" name="hotel_rating_value" lowConf={lowConf}>
                <input type="number" step="0.1" className={`${inputCls} ${lowConf('hotel_rating_value') ? lowConfCls : ''}`} value={promotion.hotel_rating_value ?? ''} onChange={(e) => setField('hotel_rating_value', e.target.value)} />
              </Field>
              <Field label="Avaliação (texto)" name="hotel_rating_text" lowConf={lowConf}>
                <input className={inputCls} value={promotion.hotel_rating_text ?? ''} onChange={(e) => setField('hotel_rating_text', e.target.value)} placeholder="Muito bom" />
              </Field>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700/50 pt-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold mb-3">Voo</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tipo de voo" name="flight_type" lowConf={lowConf}>
                <select className={`${inputCls} appearance-none ${lowConf('flight_type') ? lowConfCls : ''}`} value={(promotion.flight_type && promotion.flight_type.toLowerCase().includes('parad')) ? 'Com paradas' : 'Direto'} onChange={(e) => setField('flight_type', e.target.value)}>
                  <option value="Direto" className="bg-white dark:bg-slate-900">Direto</option>
                  <option value="Com paradas" className="bg-white dark:bg-slate-900">Com paradas</option>
                </select>
              </Field>
              <Field label="Companhias (separadas por vírgula)" name="airlines" lowConf={lowConf}>
                <input
                  className={`${inputCls} ${lowConf('airlines') ? lowConfCls : ''}`}
                  value={Array.isArray(promotion.airlines) ? promotion.airlines.join(', ') : (promotion.airlines ?? '')}
                  onChange={(e) => setField('airlines', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                />
              </Field>
            </div>
            <div className="mt-4">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Bagagem</span>
              <div className="flex items-center gap-6 mt-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded accent-indigo-600" checked={(promotion.baggage || []).includes('carry_on')} onChange={() => toggleBaggage('carry_on')} />
                  Bagagem de mão
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded accent-indigo-600" checked={(promotion.baggage || []).includes('checked')} onChange={() => toggleBaggage('checked')} />
                  Bagagem despachada
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700/50 pt-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold mb-3">Preço & Chamada</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Preço total (R$)" name="total_price" lowConf={lowConf}>
                <input type="number" step="0.01" className={`${inputCls} ${lowConf('total_price') ? lowConfCls : ''}`} value={promotion.total_price ?? ''} onChange={(e) => setField('total_price', e.target.value)} />
              </Field>
              <Field label="Parcelas" name="installments" lowConf={lowConf}>
                <input type="number" className={`${inputCls} ${lowConf('installments') ? lowConfCls : ''}`} value={promotion.installments ?? ''} onChange={(e) => setField('installments', e.target.value)} />
              </Field>
              <Field label="Valor da parcela (R$)" name="installment_amount" lowConf={lowConf}>
                <input type="number" step="0.01" className={`${inputCls} ${lowConf('installment_amount') ? lowConfCls : ''}`} value={promotion.installment_amount ?? ''} onChange={(e) => setField('installment_amount', e.target.value)} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Personalize (texto)" name="customization_text" lowConf={lowConf}>
                <input className={inputCls} value={promotion.customization_text ?? ''} onChange={(e) => setField('customization_text', e.target.value)} placeholder="Precisa de outras datas ou roteiro? Fale conosco!" />
              </Field>
              <Field label="Texto da chamada (CTA)" name="cta_text" lowConf={lowConf}>
                <input className={`${inputCls} ${lowConf('cta_text') ? lowConfCls : ''}`} value={promotion.cta_text ?? ''} onChange={(e) => setField('cta_text', e.target.value)} placeholder="Garanta já sua viagem inesquecível!" />
              </Field>
            </div>
          </div>

          {/* Fundo da arte */}
          <div className="border-t border-slate-200 dark:border-slate-700/50 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Fundo da arte
              </p>
              <button
                type="button"
                onClick={onRefreshBg}
                disabled={loadingBg}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingBg ? 'animate-spin' : ''}`} /> Atualizar fundos
              </button>
            </div>

            {loadingBg ? (
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
                    className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      selectedBg === null
                        ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'
                    } bg-slate-50 dark:bg-slate-800/50`}
                  >
                    <Ban className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Sem fundo</span>
                    {selectedBg === null && (
                      <span className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>

                  {backgrounds.map((opt) => {
                    const active = selectedBg === opt.url;
                    return (
                      <button
                        key={opt.url}
                        type="button"
                        onClick={() => onSelectBg(opt.url)}
                        className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                          active
                            ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                            : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'
                        }`}
                      >
                        <img src={opt.thumb} alt={`Fundo (${opt.source})`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 left-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/60 text-white">
                          {opt.source === 'local' ? 'Local' : 'Pexels'}
                        </span>
                        {active && (
                          <span className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {backgrounds.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
                    Nenhuma foto encontrada — será usado o fundo padrão.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="pt-4 flex justify-between gap-3 border-t border-slate-200 dark:border-slate-700/50">
            <button
              onClick={onBack}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button
              onClick={onGenerate}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Gerando...' : 'Gerar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, lowConf, children }) {
  const flagged = lowConf(name);
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
        {label}
        {flagged && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 px-1.5 py-0.5 rounded">
            <AlertTriangle className="w-2.5 h-2.5" /> revisar
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// ── Step 3: Result ────────────────────────────────────────────────
function ResultStep({ imageUrl, messageText, loading, onCopy, onRegenerate, onReset }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Generated art */}
      <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl p-6">
        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" /> Arte gerada
        </div>
        {imageUrl ? (
          <img src={imageUrl} alt="Arte da promoção" className="w-full rounded-lg border border-slate-200 dark:border-slate-700/50" />
        ) : (
          <div className="text-sm text-slate-400 dark:text-slate-500 py-12 text-center">Imagem indisponível</div>
        )}
        <a
          href={imageUrl}
          download="promocao.png"
          className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" /> Baixar imagem
        </a>
      </div>

      {/* WhatsApp message */}
      <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl p-6 flex flex-col">
        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Mensagem WhatsApp</div>
        <textarea
          readOnly
          value={messageText}
          className={`${inputCls} flex-1 min-h-[280px] resize-none font-mono text-sm leading-relaxed`}
        />
        <button
          onClick={onCopy}
          className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95"
        >
          <Copy className="w-4 h-4" /> Copiar mensagem
        </button>
      </div>

      {/* Footer actions */}
      <div className="lg:col-span-2 flex justify-between gap-3">
        <button
          onClick={onRegenerate}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Regenerar
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nova promoção
        </button>
      </div>
    </div>
  );
}
