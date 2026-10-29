// Renderer server-side da página pública de itinerário — layout VIP "card-soft".
// HTML moderno, responsivo e elegante para visualização no smartphone e computador.
// Inclui MODO CONCIERGE VIP: Clima em tempo real no destino, Checklist interativo de bagagem e Dicas de embarque.
const QRCode = require('qrcode');
const {
  airportCity,
  tripCarrier,
  normalizeFlightNumber,
  carrierShortName,
  firstNameOf,
  lastNameOf,
  manageBookingUrl
} = require('./voucherCarrier');
const { buildReservationGroups, dedupeReservationGroups } = require('./reservationGroups');
const { buildWaLink } = require('./flightChangeMessage');

// Mapa de coordenadas dos principais aeroportos para consulta climática instantânea
const AIRPORT_COORDS = {
  SSA: { lat: -12.9086, lon: -38.3225, city: 'Salvador' },
  CGH: { lat: -23.6261, lon: -46.6564, city: 'São Paulo' },
  GRU: { lat: -23.4356, lon: -46.4731, city: 'Guarulhos' },
  GIG: { lat: -22.8089, lon: -43.2436, city: 'Rio de Janeiro' },
  SDU: { lat: -22.9105, lon: -43.1631, city: 'Rio de Janeiro' },
  BSB: { lat: -15.8692, lon: -47.9208, city: 'Brasília' },
  REC: { lat: -8.1258, lon: -34.9239, city: 'Recife' },
  FOR: { lat: -3.7763, lon: -38.5326, city: 'Fortaleza' },
  CNF: { lat: -19.6244, lon: -43.9719, city: 'Belo Horizonte' },
  CWB: { lat: -25.5285, lon: -49.1758, city: 'Curitiba' },
  POA: { lat: -29.9939, lon: -51.1711, city: 'Porto Alegre' },
  FLN: { lat: -27.6703, lon: -48.5525, city: 'Florianópolis' },
  VIX: { lat: -20.2581, lon: -40.2864, city: 'Vitória' },
  NAT: { lat: -5.7689, lon: -35.3664, city: 'Natal' },
  MCZ: { lat: -9.5108, lon: -35.7917, city: 'Maceió' },
  MAO: { lat: -3.0386, lon: -60.0497, city: 'Manaus' },
  BEL: { lat: -1.3793, lon: -48.4763, city: 'Belém' },
  GOI: { lat: -16.6322, lon: -49.2206, city: 'Goiânia' },
  CGB: { lat: -15.6529, lon: -56.1167, city: 'Cuiabá' },
  IGU: { lat: -25.5961, lon: -54.4872, city: 'Foz do Iguaçu' },
  NVT: { lat: -26.8794, lon: -48.6514, city: 'Navegantes' },
  JPA: { lat: -7.1483, lon: -34.9504, city: 'João Pessoa' },
  AJU: { lat: -10.9850, lon: -37.0703, city: 'Aracaju' },
  SLZ: { lat: -2.5869, lon: -44.2342, city: 'São Luís' },
  VCP: { lat: -23.0074, lon: -47.1345, city: 'Campinas' },
  BPS: { lat: -16.4386, lon: -39.0808, city: 'Porto Seguro' },
  IOS: { lat: -14.8160, lon: -39.0333, city: 'Ilhéus' },
  MCO: { lat: 28.4294, lon: -81.3090, city: 'Orlando' },
  MIA: { lat: 25.7959, lon: -80.2870, city: 'Miami' },
  LIS: { lat: 38.7742, lon: -9.1342, city: 'Lisboa' },
  EZE: { lat: -34.8222, lon: -58.5358, city: 'Buenos Aires' },
  MAD: { lat: 40.4983, lon: -3.5676, city: 'Madrid' },
  CDG: { lat: 49.0097, lon: 2.5479, city: 'Paris' }
};

// Rótulo curto de um grupo de reserva pra CTAs/QRs (ex.: "Interno").
function groupShortLabel(label) {
  const l = (label || '').toUpperCase();
  if (l === 'IDA') return 'Ida';
  if (l === 'VOLTA') return 'Volta';
  if (l === 'DESTINOS INTERNOS' || l.startsWith('INTERNO')) return 'Interno';
  return label;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  } catch { return ''; }
}

function fmtDateBR(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  } catch { return ''; }
}

