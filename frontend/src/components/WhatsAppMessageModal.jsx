import React, { useState, useEffect, useMemo } from 'react';
import { X, Copy, Check, MessageCircle, Plus, Link as LinkIcon, User, CreditCard, Sparkles, AlertCircle, Percent } from 'lucide-react';
import useBackClose from '../hooks/useBackClose';
import { getSellers, addSeller } from '../api/voucherClient';

function extractFirstName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  const first = parts[0].toLowerCase();
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default function WhatsAppMessageModal({ isOpen, onClose, voucher, itinerarioUrl, showToast }) {
  useBackClose(isOpen, onClose);

  // Campos do formulário
  const [clientName, setClientName] = useState('');
  
  // Modo de Localizador: 'single' | 'multiple'
  const [locatorMode, setLocatorMode] = useState('single');
  const [locatorSingle, setLocatorSingle] = useState('');
  const [locatorIda, setLocatorIda] = useState('');
  const [locatorVolta, setLocatorVolta] = useState('');

  // Link do CRM
  const [crmLink, setCrmLink] = useState('');

  // Detalhes do Pagamento
  const [itemType, setItemType] = useState('Voo'); // 'Voo' | 'Pacote'
  const [paxCount, setPaxCount] = useState(2);
  const [itemAmount, setItemAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  
  // Desconto por forma de pagamento
  const [hasDiscount, setHasDiscount] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('-3%');
  const [discountAmount, setDiscountAmount] = useState('');

  // Modo livre para detalhes caso prefira editar
  const [customDetails, setCustomDetails] = useState('');
  const [useCustomDetails, setUseCustomDetails] = useState(false);

  // Condição de Pagamento
  const [paymentStatus, setPaymentStatus] = useState('paid'); // 'paid' | 'pending'
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentLink, setPaymentLink] = useState('');

  // Vendedores
  const [sellers, setSellers] = useState([{ id: 1, name: 'Joabh Souza' }]);
  const [selectedSeller, setSelectedSeller] = useState('Joabh Souza');
  const [newSellerName, setNewSellerName] = useState('');
  const [addingSeller, setAddingSeller] = useState(false);
  const [copied, setCopied] = useState(false);

  // Carrega lista de vendedores e seleciona o preferido
  useEffect(() => {
    let active = true;
    getSellers()
      .then(list => {
        if (!active) return;
        if (Array.isArray(list) && list.length > 0) {
          setSellers(list);
          const saved = localStorage.getItem('last_selected_seller');
          if (saved && list.some(s => s.name === saved)) {
            setSelectedSeller(saved);
          } else {
            setSelectedSeller(list[0].name);
          }
        }
      })
      .catch(() => {
        // fallback
      });
    return () => { active = false; };
  }, []);

  // Inicializa dados com base no voucher atual quando o modal abre
  useEffect(() => {
    if (!isOpen) return;

    // Nome do cliente extraído do 1º passageiro
    const firstPax = voucher?.passengers?.[0]?.name;
    const name = extractFirstName(firstPax) || 'Júnior';
    setClientName(name);

    // Quantidade de passageiros
    const count = voucher?.passengers?.length || 2;
    setPaxCount(count);

    // Identifica se há múltiplos localizadores nos trechos
    const trips = voucher?.trips || [];
    const tripLocators = trips.map(t => t.locator).filter(Boolean);
    const uniqueLocs = [...new Set(tripLocators)];

    if (uniqueLocs.length > 1) {
      setLocatorMode('multiple');
      const idaTrip = trips.find(t => t.direction === 'ida');
      const voltaTrip = trips.find(t => t.direction === 'volta');
      setLocatorIda(idaTrip?.locator || uniqueLocs[0] || '');
      setLocatorVolta(voltaTrip?.locator || uniqueLocs[1] || '');
    } else {
      setLocatorMode('single');
      const loc = voucher?.reservation?.locator || uniqueLocs[0] || '';
      setLocatorSingle(loc);
    }

    // Link do itinerário
    setCrmLink('');

    // Reset desconto e valores
    setHasDiscount(false);
    setDiscountPercent('-3%');
    setDiscountAmount('');
    setItemAmount('');
    setTaxAmount('');
    setUseCustomDetails(false);

    setCopied(false);
  }, [isOpen, voucher]);

  // Constrói as linhas de detalhes de pagamento estruturadas
  const builtPaymentDetails = useMemo(() => {
    if (useCustomDetails && customDetails) return customDetails;

    const paxLabel = paxCount === 1 ? '1 pessoa' : `${paxCount} pessoas`;
    const lines = [];

    const itemStr = itemAmount.trim() ? `R$ ${itemAmount.trim()}` : '';
    lines.push(`> ${itemType} para ${paxLabel}: ${itemStr}`);

    const taxStr = taxAmount.trim() ? `R$ ${taxAmount.trim()}` : '';
    lines.push(`> Impostos, taxas e encargos: ${taxStr}`);

    if (hasDiscount) {
      const pct = discountPercent.trim() ? `(${discountPercent.trim()})` : '';
      const discVal = discountAmount.trim()
        ? (discountAmount.trim().startsWith('-') ? discountAmount.trim() : `-R$ ${discountAmount.trim()}`)
        : '';
      lines.push(`> Desconto por forma de pagamento ${pct}: ${discVal}`);
    }

    return lines.join('\n');
  }, [useCustomDetails, customDetails, itemType, paxCount, itemAmount, taxAmount, hasDiscount, discountPercent, discountAmount]);

  // Constrói o bloco de localizador
  const locatorBlock = useMemo(() => {
    if (locatorMode === 'multiple') {
      const ida = locatorIda.trim() || '---';
      const volta = locatorVolta.trim() || '---';
      return `Localizadores:\n> Ida: _${ida}_\n> Volta: _${volta}_`;
    }
    const single = locatorSingle.trim() || '---';
    return `Localizador: \n> _${single}_`;
  }, [locatorMode, locatorSingle, locatorIda, locatorVolta]);

  // Mensagem final formatada no WhatsApp
  const formattedMessage = useMemo(() => {
    const name = clientName?.trim() || 'Cliente';
    const link = crmLink?.trim();

    let linkBlock = '';
    if (link) {
      linkBlock = `Para visualizar todos os detalhes da sua viagem, acesse o link:\n${link}\n\n`;
    }

    const payDetailsBlock = builtPaymentDetails.trim()
      ? `*🏦 Detalhes do pagamento:*\n${builtPaymentDetails.trim()}\n\n`
      : '';

    let payDataBlock = '';
    if (paymentStatus === 'paid') {
      const totalStr = totalAmount?.trim() ? `R$ ${totalAmount.trim()}` : '';
      const methodStr = paymentMethod?.trim() ? `, ${paymentMethod.trim()}` : '';
      const dot = totalStr.endsWith('.') ? '' : '.';
      payDataBlock = `*💰 Dados para o seu pagamento:*\n*Total:* ${totalStr}${methodStr}${dot}✅\n\n`;
    } else {
      const totalStr = totalAmount?.trim() ? `R$ ${totalAmount.trim()}` : '';
      const linkStr = paymentLink?.trim() ? `\nLink para pagamento: ${paymentLink.trim()} 💳` : '';
      payDataBlock = `*💰 Dados para o seu pagamento:*\n*Total:* ${totalStr}.${linkStr}\n\n`;
    }

    const sellerName = selectedSeller?.trim() || 'Joabh Souza';

    return `*Pronto, ${name}! 🌟*\n\n` +
      `Parabéns pela sua compra!🥳 Sua reserva foi confirmada com sucesso! ✈️🧳\n\n` +
      `*✈️ Dados da reserva:*\n` +
      `${locatorBlock}\n\n` +
      linkBlock +
      payDetailsBlock +
      payDataBlock +
      `Estamos à disposição para qualquer dúvida ou alteração. Agradecemos por escolher o Clube do Voo Viagens. Desejamos uma viagem incrível! 🌏✨\n\n` +
      `Atenciosamente,\n` +
      `_${sellerName}_\n` +
      `_Clube do Voo Viagens LTDA_`;
  }, [clientName, locatorBlock, crmLink, builtPaymentDetails, paymentStatus, totalAmount, paymentMethod, paymentLink, selectedSeller]);

  const handleSelectSeller = (e) => {
    const val = e.target.value;
    setSelectedSeller(val);
    localStorage.setItem('last_selected_seller', val);
  };

  const handleAddSeller = async () => {
    const trimmed = newSellerName.trim();
    if (!trimmed) return;
    try {
      const created = await addSeller(trimmed);
      setSellers(prev => {
        const exists = prev.some(s => s.name.toLowerCase() === created.name.toLowerCase());
        return exists ? prev : [...prev, created];
      });
      setSelectedSeller(created.name);
      localStorage.setItem('last_selected_seller', created.name);
      setNewSellerName('');
      setAddingSeller(false);
      showToast?.('Vendedor adicionado', 'success');
    } catch {
      showToast?.('Erro ao adicionar vendedor', 'error');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedMessage).then(() => {
      setCopied(true);
      showToast?.('Mensagem copiada para a área de transferência!', 'success');
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      showToast?.('Erro ao copiar mensagem', 'error');
    });
  };

  const handleSendWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(formattedMessage)}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Mensagem para WhatsApp
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-800">
                  Padrão Clube do Voo
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Personalize os dados e copie ou envie direto para o cliente com formatação oficial.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo: Formulário + Prévia WhatsApp */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna 1: Campos */}
          <div className="lg:col-span-6 space-y-4">
            {/* Nome do Cliente */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Nome do Cliente
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Ex: Júnior"
                  className="w-full pl-9 pr-3 py-2 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Localizadores: Único ou Múltiplos (Ida/Volta) */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Localizador da Reserva
                </label>
                <div className="flex rounded-lg bg-slate-200 dark:bg-slate-700 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setLocatorMode('single')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                      locatorMode === 'single'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    Único
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocatorMode('multiple')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                      locatorMode === 'multiple'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    Ida e Volta
                  </button>
                </div>
              </div>

              {locatorMode === 'single' ? (
                <div>
                  <input
                    type="text"
                    value={locatorSingle}
                    onChange={e => setLocatorSingle(e.target.value.toUpperCase())}
                    placeholder="Ex: AYZEER"
                    className="w-full px-3 py-2 text-base md:text-sm font-mono font-bold tracking-wider bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-emerald-700 dark:text-emerald-400 uppercase"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Ida
                    </label>
                    <input
                      type="text"
                      value={locatorIda}
                      onChange={e => setLocatorIda(e.target.value.toUpperCase())}
                      placeholder="Ex: LNVZPS"
                      className="w-full px-3 py-1.5 text-base md:text-sm font-mono font-bold tracking-wider bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-emerald-700 dark:text-emerald-400 uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Volta
                    </label>
                    <input
                      type="text"
                      value={locatorVolta}
                      onChange={e => setLocatorVolta(e.target.value.toUpperCase())}
                      placeholder="Ex: SICQVA"
                      className="w-full px-3 py-1.5 text-base md:text-sm font-mono font-bold tracking-wider bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-emerald-700 dark:text-emerald-400 uppercase"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Link do CRM */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Link do Itinerário (CRM)
                </label>
                {itinerarioUrl && (
                  <button
                    type="button"
                    onClick={() => setCrmLink(itinerarioUrl)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <LinkIcon className="w-3 h-3" /> Usar link do painel
                  </button>
                )}
              </div>
              <div className="relative">
                <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={crmLink}
                  onChange={e => setCrmLink(e.target.value)}
                  placeholder="https://agencia.iddas.com.br/reserva/..."
                  className="w-full pl-9 pr-3 py-2 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Detalhes do Pagamento (com Desconto Opcional) */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  🏦 Detalhes do Pagamento
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!useCustomDetails) setCustomDetails(builtPaymentDetails);
                    setUseCustomDetails(!useCustomDetails);
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {useCustomDetails ? 'Usar campos estruturados' : 'Editar texto livre'}
                </button>
              </div>

              {!useCustomDetails ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                        Tipo
                      </label>
                      <select
                        value={itemType}
                        onChange={e => setItemType(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                      >
                        <option value="Voo">Voo</option>
                        <option value="Pacote">Pacote</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                        Qtd. Passageiros
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={paxCount}
                        onChange={e => setPaxCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                        Valor Voo/Pacote (R$)
                      </label>
                      <input
                        type="text"
                        value={itemAmount}
                        onChange={e => setItemAmount(e.target.value)}
                        placeholder="Ex: 2.234,16"
                        className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Impostos, taxas e encargos (R$)
                    </label>
                    <input
                      type="text"
                      value={taxAmount}
                      onChange={e => setTaxAmount(e.target.value)}
                      placeholder="Ex: 312,49"
                      className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  {/* Checkbox Desconto por forma de pagamento */}
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700/60">
                    <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                      <input
                        type="checkbox"
                        checked={hasDiscount}
                        onChange={e => setHasDiscount(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                      />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Desconto por forma de pagamento
                      </span>
                    </label>

                    {hasDiscount && (
                      <div className="grid grid-cols-2 gap-2 mt-2 pl-6 animate-fade-in">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Percentual
                          </label>
                          <input
                            type="text"
                            value={discountPercent}
                            onChange={e => setDiscountPercent(e.target.value)}
                            placeholder="Ex: -3%"
                            className="w-full px-2.5 py-1 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Valor do desconto (R$)
                          </label>
                          <input
                            type="text"
                            value={discountAmount}
                            onChange={e => setDiscountAmount(e.target.value)}
                            placeholder="Ex: 175,35"
                            className="w-full px-2.5 py-1 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    rows={4}
                    value={customDetails}
                    onChange={e => setCustomDetails(e.target.value)}
                    placeholder="> Voo para 2 pessoas: R$ 2.234,16&#10;> Impostos, taxas e encargos: R$ 312,49&#10;> Desconto por forma de pagamento (-3%): -R$ 175,35"
                    className="w-full p-2.5 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 resize-none"
                  />
                </div>
              )}
            </div>

            {/* Dados para o Pagamento (Status / Condição) */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Condição de Pagamento
                </span>
                <div className="flex rounded-lg bg-slate-200 dark:bg-slate-700 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('paid')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                      paymentStatus === 'paid'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    Já Pago ✅
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('pending')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                      paymentStatus === 'pending'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    A Pagar / Link 💳
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Valor Total (R$)
                  </label>
                  <input
                    type="text"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    placeholder="Ex: 5.669,65"
                    className="w-full px-3 py-1.5 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                  />
                </div>

                {paymentStatus === 'paid' ? (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Condição / Forma (opcional)
                    </label>
                    <input
                      type="text"
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      placeholder="Ex: em 4x sem juros no NuPay"
                      className="w-full px-3 py-1.5 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Link de Pagamento ou Pix
                    </label>
                    <input
                      type="text"
                      value={paymentLink}
                      onChange={e => setPaymentLink(e.target.value)}
                      placeholder="Ex: https://pag.ae/... ou Pix"
                      className="w-full px-3 py-1.5 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Vendedor no rodapé (sem alterar a formatação do rodapé) */}
            <div className="pt-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Vendedor / Emissor
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedSeller}
                  onChange={handleSelectSeller}
                  className="flex-1 px-3 py-2 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                >
                  {sellers.map(s => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setAddingSeller(!addingSeller)}
                  className="px-3 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  title="Cadastrar novo vendedor"
                >
                  <Plus className="w-4 h-4" /> Novo
                </button>
              </div>

              {addingSeller && (
                <div className="mt-2 p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg flex gap-2 items-center">
                  <input
                    type="text"
                    value={newSellerName}
                    onChange={e => setNewSellerName(e.target.value)}
                    placeholder="Nome completo do vendedor"
                    className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddSeller}
                    disabled={!newSellerName.trim()}
                    className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium disabled:opacity-50 cursor-pointer"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingSeller(false)}
                    className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Coluna 2: Prévia ao Vivo do WhatsApp */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Prévia ao vivo no WhatsApp
              </span>
              <span className="text-[11px] text-slate-400">Visual real no WhatsApp</span>
            </div>

            {/* Container estilo WhatsApp Dark Wallpaper */}
            <div className="flex-1 min-h-[400px] bg-[#0c1317] rounded-xl p-4 sm:p-5 overflow-y-auto border border-[#222d34] flex flex-col justify-between shadow-inner">
              {/* Balão de mensagem verde do WhatsApp */}
              <div className="self-end max-w-full sm:max-w-[94%] bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-sm p-4 text-[13.5px] leading-relaxed shadow-md font-sans">
                {/* Renderização formatada com negritos e citações reais */}
                <div className="whitespace-pre-wrap break-words space-y-3 font-normal">
                  <p><strong className="font-bold text-white">Pronto, {clientName || 'Júnior'}! 🌟</strong></p>
                  <p>Parabéns pela sua compra!🥳 Sua reserva foi confirmada com sucesso! ✈️🧳</p>

                  <div>
                    <p className="font-bold text-white">✈️ Dados da reserva:</p>
                    {locatorMode === 'multiple' ? (
                      <>
                        <p className="text-[#aebac1]">Localizadores:</p>
                        <div className="border-l-4 border-emerald-300 pl-2.5 my-1 space-y-0.5">
                          <div>Ida: <span className="italic font-mono text-emerald-200 font-bold">{locatorIda || 'LNVZPS'}</span></div>
                          <div>Volta: <span className="italic font-mono text-emerald-200 font-bold">{locatorVolta || 'SICQVA'}</span></div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-[#aebac1]">Localizador:</p>
                        <div className="border-l-4 border-emerald-300 pl-2.5 my-1">
                          <span className="italic font-mono text-emerald-200 font-bold">{locatorSingle || 'AYZEER'}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {crmLink ? (
                    <div>
                      <p>Para visualizar todos os detalhes da sua viagem, acesse o link:</p>
                      <a
                        href={crmLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#53bdeb] underline break-all hover:text-[#7fd4ff]"
                      >
                        {crmLink}
                      </a>
                    </div>
                  ) : (
                    <div className="p-2 bg-black/20 rounded border border-white/10 text-xs text-amber-200/90 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Link do itinerário não preenchido (adicione seu link CRM ao lado)</span>
                    </div>
                  )}

                  {builtPaymentDetails && (
                    <div>
                      <p className="font-bold text-white">🏦 Detalhes do pagamento:</p>
                      <div className="border-l-4 border-emerald-300 pl-2.5 my-1 text-emerald-100 font-mono text-[13px] whitespace-pre-wrap space-y-0.5">
                        {builtPaymentDetails.split('\n').map((line, idx) => (
                          <div key={idx}>{line.replace(/^>\s*/, '')}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="font-bold text-white">💰 Dados para o seu pagamento:</p>
                    {paymentStatus === 'paid' ? (
                      <p>
                        <strong className="font-bold text-white">Total:</strong> R$ {totalAmount || '5.669,65'}{paymentMethod ? `, ${paymentMethod}` : ''}.✅
                      </p>
                    ) : (
                      <p>
                        <strong className="font-bold text-white">Total:</strong> R$ {totalAmount || '---'}.
                        {paymentLink && (
                          <span className="block text-[#53bdeb] underline break-all">
                            Link para pagamento: {paymentLink} 💳
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <p>
                    Estamos à disposição para qualquer dúvida ou alteração. Agradecemos por escolher o Clube do Voo Viagens. Desejamos uma viagem incrível! 🌏✨
                  </p>

                  <div className="pt-1">
                    <p>Atenciosamente,</p>
                    <p className="italic text-white">_{selectedSeller || 'Joabh Souza'}_</p>
                    <p className="italic text-[#d1d7db]">_Clube do Voo Viagens LTDA_</p>
                  </div>
                </div>

                {/* Timestamp e double check */}
                <div className="flex items-center justify-end gap-1 mt-2 text-[11px] text-[#8696a0]">
                  <span>18:33</span>
                  <span className="text-[#53bdeb] font-bold">✓✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com botões de ação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer order-3 sm:order-1"
          >
            Fechar
          </button>

          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2.5 order-1 sm:order-2">
            <button
              type="button"
              onClick={handleCopy}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] md:min-h-0 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">Mensagem Copiada!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span>Copiar Mensagem</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px] md:min-h-0 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Abrir no WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
