import React, { useState, useEffect, useMemo } from 'react';
import { X, Copy, Check, MessageCircle, Plus, Link as LinkIcon, User, CreditCard, Sparkles, AlertCircle } from 'lucide-react';
import useBackClose from '../hooks/useBackClose';
import { getSellers, addSeller, removeSeller } from '../api/voucherClient';

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
  const [locator, setLocator] = useState('');
  const [crmLink, setCrmLink] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('paid'); // 'paid' | 'pending'
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('em 4x sem juros no NuPay');
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
        // fallback silencioso
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

    // Localizador
    const loc = voucher?.reservation?.locator || '';
    setLocator(loc);

    // Link do itinerário: começa vazio para permitir colar do CRM
    setCrmLink('');

    // Detalhes do pagamento pré-formatados com a quantidade de passageiros
    const paxCount = voucher?.passengers?.length || 1;
    const paxLabel = paxCount === 1 ? '1 pessoa' : `${paxCount} pessoas`;
    setPaymentDetails(`> Voo para ${paxLabel}: R$ \n> Impostos, taxas e encargos: R$ `);

    setCopied(false);
  }, [isOpen, voucher]);

  // Mensagem final formatada no padrão exato solicitado
  const formattedMessage = useMemo(() => {
    const name = clientName?.trim() || 'Cliente';
    const loc = locator?.trim() || '---';
    const link = crmLink?.trim();

    let linkBlock = '';
    if (link) {
      linkBlock = `Para visualizar todos os detalhes da sua viagem, acesse o link:\n${link}\n\n`;
    }

    let payDetailsBlock = '';
    if (paymentDetails?.trim()) {
      payDetailsBlock = `🏦 Detalhes do pagamento:\n${paymentDetails.trim()}\n\n`;
    }

    let payDataBlock = '';
    if (paymentStatus === 'paid') {
      const totalStr = totalAmount?.trim() ? `Total: R$ ${totalAmount.trim()}` : 'Total pago';
      const methodStr = paymentMethod?.trim() ? `, ${paymentMethod.trim()}` : '';
      payDataBlock = `💰 Dados para o seu pagamento: \n${totalStr}${methodStr}.✅\n\n`;
    } else {
      const totalStr = totalAmount?.trim() ? `Total: R$ ${totalAmount.trim()}` : 'Total a pagar';
      const linkStr = paymentLink?.trim() ? `\nLink para pagamento: ${paymentLink.trim()} 💳` : '';
      payDataBlock = `💰 Dados para o seu pagamento: \n${totalStr}.${linkStr}\n\n`;
    }

    const sellerName = selectedSeller?.trim() || 'Joabh Souza';

    return `Pronto, ${name}! 🌟\n\n` +
      `Parabéns pela sua compra!🥳 Sua reserva foi confirmada com sucesso! ✈️🧳\n\n` +
      `✈️ Dados da reserva:\n` +
      `Localizador: \n` +
      `> ${loc}\n\n` +
      linkBlock +
      payDetailsBlock +
      payDataBlock +
      `Estamos à disposição para qualquer dúvida ou alteração. Agradecemos por escolher o Clube do Voo Viagens. Desejamos uma viagem incrível! 🌏✨\n\n` +
      `Atenciosamente,\n` +
      `_${sellerName}_\n` +
      `_Clube do Voo Viagens LTDA_`;
  }, [clientName, locator, crmLink, paymentDetails, paymentStatus, totalAmount, paymentMethod, paymentLink, selectedSeller]);

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
                Personalize os dados e copie ou envie direto para o cliente.
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
            {/* Linha 1: Nome do Cliente + Localizador */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Localizador
                </label>
                <input
                  type="text"
                  value={locator}
                  onChange={e => setLocator(e.target.value.toUpperCase())}
                  placeholder="Ex: AYZEER"
                  className="w-full px-3 py-2 text-base md:text-sm font-mono font-bold tracking-wider bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-emerald-700 dark:text-emerald-400 uppercase"
                />
              </div>
            </div>

            {/* Linha 2: Link do CRM */}
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
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Cole o link gerado pelo seu CRM. Se deixado em branco, essa linha é omitida.
              </p>
            </div>

            {/* Linha 3: Detalhes do Pagamento */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Detalhes do Pagamento (Discriminação)
              </label>
              <textarea
                rows={3}
                value={paymentDetails}
                onChange={e => setPaymentDetails(e.target.value)}
                placeholder="> Voo para 2 pessoas: R$ 2.234,16&#10;> Impostos, taxas e encargos: R$ 312,49"
                className="w-full p-2.5 text-base md:text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800 dark:text-slate-100 resize-none"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Linhas com <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold">&gt;</code> viram barras de citação no WhatsApp.
              </p>
            </div>

            {/* Linha 4: Dados para o Pagamento (Status / Condição) */}
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
                    placeholder="Ex: 2.546,65"
                    className="w-full px-3 py-1.5 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                  />
                </div>

                {paymentStatus === 'paid' ? (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Forma / Condição
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

            {/* Linha 5: Vendedor no rodapé */}
            <div className="pt-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Vendedor / Emissor (Rodapé)
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
            <div className="flex-1 min-h-[360px] bg-[#0c1317] rounded-xl p-4 sm:p-5 overflow-y-auto border border-[#222d34] flex flex-col justify-between shadow-inner">
              {/* Balão de mensagem verde do WhatsApp */}
              <div className="self-end max-w-full sm:max-w-[94%] bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-sm p-4 text-[13.5px] leading-relaxed shadow-md font-sans">
                {/* Renderização formatada */}
                <div className="whitespace-pre-wrap break-words space-y-3 font-normal">
                  <p>Pronto, <strong className="font-semibold text-white">{clientName || 'Júnior'}</strong>! 🌟</p>
                  <p>Parabéns pela sua compra!🥳 Sua reserva foi confirmada com sucesso! ✈️🧳</p>

                  <div>
                    <p className="font-medium text-white">✈️ Dados da reserva:</p>
                    <p className="text-[#aebac1]">Localizador:</p>
                    <div className="border-l-4 border-emerald-300 pl-2.5 my-1 text-emerald-200 font-mono font-bold tracking-wider">
                      {locator || 'AYZEER'}
                    </div>
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

                  {paymentDetails && (
                    <div>
                      <p className="font-medium text-white">🏦 Detalhes do pagamento:</p>
                      <div className="border-l-4 border-emerald-300 pl-2.5 my-1 text-emerald-100 font-mono text-[13px] whitespace-pre-wrap">
                        {paymentDetails.split('\n').map((line, idx) => (
                          <div key={idx}>{line.replace(/^>\s*/, '')}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="font-medium text-white">💰 Dados para o seu pagamento:</p>
                    {paymentStatus === 'paid' ? (
                      <p>
                        Total: R$ {totalAmount || '2.546,65'}{paymentMethod ? `, ${paymentMethod}` : ''}.✅
                      </p>
                    ) : (
                      <p>
                        Total: R$ {totalAmount || '---'}.
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
