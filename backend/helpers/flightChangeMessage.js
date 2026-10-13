// Textos de WhatsApp do fluxo de alteração de voo. Puro, sem I/O.
// *texto* = negrito no WhatsApp (mesmo padrão dos outros módulos).
const { firstNameOf } = require('./voucherCarrier');

const DIRECTION_LABEL = { ida: 'Ida', volta: 'Volta', interno: 'Trecho interno', multi: 'Trecho' };
const FIELD_LABEL = {
  partida: 'Partida', chegada: 'Chegada', voo: 'Voo', origem: 'Origem', destino: 'Destino', classe: 'Classe'
};

// Remove marcadores de formatação do WhatsApp de valores vindos do voucher
// (nome/localizador) para não quebrar o negrito da mensagem.
const safe = (s) => String(s ?? '').replace(/[*_~`]/g, '').trim();

function buildWaLink(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;           // telefone inválido/curto demais
  if (digits.length <= 11) digits = '55' + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const greetingName = (v) => safe(firstNameOf(v?.passengers?.[0]?.name));
const hello = (v, emoji) => {
  const n = greetingName(v);
  return `Olá${n ? `, *${n}*` : ''}! ${emoji}`;
};
const routeOf = (v) => {
  const o = v?.route?.origin || v?.trips?.[0]?.departure?.airport;
  const d = v?.route?.destination || v?.trips?.[0]?.arrival?.airport;
  return o && d ? `${o} → ${d}` : '';
};
const tripLabel = (t) => {
  const base = DIRECTION_LABEL[t?.direction] || 'Trecho';
  const o = t?.departure?.airport, d = t?.arrival?.airport;
  return o && d ? `${base} (${o} → ${d})` : base;
};

/** Mensagem que o CLIENTE envia para nós ao tocar no link (pré-preenchida). */
function noticeClientMessage(v) {
  const n = greetingName(v);
  const loc = safe(v?.reservation?.locator);
  return `Olá! Recebi o aviso de alteração do meu voo.${loc ? ` Reserva ${loc}` : ''}${n ? ` — ${n}` : ''}.`;
}

function buildNoticeText(v, { supportPhone } = {}) {
  const loc = safe(v?.reservation?.locator);
  const rota = routeOf(v);
  // Aviso nunca traz horário: remove HH:MM caso o rótulo da data venha com hora.
  const data = String(v?.trips?.[0]?.dateLabel || '').replace(/\s*\d{1,2}:\d{2}\s*/g, ' ').trim();
  const detalhe = [rota, data].filter(Boolean).join(', ');
  const link = buildWaLink(supportPhone, noticeClientMessage(v));
  const linhas = [
    hello(v, '✈️'), '',
    `A companhia aérea fez uma alteração no seu voo${loc ? ` da reserva *${loc}*` : ''}${detalhe ? ` (${detalhe})` : ''}.`, '',
    'Entraremos em contato pelo WhatsApp com os detalhes.'
  ];
  if (link) linhas.push(`Se preferir, é só nos chamar: ${link}`);
  return linhas.join('\n');
}

function buildConfirmationText(newV, diff, { emailSent = false } = {}) {
  const loc = safe(newV?.reservation?.locator);
  const linhas = [hello(newV, '✅'), '', `Seu voo foi reajustado ✅${loc ? ` Reserva *${loc}*` : ''}`];
  if (diff?.locatorChanged) linhas.push(`Novo localizador: *${safe(diff.locatorChanged.depois)}*`);

  for (const t of diff?.trips || []) {
    if (t.status === 'igual') continue;
    linhas.push('');
    if (t.status === 'removido') {
      linhas.push(`*${tripLabel(t.old)}*`, '• Trecho cancelado');
    } else if (t.status === 'novo') {
      linhas.push(`*${tripLabel(t.new)}*`, '• Trecho incluído', `• Voo: ${t.new.flightNumber || '—'}`);
    } else {
      linhas.push(`*${tripLabel(t.new)}*`);
      t.changes.forEach(c => linhas.push(`• ${FIELD_LABEL[c.campo] || c.campo}: ${c.antes} → ${c.depois}`));
    }
  }
  linhas.push('', emailSent
    ? 'Enviamos o novo voucher por e-mail 📧'
    : 'Em instantes enviamos o novo voucher.');
  return linhas.join('\n');
}

module.exports = { buildWaLink, buildNoticeText, buildConfirmationText, noticeClientMessage };
