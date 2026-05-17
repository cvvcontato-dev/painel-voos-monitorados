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

function buildTelegramMessage(flight) {
    const economiaPorPax = flight.preco_esperado - flight.preco_atual;
    const pax = flight.quantidade_pax || 1;
    const economiaTotal = economiaPorPax * pax;

    return `
✈️ <b>ALERTA DE VOO — PREÇO ABAIXO DO ALVO!</b>

👤 <b>Cliente:</b> ${flight.cliente}
📅 <b>Viagem:</b> ${flight.mes_viagem}
👥 <b>Passageiros:</b> ${pax}

💰 <b>Preço atual:</b> ${formatBRL(flight.preco_atual)}
🎯 <b>Preço alvo:</b> ${formatBRL(flight.preco_esperado)}

💸 <b>Economia por pax:</b> ${formatBRL(economiaPorPax)}
💸 <b>Economia total:</b> ${formatBRL(economiaTotal)}

🔗 <a href="${flight.link_voo}">Acessar Google Flights</a>
    `.trim();
}

function buildEmailHtml(flight) {
    const economiaPorPax = flight.preco_esperado - flight.preco_atual;
    const pax = flight.quantidade_pax || 1;
    const economiaTotal = economiaPorPax * pax;

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #e2e8f0; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155; border-radius: 16px; padding: 32px; box-shadow: 0 25px 50px rgba(0,0,0,0.5);">
    
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 40px;">✈️</span>
      <h1 style="color: #ffffff; font-size: 22px; margin: 8px 0 4px;">Alerta de Voo</h1>
      <p style="color: #94a3b8; font-size: 13px; margin: 0;">Preço abaixo do alvo detectado!</p>
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
async function sendTelegram(chatId, flight) {
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

        const message = buildTelegramMessage(flight);
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
async function sendEmail(to, flight) {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return { sucesso: false, erro: 'Credenciais de e-mail não configuradas' };
        }

        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: to,
            subject: `✈️ Alerta de voo | ${flight.cliente} — ${flight.mes_viagem}`,
            html: buildEmailHtml(flight)
        });

        console.log(`[NOTIFIER] ✓ E-mail enviado para ${to} | MessageId: ${info.messageId}`);
        return { sucesso: true };
    } catch (error) {
        console.error('[NOTIFIER] Erro ao enviar e-mail:', error.message);
        return { sucesso: false, erro: error.message };
    }
}

module.exports = { sendTelegram, sendEmail };
