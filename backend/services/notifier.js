const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const { airportCity, tripCarrier, normalizeFlightNumber, carrierDisplayName, carrierShortName } = require('../helpers/voucherCarrier');

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

// SVG icons (inline — email-safe)
const SVG_SWAP_WHITE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M7 7h11l-3-3 1.4-1.4L21 7l-4.6 4.4L15 10l3-3H7V7zm10 10H6l3 3-1.4 1.4L3 17l4.6-4.4L9 14l-3 3h11v0z"/></svg>';
const SVG_PLANE_BLUE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#00539C" xmlns="http://www.w3.org/2000/svg"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';
const SVG_IG_WHITE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.22.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.05.41 2.22.06 1.25.07 1.62.07 4.82 0 3.2 0 3.6-.07 4.85-.05 1.17-.25 1.8-.41 2.22-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.05.36-2.22.41-1.25.06-1.62.07-4.85.07-3.2 0-3.6 0-4.85-.07-1.17-.05-1.8-.25-2.22-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.05-.41-2.22C2.21 15.6 2.2 15.2 2.2 12s0-3.6.07-4.85c.05-1.17.25-1.8.41-2.22.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.05-.36 2.22-.41C8.4 2.21 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.52 0-4.76.07-1.07.05-1.65.23-2.04.38-.51.2-.88.44-1.27.83-.39.39-.63.76-.83 1.27-.15.39-.33.97-.38 2.04C2.65 9.83 2.64 10.2 2.64 12s0 2.17.08 3.41c.05 1.07.23 1.65.38 2.04.2.51.44.88.83 1.27.39.39.76.63 1.27.83.39.15.97.33 2.04.38 1.24.08 1.61.08 4.76.08 3.15 0 3.52 0 4.76-.08 1.07-.05 1.65-.23 2.04-.38.51-.2.88-.44 1.27-.83.39-.39.63-.76.83-1.27.15-.39.33-.97.38-2.04.08-1.24.08-1.61.08-3.41 0-1.8 0-2.17-.08-3.41-.05-1.07-.23-1.65-.38-2.04-.2-.51-.44-.88-.83-1.27a3.45 3.45 0 0 0-1.27-.83c-.39-.15-.97-.33-2.04-.38C15.52 4 15.15 4 12 4zm0 3.06a4.94 4.94 0 1 1 0 9.88 4.94 4.94 0 0 1 0-9.88zm0 1.8a3.14 3.14 0 1 0 0 6.28 3.14 3.14 0 0 0 0-6.28zm5.15-2.06a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z"/></svg>';
const SVG_FB_WHITE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.9h-2.33v6.98A10 10 0 0 0 22 12z"/></svg>';
const SVG_WA_WHITE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.34.22-.64.07-.3-.15-1.27-.47-2.42-1.49-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51-.17 0-.37-.02-.57-.02-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.08 4.5.71.3 1.26.49 1.7.62.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.49 15.31L2 22l4.81-1.5A10 10 0 1 0 12 2zm0 18.18a8.18 8.18 0 0 1-4.16-1.13l-.3-.18-2.86.89.91-2.78-.2-.32A8.18 8.18 0 1 1 12 20.18z"/></svg>';
const SVG_MAIL_WHITE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>';

// URLs públicas das redes sociais da agência (hardcoded por enquanto;
// mover pra voucher_settings se quiser editar via UI no futuro).
const SOCIAL_INSTAGRAM_URL = 'https://www.instagram.com/clubedovooviagens';
const SOCIAL_EMAIL_ADDRESS = 'contato@clubedovooviagens.com.br';
const SOCIAL_WHATSAPP_URL  = 'https://wa.me/5575992020012';

