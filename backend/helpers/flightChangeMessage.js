// Textos de WhatsApp do fluxo de alteração de voo. Puro, sem I/O.
// *texto* = negrito no WhatsApp (mesmo padrão dos outros módulos).
const { firstNameOf } = require('./voucherCarrier');
const { normalizePhone } = require('./boardingPassPayload');

const DIRECTION_LABEL = { ida: 'Ida', volta: 'Volta', interno: 'Trecho interno', multi: 'Trecho' };
const FIELD_LABEL = {
  partida: 'Partida', chegada: 'Chegada', voo: 'Voo', origem: 'Origem', destino: 'Destino', classe: 'Classe'
};

// Localizador: só o '*' quebra o negrito do WhatsApp; o resto é preservado.
const safeLoc = (s) => String(s ?? '').replace(/\*/g, '').trim();
// Nome: '_' vira espaço (itálico) e remove marcadores de formatação.
const safeName = (s) => String(s ?? '').replace(/_/g, ' ').replace(/[*~`]/g, '').trim();

// Telefone: sem zeros iniciais; 10/11 dígitos ganham 55; 12/13 só se já começam com 55.
function buildWaLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  // '+' explícito com DDI diferente de 55 = número estrangeiro (os dígitos sozinhos pareceriam BR).
  if (/^\s*\+/.test(String(phone || '')) && !digits.startsWith('55')) return null;
  const norm = normalizePhone(digits);
  if (!norm) return null;
  return `https://wa.me/${norm}?text=${encodeURIComponent(text)}`;
}

const greetingName = (v) => firstNameOf(safeName(v?.passengers?.[0]?.name));
const hello = (v, emoji) => {
  const n = greetingName(v);
  return `Olá${n ? `, *${n}*` : ''}! ${emoji}`;
};
const routeOf = (v) => {
  const trips = v?.trips || [];
  const o = v?.route?.origin || trips[0]?.departure?.airport;
  const d = v?.route?.destination || trips[trips.length - 1]?.arrival?.airport;
  return o && d ? `${o} → ${d}` : '';
};
// Datas distintas de todos os trechos, sem horário; rótulo fora do padrão é descartado.
const DATE_RE = /\d{1,2}\s+[A-Za-zçÇ]{3,}\.?\s+\d{4}/;
const datesOf = (v) => {
  const out = [];
  for (const t of v?.trips || []) {
    const m = String(t?.dateLabel || '').match(DATE_RE);
    if (m && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
};
const joinDates = (d) => (d.length <= 2 ? d.join(' e ') : d.join(', '));
const tripLabel = (t) => {
  const base = DIRECTION_LABEL[t?.direction] || 'Trecho';
  const o = t?.departure?.airport, d = t?.arrival?.airport;
  return o && d ? `${base} (${o} → ${d})` : base;
};

/** Mensagem que o CLIENTE envia para nós ao tocar no link (pré-preenchida). */
function noticeClientMessage(v) {
  const n = greetingName(v);
  const loc = safeLoc(v?.reservation?.locator);
  const extra = [loc ? `Reserva ${loc}` : '', n].filter(Boolean).join(' — ');
  return `Olá! Recebi o aviso de alteração do meu voo.${extra ? ` ${extra}.` : ''}`;
}

/** "GRU → REC, 12 SET 2026 e 19 SET 2026" (rota + datas válidas de todos os trechos, sem horário). */
function noticeDetail(v) {
  return [routeOf(v), joinDates(datesOf(v))].filter(Boolean).join(', ');
}

function buildNoticeText(v, { supportPhone } = {}) {
  const loc = safeLoc(v?.reservation?.locator);
  const detalhe = noticeDetail(v);
  const link = buildWaLink(supportPhone, noticeClientMessage(v));
  const linhas = [
    hello(v, '✈️'), '',
    `A companhia aérea fez uma alteração no seu voo${loc ? ` da reserva *${loc}*` : ''}${detalhe ? ` (${detalhe})` : ''}.`, '',
    'Entraremos em contato pelo WhatsApp com os detalhes.'
  ];
  if (link) linhas.push(`Se preferir, é só nos chamar: ${link}`);
  return linhas.join('\n');
}

/**
 * Blocos de mudança (cada bloco = lista de linhas): [localizador novo?] e um bloco por trecho alterado.
 * `b` envolve trechos em negrito do WhatsApp (ou não, para texto puro).
 */
function changeBlocks(diff, b) {
  const loc = diff?.locatorChanged ? [`Novo localizador: ${b(safeLoc(diff.locatorChanged.depois))}`] : null;
  const trips = [];
  for (const t of diff?.trips || []) {
    if (t.status === 'igual') continue;
    if (t.status === 'removido') {
      trips.push([b(tripLabel(t.old)), '• Trecho cancelado']);
    } else if (t.status === 'novo') {
      trips.push([b(tripLabel(t.new)), '• Trecho incluído', `• Voo: ${t.new.flightNumber || '—'}`]);
    } else {
      trips.push([b(tripLabel(t.new)), ...t.changes.map(c => `• ${FIELD_LABEL[c.campo] || c.campo}: ${c.antes} → ${c.depois}`)]);
    }
  }
  return { loc, trips };
}

/** Linhas de mudança em texto puro (sem asteriscos, sem saudação/fechamento). Usada também no e-mail. */
function buildChangeSummaryLines(diff) {
  const { loc, trips } = changeBlocks(diff, s => s);
  const linhas = [];
  if (loc) linhas.push(...loc);
  trips.forEach(t => { if (linhas.length) linhas.push(''); linhas.push(...t); });
  return linhas;
}

function buildConfirmationText(newV, diff, { emailSent = false, voucherUrl = '' } = {}) {
  const loc = safeLoc(newV?.reservation?.locator);
  const linhas = [hello(newV, '😊'), '', `Seu voo foi reajustado ✅${loc ? ` Reserva *${loc}*` : ''}`];
  const { loc: locBlock, trips } = changeBlocks(diff, s => `*${s}*`);
  if (locBlock) linhas.push(...locBlock);

  if (!trips.length && !locBlock) linhas.push('', 'Os detalhes estão no novo voucher.');
  trips.forEach(t => linhas.push('', ...t));

  if (voucherUrl) linhas.push('', 'Seu novo voucher já está disponível:', voucherUrl);
  if (emailSent) linhas.push('', 'Também enviamos o PDF por e-mail 📧');
  if (!voucherUrl && !emailSent) linhas.push('', 'Em instantes enviamos o novo voucher.');
  return linhas.join('\n');
}

module.exports = { noticeDetail, buildWaLink, buildNoticeText, buildConfirmationText, buildChangeSummaryLines, noticeClientMessage };