function getDaysUntil(iso) {
  if (!iso) return null;
  try {
    const dep = new Date(iso);
    if (isNaN(dep.getTime())) return null;
    const now = new Date();
    const depDate = new Date(dep.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const nowDate = new Date(now.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const diffMs = depDate.getTime() - nowDate.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  } catch { return null; }
}

function calcDuration(depIso, arrIso) {
  if (!depIso || !arrIso) return '';
  try {
    const d1 = new Date(depIso);
    const d2 = new Date(arrIso);
    const diffM = Math.round((d2 - d1) / (1000 * 60));
    if (diffM <= 0) return '';
    const h = Math.floor(diffM / 60);
    const m = diffM % 60;
    return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  } catch { return ''; }
}

const firstName = firstNameOf;

function directionLabel(direction, idx) {
  const d = (direction || '').toLowerCase();
  if (d === 'ida') return 'Voo de Ida';
  if (d === 'volta') return 'Voo de Volta';
  if (d === 'interno') return 'Voo Interno';
  return `Voo ${idx + 1}`;
}

const CARRIER_COLORS = {
  azul: { bg: '#eef4ff', text: '#003da5', border: '#bfdbfe' },
  gol: { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
  latam: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
  default: { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' }
};

const SOCIAL_ICONS = {
  instagram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.22.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.05.41 2.22.06 1.25.07 1.62.07 4.82 0 3.2 0 3.6-.07 4.85-.05 1.17-.25 1.8-.41 2.22-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.05.36-2.22.41-1.25.06-1.62.07-4.85.07-3.2 0-3.6 0-4.85-.07-1.17-.05-1.8-.25-2.22-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.05-.41-2.22C2.21 15.6 2.2 15.2 2.2 12s0-3.6.07-4.85c.05-1.17.25-1.8.41-2.22.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.05-.36 2.22-.41C8.4 2.21 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.52 0-4.76.07-1.07.05-1.65.23-2.04.38-.51.2-.88.44-1.27.83-.39.39-.63.76-.83 1.27-.15.39-.33.97-.38 2.04C2.65 9.83 2.64 10.2 2.64 12s0 2.17.08 3.41c.05 1.07.23 1.65.38 2.04.2.51.44.88.83 1.27.39.39.76.63 1.27.83.39.15.97.33 2.04.38 1.24.08 1.61.08 4.76.08 3.15 0 3.52 0 4.76-.08 1.07-.05 1.65-.23 2.04-.38.51-.2.88-.44 1.27-.83.39-.39.63-.76.83-1.27.15-.39.33-.97.38-2.04.08-1.24.08-1.61.08-3.41 0-1.8 0-2.17-.08-3.41-.05-1.07-.23-1.65-.38-2.04-.2-.51-.44-.88-.83-1.27a3.45 3.45 0 0 0-1.27-.83c-.39-.15-.97-.33-2.04-.38C15.52 4 15.15 4 12 4zm0 3.06a4.94 4.94 0 1 1 0 9.88 4.94 4.94 0 0 1 0-9.88zm0 1.8a3.14 3.14 0 1 0 0 6.28 3.14 3.14 0 0 0 0-6.28zm5.15-2.06a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z"/></svg>',
  facebook: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.9h-2.33v6.98A10 10 0 0 0 22 12z"/></svg>',
  whatsapp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.34.22-.64.07-.3-.15-1.27-.47-2.42-1.49-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51-.17 0-.37-.02-.57-.02-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.08 4.5.71.3 1.26.49 1.7.62.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.49 15.31L2 22l4.81-1.5A10 10 0 1 0 12 2zm0 18.18a8.18 8.18 0 0 1-4.16-1.13l-.3-.18-2.86.89.91-2.78-.2-.32A8.18 8.18 0 1 1 12 20.18z"/></svg>'
};

// QR em SVG 110x110 (sem prólogo XML) para embutir no HTML; '' se a geração falhar.
async function qrSvg(target) {
  try {
    const svg = await QRCode.toString(target, { type: 'svg', width: 110, margin: 1, color: { dark: '#0e1726', light: '#ffffff' } });
    return svg.replace(/<\?xml[^?]*\?>/, '').replace(/width="\d+"/, 'width="110"').replace(/height="\d+"/, 'height="110"').trim();
  } catch { return ''; }
}

const CALENDAR_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#00569e" style="vertical-align:-2px;margin-right:6px;"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>';

async function renderItinerarioPage({ voucherData, settings, pdfUrl, isFlightChange, variant }) {
  const isChange = variant === 'flight_change' || Boolean(isFlightChange);
  const vd = voucherData || {};
  const s = settings || {};
  const trips = Array.isArray(vd.trips) ? vd.trips : [];
  const passengers = Array.isArray(vd.passengers) ? vd.passengers : [];

  const brandColor = s.brand_color || '#00569e';

  const firstPaxName = firstName(passengers[0]?.name) || 'viajante';
  const locator = (vd.reservation?.locator || 'N/A').toString();

  const paxLastName = lastNameOf(passengers[0]?.name);
  const groups = dedupeReservationGroups(buildReservationGroups(vd)).map(g => ({
    ...g,
    bookingUrl: manageBookingUrl(g.carrierKey, g.locator, paxLastName, g.trips[0]?.departure?.airport)
  }));
  const hasMultiGroups = groups.length > 1;
  const fallbackCarrier = (groups[0]?.carrierKey) || (vd.carrier && vd.carrier !== 'multi' ? vd.carrier : 'azul').toLowerCase();
  const origin = (vd.route?.origin || trips[0]?.departure?.airport || '').toUpperCase();
  const destination = (vd.route?.destination || trips[trips.length - 1]?.arrival?.airport || '').toUpperCase();
  const originCity = airportCity(origin);
  const destCity = airportCity(destination);

  // Coordenadas para previsão do tempo do destino
  const destCoords = AIRPORT_COORDS[destination] || null;

  const firstDep = trips[0]?.departure?.datetime;
  const lastArr = trips[trips.length - 1]?.arrival?.datetime;
  const periodLeft = fmtDateBR(firstDep);
  const periodRight = fmtDateBR(lastArr);
  const isOneWay = !periodRight || periodLeft === periodRight;
  const periodText = isOneWay ? (periodLeft || '—') : `${periodLeft} – ${periodRight}`;

  const contactPhone = s.contact_phone || '';
  const contactEmail = s.contact_email || '';
  const contactSite = s.contact_site || 'www.clubedovooviagens.com.br';
  const contactSiteHref = /^https?:\/\//i.test(contactSite) ? contactSite : `https://${contactSite}`;

  const phoneDigits = (contactPhone || '').replace(/\D/g, '');
  const phoneTel = phoneDigits ? `tel:+${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}` : '';
  const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}` : '';

  // QR Code SVG por grupo de reserva
  const safeGroupUrl = (u) => (u && /^https?:\/\//i.test(u)) ? u : contactSiteHref;
  const qrByGroup = await Promise.all(groups.map(async g => {
    const target = safeGroupUrl(g.bookingUrl);
    const svg = await qrSvg(target);
    return { label: g.label, locator: g.locator, carrierKey: g.carrierKey, target, svg };
  }));

  // QR do bloco "Assistência" (WhatsApp com mensagem pré-preenchida)
  const helpLocator = (vd.reservation?.locator || groups[0]?.locator || '').toString().trim();
  const helpName = firstName(passengers[0]?.name) || '';
  const helpText = `Olá! Preciso de ajuda com a minha reserva${helpLocator ? ` ${helpLocator}` : ''}${helpName ? ` (${helpName})` : ''}.`;
  const waHelpLink = buildWaLink(contactPhone, helpText);
  const assistTarget = waHelpLink || contactSiteHref;
  const assistSvg = await qrSvg(assistTarget);
  const assistLabel = waHelpLink ? 'Falar com a Clube do Voo pelo WhatsApp' : 'Abrir o site da Clube do Voo';
  const assistHint = waHelpLink
    ? 'Dúvidas, alterações ou pedidos especiais — escaneie ou toque no QR para falar conosco no WhatsApp.'
    : 'Dúvidas, alterações ou pedidos especiais — escaneie o QR ou fale conosco.';

  // Seção "Suas reservas" com N QRs (quando há mais de 1 reserva distinta).
  const reservasSectionHtml = hasMultiGroups ? `
      <section class="inner-card" style="background:#ffffff;border:1px solid #e9ecf2;border-radius:16px;padding:24px;margin:0 28px 24px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:700;margin-bottom:16px;">SUAS RESERVAS</div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            ${qrByGroup.map(g => `
            <td valign="top" align="center" style="vertical-align:top;text-align:center;padding:8px;">
              <a href="${escapeHtml(g.target)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;">
                <div style="display:inline-block;background:#ffffff;padding:8px;border-radius:12px;border:1px solid #e9ecf2;box-shadow:0 4px 12px rgba(0,0,0,0.04);line-height:0;">${g.svg || '<div style="width:110px;height:110px;"></div>'}</div>
                <div style="font-size:12px;font-weight:700;color:${brandColor};text-transform:uppercase;letter-spacing:0.5px;margin-top:10px;">${escapeHtml(groupShortLabel(g.label))}</div>
                <div style="font-size:11.5px;color:#6c757d;margin-top:2px;">${escapeHtml(carrierShortName(g.carrierKey))} &middot; <strong>${escapeHtml(g.locator || '—')}</strong></div>
              </a>
            </td>`).join('')}
          </tr>
        </table>
      </section>` : '';

  const carrierFallbackShort = carrierShortName(fallbackCarrier);

  // Contagem Regressiva para a Viagem (VIP Countdown Badge)
  let countdownHtml = '';
  const daysRemaining = getDaysUntil(firstDep);
  if (daysRemaining !== null) {
    if (daysRemaining > 1) {
      countdownHtml = `
        <div class="countdown-badge" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg, ${brandColor} 0%, #3871c1 100%);color:#ffffff;padding:9px 20px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(0,86,158,0.28);margin-bottom:18px;">
          <span>⏳ Faltam ${daysRemaining} dias para o seu embarque!</span>
        </div>`;
    } else if (daysRemaining === 1) {
      countdownHtml = `
        <div class="countdown-badge" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg, #059669 0%, #10b981 100%);color:#ffffff;padding:9px 20px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(16,185,129,0.28);margin-bottom:18px;">
          <span>✈️ Seu embarque é amanhã! Prepare as malas!</span>
        </div>`;
    } else if (daysRemaining === 0) {
      countdownHtml = `
        <div class="countdown-badge" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg, #0284c7 0%, #38bdf8 100%);color:#ffffff;padding:9px 20px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(2,132,199,0.28);margin-bottom:18px;">
          <span>🌟 O seu grande dia chegou! Tenha uma excelente viagem!</span>
        </div>`;
    }
  }

  // Cards dos Trechos de Voo (Trip cards refinados)
  const tripsHtml = trips.map((t, idx) => {
    const ck = tripCarrier(t, fallbackCarrier);
    const carrierShort = carrierShortName(ck);
    const flightNoFull = normalizeFlightNumber(t.flightNumber || '');
    const flightNo = flightNoFull.replace(/^[A-Z]{2}\s*/, '');
    const tripLocator = t.locator || locator;
    const depTime = fmtTime(t.departure?.datetime);
    const depDate = fmtDateBR(t.departure?.datetime);
    const arrTime = fmtTime(t.arrival?.datetime);
    const arrDate = fmtDateBR(t.arrival?.datetime);
    const depIata = (t.departure?.airport || '').toUpperCase();
    const arrIata = (t.arrival?.airport || '').toUpperCase();
    const title = directionLabel(t.direction, idx);
    const durationStr = calcDuration(t.departure?.datetime, t.arrival?.datetime);
    const cColor = CARRIER_COLORS[ck] || CARRIER_COLORS.default;

    return `
      <section class="trip-card" style="background:#ffffff;border:1px solid #e9ecf2;border-radius:16px;padding:22px;margin:0 28px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.03);">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
          <tr>
            <td valign="top" style="vertical-align:top;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:16px;font-weight:700;color:#0e1726;">${escapeHtml(title)}</span>
                <span style="display:inline-block;background:${cColor.bg};color:${cColor.text};border:1px solid ${cColor.border};padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:0.3px;">${escapeHtml(carrierShort)}</span>
              </div>
              <div style="font-size:12px;color:#6c757d;margin-top:4px;">${escapeHtml(carrierShort)} &middot; Voo ${escapeHtml(flightNo)}</div>
            </td>
            <td valign="top" align="right" class="trip-head-right" style="vertical-align:top;text-align:right;">
              <span style="display:inline-block;background:#e8f5ee;color:#1f9d55;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:600;margin-bottom:6px;white-space:nowrap;"><span style="color:#1f9d55;">&#9679;</span> Confirmado</span>
              <div style="font-size:11.5px;color:#8a93a4;">Localizador <strong>${escapeHtml(tripLocator)}</strong></div>
            </td>
          </tr>
        </table>
        <div style="border-top:1px solid #eef0f4;margin:16px 0;"></div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-3col">
          <tr>
            <td valign="top" width="35%" style="vertical-align:top;width:35%;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:700;">PARTIDA</div>
              <div style="font-size:28px;font-weight:800;color:${brandColor};margin-top:4px;line-height:1;">${escapeHtml(depTime || '--:--')}</div>
              <div style="font-size:13px;font-weight:600;color:#0e1726;margin-top:6px;">${escapeHtml(depIata)} &middot; ${escapeHtml(airportCity(depIata))}</div>
              <div style="font-size:11.5px;color:#8a93a4;margin-top:2px;">${escapeHtml(depDate)}</div>
            </td>
            <td valign="middle" width="30%" align="center" class="trip-plane" style="vertical-align:middle;text-align:center;width:30%;padding:0 8px;">
              ${durationStr ? `<div style="font-size:11px;color:#8a93a4;font-weight:600;margin-bottom:4px;">${escapeHtml(durationStr)}</div>` : ''}
              <div style="position:relative;height:36px;">
                <div style="position:absolute;top:50%;left:0;right:0;border-top:2px dashed #cbd5e1;"></div>
                <div style="position:relative;display:inline-block;background:#ffffff;padding:0 12px;line-height:36px;">
                  <span style="font-size:18px;color:${brandColor};">&#9992;</span>
                </div>
              </div>
              <div style="font-size:10.5px;color:#10b981;font-weight:600;margin-top:2px;">Voo Direto</div>
            </td>
            <td valign="top" width="35%" align="right" style="vertical-align:top;text-align:right;width:35%;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:700;">CHEGADA</div>
              <div style="font-size:28px;font-weight:800;color:#0e1726;margin-top:4px;line-height:1;">${escapeHtml(arrTime || '--:--')}</div>
              <div style="font-size:13px;font-weight:600;color:#0e1726;margin-top:6px;">${escapeHtml(arrIata)} &middot; ${escapeHtml(airportCity(arrIata))}</div>
              <div style="font-size:11.5px;color:#8a93a4;margin-top:2px;">${escapeHtml(arrDate)}</div>
            </td>
          </tr>
        </table>
      </section>`;
  }).join('');

  const stepCarrier = trips[0] ? carrierShortName(tripCarrier(trips[0], fallbackCarrier)) : carrierFallbackShort;

  const phoneRow = contactPhone ? `
            <div style="font-size:13.5px;color:#6c757d;margin-top:10px;"><strong style="color:#0e1726;">WhatsApp:</strong> <a href="${escapeHtml(phoneTel)}" style="color:${brandColor};text-decoration:none;font-weight:600;">${escapeHtml(contactPhone)}</a></div>` : '';
  const emailRow = contactEmail ? `
            <div style="font-size:13.5px;color:#6c757d;margin-top:6px;"><strong style="color:#0e1726;">Email:</strong> <a href="mailto:${escapeHtml(contactEmail)}" style="color:${brandColor};text-decoration:none;font-weight:600;">${escapeHtml(contactEmail)}</a></div>` : '';

  const igHref = contactSiteHref;
  const fbHref = contactSiteHref;
  const socialBtn = (href, svg) =>
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:${brandColor};text-decoration:none;margin:0 6px;vertical-align:middle;box-shadow:0 2px 8px rgba(0,86,158,0.2);">${svg}</a>`;

  const socialsHtml =
    socialBtn(igHref, SOCIAL_ICONS.instagram) +
    socialBtn(fbHref, SOCIAL_ICONS.facebook) +
    (whatsappHref ? socialBtn(whatsappHref, SOCIAL_ICONS.whatsapp) : '');

  // Step rows (Dicas de viagem)
  const stepRow = (n, title, desc, isLast) => `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="step-row" style="${isLast ? '' : 'border-bottom:1px solid #eef0f4;'}margin-bottom:${isLast ? '0' : '0'};">
          <tr>
            <td valign="top" width="46" style="vertical-align:top;width:46px;padding-bottom:${isLast ? '0' : '18px'};">
              <span style="display:inline-flex;width:34px;height:34px;border-radius:50%;background:${brandColor};color:#ffffff;font-weight:700;font-size:14px;align-items:center;justify-content:center;line-height:34px;text-align:center;box-shadow:0 2px 6px rgba(0,86,158,0.25);">${n}</span>
            </td>
            <td valign="top" style="vertical-align:top;padding-bottom:${isLast ? '0' : '18px'};padding-top:4px;">
              <div style="font-size:14.5px;font-weight:700;color:#0e1726;margin-bottom:4px;">${escapeHtml(title)}</div>
              <div style="font-size:13px;color:#6c757d;line-height:1.6;">${desc}</div>
            </td>
          </tr>
        </table>`;

  const stepsHtml =
    stepRow(1, 'Chegue cedo ao aeroporto', `Recomendamos chegar com pelo menos 2 horas de antecedência para voos nacionais (3h para internacionais). Verifique as regras de bagagem da ${escapeHtml(stepCarrier)}.`, false) +
    `<div style="border-top:1px solid #eef0f4;"></div>` +
    stepRow(2, 'Documentos em mãos', 'Tenha um documento oficial com foto e o localizador da reserva acessíveis. Estes dados serão solicitados no check-in.', false) +
    `<div style="border-top:1px solid #eef0f4;"></div>` +
    stepRow(3, 'Check-in assistido VIP', 'Nossa equipe pode realizar o check-in para você e enviar o cartão de embarque diretamente no WhatsApp. Basta nos avisar!', true);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="${brandColor}">
<title>Itinerário ${escapeHtml(locator)} — Clube do Voo Viagens</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
  :root {
    --brand-color: ${brandColor};
    --brand-dark: #004782;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f1f5f9;
    color: #0e1726;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--brand-color); }
  .page-container { max-width: 660px; margin: 0 auto; padding: 24px 16px 80px; }
  .shell {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    box-shadow: 0 12px 40px rgba(0, 86, 158, 0.08);
    overflow: hidden;
  }

  /* Concierge VIP Widgets */
  .concierge-header-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 86, 158, 0.08);
    color: var(--brand-color);
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  /* Checklist Interativo */
  .chk-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #f1f5f9;
    background: #ffffff;
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    user-select: none;
  }
  .chk-item:hover {
    background: #f8fafc;
    border-color: #e2e8f0;
  }
  .chk-item.checked {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }
  .chk-box {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 2px solid #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    shrink: 0;
    margin-top: 2px;
    transition: all 0.2s ease;
  }
  .chk-item.checked .chk-box {
    background: #16a34a;
    border-color: #16a34a;
    color: #ffffff;
  }
  .chk-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #1e293b;
    line-height: 1.35;
  }
  .chk-item.checked .chk-title {
    text-decoration: line-through;
    color: #64748b;
  }
  .chk-desc {
    font-size: 11.5px;
    color: #64748b;
    margin-top: 2px;
    line-height: 1.4;
  }

  /* Barra de Progresso */
  .chk-progress-bg {
    width: 100%;
    height: 6px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
    margin-top: 8px;
  }
  .chk-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #059669);
    width: 0%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  /* Botão Compartilhar Viagem */
  .btn-share {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #f8fafc;
    color: #334155;
    border: 1px solid #cbd5e1;
    padding: 12px 20px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    margin-top: 10px;
  }
  .btn-share:hover {
    background: #e2e8f0;
    color: #0f172a;
  }

  /* FAB WhatsApp */
  .fab-whatsapp {
    position: fixed;
    bottom: 24px;
    right: 20px;
    z-index: 99;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #25D366;
    color: #ffffff;
    padding: 14px 22px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 14px;
    text-decoration: none;
    box-shadow: 0 8px 24px rgba(37, 211, 102, 0.45);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .fab-whatsapp:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(37, 211, 102, 0.55); }
  .fab-whatsapp:active { transform: translateY(0); }

  @media (max-width: 560px) {
    .page-container { padding: 12px 10px 90px; }
    .shell { border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .row-2col > tbody > tr > td,
    .row-3col > tbody > tr > td,
    .row-2col > tr > td,
    .row-3col > tr > td {
      display: block !important;
      width: 100% !important;
      text-align: left !important;
      padding: 6px 0 !important;
    }
    .header-right, .trip-head-right, .support-right { text-align: left !important; margin-top: 12px !important; }
    .trip-plane { display: none !important; }
    .stack-mobile { padding-left: 0 !important; }
    .section-pad { padding-left: 18px !important; padding-right: 18px !important; }
    .trip-card { margin-left: 16px !important; margin-right: 16px !important; padding: 16px !important; }
    .cta-card { margin-left: 16px !important; margin-right: 16px !important; padding: 22px !important; }
    .inner-card { margin-left: 16px !important; margin-right: 16px !important; padding: 18px !important; }
  }
</style>
</head>
<body>
  <div class="page-container">
    <div class="shell">

      <!-- Section 1: Header -->
      <div class="section-pad" style="padding:28px;background:linear-gradient(to bottom, #f8fafc, #ffffff);border-bottom:1px solid #f1f5f9;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
          <tr>
            <td valign="middle" style="vertical-align:middle;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle" style="vertical-align:middle;">
                    <img src="/voucher-assets/agency-logo.png" width="46" height="46" alt="Clube do Voo" style="display:block;border:2px solid rgba(0,86,158,0.22);width:46px;height:46px;border-radius:50%;object-fit:cover;box-shadow:0 3px 8px rgba(0,86,158,0.12);" onerror="this.src='/voucher-assets/logo.png'">
                  </td>
                  <td valign="middle" style="vertical-align:middle;padding-left:14px;">
                    <div style="font-size:17px;font-weight:800;color:#0e1726;line-height:1.2;">Clube do Voo Viagens</div>
                    <div style="font-size:11.5px;color:${brandColor};text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-top:3px;">${isChange ? 'Voo reajustado' : 'Confirmação de reserva'}</div>
                  </td>
                </tr>
              </table>
            </td>
            <td valign="middle" align="right" class="header-right" style="vertical-align:middle;text-align:right;">
              <div style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:8px 16px;text-align:left;box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:700;">LOCALIZADOR${hasMultiGroups ? 'ES' : ''}</div>
                ${hasMultiGroups
                  ? `<div style="font-size:13.5px;font-weight:800;color:${brandColor};letter-spacing:1px;margin-top:2px;line-height:1.4;">${groups.map(g => `${escapeHtml(groupShortLabel(g.label))}: ${escapeHtml(g.locator || '—')}`).join('<br>')}</div>`
                  : `<div style="font-size:19px;font-weight:800;color:${brandColor};letter-spacing:1.5px;margin-top:2px;">${escapeHtml(locator)}</div>`}
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Section 2: Greeting & Countdown -->
      <div class="section-pad" style="padding:28px 28px 24px;">
        ${countdownHtml}
        <div>
          <span style="display:inline-block;background:#e8f5ee;color:#1f9d55;padding:5px 14px;border-radius:999px;font-size:11.5px;font-weight:700;margin-bottom:14px;"><span style="color:#1f9d55;">&#9679;</span> ${isChange ? 'Voo reajustado' : 'Reserva confirmada'}</span>
        </div>
        <h1 style="font-size:28px;font-weight:800;color:#0e1726;margin:0 0 10px;line-height:1.2;">Olá, ${escapeHtml(firstPaxName)}.</h1>
        <p style="font-size:14px;color:#64748b;line-height:1.65;max-width:520px;margin:0;">${isChange ? 'Seu voo foi reajustado; veja abaixo o voucher atualizado.' : 'Sua viagem está pronta. Use este itinerário VIP como referência — todos os dados do seu voo, previsão do tempo e checklist de viagem estão abaixo.'}</p>
        
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px;">
          ${pdfUrl ? `<a href="${escapeHtml(pdfUrl)}" download rel="noopener" style="display:inline-flex;align-items:center;gap:8px;background:${brandColor};color:#ffffff;padding:14px 28px;border-radius:999px;font-weight:700;font-size:13.5px;text-decoration:none;letter-spacing:0.5px;box-shadow:0 6px 18px rgba(0,86,158,0.3);transition:all 0.2s;"><span>BAIXAR VOUCHER (PDF)</span> &darr;</a>` : ''}
          <button type="button" id="shareTripBtn" class="btn-share" style="width:auto;margin-top:0;padding:14px 22px;">
            <span>📲 Compartilhar Viagem</span>
          </button>
        </div>
      </div>

      <!-- Section 3: Route Hero Card -->
      <section class="inner-card" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:22px;margin:0 28px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-3col">
          <tr>
            <td valign="middle" style="vertical-align:middle;text-align:left;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:700;">ORIGEM</div>
              <div style="font-size:26px;font-weight:800;color:${brandColor};line-height:1.1;margin-top:4px;">${escapeHtml(origin)}</div>
              <div style="font-size:13.5px;color:#475569;font-weight:600;margin-top:3px;">${escapeHtml(originCity)}</div>
            </td>
            <td valign="middle" width="60" align="center" style="vertical-align:middle;text-align:center;width:60px;">
              <div style="font-size:24px;color:${brandColor};line-height:1;">&#8644;</div>
            </td>
            <td valign="middle" align="right" style="vertical-align:middle;text-align:right;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:700;">DESTINO</div>
              <div style="font-size:26px;font-weight:800;color:${brandColor};line-height:1.1;margin-top:4px;">${escapeHtml(destination)}</div>
              <div style="font-size:13.5px;color:#475569;font-weight:600;margin-top:3px;">${escapeHtml(destCity)}</div>
            </td>
          </tr>
        </table>
        <div style="border-top:1px solid #f1f5f9;padding-top:14px;margin-top:14px;text-align:center;">
          <span style="font-size:12.5px;color:#64748b;font-weight:600;">${CALENDAR_SVG}${escapeHtml(periodText)}</span>
        </div>
      </section>

      <!-- Section 3.1: CONCIERGE VIP - Clima no Destino em Tempo Real -->
      <section class="inner-card" style="background:linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin:0 28px 24px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="concierge-header-pill">🌤️ Concierge VIP</span>
              <span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#8a93a4;font-weight:700;">TEMPO NO DESTINO</span>
            </div>
            <div style="font-size:16px;font-weight:800;color:#0e1726;margin-top:4px;">
              ${escapeHtml(destCity)} (${escapeHtml(destination)})
            </div>
          </div>
          
          <div id="weatherBox" style="display:flex;align-items:center;gap:12px;background:#ffffff;padding:8px 16px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <span id="weatherEmoji" style="font-size:28px;line-height:1;">☀️</span>
            <div>
              <div id="weatherTemp" style="font-size:20px;font-weight:800;color:${brandColor};line-height:1;">--°C</div>
              <div id="weatherDesc" style="font-size:11px;color:#64748b;font-weight:600;margin-top:2px;">Carregando clima…</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 4: Trip Cards -->
      ${tripsHtml}

      <!-- Section 5: CTA Check-in Card -->
      <section class="cta-card" style="background:linear-gradient(135deg, ${brandColor} 0%, #0a73b0 100%);border-radius:18px;padding:30px 24px;margin:12px 28px 24px;text-align:center;box-shadow:0 8px 24px rgba(0,86,158,0.25);">
        <div style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:0.2px;">Pronto para embarcar?</div>
        <div style="font-size:13px;color:#ffffff;opacity:0.9;margin:8px 0 22px;">Check-in disponível 48h a 72h antes da partida</div>
        ${hasMultiGroups
          ? qrByGroup.map(g => `<a href="${escapeHtml(g.target)}" target="_blank" rel="noopener" style="display:inline-block;background:#ffffff;color:${brandColor};padding:13px 24px;border-radius:999px;font-weight:800;font-size:12.5px;text-decoration:none;letter-spacing:0.5px;box-shadow:0 4px 14px rgba(0,0,0,0.12);margin:5px 6px;">CHECK-IN ${escapeHtml(groupShortLabel(g.label).toUpperCase())} (${escapeHtml(carrierShortName(g.carrierKey).toUpperCase())}) &rarr;</a>`).join('')
          : `<a href="${escapeHtml(qrByGroup[0]?.target || contactSiteHref)}" target="_blank" rel="noopener" style="display:inline-block;background:#ffffff;color:${brandColor};padding:14px 34px;border-radius:999px;font-weight:800;font-size:13.5px;text-decoration:none;letter-spacing:0.5px;box-shadow:0 4px 14px rgba(0,0,0,0.14);">FAZER CHECK-IN &rarr;</a>`}
      </section>
      ${reservasSectionHtml}

      <!-- Section 5.1: CONCIERGE VIP - Checklist Interativo de Bagagem & Viagem -->
      <section class="inner-card" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin:0 28px 24px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="concierge-header-pill">🧳 Checklist VIP</span>
              <span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#8a93a4;font-weight:700;">PREPARAÇÃO DE VIAGEM</span>
            </div>
            <div style="font-size:18px;font-weight:800;color:#0e1726;margin-top:4px;">O que levar na bagagem</div>
          </div>
          <div id="chkCounterBadge" style="font-size:11.5px;font-weight:700;color:${brandColor};background:#eef5fb;padding:5px 14px;border-radius:999px;">
            <span id="chkCount">0</span> de 5 checados
          </div>
        </div>
        <p style="font-size:13px;color:#64748b;margin:0 0 14px;line-height:1.5;">
          Marque os itens enquanto organiza as malas. Suas marcações ficam salvas no celular:
        </p>
        
        <div class="chk-progress-bg">
          <div id="chkProgressBar" class="chk-progress-bar"></div>
        </div>

        <div style="margin-top:16px;">
          <div class="chk-item" onclick="toggleChk(0)">
            <div class="chk-box" id="box-0"></div>
            <div>
              <div class="chk-title">Documento de identificação com foto</div>
              <div class="chk-desc">RG recente, CNH válida ou Passaporte em mãos (obrigatório para o embarque).</div>
            </div>
          </div>

          <div class="chk-item" onclick="toggleChk(1)">
            <div class="chk-box" id="box-1"></div>
            <div>
              <div class="chk-title">Item pessoal (Mochila / Bolsa)</div>
              <div class="chk-desc">Deve caber embaixo do assento à sua frente. Guarde eletrônicos, remédios e casaco.</div>
            </div>
          </div>

          <div class="chk-item" onclick="toggleChk(2)">
            <div class="chk-box" id="box-2"></div>
            <div>
              <div class="chk-title">Mala de mão de até 10kg</div>
              <div class="chk-desc">Dimensões máx. 55x35x25cm. Não leve objetos pontiagudos ou tesouras.</div>
            </div>
          </div>

          <div class="chk-item" onclick="toggleChk(3)">
            <div class="chk-box" id="box-3"></div>
            <div>
              <div class="chk-title">Baterias e Powerbanks na mala de mão</div>
              <div class="chk-desc"><strong>Atenção:</strong> Baterias de lítio e carregadores portáteis são proibidos no porão despachado!</div>
            </div>
          </div>

          <div class="chk-item" onclick="toggleChk(4)">
            <div class="chk-box" id="box-4"></div>
            <div>
              <div class="chk-title">Comprovante de reserva e localizador</div>
              <div class="chk-desc">Deixe esta página salva nos favoritos ou baixe o PDF para acesso offline.</div>
            </div>
          </div>
        </div>

        <div id="chkDoneBanner" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:12px;border-radius:12px;text-align:center;font-size:13px;font-weight:700;margin-top:14px;">
          🎉 Malas prontas! Tenha um embarque tranquilo e uma viagem incrível!
        </div>
      </section>

      <!-- Section 6: Próximos passos -->
      <section class="inner-card" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin:0 28px 24px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <div style="margin-bottom:20px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:700;">PRÓXIMOS PASSOS</div>
          <div style="font-size:18px;font-weight:800;color:#0e1726;margin-top:4px;">Preparando-se para o voo</div>
        </div>
        ${stepsHtml}
      </section>

      <!-- Section 7: Assistência da Agência -->
      <section class="inner-card" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin:0 28px 28px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
          <tr>
            <td valign="top" style="vertical-align:top;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:700;">ASSISTÊNCIA VIP</div>
              <div style="font-size:18px;font-weight:800;color:#0e1726;margin:4px 0 10px;">Estamos aqui para você</div>
              <div style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:14px;">${escapeHtml(assistHint)}</div>
              ${phoneRow}
              ${emailRow}
            </td>
            <td valign="top" align="right" width="120" class="support-right" style="vertical-align:top;text-align:right;width:120px;padding-left:16px;">
              <a href="${escapeHtml(assistTarget)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(assistLabel)}" style="display:inline-block;text-decoration:none;">
                <div style="display:inline-block;background:#ffffff;padding:8px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.04);line-height:0;">${assistSvg || '<div style="width:110px;height:110px;"></div>'}</div>
              </a>
            </td>
          </tr>
        </table>
      </section>

    </div>

    <!-- Section 8: Footer -->
    <div style="text-align:center;padding:36px 20px;">
      <div style="font-size:13.5px;color:#64748b;">Desejamos uma viagem inesquecível,</div>
      <div style="font-size:15px;font-weight:800;color:#0e1726;margin-top:2px;margin-bottom:16px;">Clube do Voo Viagens</div>
      <div style="margin-bottom:16px;">${socialsHtml}</div>
      <div><a href="${escapeHtml(contactSiteHref)}" target="_blank" rel="noopener" style="font-size:12.5px;color:${brandColor};text-decoration:none;font-weight:600;">${escapeHtml(contactSite)}</a></div>
      <div style="font-size:11px;color:#94a3b8;margin-top:8px;">Itinerário oficial da sua reserva &middot; Emitido por Clube do Voo Viagens</div>
    </div>

  </div>

  <!-- Botão Flutuante (FAB) do WhatsApp no Mobile -->
  <a href="${escapeHtml(assistTarget)}" target="_blank" rel="noopener noreferrer" class="fab-whatsapp" aria-label="Falar com a agência no WhatsApp">
    ${SOCIAL_ICONS.whatsapp}
    <span>WhatsApp</span>
  </a>

  <!-- Script Interativo do Modo Concierge VIP -->
  <script>
    // 1. Checklist Interativo com persistência no LocalStorage
    var chkStorageKey = 'clube_chk_' + '${escapeHtml(locator)}';
    var chkState = [false, false, false, false, false];
    try {
      var saved = localStorage.getItem(chkStorageKey);
      if (saved) chkState = JSON.parse(saved);
    } catch(e) {}

    function renderChk() {
      var done = 0;
      for (var i = 0; i < 5; i++) {
        var box = document.getElementById('box-' + i);
        var item = box ? box.closest('.chk-item') : null;
        if (item) {
          if (chkState[i]) {
            item.classList.add('checked');
            box.innerHTML = '&#10003;';
            done++;
          } else {
            item.classList.remove('checked');
            box.innerHTML = '';
          }
        }
      }
      var countEl = document.getElementById('chkCount');
      if (countEl) countEl.innerText = done;
      var barEl = document.getElementById('chkProgressBar');
      if (barEl) barEl.style.width = (done / 5 * 100) + '%';
      var bannerEl = document.getElementById('chkDoneBanner');
      if (bannerEl) bannerEl.style.display = done === 5 ? 'block' : 'none';
      try {
        localStorage.setItem(chkStorageKey, JSON.stringify(chkState));
      } catch(e) {}
    }

    function toggleChk(index) {
      chkState[index] = !chkState[index];
      renderChk();
    }
    renderChk();

    // 2. Previsão do Tempo Dinâmica (Open-Meteo)
    (function fetchDestinationWeather() {
      var lat = ${destCoords ? destCoords.lat : 'null'};
      var lon = ${destCoords ? destCoords.lon : 'null'};
      var city = '${escapeHtml(destCity)}';

      function applyWeather(temp, code, humidity) {
        var tempEl = document.getElementById('weatherTemp');
        var descEl = document.getElementById('weatherDesc');
        var emojiEl = document.getElementById('weatherEmoji');
        if (!tempEl || !descEl || !emojiEl) return;

        tempEl.innerText = Math.round(temp) + '°C';

        var emoji = '☀️';
        var desc = 'Céu Limpo';
        if (code === 1 || code === 2 || code === 3) {
          emoji = '⛅'; desc = 'Parcialmente Nublado';
        } else if (code >= 45 && code <= 48) {
          emoji = '🌫️'; desc = 'Nevoeiro';
        } else if (code >= 51 && code <= 67) {
          emoji = '🌧️'; desc = 'Chuva Leve / Moderada';
        } else if (code >= 71 && code <= 77) {
          emoji = '❄️'; desc = 'Neve';
        } else if (code >= 80 && code <= 82) {
          emoji = '🌦️'; desc = 'Pancadas de Chuva';
        } else if (code >= 95) {
          emoji = '⛈️'; desc = 'Tempestades';
        }
        emojiEl.innerText = emoji;
        descEl.innerText = desc + (humidity ? ' · ' + humidity + '% umidade' : '');
      }

      function queryApi(latitude, longitude) {
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude + '&current=temperature_2m,relative_humidity_2m,weather_code';
        fetch(url)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data && data.current) {
              applyWeather(data.current.temperature_2m, data.current.weather_code, data.current.relative_humidity_2m);
            }
          })
          .catch(function() {
            var descEl = document.getElementById('weatherDesc');
            if (descEl) descEl.innerText = 'Excelente destino de viagem!';
          });
      }

      if (lat !== null && lon !== null) {
        queryApi(lat, lon);
      } else if (city) {
        fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=pt&format=json')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data && data.results && data.results[0]) {
              queryApi(data.results[0].latitude, data.results[0].longitude);
            }
          })
          .catch(function() {});
      }
    })();

    // 3. Botão Compartilhar Viagem
    var shareBtn = document.getElementById('shareTripBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function() {
        var shareData = {
          title: 'Meu Itinerário de Viagem — ' + '${escapeHtml(destCity)}',
          text: 'Confira os detalhes e horários do meu voo para ' + '${escapeHtml(destCity)}' + ':',
          url: window.location.href
        };
        if (navigator.share) {
          navigator.share(shareData).catch(function() {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(window.location.href).then(function() {
            shareBtn.innerText = '✓ Link Copiado!';
            setTimeout(function() { shareBtn.innerText = '📲 Compartilhar Viagem'; }, 2500);
          });
        } else {
          alert('Link do itinerário: ' + window.location.href);
        }
      });
    }
  </script>
</body>
</html>`;
}

module.exports = {
  renderItinerarioPage,
  escapeHtml,
  firstName,
  fmtTime,
  fmtDateBR
};
