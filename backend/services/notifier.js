const nodemailer = require('nodemailer');
const { airportCity, tripCarrier, normalizeFlightNumber, carrierDisplayName } = require('../helpers/voucherCarrier');

// Single SMTP transporter instance — reused across calls
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '465', 10),
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Rate limiting queue for Telegram (max 30 messages per 1000ms)
const telegramTimestamps = [];
const TELEGRAM_RATE_LIMIT = 30;
const TELEGRAM_RATE_WINDOW = 1000;

function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function buildTelegramMessage(flight, isTest = false) {
    const economiaPorPax = flight.preco_esperado - flight.preco_atual;
    const pax = flight.quantidade_pax || 1;
    const economiaTotal = economiaPorPax * pax;

    const header = isTest
        ? `🧪 <b>[TESTE] MENSAGEM DE EXEMPLO — NÃO É UM ALERTA REAL</b>\n<i>Esta é apenas uma simulação para validar o envio. Os valores abaixo são fictícios.</i>\n\n`
        : `✈️ <b>ALERTA DE VOO — PREÇO ABAIXO DO ALVO!</b>\n\n`;

    return (header + `👤 <b>Cliente:</b> ${flight.cliente}
📅 <b>Viagem:</b> ${flight.mes_viagem}
👥 <b>Passageiros:</b> ${pax}

💰 <b>Preço atual:</b> ${formatBRL(flight.preco_atual)}
🎯 <b>Preço alvo:</b> ${formatBRL(flight.preco_esperado)}

💸 <b>Economia por pax:</b> ${formatBRL(economiaPorPax)}
💸 <b>Economia total:</b> ${formatBRL(economiaTotal)}

🔗 <a href="${flight.link_voo}">Acessar Google Flights</a>`).trim();
}

