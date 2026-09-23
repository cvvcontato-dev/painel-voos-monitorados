// Monta o conteúdo das mensagens de cartão de embarque (fonte única para
// WhatsApp e e-mail). Puro, sem I/O.

const { airportCity, firstNameOf } = require('./voucherCarrier');

const WALLET_FALLBACK = 'Se a opção de carteira não aparecer, tire um print do QR code.';

// Passos por tipo de link. *texto* = negrito no WhatsApp (convertido no e-mail).
const INSTRUCTIONS = {
  google: [
    'Toque no link acima',
    'Toque em *Adicionar à carteira* (Google Wallet no Android, Apple Wallet no iPhone)',
    'Pronto! O cartão fica salvo e funciona mesmo sem internet'
  ],
  latam: [
    'Toque no link acima',
    'Toque em *Entendi*',
    'Toque em *Adicionar à minha carteira*',
    'Pronto! O cartão fica salvo e funciona mesmo sem internet'
  ],
  other: [
    'Toque no link acima',
    'Siga as instruções da página para salvar o cartão na carteira do celular'
  ]
};

const INSTRUCTION_LABEL = { google: 'Azul / Gol', latam: 'Latam', other: 'outras companhias' };

const AIRPORT_TIPS = [
  'Apresente o QR code do cartão e um documento oficial com foto na inspeção de segurança e no portão de embarque',
  'Deixe o brilho da tela no máximo',
  'Sem bagagem para despachar? Vá direto para a inspeção de segurança'
];

function instructionKey(link) {
  if (link.carrier === 'latam') return 'latam';
  if (link.recognized) return 'google';
  return 'other';
}

function cityOr(iata) {
  return airportCity(iata) || iata;
}

function dayMonth(ymd) {
  const [, m, d] = String(ymd).split('-');
  return `${d}/${m}`;
}

function segmentLabel(link, fallbackLabel, segmentIndex) {
  const d = link.data;
  if (d && d.flightNumber && d.origin && d.destination && d.date) {
    return `${d.flightNumber} · ${cityOr(d.origin)} → ${cityOr(d.destination)} · ${dayMonth(d.date)}`;
  }
  if (fallbackLabel) return fallbackLabel;
  return `Trecho ${segmentIndex + 1}`;
}

function linkUrl(link, { baseUrl, useOriginal }) {
  return !useOriginal && link.shortCode ? `${baseUrl}/c/${link.shortCode}` : link.cleanUrl;
}

function passengerCard(payload, links, i, opts) {
  const p = payload.passengers[i];
  const segments = links
    .filter(l => l.passengerIndex === i)
    .sort((a, b) => a.segmentIndex - b.segmentIndex)
    .map(l => ({
      label: segmentLabel(l, ((p.segments || [])[l.segmentIndex] || {}).label, l.segmentIndex),
      url: linkUrl(l, opts),
      instructionKey: instructionKey(l),
      data: l.data || null
    }));
  return { name: p.name, segments };
}

// channel: 'email' | 'whatsapp'. Retorna [{ passengers:[{name, segments}], contact }].
function buildRecipientGroups(payload, links, channel, opts) {
  const isEmail = channel === 'email';
  const mode = isEmail ? payload.emailMode : payload.whatsappMode;
  const cards = payload.passengers.map((_, i) => passengerCard(payload, links, i, opts));
  if (mode === 'single') {
    return [{ passengers: cards, contact: (isEmail ? payload.singleEmail : payload.singlePhone) || null }];
  }
  return cards.map((card, i) => ({
    passengers: [card],
    contact: (isEmail ? payload.passengers[i].email : payload.passengers[i].phone) || null
  }));
}

function instructionKeysOf(group) {
  return [...new Set(group.passengers.flatMap(p => p.segments.map(s => s.instructionKey)))];
}

function buildWhatsappText(group) {
  const pax = group.passengers;
  const segCount = pax.reduce((n, p) => n + p.segments.length, 0);
  const lines = [];

  if (pax.length === 1) {
    const first = firstNameOf(pax[0].name);
    lines.push(first ? `Olá, ${first}! ✈️` : 'Olá! ✈️');
    lines.push(segCount === 1
      ? 'Seu check-in está feito. Este é o seu cartão de embarque:'
      : 'Seu check-in está feito. Estes são os seus cartões de embarque:');
    lines.push('');
    pax[0].segments.forEach(s => lines.push(`*${s.label}*`, `👉 ${s.url}`, ''));
  } else {
    lines.push('Olá! ✈️', 'O check-in de vocês está feito. Estes são os cartões de embarque:', '');
    pax.forEach(p => {
      lines.push(`*${p.name}*`);
      p.segments.forEach(s => lines.push(s.label, `👉 ${s.url}`));
      lines.push('');
    });
  }

  const keys = instructionKeysOf(group);
  keys.forEach(k => {
    lines.push(keys.length > 1 ? `*Como salvar no celular (${INSTRUCTION_LABEL[k]}):*` : '*Como salvar no celular:*');
    INSTRUCTIONS[k].forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    if (keys.length > 1) lines.push('');
  });
  lines.push(WALLET_FALLBACK, '');

  lines.push('*No aeroporto:*');
  AIRPORT_TIPS.forEach(t => lines.push(`• ${t}`));
  lines.push('', 'Boa viagem! 🧳', '*Clube do Voo Viagens*');
  return lines.join('\n');
}

function waUrl(phone, text) {
  const t = encodeURIComponent(text);
  return phone ? `https://wa.me/${phone}?text=${t}` : `https://wa.me/?text=${t}`;
}

function buildWhatsappMessages(payload, links, opts) {
  return buildRecipientGroups(payload, links, 'whatsapp', opts).map(g => {
    const text = buildWhatsappText(g);
    return {
      label: g.passengers.map(p => p.name).join(', '),
      phone: g.contact,
      text,
      waUrl: waUrl(g.contact, text)
    };
  });
}

module.exports = {
  INSTRUCTIONS,
  INSTRUCTION_LABEL,
  AIRPORT_TIPS,
  WALLET_FALLBACK,
  segmentLabel,
  instructionKeysOf,
  buildRecipientGroups,
  buildWhatsappText,
  buildWhatsappMessages
};
