// Renderer server-side da página pública de itinerário — layout "card-soft".
// HTML moderno (CSS livre — não é e-mail). QR Code gerado server-side (função async).
const QRCode = require('qrcode');
const {
  airportCity,
  tripCarrier,
  normalizeFlightNumber,
  carrierShortName
} = require('./voucherCarrier');

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

function firstName(fullName) {
  if (!fullName) return '';
  const first = String(fullName).trim().split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function directionLabel(direction, idx) {
  const d = (direction || '').toLowerCase();
  if (d === 'ida') return 'Voo de Ida';
  if (d === 'volta') return 'Voo de Volta';
  return `Voo ${idx + 1}`;
}

const SOCIAL_ICONS = {
  instagram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.22.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.05.41 2.22.06 1.25.07 1.62.07 4.82 0 3.2 0 3.6-.07 4.85-.05 1.17-.25 1.8-.41 2.22-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.05.36-2.22.41-1.25.06-1.62.07-4.85.07-3.2 0-3.6 0-4.85-.07-1.17-.05-1.8-.25-2.22-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.05-.41-2.22C2.21 15.6 2.2 15.2 2.2 12s0-3.6.07-4.85c.05-1.17.25-1.8.41-2.22.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.05-.36 2.22-.41C8.4 2.21 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.52 0-4.76.07-1.07.05-1.65.23-2.04.38-.51.2-.88.44-1.27.83-.39.39-.63.76-.83 1.27-.15.39-.33.97-.38 2.04C2.65 9.83 2.64 10.2 2.64 12s0 2.17.08 3.41c.05 1.07.23 1.65.38 2.04.2.51.44.88.83 1.27.39.39.76.63 1.27.83.39.15.97.33 2.04.38 1.24.08 1.61.08 4.76.08 3.15 0 3.52 0 4.76-.08 1.07-.05 1.65-.23 2.04-.38.51-.2.88-.44 1.27-.83.39-.39.63-.76.83-1.27.15-.39.33-.97.38-2.04.08-1.24.08-1.61.08-3.41 0-1.8 0-2.17-.08-3.41-.05-1.07-.23-1.65-.38-2.04-.2-.51-.44-.88-.83-1.27a3.45 3.45 0 0 0-1.27-.83c-.39-.15-.97-.33-2.04-.38C15.52 4 15.15 4 12 4zm0 3.06a4.94 4.94 0 1 1 0 9.88 4.94 4.94 0 0 1 0-9.88zm0 1.8a3.14 3.14 0 1 0 0 6.28 3.14 3.14 0 0 0 0-6.28zm5.15-2.06a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z"/></svg>',
  facebook: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.9h-2.33v6.98A10 10 0 0 0 22 12z"/></svg>',
  whatsapp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.34.22-.64.07-.3-.15-1.27-.47-2.42-1.49-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51-.17 0-.37-.02-.57-.02-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.08 4.5.71.3 1.26.49 1.7.62.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.49 15.31L2 22l4.81-1.5A10 10 0 1 0 12 2zm0 18.18a8.18 8.18 0 0 1-4.16-1.13l-.3-.18-2.86.89.91-2.78-.2-.32A8.18 8.18 0 1 1 12 20.18z"/></svg>'
};

const CALENDAR_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#8a93a4" style="vertical-align:-2px;margin-right:6px;"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>';

async function renderItinerarioPage({ voucherData, settings, bookingUrl }) {
  const vd = voucherData || {};
  const s = settings || {};
  const trips = Array.isArray(vd.trips) ? vd.trips : [];
  const passengers = Array.isArray(vd.passengers) ? vd.passengers : [];

  const firstPaxName = firstName(passengers[0]?.name) || 'viajante';
  const locator = (vd.reservation?.locator || 'N/A').toString();
  const fallbackCarrier = (vd.carrier || 'azul').toLowerCase();
  const origin = (vd.route?.origin || trips[0]?.departure?.airport || '').toUpperCase();
  const destination = (vd.route?.destination || trips[trips.length - 1]?.arrival?.airport || '').toUpperCase();
  const originCity = airportCity(origin);
  const destCity = airportCity(destination);

  const firstDep = trips[0]?.departure?.datetime;
  const lastArr = trips[trips.length - 1]?.arrival?.datetime;
  const periodLeft = fmtDateBR(firstDep);
  const periodRight = fmtDateBR(lastArr);
  const isOneWay = !periodRight || periodLeft === periodRight;
  const periodText = isOneWay ? (periodLeft || '—') : `${periodLeft} – ${periodRight}`;

  const safeBookingUrl = bookingUrl && /^https?:\/\//i.test(bookingUrl) ? bookingUrl : '#';

  const contactPhone = s.contact_phone || '';
  const contactEmail = s.contact_email || '';
  const contactSite = s.contact_site || 'www.clubedovooviagens.com.br';
  const contactSiteHref = /^https?:\/\//i.test(contactSite) ? contactSite : `https://${contactSite}`;

  const phoneDigits = (contactPhone || '').replace(/\D/g, '');
  const phoneTel = phoneDigits ? `tel:+${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}` : '';
  const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}` : '';

  // QR Code SVG
  let qrSvg = '';
  try {
    qrSvg = await QRCode.toString(safeBookingUrl === '#' ? contactSiteHref : safeBookingUrl, {
      type: 'svg',
      width: 110,
      margin: 1,
      color: { dark: '#0e1726', light: '#ffffff' }
    });
    qrSvg = qrSvg.replace(/<\?xml[^?]*\?>/, '').replace(/width="\d+"/, 'width="110"').replace(/height="\d+"/, 'height="110"');
  } catch { qrSvg = ''; }

  const carrierFallbackShort = carrierShortName(fallbackCarrier);

  // ===== Section 4: trip cards =====
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

    return `
      <section class="trip-card" style="background:#ffffff;border:1px solid #e9ecf2;border-radius:12px;padding:20px;margin:0 28px 14px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
          <tr>
            <td valign="top" style="vertical-align:top;">
              <div style="font-size:16px;font-weight:700;color:#0e1726;">${escapeHtml(title)}</div>
              <div style="font-size:12px;color:#6c757d;margin-top:2px;">${escapeHtml(carrierShort)} &middot; Voo ${escapeHtml(flightNo)}</div>
            </td>
            <td valign="top" align="right" class="trip-head-right" style="vertical-align:top;text-align:right;">
              <span style="display:inline-block;background:#e8f5ee;color:#1f9d55;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:600;margin-bottom:6px;white-space:nowrap;"><span style="color:#1f9d55;">&#9679;</span> Confirmado</span>
              <div style="font-size:11px;color:#8a93a4;">Localizador ${escapeHtml(tripLocator)}</div>
            </td>
          </tr>
        </table>
        <div style="border-top:1px solid #eef0f4;margin:16px 0;"></div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-3col">
          <tr>
            <td valign="top" width="35%" style="vertical-align:top;width:35%;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:600;">PARTIDA</div>
              <div style="font-size:26px;font-weight:700;color:#0e1726;margin-top:4px;line-height:1;">${escapeHtml(depTime || '--:--')}</div>
              <div style="font-size:12.5px;color:#6c757d;margin-top:8px;">${escapeHtml(depIata)} &middot; ${escapeHtml(airportCity(depIata))}</div>
              <div style="font-size:11.5px;color:#8a93a4;margin-top:2px;">${escapeHtml(depDate)}</div>
            </td>
            <td valign="middle" width="30%" align="center" class="trip-plane" style="vertical-align:middle;text-align:center;width:30%;padding:0 8px;">
              <div style="position:relative;height:36px;">
                <div style="position:absolute;top:50%;left:0;right:0;border-top:1px dashed #c5cbd5;"></div>
                <div style="position:relative;display:inline-block;background:#ffffff;padding:0 12px;line-height:36px;">
                  <span style="font-size:18px;color:#00569e;">&#9992;</span>
                </div>
              </div>
            </td>
            <td valign="top" width="35%" align="right" style="vertical-align:top;text-align:right;width:35%;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:600;">CHEGADA</div>
              <div style="font-size:26px;font-weight:700;color:#0e1726;margin-top:4px;line-height:1;">${escapeHtml(arrTime || '--:--')}</div>
              <div style="font-size:12.5px;color:#6c757d;margin-top:8px;">${escapeHtml(arrIata)} &middot; ${escapeHtml(airportCity(arrIata))}</div>
              <div style="font-size:11.5px;color:#8a93a4;margin-top:2px;">${escapeHtml(arrDate)}</div>
            </td>
          </tr>
        </table>
      </section>`;
  }).join('');

  const stepCarrier = trips[0] ? carrierShortName(tripCarrier(trips[0], fallbackCarrier)) : carrierFallbackShort;

  const phoneRow = contactPhone ? `
            <div style="font-size:13px;color:#6c757d;margin-top:8px;"><strong style="color:#0e1726;">WhatsApp:</strong> <a href="${escapeHtml(phoneTel)}" style="color:#00569e;text-decoration:none;">${escapeHtml(contactPhone)}</a></div>` : '';
  const emailRow = contactEmail ? `
            <div style="font-size:13px;color:#6c757d;margin-top:4px;"><strong style="color:#0e1726;">Email:</strong> <a href="mailto:${escapeHtml(contactEmail)}" style="color:#00569e;text-decoration:none;">${escapeHtml(contactEmail)}</a></div>` : '';

  const igHref = contactSiteHref;
  const fbHref = contactSiteHref;
  const socialBtn = (href, svg) =>
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#00569e;text-decoration:none;margin:0 6px;vertical-align:middle;">${svg}</a>`;

  const socialsHtml =
    socialBtn(igHref, SOCIAL_ICONS.instagram) +
    socialBtn(fbHref, SOCIAL_ICONS.facebook) +
    (whatsappHref ? socialBtn(whatsappHref, SOCIAL_ICONS.whatsapp) : '');

  // Step rows
  const stepRow = (n, title, desc, isLast) => `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="step-row" style="${isLast ? '' : 'border-bottom:1px solid #eef0f4;'}margin-bottom:${isLast ? '0' : '0'};">
          <tr>
            <td valign="top" width="46" style="vertical-align:top;width:46px;padding-bottom:${isLast ? '0' : '18px'};">
              <span style="display:inline-flex;width:32px;height:32px;border-radius:50%;background:#00569e;color:#ffffff;font-weight:700;font-size:14px;align-items:center;justify-content:center;line-height:32px;text-align:center;">${n}</span>
            </td>
            <td valign="top" style="vertical-align:top;padding-bottom:${isLast ? '0' : '18px'};padding-top:4px;">
              <div style="font-size:14px;font-weight:700;color:#0e1726;margin-bottom:4px;">${escapeHtml(title)}</div>
              <div style="font-size:12.5px;color:#6c757d;line-height:1.55;">${desc}</div>
            </td>
          </tr>
        </table>`;

  const stepsHtml =
    stepRow(1, 'Chegue cedo ao aeroporto', `Recomendamos chegar com pelo menos 2 horas de antecedência. Verifique os requisitos de bagagem da ${escapeHtml(stepCarrier)}.`, false) +
    `<div style="border-top:1px solid #eef0f4;"></div>` +
    stepRow(2, 'Documentos em mãos', 'Tenha um documento oficial com foto e o localizador da reserva acessíveis. Estes dados serão solicitados no check-in.', false) +
    `<div style="border-top:1px solid #eef0f4;"></div>` +
    stepRow(3, 'Check-in assistido', 'Nossa equipe pode realizar o check-in para você e enviar o cartão de embarque diretamente. Basta nos avisar.', true);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Itinerário ${escapeHtml(locator)} — Clube do Voo Viagens</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
  html, body { margin:0; padding:0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f4f5f7;
    color: #0e1726;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: #00569e; }
  .page-container { max-width: 640px; margin: 0 auto; padding: 24px; }
  .shell {
    background: #ffffff;
    border: 1px solid #e9ecf2;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.06);
    overflow: hidden;
  }

  @media (max-width: 560px) {
    .page-container { padding: 12px; }
    .shell { border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.05); }
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
    .section-pad { padding-left: 16px !important; padding-right: 16px !important; }
    .trip-card { margin-left: 16px !important; margin-right: 16px !important; }
    .cta-card { margin-left: 16px !important; margin-right: 16px !important; }
    .inner-card { margin-left: 16px !important; margin-right: 16px !important; }
  }
</style>
</head>
<body>
  <div class="page-container">
    <div class="shell">

      <!-- Section 1: Header -->
      <div class="section-pad" style="padding:28px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
          <tr>
            <td valign="middle" style="vertical-align:middle;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle" style="vertical-align:middle;">
                    <img src="/voucher-assets/agency-logo.png" width="40" height="40" alt="" style="display:block;border:0;width:40px;height:40px;border-radius:8px;" onerror="this.style.display='none'">
                  </td>
                  <td valign="middle" style="vertical-align:middle;padding-left:12px;">
                    <div style="font-size:16px;font-weight:700;color:#0e1726;line-height:1.2;">Clube do Voo Viagens</div>
                    <div style="font-size:12px;color:#6c757d;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Confirmação de reserva</div>
                  </td>
                </tr>
              </table>
            </td>
            <td valign="middle" align="right" class="header-right" style="vertical-align:middle;text-align:right;">
              <div style="display:inline-block;background:#f4f5f7;border:1px solid #e9ecf2;border-radius:10px;padding:8px 14px;text-align:left;">
                <div style="font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:600;">LOCALIZADOR</div>
                <div style="font-size:18px;font-weight:700;color:#00569e;letter-spacing:1.5px;margin-top:2px;">${escapeHtml(locator)}</div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Section 2: Greeting -->
      <div class="section-pad" style="padding:0 28px 28px;">
        <span style="display:inline-block;background:#e8f5ee;color:#1f9d55;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:600;margin-bottom:16px;"><span style="color:#1f9d55;">&#9679;</span> Reserva confirmada</span>
        <h1 style="font-size:26px;font-weight:600;color:#0e1726;margin:0 0 10px;line-height:1.2;">Olá, ${escapeHtml(firstPaxName)}.</h1>
        <p style="font-size:13.5px;color:#6c757d;line-height:1.65;max-width:480px;margin:0;">Sua viagem está pronta. Use este email como referência — todos os dados do seu voo, contatos e próximos passos estão abaixo.</p>
      </div>

      <!-- Section 3: Route inner card -->
      <section class="inner-card" style="background:#ffffff;border:1px solid #e9ecf2;border-radius:12px;padding:20px;margin:0 28px 28px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-3col">
          <tr>
            <td valign="middle" style="vertical-align:middle;text-align:left;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:600;">ORIGEM</div>
              <div style="font-size:24px;font-weight:700;color:#0e1726;line-height:1.1;margin-top:4px;">${escapeHtml(origin)}</div>
              <div style="font-size:13px;color:#6c757d;margin-top:2px;">${escapeHtml(originCity)}</div>
            </td>
            <td valign="middle" width="60" align="center" style="vertical-align:middle;text-align:center;width:60px;">
              <div style="font-size:22px;color:#00569e;line-height:1;">&#8644;</div>
            </td>
            <td valign="middle" align="right" style="vertical-align:middle;text-align:right;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:600;">DESTINO</div>
              <div style="font-size:24px;font-weight:700;color:#0e1726;line-height:1.1;margin-top:4px;">${escapeHtml(destination)}</div>
              <div style="font-size:13px;color:#6c757d;margin-top:2px;">${escapeHtml(destCity)}</div>
            </td>
          </tr>
        </table>
        <div style="border-top:1px solid #eef0f4;padding-top:14px;margin-top:14px;text-align:center;">
          <span style="font-size:12px;color:#6c757d;">${CALENDAR_SVG}${escapeHtml(periodText)}</span>
        </div>
      </section>

      <!-- Section 4: Trip cards -->
      ${tripsHtml}

      <!-- Section 5: CTA card -->
      <section class="cta-card" style="background:#00569e;border-radius:14px;padding:28px;margin:8px 28px 28px;text-align:center;">
        <div style="font-size:17px;font-weight:700;color:#ffffff;">Pronto para embarcar?</div>
        <div style="font-size:12.5px;color:#ffffff;opacity:0.85;margin:8px 0 20px;">Check-in disponível 48h antes da partida</div>
        <a href="${escapeHtml(safeBookingUrl)}" target="_blank" rel="noopener" style="display:inline-block;background:#ffffff;color:#00569e;padding:13px 32px;border-radius:999px;font-weight:700;font-size:13.5px;text-decoration:none;letter-spacing:0.5px;box-shadow:0 4px 14px rgba(0,0,0,0.12);">FAZER CHECK-IN &rarr;</a>
      </section>

      <!-- Section 6: Próximos passos -->
      <section class="inner-card" style="background:#ffffff;border:1px solid #e9ecf2;border-radius:12px;padding:24px;margin:0 28px 28px;">
        <div style="margin-bottom:18px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:600;">PRÓXIMOS PASSOS</div>
          <div style="font-size:18px;font-weight:700;color:#0e1726;margin-top:4px;">Preparando-se para o voo</div>
        </div>
        ${stepsHtml}
      </section>

      <!-- Section 7: Assistência -->
      <section class="inner-card" style="background:#ffffff;border:1px solid #e9ecf2;border-radius:12px;padding:24px;margin:0 28px 28px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
          <tr>
            <td valign="top" style="vertical-align:top;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8a93a4;font-weight:600;">ASSISTÊNCIA</div>
              <div style="font-size:17px;font-weight:700;color:#0e1726;margin:4px 0 10px;">Estamos aqui para ajudar</div>
              <div style="font-size:12.5px;color:#6c757d;line-height:1.55;margin-bottom:14px;">Dúvidas, alterações ou pedidos especiais — escaneie o QR ou fale conosco.</div>
              ${phoneRow}
              ${emailRow}
            </td>
            <td valign="top" align="right" width="120" class="support-right" style="vertical-align:top;text-align:right;width:120px;padding-left:16px;">
              <div style="display:inline-block;background:#ffffff;padding:6px;border-radius:8px;border:1px solid #e9ecf2;line-height:0;">${qrSvg || '<div style="width:110px;height:110px;"></div>'}</div>
            </td>
          </tr>
        </table>
      </section>

    </div>

    <!-- Section 8: Footer (outside shell) -->
    <div style="text-align:center;padding:32px 24px;">
      <div style="font-size:13px;color:#6c757d;">Boa viagem,</div>
      <div style="font-size:14px;font-weight:700;color:#0e1726;margin-top:2px;margin-bottom:16px;">Clube do Voo Viagens</div>
      <div style="margin-bottom:14px;">${socialsHtml}</div>
      <div style="margin-top:14px;"><a href="${escapeHtml(contactSiteHref)}" target="_blank" rel="noopener" style="font-size:12px;color:#00569e;text-decoration:none;">${escapeHtml(contactSite)}</a></div>
      <div style="font-size:11px;font-style:italic;color:#8a93a4;margin-top:4px;">Email automático — não responda diretamente. Use os canais acima.</div>
    </div>

  </div>
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