function buildEmailHtml(flight, isTest = false) {
    const economiaPorPax = flight.preco_esperado - flight.preco_atual;
    const pax = flight.quantidade_pax || 1;
    const economiaTotal = economiaPorPax * pax;

    const testBanner = isTest ? `
    <div style="background: #f59e0b; color: #1f2937; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; text-align: center; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">
      🧪 MENSAGEM DE TESTE — Os valores abaixo são fictícios.<br/>
      <span style="font-weight: 400; font-size: 12px;">Esta é uma simulação enviada para validar o envio. Não representa um alerta real.</span>
    </div>` : '';

    const title = isTest ? '[TESTE] Alerta de Voo' : 'Alerta de Voo';
    const subtitle = isTest ? 'Exemplo de notificação — não é um alerta real' : 'Preço abaixo do alvo detectado!';

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #e2e8f0; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155; border-radius: 16px; padding: 32px; box-shadow: 0 25px 50px rgba(0,0,0,0.5);">
    ${testBanner}
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 40px;">${isTest ? '🧪' : '✈️'}</span>
      <h1 style="color: #ffffff; font-size: 22px; margin: 8px 0 4px;">${title}</h1>
      <p style="color: #94a3b8; font-size: 13px; margin: 0;">${subtitle}</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">👤 Cliente</td>
        <td style="padding: 10px 0; color: #f1f5f9; font-weight: 600; text-align: right;">${flight.cliente}</td>
      </tr>
      <tr style="border-top: 1px solid #1e293b;">
        <td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">📅 Viagem</td>
        <td style="padding: 10px 0; color: #f1f5f9; font-weight: 600; text-align: right;">${flight.mes_viagem}</td>
      </tr>
      <tr style="border-top: 1px solid #1e293b;">
        <td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">👥 Passageiros</td>
        <td style="padding: 10px 0; color: #f1f5f9; font-weight: 600; text-align: right;">${pax}</td>
      </tr>
    </table>

    <div style="background: #1e293b; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #334155;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <div>
          <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Preço Atual</div>
          <div style="color: #4ade80; font-size: 28px; font-weight: 700; font-family: monospace;">${formatBRL(flight.preco_atual)}</div>
        </div>
        <div style="text-align: right;">
          <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Preço Alvo</div>
          <div style="color: #e2e8f0; font-size: 28px; font-weight: 700; font-family: monospace;">${formatBRL(flight.preco_esperado)}</div>
        </div>
      </div>
      <div style="border-top: 1px solid #334155; padding-top: 12px;">
        <div style="color: #94a3b8; font-size: 11px;">Economia por pax: <strong style="color: #4ade80;">${formatBRL(economiaPorPax)}</strong></div>
        <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">Economia total (${pax} pax): <strong style="color: #4ade80;">${formatBRL(economiaTotal)}</strong></div>
      </div>
    </div>

    <a href="${flight.link_voo}" style="display: block; text-align: center; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 20px;">
      🔗 Acessar no Google Flights
    </a>

    <p style="text-align: center; color: #475569; font-size: 11px; margin-top: 24px;">
      Monitoramento de Voos Prime — Clube do Voo Viagens
    </p>
  </div>
</body>
</html>
    `.trim();
}

/**
 * Send a Telegram notification with rate limiting.
 */
async function sendTelegram(chatId, flight, options = {}) {
    const { isTest = false } = options;
    try {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            return { sucesso: false, erro: 'TELEGRAM_BOT_TOKEN não configurado' };
        }

        // Rate limiting
        const now = Date.now();
        // Remove timestamps older than the window
        while (telegramTimestamps.length > 0 && telegramTimestamps[0] < now - TELEGRAM_RATE_WINDOW) {
            telegramTimestamps.shift();
        }
        if (telegramTimestamps.length >= TELEGRAM_RATE_LIMIT) {
            const waitTime = telegramTimestamps[0] + TELEGRAM_RATE_WINDOW - now;
            console.log(`[NOTIFIER] Telegram rate limit atingido, aguardando ${waitTime}ms`);
            await new Promise(r => setTimeout(r, waitTime));
        }
        telegramTimestamps.push(Date.now());

        const message = buildTelegramMessage(flight, isTest);
        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            })
        });

        const data = await response.json();

        if (data.ok) {
            console.log(`[NOTIFIER] ✓ Telegram enviado para ${chatId}`);
            return { sucesso: true };
        } else {
            console.error(`[NOTIFIER] ✗ Telegram falhou:`, data.description);
            return { sucesso: false, erro: data.description };
        }
    } catch (error) {
        console.error('[NOTIFIER] Erro ao enviar Telegram:', error.message);
        return { sucesso: false, erro: error.message };
    }
}

/**
 * Send an email notification.
 */
async function sendEmail(to, flight, options = {}) {
    const { isTest = false } = options;
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return { sucesso: false, erro: 'Credenciais de e-mail não configuradas' };
        }

        const subject = isTest
            ? `🧪 [TESTE] Notificação de exemplo | ${flight.cliente}`
            : `✈️ Alerta de voo | ${flight.cliente} — ${flight.mes_viagem}`;

        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: to,
            subject,
            html: buildEmailHtml(flight, isTest)
        });

        console.log(`[NOTIFIER] ✓ E-mail enviado para ${to} | MessageId: ${info.messageId}`);
        return { sucesso: true };
    } catch (error) {
        console.error('[NOTIFIER] Erro ao enviar e-mail:', error.message);
        return { sucesso: false, erro: error.message };
    }
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPassengerNames(passengers) {
    const names = (passengers || []).map(p => p && p.name).filter(Boolean);
    if (names.length === 0) return 'Cliente';
    if (names.length <= 3) return names.join(' e ');
    return `${names[0]}, ${names[1]} e mais ${names.length - 2}`;
}

// ----- helpers de formatação para o template de e-mail "Itinerário Executivo" -----

function firstName(fullName) {
    if (!fullName) return '';
    const first = String(fullName).trim().split(/\s+/)[0] || '';
    if (!first) return '';
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
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

function requireAirportCity(iata) {
    return airportCity(iata);
}

function directionLabel(direction, idx, total) {
    const d = (direction || '').toLowerCase();
    if (d === 'ida') return 'Voo de Ida';
    if (d === 'volta') return 'Voo de Volta';
    return `Trecho ${idx + 1}`;
}

function buildVoucherEmailHtml({ voucherData, settings, customMessage, bookingUrl }) {
    const vd = voucherData || {};
    const s = settings || {};
    const trips = Array.isArray(vd.trips) ? vd.trips : [];
    const passengers = Array.isArray(vd.passengers) ? vd.passengers : [];

    const firstPaxName = firstName(passengers[0]?.name) || 'viajante';
    const locator = (vd.reservation?.locator || 'N/A').toString();
    const fallbackCarrier = (vd.carrier || 'azul').toLowerCase();
    const origin = (vd.route?.origin || trips[0]?.departure?.airport || '').toUpperCase();
    const destination = (vd.route?.destination || trips[trips.length - 1]?.arrival?.airport || '').toUpperCase();

    // Período: usa primeira partida → última chegada
    const firstDep = trips[0]?.departure?.datetime;
    const lastArr = trips[trips.length - 1]?.arrival?.datetime;
    const periodLeft = fmtDate(firstDep);
    const periodRight = fmtDate(lastArr);
    const isOneWay = !periodRight || periodLeft === periodRight;
    const periodText = isOneWay ? (periodLeft || '—') : `${periodLeft} → ${periodRight}`;

    const safeBookingUrl = bookingUrl && /^https?:\/\//i.test(bookingUrl) ? bookingUrl : '#';

    const contactPhone = s.contact_phone || '';
    const contactEmail = s.contact_email || '';
    const contactSite = s.contact_site || 'https://www.clubedovooviagens.com.br';
    const contactSiteHref = /^https?:\/\//i.test(contactSite) ? contactSite : `https://${contactSite}`;

    // Custom message
    const trimmedMsg = (customMessage || '').trim();
    const customBox = trimmedMsg
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;"><tr><td bgcolor="#f0f6fc" style="background:#f0f6fc;border-left:4px solid #3871c1;border-radius:6px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a2a48;line-height:1.55;">${escapeHtml(trimmedMsg).replace(/\n/g, '<br>')}</td></tr></table>`
        : '';

    // ----- Header -----
    const headerHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#00569e" style="background:#00569e;background:linear-gradient(135deg,#00569e,#3871c1);">
        <tr>
          <td style="padding:22px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="left" valign="middle" style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
                  <div style="font-size:18px;font-weight:700;line-height:1.2;">Clube do Voo Viagens</div>
                  <div style="font-size:12px;opacity:0.85;margin-top:4px;">Confirmação de Reserva</div>
                </td>
                <td align="right" valign="middle">
                  <span style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;padding:6px 12px;border-radius:999px;letter-spacing:0.3px;">● Reserva confirmada</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    // ----- Greeting -----
    const greetingHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#1a2a48;">
            <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">Olá, <strong>${escapeHtml(firstPaxName)}</strong>,</p>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">Sua viagem está pronta. Use este email como referência — todos os dados do seu voo, contatos e próximos passos estão abaixo.</p>
            ${customBox}
          </td>
        </tr>
      </table>`;

    // ----- Reservation summary card -----
    const summaryHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:0 28px;">
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
            <tr>
              <td width="33%" align="left" valign="middle" style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;border-right:1px solid #eef2f7;">
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Localizador</div>
                <div style="font-size:18px;color:#00569e;font-weight:700;letter-spacing:2px;margin-top:6px;">${escapeHtml(locator)}</div>
              </td>
              <td width="34%" align="center" valign="middle" style="padding:14px 12px;font-family:Arial,Helvetica,sans-serif;border-right:1px solid #eef2f7;">
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Origem</div>
                <div style="font-size:16px;color:#1a2a48;font-weight:700;line-height:1.2;margin-top:2px;">${escapeHtml(origin)}</div>
                <div style="font-size:11px;color:#94a3b8;">${escapeHtml(requireAirportCity(origin))}</div>
                <div style="font-size:18px;color:#3871c1;margin:6px 0;line-height:1;">⇄</div>
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Destino</div>
                <div style="font-size:16px;color:#1a2a48;font-weight:700;line-height:1.2;margin-top:2px;">${escapeHtml(destination)}</div>
                <div style="font-size:11px;color:#94a3b8;">${escapeHtml(requireAirportCity(destination))}</div>
              </td>
              <td width="33%" align="right" valign="middle" style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Período</div>
                <div style="font-size:13px;color:#1a2a48;font-weight:600;margin-top:6px;">${escapeHtml(periodText)}</div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`;

    // ----- Trips -----
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
        const title = directionLabel(t.direction, idx, trips.length);

        return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:16px 28px 0;">
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
            <tr>
              <td style="padding:18px 20px 0;font-family:Arial,Helvetica,sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="left" valign="middle">
                      <div style="font-size:15px;color:#1a2a48;font-weight:700;">${escapeHtml(title)}</div>
                      <div style="font-size:12px;color:#64748b;margin-top:4px;">${escapeHtml(carrierLabel)} · Voo ${escapeHtml(flightNo)}</div>
                      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Localizador ${escapeHtml(tripLocator)}</div>
                    </td>
                    <td align="right" valign="middle">
                      <span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;">● Confirmado</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px 20px;font-family:Arial,Helvetica,sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td width="42%" align="left" valign="top" style="padding:12px 8px 12px 0;">
                      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Partida</div>
                      <div style="font-size:24px;color:#1a2a48;font-weight:700;margin-top:4px;line-height:1;">${escapeHtml(depTime || '--:--')}</div>
                      <div style="font-size:13px;color:#1a2a48;margin-top:6px;"><strong>${escapeHtml(depIata)}</strong> · ${escapeHtml(requireAirportCity(depIata))}</div>
                      <div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(depDate)}</div>
                    </td>
                    <td width="16%" align="center" valign="middle" style="padding:12px 0;">
                      <div style="font-size:26px;color:#3871c1;line-height:1;">✈</div>
                    </td>
                    <td width="42%" align="right" valign="top" style="padding:12px 0 12px 8px;">
                      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Chegada</div>
                      <div style="font-size:24px;color:#1a2a48;font-weight:700;margin-top:4px;line-height:1;">${escapeHtml(arrTime || '--:--')}</div>
                      <div style="font-size:13px;color:#1a2a48;margin-top:6px;"><strong>${escapeHtml(arrIata)}</strong> · ${escapeHtml(requireAirportCity(arrIata))}</div>
                      <div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(arrDate)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`;
    }).join('');

    // ----- CTA -----
    const ctaHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:20px 28px 0;">
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#00569e" style="background:#00569e;background:linear-gradient(135deg,#00569e,#3871c1);border-radius:14px;">
            <tr>
              <td align="center" style="padding:24px 20px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
                <div style="font-size:16px;font-weight:700;margin-bottom:4px;">Pronto para embarcar?</div>
                <div style="font-size:12px;opacity:0.9;margin-bottom:16px;">Check-in disponível 48h antes da partida</div>
                <a href="${escapeHtml(safeBookingUrl)}" style="display:inline-block;padding:14px 26px;background:#ffffff;color:#00569e;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px;letter-spacing:0.5px;">FAZER CHECK-IN →</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`;

    // ----- Próximos passos -----
    const firstCarrierName = trips[0] ? (trips[0].airlineDisplayName || carrierDisplayName(tripCarrier(trips[0], fallbackCarrier))) : carrierDisplayName(fallbackCarrier);
    const stepCard = (color, title, desc) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:10px;">
        <tr>
          <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="32" valign="top" style="padding-right:12px;">
                  <div style="width:24px;height:24px;background:${color};border-radius:50%;color:#ffffff;text-align:center;font-size:13px;font-weight:700;line-height:24px;">●</div>
                </td>
                <td valign="top">
                  <div style="font-size:13px;color:#1a2a48;font-weight:700;">${escapeHtml(title)}</div>
                  <div style="font-size:12px;color:#64748b;line-height:1.55;margin-top:4px;">${escapeHtml(desc)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    const stepsHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:24px 28px 0;">
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:15px;color:#1a2a48;font-weight:700;">Próximos passos</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;">Preparando-se para o voo</div>
            ${stepCard('#3871c1', 'Chegue cedo ao aeroporto', `Recomendamos chegar com pelo menos 2 horas de antecedência. Verifique os requisitos de bagagem da ${firstCarrierName}.`)}
            ${stepCard('#00569e', 'Documentos em mãos', 'Tenha um documento oficial com foto e o localizador da reserva acessíveis. Estes dados serão solicitados no check-in.')}
            ${stepCard('#15803d', 'Check-in assistido', 'Nossa equipe pode realizar o check-in para você e enviar o cartão de embarque diretamente. Basta nos avisar.')}
          </td>
        </tr>
      </table>`;

    // ----- Assistência -----
    const phoneHtml = contactPhone ? `<tr><td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a2a48;"><strong>WhatsApp:</strong> ${escapeHtml(contactPhone)}</td></tr>` : '';
    const emailHtml = contactEmail ? `<tr><td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a2a48;"><strong>Email:</strong> <a href="mailto:${escapeHtml(contactEmail)}" style="color:#00569e;text-decoration:none;">${escapeHtml(contactEmail)}</a></td></tr>` : '';

    const supportHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:20px 28px 0;">
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f0f6fc" style="background:#f0f6fc;border-radius:12px;">
            <tr>
              <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:14px;color:#1a2a48;font-weight:700;">Estamos aqui para ajudar</div>
                <div style="font-size:12px;color:#475569;margin-top:4px;margin-bottom:10px;">Dúvidas, alterações ou pedidos especiais — fale conosco.</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  ${phoneHtml}
                  ${emailHtml}
                </table>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`;

    // ----- Footer -----
    const footerHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:24px 28px 28px;">
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;color:#475569;font-size:13px;line-height:1.6;">
            <div>Boa viagem,</div>
            <div style="color:#1a2a48;font-weight:700;margin-top:2px;">Clube do Voo Viagens</div>
            <div style="margin-top:6px;"><a href="${escapeHtml(contactSiteHref)}" style="color:#00569e;text-decoration:none;font-size:12px;">${escapeHtml(contactSite)}</a></div>
            <div style="margin-top:14px;color:#94a3b8;font-size:11px;">Email automático — não responda diretamente. Use os canais acima.</div>
          </td>
        </tr>
      </table>`;

    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmação de Reserva</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f4f6f9" style="background:#f4f6f9;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#ffffff" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.08);">
          <tr><td>${headerHtml}</td></tr>
          <tr><td>${greetingHtml}</td></tr>
          <tr><td>${summaryHtml}</td></tr>
          <tr><td>${tripsHtml}</td></tr>
          <tr><td>${ctaHtml}</td></tr>
          <tr><td>${stepsHtml}</td></tr>
          <tr><td>${supportHtml}</td></tr>
          <tr><td>${footerHtml}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

async function sendVoucherEmail({ to, bcc, voucherData, settings, attachmentPath, customMessage, bookingUrl }) {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return { sucesso: false, erro: 'Credenciais de e-mail não configuradas' };
        }
        const vd = voucherData || {};
        const locator = vd.reservation?.locator || 'N/A';
        const names = (vd.passengers || []).map(p => p && p.name).filter(Boolean);
        let subject;
        if (names.length > 2) {
            subject = `Voucher de viagem — ${locator} | ${names[0]} e mais ${names.length - 1}`;
        } else {
            subject = `Voucher de viagem — ${locator} | ${formatPassengerNames(vd.passengers)}`;
        }

        const mailOptions = {
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: to.join(', '),
            bcc: bcc || undefined,
            subject,
            html: buildVoucherEmailHtml({ voucherData: vd, settings, customMessage, bookingUrl }),
            attachments: [{ filename: `Voucher-${locator}.pdf`, path: attachmentPath }]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[NOTIFIER] ✓ Voucher e-mail enviado para ${to.join(', ')} | MessageId: ${info.messageId}`);
        return { sucesso: true, messageId: info.messageId, subject };
    } catch (error) {
        console.error('[NOTIFIER] Erro ao enviar voucher por e-mail:', error.message);
        return { sucesso: false, erro: error.message };
    }
}

module.exports = { sendTelegram, sendEmail, sendVoucherEmail, buildVoucherEmailHtml };
