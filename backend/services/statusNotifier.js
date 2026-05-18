const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '465', 10),
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  return transporter;
}

const EVENT_TITLES = {
  cancelado: { emoji: '🚨', label: 'VOO CANCELADO', color: '#dc2626' },          // red
  atrasado: { emoji: '⚠️', label: 'ATRASO CONFIRMADO', color: '#f59e0b' },       // amber
  reagendado: { emoji: '⚠️', label: 'VOO REAGENDADO', color: '#f59e0b' }         // amber
};

function formatDiff(diff) {
  if (!diff || !Array.isArray(diff)) return '';
  return diff.map(d => `<li><b>${d.campo}:</b> ${d.antes || '—'} → ${d.depois || '—'}</li>`).join('');
}

function formatDiffPlain(diff) {
  if (!diff || !Array.isArray(diff)) return '';
  return diff.map(d => `• <b>${d.campo}:</b> ${d.antes || '—'} → ${d.depois || '—'}`).join('\n');
}

function buildStatusEmailHtml(flight, evento, diff) {
  const meta = EVENT_TITLES[evento] || { emoji: 'ℹ️', label: evento.toUpperCase(), color: '#475569' };
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;">
    <div style="background:${meta.color};padding:20px;text-align:center;">
      <div style="font-size:32px;">${meta.emoji}</div>
      <div style="color:#fff;font-size:18px;font-weight:700;margin-top:4px;">${meta.label}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#f1f5f9;"><b>Cliente:</b> ${flight.cliente}</p>
      <p style="margin:0 0 12px;color:#f1f5f9;"><b>Voo:</b> ${flight.numero_voo} (${flight.companhia || '—'})</p>
      <p style="margin:0 0 12px;color:#f1f5f9;"><b>Trecho:</b> ${flight.origem || '?'} → ${flight.destino || '?'}</p>
      <p style="margin:0 0 12px;color:#f1f5f9;"><b>Data:</b> ${flight.data_voo}</p>
      <div style="background:#0f172a;border-radius:8px;padding:16px;margin-top:16px;">
        <ul style="margin:0;padding-left:18px;color:#e2e8f0;font-size:14px;">${formatDiff(diff)}</ul>
      </div>
      <p style="margin-top:20px;font-size:11px;color:#475569;text-align:center;">
        Monitor de Status — Clube do Voo Viagens
      </p>
    </div>
  </div>
</body></html>`.trim();
}

function buildStatusTelegramMessage(flight, evento, diff) {
  const meta = EVENT_TITLES[evento] || { emoji: 'ℹ️', label: evento.toUpperCase() };
  return `
${meta.emoji} <b>${meta.label}</b>

👤 <b>Cliente:</b> ${flight.cliente}
✈️ <b>Voo:</b> ${flight.numero_voo} ${flight.companhia ? '(' + flight.companhia + ')' : ''}
🛫 <b>Trecho:</b> ${flight.origem || '?'} → ${flight.destino || '?'}
📅 <b>Data:</b> ${flight.data_voo}

<b>Alterações:</b>
${formatDiffPlain(diff)}
  `.trim();
}

async function sendStatusEmail(to, flight, evento, diff) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)
    return { sucesso: false, erro: 'Credenciais de email não configuradas' };
  try {
    const meta = EVENT_TITLES[evento] || { label: evento.toUpperCase() };
    const info = await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject: `${meta.label} | ${flight.numero_voo} ${flight.data_voo} — ${flight.cliente}`,
      html: buildStatusEmailHtml(flight, evento, diff)
    });
    return { sucesso: true, messageId: info.messageId };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

async function sendStatusTelegram(chatId, flight, evento, diff) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sucesso: false, erro: 'TELEGRAM_BOT_TOKEN não configurado' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildStatusTelegramMessage(flight, evento, diff),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    return data.ok ? { sucesso: true } : { sucesso: false, erro: data.description };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

module.exports = {
  sendStatusEmail,
  sendStatusTelegram,
  buildStatusEmailHtml,    // exported for snapshot/visual testing
  buildStatusTelegramMessage
};