// E-mail no formato do MODELO COMPACTADO do usuário (header azul, route overview,
// cards de voo, CTA, próximos passos numerados, support card com QR, footer escuro).
// 100% inline styles + tables — email-safe (Gmail/Outlook/Apple Mail).
async function buildVoucherEmailHtml({ voucherData, settings, customMessage, bookingUrl, itinerarioUrl }) {
    const vd = voucherData || {};
    const s = settings || {};
    const trips = Array.isArray(vd.trips) ? vd.trips : [];
    const passengers = Array.isArray(vd.passengers) ? vd.passengers : [];

    const firstPaxName = firstName(passengers[0]?.name) || 'viajante';
    const locator = (vd.reservation?.locator || 'N/A').toString();
    const fallbackCarrier = (vd.carrier || 'azul').toLowerCase();
    const origin = (vd.route?.origin || trips[0]?.departure?.airport || '').toUpperCase();
    const destination = (vd.route?.destination || trips[trips.length - 1]?.arrival?.airport || '').toUpperCase();
    const originCity = airportCity(origin) || origin;
    const destCity = airportCity(destination) || destination;

    // Período: usa primeira partida → última chegada
    const firstDep = trips[0]?.departure?.datetime;
    const lastArr = trips[trips.length - 1]?.arrival?.datetime;
    const periodLeft = fmtDate(firstDep);
    const periodRight = fmtDate(lastArr);
    const isOneWay = !periodRight || periodLeft === periodRight;

    const safeBookingUrl = bookingUrl && /^https?:\/\//i.test(bookingUrl) ? bookingUrl : '#';
    const safeItinerarioUrl = itinerarioUrl && /^https?:\/\//i.test(itinerarioUrl) ? itinerarioUrl : '';

    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const logoUrl = `${publicBaseUrl}/voucher-assets/agency-logo.png`;

    const contactPhone = s.contact_phone || '';
    const contactEmail = s.contact_email || '';
    const contactSite = s.contact_site || 'www.clubedovooviagens.com.br';
    const contactSiteHref = /^https?:\/\//i.test(contactSite) ? contactSite : `https://${contactSite}`;
    const phoneDigits = (contactPhone || '').replace(/\D/g, '');
    const whatsappHref = phoneDigits
        ? `https://wa.me/${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}`
        : contactSiteHref;

    // QR Code PNG embutido como data URL — mais compatível com clientes de e-mail (Gmail/Outlook
    // bloqueiam ou renderizam SVG inline inconsistentemente). Aponta pro itinerário hospedado
    // se houver; senão pro site da agência.
    let qrDataUrl = '';
    try {
        const qrTarget = safeItinerarioUrl || contactSiteHref;
        qrDataUrl = await QRCode.toDataURL(qrTarget, {
            width: 192,           // 96px exibido em retina = 2x
            margin: 1,
            color: { dark: '#1A202C', light: '#ffffff' },
            errorCorrectionLevel: 'M'
        });
    } catch { qrDataUrl = ''; }

    // Custom message (acima do route overview)
    const trimmedMsg = (customMessage || '').trim();
    const customBox = trimmedMsg
        ? `<div style="background:#F0F6FC;border-left:4px solid #00539C;border-radius:6px;padding:14px 16px;margin-bottom:24px;font-size:14px;color:#2D3748;line-height:1.55;">${escapeHtml(trimmedMsg).replace(/\n/g, '<br>')}</div>`
        : '';

    // ===== Header (azul com logo) =====
    const headerHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#00539C" style="background-color:#00539C;">
        <tr>
          <td style="padding:24px;font-family:Inter,Arial,Helvetica,sans-serif;color:#ffffff;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" width="64" style="padding-right:16px;">
                  <!-- Logo já é circular com fundo branco — sem wrapper extra. -->
                  <img src="${escapeHtml(logoUrl)}" alt="Clube do Voo" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:9999px;border:0;outline:none;">
                </td>
                <td valign="middle" style="font-family:Inter,Arial,Helvetica,sans-serif;color:#ffffff;">
                  <div style="font-size:20px;font-weight:700;line-height:1.2;letter-spacing:0.025em;">Clube do Voo Viagens</div>
                  <div style="font-size:14px;opacity:0.9;margin-top:4px;">Confirmação de Reserva</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    // ===== Greeting + localizador =====
    const greetingHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:32px;">
        <tr>
          <td valign="top" style="font-family:Inter,Arial,Helvetica,sans-serif;">
            <div style="color:#00539C;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Reserva Confirmada</div>
            <h2 style="font-size:36px;font-weight:700;color:#2D3748;margin:0 0 16px;line-height:1.1;">Olá, ${escapeHtml(firstPaxName)}.</h2>
            <p style="color:#718096;font-size:14px;line-height:1.625;margin:0;max-width:380px;">Sua viagem está pronta. Use este email como referência — todos os dados do seu voo, contatos e próximos passos estão abaixo.</p>
          </td>
          <td valign="top" align="right" width="140" style="padding-left:12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E5E7EB;border-radius:4px;">
              <tr>
                <td align="center" style="padding:16px;font-family:Inter,Arial,Helvetica,sans-serif;min-width:120px;">
                  <div style="font-size:12px;color:#718096;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Localizador</div>
                  <div style="color:#00539C;font-weight:700;font-size:20px;letter-spacing:0.1em;">${escapeHtml(locator)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    // ===== Route Overview (azul escuro) =====
    const periodHtml = isOneWay
        ? escapeHtml(periodLeft || '—')
        : `${escapeHtml(periodLeft)} &rarr;<br>${escapeHtml(periodRight)}`;
    const routeOverviewHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#004A8F" style="background-color:#004A8F;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:24px;font-family:Inter,Arial,Helvetica,sans-serif;color:#ffffff;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="left" valign="middle" width="33%">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.8;margin-bottom:4px;">Origem</div>
                  <div style="font-size:48px;font-weight:700;line-height:1;margin-bottom:4px;">${escapeHtml(origin)}</div>
                  <div style="font-size:14px;">${escapeHtml(originCity)}</div>
                </td>
                <td align="center" valign="middle" width="34%" style="padding:0 12px;">
                  <div style="margin-bottom:8px;line-height:1;">${SVG_SWAP_WHITE}</div>
                  <div style="font-size:12px;opacity:0.9;white-space:nowrap;">${periodHtml}</div>
                </td>
                <td align="right" valign="middle" width="33%">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.8;margin-bottom:4px;">Destino</div>
                  <div style="font-size:48px;font-weight:700;line-height:1;margin-bottom:4px;">${escapeHtml(destination)}</div>
                  <div style="font-size:14px;">${escapeHtml(destCity)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    // ===== Flight cards =====
    const flightCard = (t, idx) => {
        const ck = tripCarrier(t, fallbackCarrier);
        const carrierLabel = t.airlineDisplayName || carrierDisplayName(ck) || 'Companhia aérea';
        // O modelo usa "Azul · Voo 2411" — apenas o número
        const flightNoRaw = normalizeFlightNumber(t.flightNumber || '');
        const flightNoOnly = (flightNoRaw.match(/\d+/) || [''])[0] || flightNoRaw;
        const carrierShort = carrierShortName(ck);
        const depTime = fmtTime(t.departure?.datetime) || '--:--';
        const depDate = fmtDate(t.departure?.datetime) || '';
        const arrDate = fmtDate(t.arrival?.datetime) || '';
        const depIata = (t.departure?.airport || '').toUpperCase();
        const arrIata = (t.arrival?.airport || '').toUpperCase();
        const depCity = airportCity(depIata) || depIata;
        const arrCity = airportCity(arrIata) || arrIata;
        const tripLocator = t.locator || locator;
        const dir = (t.direction || '').toLowerCase();
        const title = dir === 'ida' ? 'Voo de Ida' : (dir === 'volta' ? 'Voo de Volta' : `Trecho ${idx + 1}`);

        return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #E5E7EB;border-top:4px solid #00539C;border-radius:4px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
        <tr>
          <td style="padding:24px;font-family:Inter,Arial,Helvetica,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td valign="top" align="left">
                  <div style="color:#00539C;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(title)}</div>
                  <div style="color:#718096;font-size:14px;">${escapeHtml(carrierShort || carrierLabel)} &middot; Voo ${escapeHtml(flightNoOnly)}</div>
                </td>
                <td valign="top" align="right">
                  <div style="color:#718096;font-size:12px;margin-bottom:4px;">Confirmado</div>
                  <div style="font-size:14px;font-weight:600;color:#2D3748;"><span style="color:#22c55e;">&bull;</span> Localizador ${escapeHtml(tripLocator)}</div>
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="middle" align="left" width="38%">
                  <div style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Partida</div>
                  <div style="font-size:30px;font-weight:700;color:#2D3748;margin-bottom:4px;line-height:1;">${escapeHtml(depTime)}</div>
                  <div style="font-size:14px;font-weight:600;color:#2D3748;">${escapeHtml(depIata)} &middot; ${escapeHtml(depCity)}</div>
                  <div style="font-size:12px;color:#718096;">${escapeHtml(depDate)}</div>
                </td>
                <td valign="middle" align="center" width="24%" style="border-top:1px dashed #CBD5E1;padding:0 8px;position:relative;">
                  <div style="background:#ffffff;display:inline-block;padding:0 10px;margin-top:-10px;line-height:1;">${SVG_PLANE_BLUE}</div>
                </td>
                <td valign="middle" align="right" width="38%">
                  <div style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Chegada</div>
                  <div style="font-size:30px;font-weight:700;color:#2D3748;margin-bottom:4px;line-height:1;">${escapeHtml(arrIata)}</div>
                  <div style="font-size:14px;font-weight:600;color:#2D3748;">${escapeHtml(arrCity)}</div>
                  <div style="font-size:12px;color:#718096;">${escapeHtml(arrDate)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    };
    const tripsHtml = trips.length > 0
        ? `<div style="margin-bottom:32px;">${trips.map(flightCard).join('')}</div>`
        : '';

    // ===== CTA "Fazer Check-in" =====
    const ctaHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#004A8F" style="background-color:#004A8F;border-radius:8px;margin-bottom:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
        <tr>
          <td align="center" style="padding:32px;font-family:Inter,Arial,Helvetica,sans-serif;color:#ffffff;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;opacity:0.9;">Pronto para embarcar?</div>
            <div style="font-size:24px;font-weight:700;margin-bottom:24px;">Check-in disponível 48h antes da partida</div>
            <a href="${escapeHtml(safeBookingUrl)}" style="display:inline-block;background:#ffffff;color:#00539C;font-weight:700;font-size:14px;letter-spacing:0.1em;text-transform:uppercase;padding:12px 32px;border-radius:4px;text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,0.05);">Fazer Check-in &rarr;</a>
          </td>
        </tr>
      </table>`;

    const itinerarioLinkHtml = safeItinerarioUrl
        ? `<div style="text-align:center;margin-top:16px;margin-bottom:24px;font-family:Inter,Arial,Helvetica,sans-serif;">
             <a href="${escapeHtml(safeItinerarioUrl)}" style="color:#00539C;font-size:12px;text-decoration:underline;">Ver itinerário completo na web</a>
           </div>`
        : '<div style="margin-bottom:24px;"></div>';

    // ===== Próximos passos =====
    const firstCarrierShort = trips[0]
        ? (carrierShortName(tripCarrier(trips[0], fallbackCarrier)) || carrierDisplayName(tripCarrier(trips[0], fallbackCarrier)))
        : carrierShortName(fallbackCarrier);

    const stepItem = (n, title, desc) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
        <tr>
          <td valign="top" width="48" style="padding-right:16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#004A8F" style="background-color:#004A8F;border-radius:9999px;">
              <tr>
                <td align="center" valign="middle" width="32" height="32" style="width:32px;height:32px;font-family:Inter,Arial,Helvetica,sans-serif;color:#ffffff;font-weight:700;font-size:14px;line-height:32px;">${n}</td>
              </tr>
            </table>
          </td>
          <td valign="top" style="font-family:Inter,Arial,Helvetica,sans-serif;">
            <div style="font-weight:700;color:#2D3748;font-size:16px;margin-bottom:4px;">${escapeHtml(title)}</div>
            <div style="color:#718096;font-size:14px;line-height:1.625;">${escapeHtml(desc)}</div>
          </td>
        </tr>
      </table>`;

    const stepsHtml = `
      <div style="margin-bottom:40px;font-family:Inter,Arial,Helvetica,sans-serif;">
        <div style="color:#00539C;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Próximos Passos</div>
        <div style="font-size:24px;font-weight:700;color:#2D3748;margin-bottom:24px;">Preparando-se para o voo</div>
        ${stepItem(1, 'Chegue cedo ao aeroporto', `Recomendamos chegar com pelo menos 2 horas de antecedência. Verifique os requisitos de bagagem da ${firstCarrierShort}.`)}
        ${stepItem(2, 'Documentos em mãos', 'Tenha um documento oficial com foto e o localizador da reserva acessíveis. Estes dados serão solicitados no check-in.')}
        ${stepItem(3, 'Check-in assistido', 'Nossa equipe pode realizar o check-in para você e enviar o cartão de embarque diretamente. Basta nos avisar.')}
      </div>`;

    // ===== Support Card =====
    const supportContactLines = [];
    if (contactPhone) {
        supportContactLines.push(`<div style="margin-bottom:4px;"><span style="font-weight:700;color:#2D3748;">WhatsApp:</span> <a href="${escapeHtml(whatsappHref)}" style="color:#00539C;text-decoration:none;">${escapeHtml(contactPhone)}</a></div>`);
    }
    if (contactEmail) {
        supportContactLines.push(`<div><span style="font-weight:700;color:#2D3748;">Email:</span> <a href="mailto:${escapeHtml(contactEmail)}" style="color:#00539C;text-decoration:none;">${escapeHtml(contactEmail)}</a></div>`);
    }
    const supportHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F3F4F6" style="background-color:#F3F4F6;border-radius:8px;margin-bottom:32px;">
        <tr>
          <td style="padding:24px;font-family:Inter,Arial,Helvetica,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="middle" align="left">
                  <div style="color:#718096;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Assistência</div>
                  <div style="font-weight:700;color:#2D3748;font-size:18px;margin-bottom:8px;">Estamos aqui para ajudar</div>
                  <div style="color:#718096;font-size:14px;margin-bottom:16px;">Dúvidas, alterações ou pedidos especiais — escaneie o QR ou fale conosco.</div>
                  <div style="font-size:14px;">${supportContactLines.join('')}</div>
                </td>
                <td valign="middle" align="right" width="120" style="padding-left:16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;border-radius:4px;">
                    <tr>
                      <td align="center" valign="middle" style="padding:8px;line-height:0;">
                        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code" width="96" height="96" style="display:block;width:96px;height:96px;border:0;outline:none;">` : '<div style="width:96px;height:96px;background:#E5E7EB;"></div>'}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    // ===== Signoff =====
    const signoffHtml = `
      <div style="border-top:1px solid #E5E7EB;padding-top:24px;margin-top:32px;font-family:Inter,Arial,Helvetica,sans-serif;">
        <p style="color:#718096;font-size:14px;margin:0;">Boa viagem,</p>
        <p style="color:#718096;font-size:14px;margin:0;">&middot; Clube do Voo Viagens</p>
        <p style="color:#718096;font-size:12px;margin-top:8px;margin-bottom:0;">Você também encontra o voucher detalhado em <strong>PDF anexo</strong> a este email.</p>
      </div>`;

    // ===== Footer escuro =====
    const socialBtn = (href, svg) => `<a href="${escapeHtml(href || contactSiteHref)}" style="display:inline-block;color:#ffffff;text-decoration:none;margin:0 12px;">${svg}</a>`;
    const footerHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1A202C" style="background-color:#1A202C;">
        <tr>
          <td align="center" style="padding:32px;font-family:Inter,Arial,Helvetica,sans-serif;color:#ffffff;">
            <div style="margin-bottom:16px;">
              ${socialBtn(SOCIAL_INSTAGRAM_URL, SVG_IG_WHITE)}${socialBtn(`mailto:${SOCIAL_EMAIL_ADDRESS}`, SVG_MAIL_WHITE)}${socialBtn(SOCIAL_WHATSAPP_URL, SVG_WA_WHITE)}
            </div>
            <div style="font-size:14px;font-weight:600;margin-bottom:8px;">
              <a href="${escapeHtml(contactSiteHref)}" style="color:#ffffff;text-decoration:none;">${escapeHtml(contactSite)}</a>
            </div>
            <div style="font-size:12px;color:#9ca3af;font-style:italic;">Email automático — não responda diretamente. Use os canais acima.</div>
          </td>
        </tr>
      </table>`;

    // ===== Main content =====
    const mainHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="padding:32px;font-family:Inter,Arial,Helvetica,sans-serif;">
            ${greetingHtml}
            ${customBox}
            ${routeOverviewHtml}
            ${tripsHtml}
            ${ctaHtml}
            ${itinerarioLinkHtml}
            ${stepsHtml}
            ${supportHtml}
            ${signoffHtml}
          </td>
        </tr>
      </table>`;

    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmação de Reserva - Clube do Voo Viagens</title></head>
<body style="margin:0;padding:0;background-color:#E2E8F0;font-family:Inter,Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#E2E8F0" style="background-color:#E2E8F0;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">
          <tr><td>${headerHtml}</td></tr>
          <tr><td>${mainHtml}</td></tr>
          <tr><td>${footerHtml}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

// --- versão antiga removida (substituída pelo e-mail simplificado + página hospedada) ---
// eslint-disable-next-line no-unused-vars
function _unusedLegacyEmail__REMOVED({ voucherData, settings, customMessage, bookingUrl }) {
  return null; }
/* legacy body kept out — see git history for the full "Itinerário Executivo" inline e-mail.
function _legacy({ voucherData, settings, customMessage, bookingUrl }) {
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
    const contactSite = s.contact_site || 'https://www.clubedovooviagens.com.br';
    const contactSiteHref = /^https?:\/\//i.test(contactSite) ? contactSite : `https://${contactSite}`;
    const trimmedMsg = (customMessage || '').trim();
    const customBox = trimmedMsg
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;"><tr><td bgcolor="#f0f6fc" style="background:#f0f6fc;border-left:4px solid #3871c1;border-radius:6px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a2a48;line-height:1.55;">${escapeHtml(trimmedMsg).replace(/\n/g, '<br>')}</td></tr></table>`
        : '';

    // ----- Header -----
    const headerHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#00569e" style="background:#00569e;">
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
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#00569e" style="background:#00569e;border-radius:14px;">
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
*/

async function sendVoucherEmail({ to, bcc, voucherData, settings, attachmentPath, customMessage, bookingUrl, itinerarioUrl }) {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return { sucesso: false, erro: 'Credenciais de e-mail não configuradas' };
        }
        const vd = voucherData || {};
        const locator = vd.reservation?.locator || 'N/A';
        const names = (vd.passengers || []).map(p => p && p.name).filter(Boolean);
        // Assunto fixo conforme padrão da agência.
        const subject = 'Eba! Sua viagem está confirmada';

        const mailOptions = {
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: to.join(', '),
            bcc: bcc || undefined,
            subject,
            html: await buildVoucherEmailHtml({ voucherData: vd, settings, customMessage, bookingUrl, itinerarioUrl }),
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
