// Textos de WhatsApp do fluxo de alteração de voo. Puro, sem I/O.
// *texto* = negrito no WhatsApp (mesmo padrão dos outros módulos).
const { firstNameOf } = require('./voucherCarrier');
const { normalizePhone } = require('./boardingPassPayload');
const { locatorOf, restrictTo } = require('./flightChangeReservations');
const { journeysOf, expandAffected } = require('./flightJourneys');

const DIRECTION_LABEL = { ida: 'Ida', volta: 'Volta', interno: 'Trecho interno', multi: 'Trecho' };
const FIELD_LABEL = {
  partida: 'Partida', chegada: 'Chegada', voo: 'Voo', origem: 'Origem', destino: 'Destino', classe: 'Classe', itinerario: 'Itinerário'
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

/**
 * Trechos afetados agrupados por reserva (na ordem do voucher): [{ locator, dirs, detail }].
 * null = sem restrição (sem `affected` ou cobrindo todos os trechos) => textos de sempre.
 */
function noticeSegments(v, affected) {
  const trips = v?.trips || [];
  const exp = expandAffected(v, affected);          // viagens inteiras
  const A = restrictTo(exp, trips.length);
  if (!A) return null;
  const marcadas = journeysOf(v).filter(j => A.includes(j.indexes[0]));
  const groups = [];
  marcadas.forEach(j => {
    let g = groups.find(x => x.key === j.locator);
    if (!g) { g = { key: j.locator, journeys: [] }; groups.push(g); }
    g.journeys.push(j);
  });
  return groups.map(g => {
    // origem = partida da 1ª viagem; destino = chegada da viagem de ida (senão da última): sempre a viagem INTEIRA
    const idas = g.journeys.filter(j => j.direction === 'ida');
    const o = g.journeys[0].origin;
    const d = (idas.length ? idas : g.journeys).slice(-1)[0].destination;
    const datas = [];
    g.journeys.forEach(j => { const m = String(j.trips[0]?.dateLabel || '').match(DATE_RE); if (m && !datas.includes(m[0])) datas.push(m[0]); });
    return {
      locator: safeLoc(g.key),
      dirs: [...new Set(g.journeys.map(j => j.direction))],
      detail: [o && d ? `${o} → ${d}` : '', joinDates(datas)].filter(Boolean).join(', ')
    };
  });
}

/** "voo de ida e volta" / "voo de volta" / "trecho interno" / "voo" (b = negrito do canal). */
function segmentKind(dirs, b) {
  const lados = ['ida', 'volta'].filter(d => dirs.includes(d));
  if (lados.length && dirs.every(d => d === 'ida' || d === 'volta')) return `voo de ${lados.map(b).join(' e ')}`;
  if (dirs.length === 1 && dirs[0] === 'interno') return 'trecho interno';
  return 'voo';
}

/**
 * Frase do aviso só dos trechos afetados, ex.: "A companhia aérea fez uma alteração no seu voo de *volta* da
 * reserva *XYZ789* (REC → GRU, 19 SET 2026)." fmt = { bold, plain }: como o canal marca negrito e trata texto
 * variável (WhatsApp: *x*; e-mail: <strong> + escape). null = sem restrição (usar o texto de sempre).
 */
function noticeSentence(v, affected, fmt) {
  const segs = noticeSegments(v, affected);
  if (!segs || !segs.length) return null;
  const { bold, plain } = fmt;
  const textos = segs.map(sg => `${segmentKind(sg.dirs, bold)}${sg.locator ? ` da reserva ${bold(sg.locator)}` : ''}${sg.detail ? ` (${plain(sg.detail)})` : ''}`);
  const lista = textos.length === 1 ? textos[0]
    : `${textos.slice(0, -1).join(', no ')} e no ${textos[textos.length - 1]}`;
  return `A companhia aérea fez uma alteração no seu ${lista}.`;
}

/** Mensagem que o CLIENTE envia para nós ao tocar no link (pré-preenchida). */
function noticeClientMessage(v, { affected } = {}) {
  const n = greetingName(v);
  const segs = noticeSegments(v, affected);
  let loc, rotulo = 'Reserva';
  if (segs) {
    const locs = [...new Set(segs.map(x => x.locator).filter(Boolean))];
    loc = locs.length > 1 ? `${locs.slice(0, -1).join(', ')} e ${locs[locs.length - 1]}` : (locs[0] || '');
    if (locs.length > 1) rotulo = 'Reservas';
  } else {
    loc = safeLoc(v?.reservation?.locator);
  }
  const extra = [loc ? `${rotulo} ${loc}` : '', n].filter(Boolean).join(' — ');
  return `Olá! Recebi o aviso de alteração do meu voo.${extra ? ` ${extra}.` : ''}`;
}

/** "GRU → REC, 12 SET 2026 e 19 SET 2026" (rota + datas válidas de todos os trechos, sem horário). */
function noticeDetail(v, { affected } = {}) {
  const segs = noticeSegments(v, affected);
  if (segs) return segs.map(x => x.detail).filter(Boolean).join(' e ');
  return [routeOf(v), joinDates(datesOf(v))].filter(Boolean).join(', ');
}

function buildNoticeText(v, { supportPhone, affected } = {}) {
  const loc = safeLoc(v?.reservation?.locator);
  const detalhe = noticeDetail(v);
  const link = buildWaLink(supportPhone, noticeClientMessage(v, { affected }));
  const frase = noticeSentence(v, affected, { bold: s => `*${s}*`, plain: s => s })
    || `A companhia aérea fez uma alteração no seu voo${loc ? ` da reserva *${loc}*` : ''}${detalhe ? ` (${detalhe})` : ''}.`;
  const linhas = [
    hello(v, '✈️'), '',
    frase, '',
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
  // Uma linha por reserva afetada cujo localizador mudou; sem reservationChanges, o localizador único de sempre.
  const rc = diff?.reservationChanges || [];
  let loc = null;
  if (rc.length) {
    loc = rc.map(r => `Novo localizador${rc.length > 1 ? ` (${(DIRECTION_LABEL[r.direction] || 'Trecho').toLowerCase()})` : ''}: ${b(safeLoc(r.depois))}`);
  } else if (diff?.locatorChanged) {
    loc = [`Novo localizador: ${b(safeLoc(diff.locatorChanged.depois))}`];
  }
  const trips = [];
  for (const t of diff?.trips || []) {
    if (t.status === 'igual') continue;
    if (t.status === 'removido') {
      trips.push(t.journey ? [b(tripLabel(t.old)), '• Viagem cancelada', `• Itinerário: ${t.old.itinerary}`] : [b(tripLabel(t.old)), '• Trecho cancelado']);
    } else if (t.status === 'novo') {
      trips.push(t.journey
        ? [b(tripLabel(t.new)), '• Viagem incluída', `• Itinerário: ${t.new.itinerary}`]
        : [b(tripLabel(t.new)), '• Trecho incluído', `• Voo: ${t.new.flightNumber || '—'}`]);
    } else {
      trips.push([b(tripLabel(t.new)), ...t.changes.map(c => (c.campo === 'itinerario'
        ? `• ${FIELD_LABEL[c.campo]}: de ${c.antes} para ${c.depois}`      // as duas rotas têm setas: "de … para …" evita a leitura confusa
        : `• ${FIELD_LABEL[c.campo] || c.campo}: ${c.antes} → ${c.depois}`))]);
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
  // Com trechos afetados (diff restrito), cita a(s) reserva(s) afetada(s), não a da ida.
  const ar = diff?.affectedReservations;
  const locs = (ar && ar.length ? ar.map(x => safeLoc(x.locator)) : [safeLoc(newV?.reservation?.locator)]).filter(Boolean);
  const reserva = locs.length > 1 ? ` Reservas ${locs.map(l => `*${l}*`).join(' e ')}` : (locs.length ? ` Reserva *${locs[0]}*` : '');
  const linhas = [hello(newV, '😊'), '', `Seu voo foi reajustado ✅${reserva}`];
  const { loc: locBlock, trips } = changeBlocks(diff, s => `*${s}*`);
  if (locBlock) linhas.push(...locBlock);

  if (!trips.length && !locBlock) linhas.push('', 'Os detalhes estão no novo voucher.');
  trips.forEach(t => linhas.push('', ...t));

  if (voucherUrl) linhas.push('', 'Seu novo voucher já está disponível:', voucherUrl);
  if (emailSent) linhas.push('', 'Também enviamos o PDF por e-mail 📧');
  if (!voucherUrl && !emailSent) linhas.push('', 'Em instantes enviamos o novo voucher.');
  return linhas.join('\n');
}

module.exports = { noticeDetail, noticeSentence, buildWaLink, buildNoticeText, buildConfirmationText, buildChangeSummaryLines, noticeClientMessage };
