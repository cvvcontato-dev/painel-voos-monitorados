// Renderer server-side da página pública de itinerário (Caminho A — padrão Airbnb/Booking).
// HTML completo, design "Itinerário Executivo" — CSS moderno (não restrito a regras de e-mail).
const {
  airportCity,
  tripCarrier,
  normalizeFlightNumber,
  carrierDisplayName
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

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  } catch { return ''; }
}

function fmtDateBR(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });
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
  return `Trecho ${idx + 1}`;
}

function renderItinerarioPage({ voucherData, settings, bookingUrl }) {
  const vd = voucherData || {};
  const s = settings || {};
  const trips = Array.isArray(vd.trips) ? vd.trips : [];
  const passengers = Array.isArray(vd.passengers) ? vd.passengers : [];

  const firstPaxName = firstName(passengers[0]?.name) || 'viajante';
  const locator = (vd.reservation?.locator || 'N/A').toString();
  const fallbackCarrier = (vd.carrier || 'azul').toLowerCase();
  const origin = (vd.route?.origin || trips[0]?.departure?.airport || '').toUpperCase();
  const destination = (vd.route?.destination || trips[trips.length - 1]?.arrival?.airport || '').toUpperCase();

  const firstDep = trips[0]?.departure?.datetime;
  const lastArr = trips[trips.length - 1]?.arrival?.datetime;
  const periodLeft = fmtDate(firstDep);
  const periodRight = fmtDate(lastArr);
  const isOneWay = !periodRight || periodLeft === periodRight;
  const periodText = isOneWay ? (periodLeft || '—') : `${periodLeft} → ${periodRight}`;

  const safeBookingUrl = bookingUrl && /^https?:\/\//i.test(bookingUrl) ? bookingUrl : '#';

  const contactPhone = s.contact_phone || '';
  const contactEmail = s.contact_email || '';
  const contactSite = s.contact_site || 'www.clubedovooviagens.com.br';
  const contactSiteHref = /^https?:\/\//i.test(contactSite) ? contactSite : `https://${contactSite}`;

  const phoneDigits = (contactPhone || '').replace(/\D/g, '');
  const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}` : '';

  const tripsHtml = trips.map((t, idx) => {
    const ck = tripCarrier(t, fallbackCarrier);
    const carrierLabel = t.airlineDisplayName || carrierDisplayName(ck);
    const flightNo = normalizeFlightNumber(t.flightNumber || '');
    const tripLocator = t.locator || locator;
    const depTime = fmtTime(t.departure?.datetime);
    const depDate = fmtDate(t.departure?.datetime);
    const arrTime = fmtTime(t.arrival?.datetime);
    const arrDate = fmtDate(t.arrival?.datetime);
    const depIata = (t.departure?.airport || '').toUpperCase();
    const arrIata = (t.arrival?.airport || '').toUpperCase();
    const title = directionLabel(t.direction, idx);

    return `
    <section class="card trip-card">
      <header class="trip-head">
        <div>
          <div class="trip-title">${escapeHtml(title)}</div>
          <div class="trip-sub">${escapeHtml(carrierLabel)} · Voo ${escapeHtml(flightNo)}</div>
          <div class="trip-locator">Localizador ${escapeHtml(tripLocator)}</div>
        </div>
        <span class="pill pill-green">● Confirmado</span>
      </header>
      <div class="trip-grid">
        <div class="trip-side trip-side-left">
          <div class="label">Partida</div>
          <div class="time">${escapeHtml(depTime || '--:--')}</div>
          <div class="iata"><strong>${escapeHtml(depIata)}</strong> · ${escapeHtml(airportCity(depIata))}</div>
          <div class="datestr">${escapeHtml(depDate)}</div>
        </div>
        <div class="trip-center" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z" fill="#3871c1"/>
          </svg>
        </div>
        <div class="trip-side trip-side-right">
          <div class="label">Chegada</div>
          <div class="time">${escapeHtml(arrTime || '--:--')}</div>
          <div class="iata"><strong>${escapeHtml(arrIata)}</strong> · ${escapeHtml(airportCity(arrIata))}</div>
          <div class="datestr">${escapeHtml(arrDate)}</div>
        </div>
      </div>
    </section>`;
  }).join('');

  const firstCarrierName = trips[0]
    ? (trips[0].airlineDisplayName || carrierDisplayName(tripCarrier(trips[0], fallbackCarrier)))
    : carrierDisplayName(fallbackCarrier);

  const phoneLineHtml = contactPhone ? `
        <div class="contact-row">
          <span class="contact-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1f9d55" xmlns="http://www.w3.org/2000/svg"><path d="M20.5 3.5A11.5 11.5 0 0 0 2.7 18l-1.2 4.5 4.6-1.2A11.5 11.5 0 1 0 20.5 3.5zm-8.5 18a9.5 9.5 0 0 1-4.8-1.3l-.3-.2-2.7.7.7-2.6-.2-.3A9.5 9.5 0 1 1 12 21.5zm5.2-7.1c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.5-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.5-.3z"/></svg>
          </span>
          <div>
            <div class="contact-label">WhatsApp</div>
            ${whatsappHref ? `<a href="${escapeHtml(whatsappHref)}" target="_blank" rel="noopener">${escapeHtml(contactPhone)}</a>` : `<span>${escapeHtml(contactPhone)}</span>`}
          </div>
        </div>` : '';

  const emailLineHtml = contactEmail ? `
        <div class="contact-row">
          <span class="contact-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#00569e" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
          </span>
          <div>
            <div class="contact-label">Email</div>
            <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>
          </div>
        </div>` : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Itinerário ${escapeHtml(locator)} — Clube do Voo Viagens</title>
<style>
  *,*::before,*::after { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #e9ecf2;
    color: #0e1726;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: #00569e; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 16px; }
  .card {
    background: #ffffff;
    border: 1px solid #e9ecf2;
    border-radius: 14px;
    margin-top: 14px;
    overflow: hidden;
  }
  .card-pad { padding: 24px; }
  .header {
    background: #00569e;
    color: #ffffff;
    border-radius: 14px 14px 0 0;
    padding: 20px 24px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px;
    margin-top: 14px;
  }
  .header .brand { font-size: 18px; font-weight: 700; line-height: 1.2; }
  .header .sub   { font-size: 12px; opacity: 0.85; margin-top: 4px; }
  .header .pill  {
    display: inline-block;
    background: rgba(255,255,255,0.18);
    color: #ffffff;
    font-size: 11px; font-weight: 600;
    padding: 6px 12px; border-radius: 999px;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }
  .greeting { margin-top: 0; border-radius: 0 0 14px 14px; }
  .greeting .hello { font-size: 16px; margin: 0 0 10px; }
  .greeting p { margin: 0; color: #5b6878; font-size: 14px; }

  .summary { padding: 18px 20px; }
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    align-items: center;
  }
  .summary-cell { padding: 6px 8px; }
  .summary-cell.middle {
    border-left: 1px solid #e9ecf2;
    border-right: 1px solid #e9ecf2;
    text-align: center;
  }
  .summary-cell .label {
    font-size: 10px; color: #808080;
    text-transform: uppercase; letter-spacing: 1px; font-weight: 700;
  }
  .summary-cell .loc {
    font-size: 22px; color: #00569e; font-weight: 700; letter-spacing: 2px; margin-top: 6px;
  }
  .summary-cell .iata { font-size: 16px; font-weight: 700; color: #0e1726; margin-top: 2px; line-height: 1.1; }
  .summary-cell .city { font-size: 12px; color: #808080; }
  .summary-cell .swap { font-size: 18px; color: #3871c1; margin: 6px 0; }
  .summary-cell .period { font-size: 13px; color: #0e1726; font-weight: 600; margin-top: 6px; }

  .trip-card { padding: 18px 20px; }
  .trip-head {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 12px; margin-bottom: 14px;
  }
  .trip-title { font-size: 16px; font-weight: 700; color: #0e1726; }
  .trip-sub { font-size: 12px; color: #5b6878; margin-top: 4px; }
  .trip-locator { font-size: 11px; color: #808080; margin-top: 2px; }
  .pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px; white-space: nowrap; }
  .pill-green { background: #dcfce7; color: #1f9d55; }

  .trip-grid {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px; align-items: center;
  }
  .trip-side .label { font-size: 10px; color: #808080; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
  .trip-side .time { font-size: 30px; color: #0e1726; font-weight: 700; line-height: 1; margin-top: 6px; }
  .trip-side .iata { font-size: 13px; color: #0e1726; margin-top: 8px; }
  .trip-side .datestr { font-size: 12px; color: #5b6878; margin-top: 2px; }
  .trip-side-right { text-align: right; }
  .trip-center { display: flex; align-items: center; justify-content: center; padding: 0 4px; }

  .cta {
    background: #00569e;
    color: #ffffff;
    border-radius: 14px;
    padding: 26px 20px;
    text-align: center;
    margin-top: 14px;
  }
  .cta h2 { margin: 0 0 4px; font-size: 18px; font-weight: 700; }
  .cta p  { margin: 0 0 18px; font-size: 13px; opacity: 0.92; }
  .cta a.btn {
    display: inline-block;
    background: #ffffff; color: #00569e;
    text-decoration: none; font-weight: 700; font-size: 14px;
    padding: 14px 28px; border-radius: 10px; letter-spacing: 0.4px;
  }

  .steps-head { padding: 22px 24px 6px; }
  .steps-title { font-size: 16px; font-weight: 700; color: #0e1726; }
  .steps-sub   { font-size: 12px; color: #5b6878; margin-top: 2px; }
  .step {
    display: flex; gap: 14px; align-items: flex-start;
    background: #ffffff; border: 1px solid #e9ecf2; border-radius: 12px;
    padding: 14px 16px; margin-top: 10px;
  }
  .step .dot {
    width: 28px; height: 28px; border-radius: 50%;
    flex: 0 0 28px;
    display: flex; align-items: center; justify-content: center;
    color: #ffffff; font-size: 14px; font-weight: 700;
  }
  .step .dot.blue  { background: #3871c1; }
  .step .dot.deep  { background: #00569e; }
  .step .dot.green { background: #1f9d55; }
  .step h3 { margin: 0; font-size: 14px; color: #0e1726; }
  .step p  { margin: 4px 0 0; font-size: 12px; color: #5b6878; line-height: 1.55; }

  .support {
    background: #f6f8fb;
    border: 1px solid #e9ecf2;
    border-radius: 14px;
    padding: 20px 22px;
    margin-top: 14px;
  }
  .support h2 { margin: 0 0 4px; font-size: 15px; color: #0e1726; }
  .support .lead { margin: 0 0 14px; font-size: 13px; color: #5b6878; }
  .contact-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
  .contact-icon {
    width: 32px; height: 32px; border-radius: 50%;
    background: #ffffff; border: 1px solid #e9ecf2;
    display: inline-flex; align-items: center; justify-content: center; flex: 0 0 32px;
  }
  .contact-label { font-size: 11px; color: #808080; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }
  .contact-row a { font-size: 14px; color: #00569e; text-decoration: none; font-weight: 600; }
  .contact-row a:hover { text-decoration: underline; }

  .footer {
    text-align: center;
    padding: 22px 16px 36px;
    color: #5b6878; font-size: 13px;
  }
  .footer .brand { color: #0e1726; font-weight: 700; margin-top: 2px; }
  .footer a { color: #00569e; text-decoration: none; font-size: 12px; }

  @media (max-width: 560px) {
    .wrap { padding: 12px; }
    .header { flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px 18px; }
    .summary-grid { grid-template-columns: 1fr; }
    .summary-cell.middle { border-left: 0; border-right: 0; border-top: 1px solid #e9ecf2; border-bottom: 1px solid #e9ecf2; padding: 14px 0; }
    .trip-grid { grid-template-columns: 1fr; text-align: center; }
    .trip-side-right { text-align: center; }
    .trip-center { padding: 4px 0; }
    .trip-head { flex-direction: column; align-items: flex-start; }
    .summary-cell .loc { font-size: 20px; }
  }
</style>
</head>
<body>
  <main class="wrap">
    <header class="header" role="banner">
      <div>
        <div class="brand">Clube do Voo Viagens</div>
        <div class="sub">Confirmação de Reserva</div>
      </div>
      <span class="pill">● Reserva confirmada</span>
    </header>

    <section class="card greeting card-pad">
      <p class="hello">Olá, <strong>${escapeHtml(firstPaxName)}</strong>,</p>
      <p>Sua viagem está pronta. Use esta página como referência — todos os dados do seu voo, contatos e próximos passos estão abaixo.</p>
    </section>

    <section class="card summary">
      <div class="summary-grid">
        <div class="summary-cell">
          <div class="label">Localizador</div>
          <div class="loc">${escapeHtml(locator)}</div>
        </div>
        <div class="summary-cell middle">
          <div class="label">Origem</div>
          <div class="iata">${escapeHtml(origin)}</div>
          <div class="city">${escapeHtml(airportCity(origin))}</div>
          <div class="swap">⇄</div>
          <div class="label">Destino</div>
          <div class="iata">${escapeHtml(destination)}</div>
          <div class="city">${escapeHtml(airportCity(destination))}</div>
        </div>
        <div class="summary-cell" style="text-align:right;">
          <div class="label">Período</div>
          <div class="period">${escapeHtml(periodText)}</div>
        </div>
      </div>
    </section>

    ${tripsHtml}

    <section class="cta" aria-label="Check-in">
      <h2>Pronto para embarcar?</h2>
      <p>Check-in disponível 48h antes da partida</p>
      <a class="btn" href="${escapeHtml(safeBookingUrl)}" target="_blank" rel="noopener">FAZER CHECK-IN →</a>
    </section>

    <section class="card">
      <div class="steps-head">
        <div class="steps-title">Próximos passos</div>
        <div class="steps-sub">Preparando-se para o voo</div>
      </div>
      <div style="padding: 6px 24px 22px;">
        <div class="step">
          <div class="dot blue">●</div>
          <div>
            <h3>Chegue cedo ao aeroporto</h3>
            <p>Recomendamos chegar com pelo menos 2 horas de antecedência. Verifique os requisitos de bagagem da ${escapeHtml(firstCarrierName)}.</p>
          </div>
        </div>
        <div class="step">
          <div class="dot deep">●</div>
          <div>
            <h3>Documentos em mãos</h3>
            <p>Tenha um documento oficial com foto e o localizador da reserva acessíveis. Estes dados serão solicitados no check-in.</p>
          </div>
        </div>
        <div class="step">
          <div class="dot green">●</div>
          <div>
            <h3>Check-in assistido</h3>
            <p>Nossa equipe pode realizar o check-in para você e enviar o cartão de embarque diretamente. Basta nos avisar.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="support">
      <h2>Estamos aqui para ajudar</h2>
      <p class="lead">Dúvidas, alterações ou pedidos especiais — fale conosco.</p>
      ${phoneLineHtml}
      ${emailLineHtml}
    </section>

    <footer class="footer">
      <div>Boa viagem,</div>
      <div class="brand">Clube do Voo Viagens</div>
      <div style="margin-top:6px;"><a href="${escapeHtml(contactSiteHref)}" target="_blank" rel="noopener">${escapeHtml(contactSite)}</a></div>
    </footer>
  </main>
</body>
</html>`;
}

module.exports = {
  renderItinerarioPage,
  // exportados para teste
  escapeHtml,
  firstName,
  fmtTime,
  fmtDate,
  fmtDateBR
};
