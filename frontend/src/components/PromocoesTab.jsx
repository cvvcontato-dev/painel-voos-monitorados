import { useState, useRef, useEffect } from 'react';
import {
  UploadCloud, Sparkles, ArrowLeft, RefreshCw, Copy, Download,
  Plus, AlertTriangle, Info, Image as ImageIcon, Library, Camera
} from 'lucide-react';
import { extractPrint, renderMessage, renderImage } from '../api/promoClient';
import BackgroundPicker from './BackgroundPicker';
import BackgroundBank from './BackgroundBank';
import SmartProcessingModal from './SmartProcessingModal';
import useSmartProgress from '../hooks/useSmartProgress';
import EmptyState from './EmptyState';

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
  const [selectedBg, setSelectedBg] = useState(null);
  const [bankOpen, setBankOpen] = useState(false);
  const fileInputRef = useRef(null);
  const smartProgress = useSmartProgress();

  const lowConf = (name) => (meta.low_confidence_fields || []).includes(name);

  // ── Step 1: Upload ──────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPrintUrl(localUrl);
    setLoading(true);
    smartProgress.start({
      title: 'Lendo Promoção com IA',
      subtitle: 'Extraindo detalhes de destinos, datas e tarifas...',
      steps: [
        { title: 'Lendo dados da promoção com IA...', desc: 'Interpretando cidades, cia aérea, datas e valores' },
        { title: 'Formatando arte e itinerário...', desc: 'Estruturando regras de parcelamento e bagagem' },
        { title: 'Promoção pronta para revisão!', desc: 'Preenchendo formulário inteligente' }
      ]
    });
    try {
      const res = await extractPrint(file);
      setPromotion(res.promotion);
      setMeta(res._meta || { low_confidence_fields: [], validation_warnings: [], agency_commission_detected: null });
      smartProgress.complete();
      setStep('review');
    } catch (err) {
      if (err.kind === 'unprocessable') {
        // Não conseguiu ler o print: vai para revisão com formulário em branco.
        setPromotion(BLANK_PROMOTION());
        setMeta({ low_confidence_fields: [], validation_warnings: [], agency_commission_detected: null });
        smartProgress.complete();
      setStep('review');
        showToast(err.message, 'error');
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Ctrl+V no passo de upload: aceita imagem da área de transferência (print → cola direto)
  useEffect(() => {
    if (step !== 'upload') return;
    const onPaste = (e) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
      if (!item) return;                 // não é imagem — deixa o paste normal seguir
      e.preventDefault();
      const file = item.getAsFile();
      if (file) handleFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [step]);

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
    smartProgress.start({
      title: 'Lendo Promoção com IA',
      subtitle: 'Extraindo detalhes de destinos, datas e tarifas...',
      steps: [
        { title: 'Lendo dados da promoção com IA...', desc: 'Interpretando cidades, cia aérea, datas e valores' },
        { title: 'Formatando arte e itinerário...', desc: 'Estruturando regras de parcelamento e bagagem' },
        { title: 'Promoção pronta para revisão!', desc: 'Preenchendo formulário inteligente' }
      ]
    });
    try {
      const [msgRes, imgRes] = await Promise.all([
        renderMessage(promotion),
        renderImage(promotion, selectedBg),
      ]);
      setMessageText(msgRes.message_text || '');
      setImageUrl(imgRes.image_url || '');
      smartProgress.complete();
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

  const copyInstagramCaption = async () => {
    try {
      const dest = promotion?.destination_city || 'Destino Incrível';
      const orig = promotion?.origin_city ? `Saindo de ${promotion.origin_city}` : '';
      const total = promotion?.total_price ? fmtBRL(promotion.total_price) : '';
      const parc = promotion?.installments && promotion?.installment_amount
        ? `em até ${promotion.installments}x de ${fmtBRL(promotion.installment_amount)}`
        : '';
      const precoStr = total ? `A partir de ${total} ${parc}` : '';

      const caption = `✈️ PROMOÇÃO IMPERDÍVEL PARA ${dest.toUpperCase()}! 🌴🌍\n\n` +
        (orig ? `📍 ${orig}\n` : '') +
        (precoStr ? `💰 ${precoStr.trim()}\n` : '') +
        (promotion?.travel_month_label ? `📅 Período: ${promotion.travel_month_label}\n` : '') +
        `\n✨ Vagas promocionais limitadas! Garanta a sua viagem sem dor de cabeça com todo o suporte da nossa assessoria.\n\n` +
        `💬 Fale conosco agora mesmo pelo link da bio ou envie um Direct!\n\n` +
        `#clubedovoo #promocao #passagensaereas #viagens #turismo #viajar #ferias`;

      await navigator.clipboard.writeText(caption);
      showToast('Legenda para o Instagram copiada!', 'success');
    } catch {
      showToast('Não foi possível copiar legenda', 'error');
    }
  };

  const reset = () => {
    setStep('upload');
    setPromotion(null);
    setMeta({ low_confidence_fields: [], validation_warnings: [], agency_commission_detected: null });
    setPrintUrl(null);
    setMessageText('');
    setImageUrl('');
    setSelectedBg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setBankOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 min-h-[44px] md:min-h-0 text-sm font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Gerenciar as fotos de fundo salvas por destino"
        >
          <Library className="w-4 h-4 text-indigo-500" /> Banco de fundos
        </button>
      </div>
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
          selectedBg={selectedBg}
          onSelectBg={setSelectedBg}
          showToast={showToast}
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
          onCopyInstagram={copyInstagramCaption}
          onRegenerate={regenerate}
          onReset={reset}
        />
      )}

      <BackgroundBank isOpen={bankOpen} onClose={() => setBankOpen(false)} showToast={showToast} />
      <SmartProcessingModal {...smartProgress} />
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
    <div className="flex items-center justify-center gap-2 md:gap-3 mb-6">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 md:gap-3">
          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all ${
            i === idx
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-400 text-white border-indigo-600 shadow-md shadow-indigo-600/25'
              : i < idx
                ? 'bg-blue-50 text-indigo-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50'
          }`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-white/20">{i + 1}</span>
            <span className={i === idx ? '' : 'hidden md:inline'}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="w-4 md:w-8 h-px bg-slate-300 dark:bg-slate-700" />}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────
function UploadStep({ loading, fileInputRef, onSelect, onDrop }) {
  const cameraRef = useRef(null);
  return (
    <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-xl rounded-2xl p-4 md:p-8">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="relative overflow-hidden flex flex-col items-center justify-center gap-4 py-12 md:py-16 px-6 md:px-10 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#3871c1] dark:hover:border-[#3871c1] transition-all cursor-pointer text-center bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-900/30 dark:to-slate-800/20"
      >
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#3871c1]/10 rounded-full blur-2xl pointer-events-none" />
        {loading ? (
          <>
            <div className="w-9 h-9 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Lendo os dados da promoção com IA...</p>
          </>
        ) : (
          <>
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600/15 to-indigo-400/20 dark:from-indigo-600/30 dark:to-indigo-400/40 border border-indigo-600/25 flex items-center justify-center text-indigo-600 dark:text-[#3871c1] shadow-lg shadow-indigo-600/10">
                <UploadCloud className="w-8 h-8" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3871c1] opacity-60" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-600" />
              </span>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">Envie o print da promoção</p>
              <p className="hidden md:block text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
                Arraste uma imagem aqui, clique para selecionar ou aperte <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs text-slate-700 dark:text-slate-300">Ctrl+V</kbd> para colar da área de transferência.
              </p>
              <p className="md:hidden text-sm text-slate-500 dark:text-slate-400 mt-1">Toque para escolher uma imagem (PNG ou JPG)</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); cameraRef.current?.click(); }}
              className="md:hidden min-h-[44px] px-4 inline-flex items-center gap-2 rounded-lg border text-sm font-medium border-indigo-400/40 text-indigo-600 dark:text-sky-300"
            >
              <Camera className="w-4 h-4" /> Tirar foto
            </button>
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
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Fotografar o print"
          onChange={onSelect}
          disabled={loading}
        />
      </label>
    </div>
  );
}

// ── Step 2: Review ────────────────────────────────────────────────
function ReviewStep({ promotion, meta, printUrl, loading, lowConf, setField, toggleBaggage, selectedBg, onSelectBg, showToast, onBack, onGenerate }) {
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
            <EmptyState icon={ImageIcon} title="Nenhum print carregado" description="Envie uma imagem ou print acima para ler os dados promocionais com IA." hint="Dica: Cole um print com Ctrl+V a qualquer momento." className="py-6" />
          )}
        </div>

        {/* Editable form */}
        <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl p-4 md:p-6 space-y-4">
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
              <div className="flex flex-wrap items-center gap-x-6 gap-y-0 mt-2">
                <label className="flex items-center gap-2 min-h-[44px] md:min-h-0 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 md:w-4 md:h-4 rounded accent-indigo-600" checked={(promotion.baggage || []).includes('carry_on')} onChange={() => toggleBaggage('carry_on')} />
                  Bagagem de mão
                </label>
                <label className="flex items-center gap-2 min-h-[44px] md:min-h-0 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 md:w-4 md:h-4 rounded accent-indigo-600" checked={(promotion.baggage || []).includes('checked')} onChange={() => toggleBaggage('checked')} />
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
          <BackgroundPicker
            destination={promotion.destination_city}
            country={promotion.destination_country}
            selectedBg={selectedBg}
            onSelectBg={onSelectBg}
            showToast={showToast}
          />

          {/* Actions */}
          <div className="pt-4 flex justify-between gap-3 border-t border-slate-200 dark:border-slate-700/50">
            <button
              onClick={onBack}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button
              onClick={onGenerate}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95 disabled:opacity-50"
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
          <span className="inline-flex items-center gap-1 text-[11px] md:text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 px-1.5 py-0.5 rounded">
            <AlertTriangle className="w-2.5 h-2.5" /> revisar
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// ── Step 3: Result ────────────────────────────────────────────────
function ResultStep({ imageUrl, messageText, loading, onCopy, onCopyInstagram, onRegenerate, onReset }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Generated art */}
      <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl p-4 md:p-6">
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
          className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" /> Baixar imagem
        </a>

        <button
          type="button"
          onClick={onCopyInstagram}
          className="mt-2 w-full flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors cursor-pointer"
          title="Copiar legenda formatada para o Instagram"
        >
          <Copy className="w-4 h-4" /> Copiar Legenda Instagram
        </button>

      </div>

      {/* WhatsApp message */}
      <div className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl p-4 md:p-6 flex flex-col">
        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Mensagem WhatsApp</div>
        <textarea
          readOnly
          value={messageText}
          className={`${inputCls} flex-1 min-h-[280px] resize-none font-mono text-sm leading-relaxed`}
        />
        <button
          onClick={onCopy}
          className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95"
        >
          <Copy className="w-4 h-4" /> Copiar mensagem
        </button>
      </div>

      {/* Footer actions */}
      <div className="lg:col-span-2 flex justify-between gap-3">
        <button
          onClick={onRegenerate}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Regenerar
        </button>
        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nova promoção
        </button>
      </div>
    </div>
  );
}
