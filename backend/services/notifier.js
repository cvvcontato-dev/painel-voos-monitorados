const nodemailer = require('nodemailer');

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

function buildVoucherEmailHtml({ voucherData, settings, customMessage }) {
    const vd = voucherData || {};
    const passengerNames = escapeHtml(formatPassengerNames(vd.passengers));
    const locator = escapeHtml(vd.reservation?.locator || 'N/A');
    const origin = escapeHtml(vd.route?.origin || '');
    const destination = escapeHtml(vd.route?.destination || '');
    const status = escapeHtml(vd.reservation?.status || 'Confirmado');
    const s = settings || {};
    const contactLine = escapeHtml([s.contact_phone, s.contact_email, s.contact_site].filter(Boolean).join(' · '));

    const trimmedMsg = (customMessage || '').trim();
    const customBox = trimmedMsg
        ? `<div style="background: #f0f6fc; border-left: 4px solid #3871c1; border-radius: 6px; padding: 12px 14px; margin: 0 0 16px; font-size: 14px; color: #1a2a48; white-space: pre-wrap;">${escapeHtml(trimmedMsg).replace(/\n/g, '<br>')}</div>`
        : '';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f6f9; padding: 24px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(90deg, #3871c1, #00569e); color: white; padding: 22px 28px;">
      <div style="font-size: 18px; font-weight: 700;">Clube do Voo Viagens</div>
      <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Confirmação de reserva</div>
    </div>
    <div style="padding: 24px 28px; color: #1a2a48;">
      <p style="margin: 0 0 14px; font-size: 15px;">Olá, <strong>${passengerNames}</strong>,</p>
      ${customBox}
      <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #1a2a48;">
        Sua reserva está confirmada. Em anexo você encontra o voucher completo com todas as informações da viagem.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #f4f6f9; border-radius: 8px;">
        <tr><td style="padding: 10px 14px; color: #6b7a90; font-size: 12px;">Localizador</td><td style="padding: 10px 14px; text-align: right; font-weight: 700; font-size: 14px; letter-spacing: 1px;">${locator}</td></tr>
        <tr><td style="padding: 10px 14px; color: #6b7a90; font-size: 12px; border-top: 1px solid #e5eaf0;">Trajeto</td><td style="padding: 10px 14px; text-align: right; font-weight: 600; font-size: 14px; border-top: 1px solid #e5eaf0;">${origin} → ${destination}</td></tr>
        <tr><td style="padding: 10px 14px; color: #6b7a90; font-size: 12px; border-top: 1px solid #e5eaf0;">Status</td><td style="padding: 10px 14px; text-align: right; font-weight: 600; font-size: 14px; color: #16a34a; border-top: 1px solid #e5eaf0;">● ${status}</td></tr>
      </table>

      <p style="margin: 0; font-size: 13px; color: #6b7a90;">Desejamos uma excelente viagem!</p>
    </div>
    <div style="padding: 16px 28px; background: #f4f6f9; border-top: 1px solid #e5eaf0; font-size: 11px; color: #6b7a90; text-align: center;">
      ${contactLine}
      <div style="margin-top: 8px; color: #9aa5b8;">Documento gerado pela Clube do Voo Viagens. Não substitui o voucher oficial da companhia aérea.</div>
    </div>
  </div>
</body></html>`;
}

async function sendVoucherEmail({ to, bcc, voucherData, settings, attachmentPath, customMessage }) {
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
            html: buildVoucherEmailHtml({ voucherData: vd, settings, customMessage }),
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
