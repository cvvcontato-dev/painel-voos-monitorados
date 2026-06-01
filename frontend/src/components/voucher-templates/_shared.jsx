import React, { useState } from 'react';

// Theme per carrier — DARK headers matching the real Azul voucher layout.
export const THEMES = {
  azul:  { headerBg: '#001a4d',                                              accent: '#003DA5', initial: 'A', name: 'Azul Linhas Aéreas' },
  latam: { headerBg: 'linear-gradient(90deg, #0d1d4f 0%, #c8102e 100%)',     accent: '#0d1d4f', initial: 'L', name: 'Latam Airlines' },
  gol:   { headerBg: 'linear-gradient(135deg, #ff6b00 0%, #ff4500 100%)',    accent: '#ff5500', initial: 'G', name: 'Gol Linhas Aéreas' },
  multi: { headerBg: 'linear-gradient(90deg, #3871c1 0%, #00569e 100%)',     accent: '#00569e', initial: '✈', name: 'Voo combinado' }
};

export function detectCarrierKey(data) {
  const names = (data.trips || [])
    .map(t => (t.airlineDisplayName || '').trim().toLowerCase())
    .filter(Boolean);
  const distinct = Array.from(new Set(names));
  if (distinct.length > 1) return 'multi';
  const c = (data.carrier || '').toLowerCase();
  return ['azul', 'latam', 'gol'].includes(c) ? c : 'azul';
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// SVG icons (no emojis — Playwright Chromium safe).
export const IconPhone = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
);
export const IconMail = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
);
export const IconGlobe = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
);
export const IconBag = ({ color = '#666', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M17 6h-2V3c0-.55-.45-1-1-1h-4c-.55 0-1 .45-1 1v3H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2v1h2v-1h6v1h2v-1c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2h2v2h-2V4zM7 19V8h10v11H7z"/></svg>
);
export const IconArrow = ({ color = '#9aa5b8', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M16.01 11H4v2h12.01v3L20 12l-3.99-4z"/></svg>
);
export const IconPlane = ({ color = '#003DA5', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
);
export const IconUser = ({ color = '#1a2a48', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
);

// Peso padrão de bagagem por companhia, quando o voucher não traz o peso explícito.
// Regras do negócio (Clube do Voo):
//  - Bagagem de mão: Azul = 10kg | Latam e Gol = 12kg
//  - Bagagem despachada: 23kg para qualquer companhia
//  - Item pessoal (mochila/bolsa/sacola): sem peso
export function defaultBaggageWeight(carrierKey, label) {
  const l = (label || '').toLowerCase();
  // Despachada / checked / porão / mala
  if (/despach|checked|por[aã]o/.test(l) || /\bmala\b/.test(l)) return '23kg';
  // Bagagem de mão / carry-on
  if (/m[aã]o|carry/.test(l)) {
    return (carrierKey === 'latam' || carrierKey === 'gol') ? '12kg' : '10kg';
  }
  // Item pessoal — sem peso definido
  if (/mochila|bolsa|sacola|pessoal|personal/.test(l)) return '';
  return '';
}

// Retorna o peso a exibir: usa o extraído quando existir, senão o padrão por cia.
export function resolveBaggageWeight(carrierKey, baggage) {
  if (baggage && baggage.weightText) return baggage.weightText;
  return defaultBaggageWeight(carrierKey, baggage && baggage.label);
}

// Regras oficiais por companhia (peso máximo + dimensões máximas) para cada tipo de bagagem.
// Kind: 'personal' (item pessoal) | 'handbag' (mão) | 'checked' (despachada).
export const BAGGAGE_RULES = {
  azul: {
    personal: { weightText: 'Sem peso máx.',  dimensionsText: '45 × 35 × 20 cm' },
    handbag:  { weightText: '10 kg',          dimensionsText: '55 × 35 × 25 cm' },
    checked:  { weightText: '23 kg',          dimensionsText: '80 × 50 × 28 cm (ou soma 158 cm)' }
  },
  gol: {
    personal: { weightText: '10 kg',          dimensionsText: '45 × 35 × 20 cm' },
    handbag:  { weightText: '12 kg',          dimensionsText: '55 × 35 × 25 cm' },
    checked:  { weightText: '23 kg',          dimensionsText: '80 × 50 × 28 cm (ou soma 158 cm)' }
  },
  latam: {
    personal: { weightText: '10 kg',          dimensionsText: '45 × 35 × 20 cm' },
    handbag:  { weightText: '12 kg',          dimensionsText: '55 × 35 × 25 cm' },
    checked:  { weightText: '23 kg',          dimensionsText: 'Soma de 158 cm (A + C + L)' }
  }
};

// Para carrier desconhecido (ex.: 'multi' usado em headers), cair em azul como base segura.
export function baggagePolicy(carrierKey, kind) {
  const rules = BAGGAGE_RULES[carrierKey] || BAGGAGE_RULES.azul;
  return rules[kind];
}

// Classifica uma linha de bagagem extraída pelo Gemini em uma das 3 categorias.
export function classifyBaggage(label) {
  const l = (label || '').toLowerCase();
  if (/mochila|bolsa|sacola|pessoal|personal/.test(l)) return 'personal';
  if (/despach|por[aã]o|\bmala\b|checked/.test(l)) return 'checked';
  // Default mão (carry-on)
  if (/m[aã]o|carry/.test(l) || /\b1[02]\s*kg\b/.test(l)) return 'handbag';
  return 'handbag';
}

// Nome canônico para exibir cada tipo.
export const BAGGAGE_LABEL = {
  personal: 'Item pessoal',
  handbag:  'Bagagem de mão',
  checked:  'Bagagem despachada'
};

// Detecta o carrier de UM trecho (não do voucher inteiro).
export function tripCarrier(trip, fallbackCarrier) {
  const name = (trip?.airlineDisplayName || '').toLowerCase();
  if (name.includes('azul')) return 'azul';
  if (name.includes('gol')) return 'gol';
  if (name.includes('latam') || name.includes('tam ')) return 'latam';
  const fn = (trip?.flightNumber || '').toUpperCase();
  if (/^(G3|GLO)/.test(fn)) return 'gol';
  if (/^AD/.test(fn)) return 'azul';
  if (/^(LA|JJ|LATAM)/.test(fn)) return 'latam';
  return (fallbackCarrier || 'azul').toLowerCase();
}

// Gera os blocos de bagagem a renderizar.
// Cada bloco = { direction, carrierKey, label, items[] }
// items[] sempre tem 3 entradas: personal, handbag, checked (mesmo se qty=0).
// Quando todos os trechos da direção são da mesma cia → 1 bloco por direção (label vazio).
// Quando há mais de uma cia na MESMA direção → 1 bloco por trecho (label com voo+cia).
export function buildBaggageBlocks(data) {
  const trips = data?.trips || [];
  const extracted = data?.baggage || [];
  const fallback = data?.carrier;

  // Ordem das direções (preservar primeira aparição)
  const directions = [];
  const seenDir = new Set();
  for (const t of trips) {
    const d = t.direction || 'ida';
    if (!seenDir.has(d)) { seenDir.add(d); directions.push(d); }
  }

  function itemsFor(carrierKey, direction) {
    // Pega quantidades a partir do que o Gemini extraiu para essa direção
    const dirBags = extracted.filter(b => (b.direction || '').toLowerCase() === direction);
    function qtyOf(kind) {
      const found = dirBags.find(b => classifyBaggage(b.label) === kind);
      if (found && typeof found.quantity === 'number') return found.quantity;
      // Defaults: passageiro sempre tem item pessoal e mão; despachada só se vier explícita.
      if (kind === 'personal') return 1;
      if (kind === 'handbag') return 1;
      return 0;
    }
    return ['personal', 'handbag', 'checked'].map(kind => {
      const policy = baggagePolicy(carrierKey, kind);
      return {
        kind,
        label: BAGGAGE_LABEL[kind],
        weightText: policy.weightText,
        dimensionsText: policy.dimensionsText,
        quantity: qtyOf(kind)
      };
    });
  }

  const blocks = [];
  for (const dir of directions) {
    const tripsInDir = trips.filter(t => (t.direction || 'ida') === dir);
    const carriers = Array.from(new Set(tripsInDir.map(t => tripCarrier(t, fallback))));

    if (carriers.length <= 1) {
      const ck = carriers[0] || (fallback || 'azul').toLowerCase();
      blocks.push({ direction: dir, carrierKey: ck, label: '', items: itemsFor(ck, dir) });
    } else {
      for (const t of tripsInDir) {
        const ck = tripCarrier(t, fallback);
        const carrierName = ck.charAt(0).toUpperCase() + ck.slice(1);
        const trecho = `${t.flightNumber || ''} (${carrierName})`.trim();
        blocks.push({ direction: dir, carrierKey: ck, label: trecho, items: itemsFor(ck, dir) });
      }
    }
  }
  return blocks;
}

// URL para "gerenciar reserva / minhas viagens" por companhia.
// Cada cia exige parâmetros diferentes:
//   - Azul:  precisa de pnr + origin (IATA da origem)
//   - Gol:   precisa de codigoReserva + origem (IATA) + sobrenome
//   - Latam: precisa de orderId + lastname
// Se faltar parâmetro obrigatório, cai pra página genérica de busca.
export function manageBookingUrl(carrierKey, locator, lastName, origin) {
  const loc  = encodeURIComponent((locator  || '').trim());
  const last = encodeURIComponent((lastName || '').trim());
  const orig = encodeURIComponent((origin   || '').trim());
  switch ((carrierKey || '').toLowerCase()) {
    case 'gol':
      return (loc && orig && last)
        ? `https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem?codigoReserva=${loc}&origem=${orig}&sobrenome=${last}`
        : 'https://b2c.voegol.com.br/minhas-viagens';
    case 'latam':
      return (loc && last)
        ? `https://www.latamairlines.com/br/pt/minhas-viagens/second-detail/?orderId=${loc}&lastname=${last}`
        : 'https://www.latamairlines.com/br/pt/minhas-viagens';
    case 'azul':
      return (loc && orig)
        ? `https://www.voeazul.com.br/br/pt/home/minhas-viagens/confirmacao?pnr=${loc}&origin=${orig}`
        : 'https://www.voeazul.com.br/br/pt/home/minhas-viagens';
    default:
      return 'https://www.voeazul.com.br/br/pt/home/minhas-viagens';
  }
}

// Extrai o sobrenome do primeiro passageiro pra usar em deep-links.
// Trata os 2 formatos:
//   "JOAO DA SILVA"   → "SILVA"   (última palavra)
//   "SILVA, MAYARA"   → "SILVA"   (última palavra ANTES da vírgula = sobrenome paterno)
//   "SILVA SANTOS, MARIA"  → "SANTOS"
// Mantenha em sincronia com backend/helpers/voucherCarrier.js#lastNameOf.
export function firstPassengerLastName(data) {
  const p = (data?.passengers || [])[0];
  if (!p?.name) return '';
  const trimmed = String(p.name).trim();
  if (!trimmed) return '';
  // Formato invertido: "SOBRENOME(S), NOME(S)"
  if (trimmed.includes(',')) {
    const surnamePart = trimmed.split(',', 2)[0].trim();
    const parts = surnamePart.split(/\s+/).filter(Boolean);
    return (parts[parts.length - 1] || '').toUpperCase();
  }
  // Formato normal: "NOME(S) SOBRENOME(S)"
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toUpperCase();
}

// Normaliza o número do voo para usar SEMPRE o código IATA-2 da cia, mesmo que o Gemini
// retorne o ICAO (GLO em vez de G3, AZU em vez de AD, TAM/LAN em vez de LA).
// Ex.: "GLO 1471" → "G3 1471"  |  "GLO1471" → "G3 1471"  |  "AD 4001" → "AD 4001" (inalterado).
const FLIGHT_PREFIX_MAP = {
  GLO: 'G3', G3: 'G3',
  AZU: 'AD', AD: 'AD',
  TAM: 'LA', LAN: 'LA', LATAM: 'LA', LA: 'LA', JJ: 'LA'
};
export function normalizeFlightNumber(flightNumber) {
  if (!flightNumber) return '';
  const fn = String(flightNumber).trim().toUpperCase();
  // Captura o prefixo (letras) e o restante (número)
  const m = fn.match(/^([A-Z]{2,5})\s*([0-9]+[A-Z]?)$/);
  if (!m) return flightNumber; // formato inesperado — devolve como veio
  const prefix = FLIGHT_PREFIX_MAP[m[1]] || m[1];
  return `${prefix} ${m[2]}`;
}

const WEEKDAYS_PTBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export function dateLabelWithDow(t) {
  const base = (t.dateLabel || '').trim();
  if (!t.departure?.datetime) return base;
  const upper = base.toUpperCase();
  if (WEEKDAYS_PTBR.some(d => upper.startsWith(d))) return base;
  const dow = WEEKDAYS_PTBR[new Date(t.departure.datetime).getDay()];
  if (!dow) return base;
  return `${dow}, ${base}`;
}

export function CarrierLogo({ carrierKey, theme, large = false, bare = false, secondaryCarrierKey = null }) {
  const [failed, setFailed] = useState(false);
  const [failed2, setFailed2] = useState(false);

  // Caso multi-cia com 2 carriers conhecidos: renderiza as 2 logos lado a lado.
  // (Vouchers merge têm primaryCarrier + secondaryCarrier setados em data.reservation.)
  const isDual = !!secondaryCarrierKey
    && secondaryCarrierKey !== 'multi'
    && carrierKey !== 'multi'
    && secondaryCarrierKey !== carrierKey;

  if (isDual && !bare) {
    // Card branco mais largo com as 2 logos lado a lado, separadas por divisor sutil.
    const boxH = large ? 80 : 56;
    const boxW = large ? 180 : Math.round(boxH * 1.8); // ~100px no caso default
    return (
      <div style={{
        width: boxW, height: boxH, background: 'white', borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: large ? 'none' : '0 2px 6px rgba(0,0,0,0.12)',
        padding: '6px 8px', gap: 8
      }}>
        {failed
          ? <span style={{ fontSize: large ? 22 : 18, fontWeight: 800, color: theme.accent }}>{(THEMES[carrierKey]?.initial) || '✈'}</span>
          : <img src={`/voucher-assets/carrier-logos/${carrierKey}.png`}
                 alt={carrierKey}
                 style={{ maxHeight: '100%', maxWidth: '45%', objectFit: 'contain' }}
                 onError={() => setFailed(true)} />}
        <span style={{ width: 1, height: '70%', background: '#e5eaf0' }} />
        {failed2
          ? <span style={{ fontSize: large ? 22 : 18, fontWeight: 800, color: theme.accent }}>{(THEMES[secondaryCarrierKey]?.initial) || '✈'}</span>
          : <img src={`/voucher-assets/carrier-logos/${secondaryCarrierKey}.png`}
                 alt={secondaryCarrierKey}
                 style={{ maxHeight: '100%', maxWidth: '45%', objectFit: 'contain' }}
                 onError={() => setFailed2(true)} />}
      </div>
    );
  }

  // Modo bare multi-cia (Compacto): 2 logos pequenas em linha, sem card branco.
  if (isDual && bare) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {failed
          ? <span style={{ fontSize: 18, fontWeight: 800, color: theme.accent }}>{(THEMES[carrierKey]?.initial) || '✈'}</span>
          : <img src={`/voucher-assets/carrier-logos/${carrierKey}.png`}
                 alt={carrierKey}
                 style={{ maxHeight: 48, maxWidth: 90, objectFit: 'contain', display: 'block' }}
                 onError={() => setFailed(true)} />}
        <span style={{ width: 1, height: 36, background: '#c8d0dc' }} />
        {failed2
          ? <span style={{ fontSize: 18, fontWeight: 800, color: theme.accent }}>{(THEMES[secondaryCarrierKey]?.initial) || '✈'}</span>
          : <img src={`/voucher-assets/carrier-logos/${secondaryCarrierKey}.png`}
                 alt={secondaryCarrierKey}
                 style={{ maxHeight: 48, maxWidth: 90, objectFit: 'contain', display: 'block' }}
                 onError={() => setFailed2(true)} />}
      </div>
    );
  }

  if (bare && !failed && carrierKey !== 'multi') {
    return (
      <img
        src={`/voucher-assets/carrier-logos/${carrierKey}.png`}
        alt={theme.name}
        style={{ maxHeight: 64, maxWidth: 200, objectFit: 'contain', display: 'block' }}
        onError={() => setFailed(true)}
      />
    );
  }
  const boxSize = large ? 80 : 56;
  const maxW = large ? 180 : boxSize;
  const wrapperStyle = {
    width: large ? maxW : boxSize,
    height: boxSize,
    background: 'white',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: large ? 'none' : '0 2px 6px rgba(0,0,0,0.12)',
    padding: 6
  };
  const fallback = (
    <div style={{ ...wrapperStyle, flexDirection: 'column', color: theme.accent }}>
      <div style={{ fontSize: large ? 32 : 24, fontWeight: 800, lineHeight: 1 }}>{theme.initial}</div>
      <svg width={large ? 20 : 16} height={large ? 20 : 16} viewBox="0 0 24 24" fill={theme.accent} style={{ marginTop: 2 }}>
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    </div>
  );
  if (carrierKey === 'multi' || failed) return fallback;
  return (
    <div style={wrapperStyle}>
      <img
        src={`/voucher-assets/carrier-logos/${carrierKey}.png`}
        alt={theme.name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
