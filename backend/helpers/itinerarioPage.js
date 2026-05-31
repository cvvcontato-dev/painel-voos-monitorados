// Renderer server-side da página pública de itinerário — fiel ao modelo "Itinerário Executivo".
// HTML completo, design moderno (CSS livre — não é e-mail).
// Estilos inline para resiliência; <style> no <head> apenas para media queries (responsivo).
const QRCode = require('qrcode');
const {
  airportCity,
  tripCarrier,
  normalizeFlightNumber,
  carrierDisplayName,
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

// SVG paths extraídos do modelo HTML
const SOCIAL_ICONS = {
  instagram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.22.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.05.41 2.22.06 1.25.07 1.62.07 4.82 0 3.2 0 3.6-.07 4.85-.05 1.17-.25 1.8-.41 2.22-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.05.36-2.22.41-1.25.06-1.62.07-4.85.07-3.2 0-3.6 0-4.85-.07-1.17-.05-1.8-.25-2.22-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.05-.41-2.22C2.21 15.6 2.2 15.2 2.2 12s0-3.6.07-4.85c.05-1.17.25-1.8.41-2.22.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.05-.36 2.22-.41C8.4 2.21 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.52 0-4.76.07-1.07.05-1.65.23-2.04.38-.51.2-.88.44-1.27.83-.39.39-.63.76-.83 1.27-.15.39-.33.97-.38 2.04C2.65 9.83 2.64 10.2 2.64 12s0 2.17.08 3.41c.05 1.07.23 1.65.38 2.04.2.51.44.88.83 1.27.39.39.76.63 1.27.83.39.15.97.33 2.04.38 1.24.08 1.61.08 4.76.08 3.15 0 3.52 0 4.76-.08 1.07-.05 1.65-.23 2.04-.38.51-.2.88-.44 1.27-.83.39-.39.63-.76.83-1.27.15-.39.33-.97.38-2.04.08-1.24.08-1.61.08-3.41 0-1.8 0-2.17-.08-3.41-.05-1.07-.23-1.65-.38-2.04-.2-.51-.44-.88-.83-1.27a3.45 3.45 0 0 0-1.27-.83c-.39-.15-.97-.33-2.04-.38C15.52 4 15.15 4 12 4zm0 3.06a4.94 4.94 0 1 1 0 9.88 4.94 4.94 0 0 1 0-9.88zm0 1.8a3.14 3.14 0 1 0 0 6.28 3.14 3.14 0 0 0 0-6.28zm5.15-2.06a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z"/></svg>',
  facebook: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.9h-2.33v6.98A10 10 0 0 0 22 12z"/></svg>',
  whatsapp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.34.22-.64.07-.3-.15-1.27-.47-2.42-1.49-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51-.17 0-.37-.02-.57-.02-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.08 4.5.71.3 1.26.49 1.7.62.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.49 15.31L2 22l4.81-1.5A10 10 0 1 0 12 2zm0 18.18a8.18 8.18 0 0 1-4.16-1.13l-.3-.18-2.86.89.91-2.78-.2-.32A8.18 8.18 0 1 1 12 20.18z"/></svg>'
};

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
  const periodText = isOneWay ? (periodLeft || '—') : `${periodLeft} → ${periodRight}`;

  const safeBookingUrl = bookingUrl && /^https?:\/\//i.test(bookingUrl) ? bookingUrl : '#';

  const contactPhone = s.contact_phone || '';
  const contactEmail = s.contact_email || '';
  const contactSite = s.contact_site || 'www.clubedovooviagens.com.br';
  const contactSiteHref = /^https?:\/\//i.test(contactSite) ? contactSite : `https://${contactSite}`;

  const phoneDigits = (contactPhone || '').replace(/\D/g, '');
  const phoneTel = phoneDigits ? `tel:+${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}` : '';
  const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}` : '';

  // Gera QR code SVG do bookingUrl
  let qrSvg = '';
  try {
    qrSvg = await QRCode.toString(safeBookingUrl === '#' ? contactSiteHref : safeBookingUrl, {
      type: 'svg',
      width: 100,
      margin: 1,
      color: { dark: '#0e1726', light: '#ffffff' }
    });
    // Remove XML decl e force tamanho fixo
    qrSvg = qrSvg.replace(/<\?xml[^?]*\?>/, '').replace(/width="\d+"/, 'width="100"').replace(/height="\d+"/, 'height="100"');
  } catch { qrSvg = ''; }

  const carrierFallbackShort = carrierShortName(fallbackCarrier);

  // ===== Section 4: trip cards =====
  const tripsHtml = trips.map((t, idx) => {
    const ck = tripCarrier(t, fallbackCarrier);
    const carrierShort = carrierShortName(ck);
    const flightNo = normalizeFlightNumber(t.flightNumber || '');
    const tripLocator = t.locator || locator;
    const depTime = fmtTime(t.departure?.datetime);
    const depDate = fmtDateBR(t.departure?.datetime);
    const arrTime = fmtTime(t.arrival?.datetime);
    const arrDate = fmtDateBR(t.arrival?.datetime);
    const depIata = (t.departure?.airport || '').toUpperCase();
    const arrIata = (t.arrival?.airport || '').toUpperCase();
    const title = directionLabel(t.direction, idx);

    return `
    <section class="trip-card" style="background:#ffffff;border:1px solid #e9ecf2;border-radius:12px;padding:20px;margin-bottom:12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="trip-head">
        <tr>
          <td valign="top" style="vertical-align:top;">
            <div style="font-size:16px;font-weight:700;color:#0e1726;">${escapeHtml(title)}</div>
            <div style="font-size:13px;color:#5b6878;margin-top:2px;">${escapeHtml(carrierShort)} &middot; Voo ${escapeHtml(flightNo)}</div>
          </td>
          <td valign="top" align="right" style="vertical-align:top;text-align:right;">
            <span style="display:inline-block;background:#e8f5ee;color:#1f9d55;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;"><span style="color:#1f9d55;">&#9679;</span> Confirmado</span>
            <div style="font-size:11px;color:#5b6878;margin-top:4px;">Localizador ${escapeHtml(tripLocator)}</div>
          </td>
        </tr>
      </table>
      <div style="border-top:1px solid #e9ecf2;margin:16px 0;"></div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="trip-detail">
        <tr>
          <td valign="top" width="35%" style="vertical-align:top;width:35%;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#5b6878;font-weight:700;">PARTIDA</div>
            <div style="font-size:26px;font-weight:700;color:#0e1726;margin-top:4px;line-height:1;">${escapeHtml(depTime || '--:--')}</div>
            <div style="font-size:13px;color:#5b6878;margin-top:6px;"><strong style="color:#0e1726;">${escapeHtml(depIata)}</strong> &middot; ${escapeHtml(airportCity(depIata))}</div>
            <div style="font-size:12px;color:#5b6878;margin-top:2px;">${escapeHtml(depDate)}</div>
          </td>
          <td valign="middle" width="30%" align="center" class="trip-plane" style="vertical-align:middle;text-align:center;width:30%;padding:0 8px;">
            <div style="position:relative;height:24px;">
              <div style="position:absolute;left:0;right:0;top:50%;height:1px;background:#e9ecf2;"></div>
              <div style="position:relative;display:inline-block;background:#ffffff;padding:0 8px;font-size:20px;color:#00569e;line-height:24px;">&#9992;</div>
            </div>
          </td>
          <td valign="top" width="35%" align="right" style="vertical-align:top;text-align:right;width:35%;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#5b6878;font-weight:700;">CHEGADA</div>
            <div style="font-size:26px;font-weight:700;color:#0e1726;margin-top:4px;line-height:1;">${escapeHtml(arrTime || '--:--')}</div>
            <div style="font-size:13px;color:#5b6878;margin-top:6px;"><strong style="color:#0e1726;">${escapeHtml(arrIata)}</strong> &middot; ${escapeHtml(airportCity(arrIata))}</div>
            <div style="font-size:12px;color:#5b6878;margin-top:2px;">${escapeHtml(arrDate)}</div>
          </td>
        </tr>
      </table>
    </section>`;
  }).join('');

  // ===== Próximos passos: pega a companhia do primeiro voo
  const stepCarrier = trips[0] ? carrierShortName(tripCarrier(trips[0], fallbackCarrier)) : carrierFallbackShort;

  // ===== Contato (telefone + email) — só renderiza se setting existe =====
  const phoneRow = contactPhone ? `
        <div style="font-size:12px;color:#5b6878;margin-top:8px;"><strong style="color:#0e1726;">WhatsApp:</strong> <a href="${escapeHtml(phoneTel)}" style="color:#00569e;text-decoration:none;">${escapeHtml(contactPhone)}</a></div>` : '';
  const emailRow = contactEmail ? `
        <div style="font-size:12px;color:#5b6878;margin-top:4px;"><strong style="color:#0e1726;">Email:</strong> <a href="mailto:${escapeHtml(contactEmail)}" style="color:#00569e;text-decoration:none;">${escapeHtml(contactEmail)}</a></div>` : '';

  // ===== Social icons =====
  const igHref = contactSiteHref;
  const fbHref = contactSiteHref;
  const socialBtn = (href, svg) =>
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#00569e;text-decoration:none;margin:0 6px;vertical-align:middle;">${svg}</a>`;

  const socialsHtml =
    socialBtn(igHref, SOCIAL_ICONS.instagram) +
    socialBtn(fbHref, SOCIAL_ICONS.facebook) +
    (whatsappHref ? socialBtn(whatsappHref, SOCIAL_ICONS.whatsapp) : '');

  // ===== HTML final =====
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Itinerário ${escapeHtml(locator)} — Clube do Voo Viagens</title>
<style>
  html,body { margin:0; padding:0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #e9ecf2;
    color: #0e1726;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: #00569e; }
  a:hover { text-decoration: underline; }

  /* Responsivo: empilha colunas em telas estreitas */
  @media (max-width: 560px) {
    .paper { padding: 20px !important; }
    .row-2col > td, .row-3col > td { display: block !important; width: 100% !important; text-align: left !important; padding: 6px 0 !important; }
    .row-3col > td.trip-plane { padding: 4px 0 !important; }
    .greeting-right { text-align: left !important; margin-top: 14px !important; }
    .route-right { text-align: left !important; }
    .trip-head td:last-child, .trip-detail td:last-child { text-align: left !important; }
    .support-right { text-align: left !important; margin-top: 14px !important; }
  }
</style>
</head>
<body>
  <div style="padding:24px 12px;">
    <div class="paper" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;box-shadow:0 1px 3px rgba(14,23,38,0.04),0 8px 24px rgba(14,23,38,0.06);padding:32px;">

      <!-- ============ 1. HEADER ============ -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
        <tr>
          <td valign="middle" width="60" style="vertical-align:middle;width:60px;">
            <img src="/voucher-assets/agency-logo.png" width="44" height="44" alt="" style="display:block;border:0;width:44px;height:44px;border-radius:8px;" onerror="this.style.display='none'">
          </td>
          <td valign="middle" style="vertical-align:middle;padding-left:14px;">
            <div style="font-size:18px;font-weight:700;color:#0e1726;line-height:1.2;">Clube do Voo Viagens</div>
            <div style="font-size:12px;color:#5b6878;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Confirmação de Reserva</div>
          </td>
        </tr>
      </table>

      <div style="height:28px;"></div>

      <!-- ============ 2. GREETING + LOCATOR ============ -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
        <tr>
          <td valign="top" style="vertical-align:top;">
            <span style="display:inline-block;background:#e8f5ee;color:#1f9d55;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;margin-bottom:12px;"><span style="color:#1f9d55;">&#9679;</span> Reserva confirmada</span>
            <h1 style="font-size:28px;font-weight:400;color:#0e1726;margin:0 0 8px;line-height:1.2;">Olá, ${escapeHtml(firstPaxName)}.</h1>
            <p style="font-size:14px;color:#5b6878;line-height:1.6;margin:0;">Sua viagem está pronta. Use este email como referência — todos os dados do seu voo, contatos e próximos passos estão abaixo.</p>
          </td>
          <td valign="top" align="right" class="greeting-right" style="vertical-align:top;text-align:right;padding-left:16px;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#5b6878;font-weight:700;">LOCALIZADOR</div>
            <div style="font-size:28px;font-weight:700;color:#00569e;letter-spacing:2px;margin-top:6px;">${escapeHtml(locator)}</div>
          </td>
        </tr>
      </table>

      <div style="height:28px;"></div>

      <!-- ============ 3. ROUTE CARD ============ -->
      <section style="background:#ffffff;border:1px solid #e9ecf2;border-radius:12px;padding:20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-3col">
          <td valign="middle" width="33%" style="vertical-align:middle;width:33%;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#5b6878;font-weight:700;">Origem</div>
            <div style="font-size:22px;font-weight:700;color:#0e1726;margin-top:4px;">${escapeHtml(origin)}</div>
            <div style="font-size:13px;color:#5b6878;margin-top:2px;">${escapeHtml(originCity)}</div>
          </td>
          <td valign="middle" width="34%" align="center" style="vertical-align:middle;text-align:center;width:34%;">
            <div style="font-size:24px;color:#00569e;line-height:1;margin-bottom:8px;">&#8646;</div>
            <div style="font-size:12px;color:#5b6878;">${escapeHtml(periodText)}</div>
          </td>
          <td valign="middle" width="33%" align="right" class="route-right" style="vertical-align:middle;text-align:right;width:33%;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#5b6878;font-weight:700;">Destino</div>
            <div style="font-size:22px;font-weight:700;color:#0e1726;margin-top:4px;">${escapeHtml(destination)}</div>
            <div style="font-size:13px;color:#5b6878;margin-top:2px;">${escapeHtml(destCity)}</div>
          </td>
        </table>
      </section>

      <div style="height:20px;"></div>

      <!-- ============ 4. TRIPS ============ -->
      ${tripsHtml}

      <div style="height:8px;"></div>

      <!-- ============ 5. CTA ============ -->
      <section style="background:#00569e;color:#ffffff;border-radius:14px;padding:28px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#ffffff;">Pronto para embarcar?</div>
        <div style="font-size:13px;color:#ffffff;opacity:0.85;margin:8px 0 18px;">Check-in disponível 48h antes da partida</div>
        <a href="${escapeHtml(safeBookingUrl)}" target="_blank" rel="noopener" style="display:inline-block;background:#ffffff;color:#00569e;padding:14px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.5px;">FAZER CHECK-IN &rarr;</a>
      </section>

      <div style="height:28px;"></div>

      <!-- ============ 6. PRÓXIMOS PASSOS ============ -->
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#5b6878;font-weight:700;margin-bottom:4px;">Próximos passos</div>
      <h2 style="font-size:18px;font-weight:700;color:#0e1726;margin:0 0 16px;">Preparando-se para o voo</h2>

      <div style="background:#ffffff;border:1px solid #e9ecf2;border-radius:10px;padding:16px;margin-bottom:8px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td valign="top" width="40" style="vertical-align:top;width:40px;font-size:28px;font-weight:700;color:#00569e;line-height:1;">1</td>
            <td valign="top" style="vertical-align:top;">
              <div style="font-size:14px;font-weight:700;color:#0e1726;">Chegue cedo ao aeroporto</div>
              <div style="font-size:12px;color:#5b6878;line-height:1.5;margin-top:4px;">Recomendamos chegar com pelo menos 2 horas de antecedência. Verifique os requisitos de bagagem da ${escapeHtml(stepCarrier)}.</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="background:#ffffff;border:1px solid #e9ecf2;border-radius:10px;padding:16px;margin-bottom:8px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td valign="top" width="40" style="vertical-align:top;width:40px;font-size:28px;font-weight:700;color:#00569e;line-height:1;">2</td>
            <td valign="top" style="vertical-align:top;">
              <div style="font-size:14px;font-weight:700;color:#0e1726;">Documentos em mãos</div>
              <div style="font-size:12px;color:#5b6878;line-height:1.5;margin-top:4px;">Tenha um documento oficial com foto e o localizador da reserva acessíveis. Estes dados serão solicitados no check-in.</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="background:#ffffff;border:1px solid #e9ecf2;border-radius:10px;padding:16px;margin-bottom:8px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td valign="top" width="40" style="vertical-align:top;width:40px;font-size:28px;font-weight:700;color:#00569e;line-height:1;">3</td>
            <td valign="top" style="vertical-align:top;">
              <div style="font-size:14px;font-weight:700;color:#0e1726;">Check-in assistido</div>
              <div style="font-size:12px;color:#5b6878;line-height:1.5;margin-top:4px;">Nossa equipe pode realizar o check-in para você e enviar o cartão de embarque diretamente. Basta nos avisar.</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="height:24px;"></div>

      <!-- ============ 7. ASSISTÊNCIA + QR ============ -->
      <section style="background:#f6f8fb;border-radius:12px;padding:20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="row-2col">
          <tr>
            <td valign="middle" style="vertical-align:middle;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#5b6878;font-weight:700;">ASSISTÊNCIA</div>
              <div style="font-size:16px;font-weight:700;color:#0e1726;margin:4px 0 8px;">Estamos aqui para ajudar</div>
              <div style="font-size:12px;color:#5b6878;line-height:1.5;">Dúvidas, alterações ou pedidos especiais — escaneie o QR ou fale conosco.</div>
              ${phoneRow}
              ${emailRow}
            </td>
            <td valign="middle" align="right" width="120" class="support-right" style="vertical-align:middle;text-align:right;width:120px;padding-left:16px;">
              <div style="display:inline-block;background:#ffffff;padding:6px;border-radius:8px;border:1px solid #e9ecf2;line-height:0;">${qrSvg || '<div style="width:100px;height:100px;"></div>'}</div>
            </td>
          </tr>
        </table>
      </section>

      <div style="height:24px;"></div>

      <!-- ============ 8. FOOTER SIGNATURE ============ -->
      <div style="text-align:left;padding-top:16px;">
        <div style="font-size:14px;color:#0e1726;">Boa viagem,</div>
        <div style="font-size:14px;font-weight:700;color:#0e1726;margin-top:2px;"><a href="${escapeHtml(contactSiteHref)}" target="_blank" rel="noopener" style="color:#0e1726;text-decoration:none;font-weight:700;">Clube do Voo Viagens</a></div>
      </div>

      <div style="height:24px;"></div>

      <!-- ============ 9. SOCIAL + LEGAL ============ -->
      <div style="text-align:center;">
        <div style="margin-bottom:14px;">${socialsHtml}</div>
        <div style="margin-bottom:6px;"><a href="${escapeHtml(contactSiteHref)}" target="_blank" rel="noopener" style="font-size:12px;color:#00569e;text-decoration:none;">${escapeHtml(contactSite)}</a></div>
        <div style="font-size:11px;font-style:italic;color:#5b6878;">Email automático — não responda diretamente. Use os canais acima.</div>
      </div>

    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  renderItinerarioPage,
  // exportados para teste
  escapeHtml,
  firstName,
  fmtTime,
  fmtDateBR
};
