// E-mail de cartão de embarque. Visual alinhado ao e-mail de pacote/voucher:
// logo via CID, cabeçalho azul, rodapé escuro. Recebe um "group" de
// buildRecipientGroups (helpers/boardingPassMessage.js).

const fs = require('fs');
const { transporter, AGENCY_LOGO_PATH, AGENCY_LOGO_CID } = require('./notifier');
const {
  INSTRUCTIONS, INSTRUCTION_LABEL, AIRPORT_TIPS, WALLET_FALLBACK, instructionKeysOf
} = require('../helpers/boardingPassMessage');
const { firstNameOf } = require('../helpers/voucherCarrier');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// *negrito* do WhatsApp → <strong> (depois de escapar)
function richText(s) {
  return escapeHtml(s).replace(/\*(.+?)\*/g, '<strong>$1</strong>');
}

function allSegments(group) {
  return group.passengers.flatMap(p => p.segments);
}

function buildSubject(group) {
  const segs = allSegments(group);
  const head = segs.length > 1
    ? 'Seus cartões de embarque estão prontos ✈️'
    : 'Seu cartão de embarque está pronto ✈️';
  const withData = segs.find(s => s.data && s.data.flightNumber && s.data.date);
  if (!withData) return head;
  const { flightNumber, date } = withData.data;
  return `${head} ${flightNumber} · ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function buttonHtml(url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="#00539C" style="background:#00539C;border-radius:8px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Adicionar à carteira</a>
    </td></tr></table>`;
}

function passengerBlock(p) {
  const rows = p.segments.map(s => `
    <tr><td style="padding:12px 0;border-top:1px solid #E5E7EB;">
      <div style="font-size:14px;font-weight:600;color:#2D3748;margin-bottom:10px;">✈️ ${escapeHtml(s.label)}</div>
      ${buttonHtml(s.url)}
    </td></tr>`).join('');
  return `<div style="border:1px solid #E2E8F0;border-radius:10px;padding:16px 18px;margin:0 0 16px;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#718096;font-weight:700;margin-bottom:4px;">Passageiro</div>
    <div style="font-size:17px;font-weight:700;color:#1A202C;margin-bottom:6px;">${escapeHtml(p.name)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
  </div>`;
}

function instructionsHtml(group) {
  const keys = instructionKeysOf(group);
  const blocks = keys.map(k => {
    const title = keys.length > 1 ? `Como salvar no celular (${INSTRUCTION_LABEL[k]})` : 'Como salvar no celular';
    const steps = INSTRUCTIONS[k]
      .map((step, i) => `<tr><td valign="top" style="padding:4px 10px 4px 0;"><span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;background:#00539C;color:#fff;font-size:12px;font-weight:700;text-align:center;">${i + 1}</span></td><td style="padding:4px 0;font-size:14px;color:#2D3748;line-height:1.5;">${richText(step)}</td></tr>`)
      .join('');
    return `<div style="font-size:15px;font-weight:700;color:#00539C;margin:0 0 8px;">${escapeHtml(title)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">${steps}</table>`;
  }).join('');
  return `<div style="background:#F0F6FC;border-radius:10px;padding:16px 18px;margin:8px 0 16px;">
    ${blocks}
    <div style="font-size:13px;color:#4A5568;">${escapeHtml(WALLET_FALLBACK)}</div>
  </div>`;
}

function airportHtml() {
  const items = AIRPORT_TIPS.map(t => `<li style="margin:0 0 6px;">${escapeHtml(t)}</li>`).join('');
  return `<div style="font-size:15px;font-weight:700;color:#00539C;margin:0 0 8px;">No aeroporto</div>
    <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;color:#2D3748;line-height:1.5;">${items}</ul>`;
}

function buildBoardingPassEmailHtml(group) {
  const pax = group.passengers;
  const first = pax.length === 1 ? firstNameOf(pax[0].name) : '';
  const greeting = first ? `Olá, ${first}` : 'Olá';
  const intro = allSegments(group).length > 1
    ? 'Seus cartões de embarque estão prontos. Toque no botão de cada trecho para salvá-los na carteira do celular.'
    : 'Seu cartão de embarque está pronto. Toque no botão abaixo para salvá-lo na carteira do celular.';
  const logoUrl = `cid:${AGENCY_LOGO_CID}`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartão de embarque</title></head>
<body style="margin:0;padding:0;background:#E2E8F0;font-family:Inter,Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#E2E8F0" style="background:#E2E8F0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#ffffff" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;">
        <tr><td bgcolor="#00539C" style="background:#00539C;padding:22px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" width="56" style="padding-right:14px;"><img src="${escapeHtml(logoUrl)}" alt="Clube do Voo" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:9999px;border:0;"></td>
            <td valign="middle" style="color:#fff;"><div style="font-size:19px;font-weight:700;">Clube do Voo Viagens</div><div style="font-size:13px;opacity:0.9;margin-top:3px;">Cartão de embarque</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 24px;">
          <div style="color:#00539C;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(greeting)}</div>
          <h2 style="font-size:24px;font-weight:700;color:#2D3748;margin:6px 0 8px;">Check-in realizado!</h2>
          <p style="font-size:14px;color:#4A5568;line-height:1.55;margin:0 0 20px;">${escapeHtml(intro)}</p>
          ${pax.map(passengerBlock).join('')}
          ${instructionsHtml(group)}
          ${airportHtml()}
          <div style="border-top:1px solid #E5E7EB;padding-top:18px;margin-top:20px;">
            <p style="color:#718096;font-size:13px;margin:0;">Boa viagem!</p>
            <p style="color:#718096;font-size:13px;margin:2px 0 0;">— Clube do Voo Viagens</p>
          </div>
        </td></tr>
        <tr><td align="center" bgcolor="#1A202C" style="background:#1A202C;padding:20px;color:#fff;">
          <a href="https://www.clubedovooviagens.com.br" style="color:#fff;text-decoration:none;font-size:13px;font-weight:600;">www.clubedovooviagens.com.br</a>
          <div style="font-size:11px;color:#9ca3af;font-style:italic;margin-top:6px;">E-mail automático — não responda diretamente.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendBoardingPassEmail({ to, bcc, group }) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return { sucesso: false, erro: 'Credenciais de e-mail não configuradas' };
    }
    const subject = buildSubject(group);
    const attachments = [];
    if (fs.existsSync(AGENCY_LOGO_PATH)) {
      attachments.push({ filename: 'logo.png', path: AGENCY_LOGO_PATH, cid: AGENCY_LOGO_CID, contentDisposition: 'inline' });
    }
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: to.join(', '),
      bcc: bcc || undefined,
      subject,
      html: buildBoardingPassEmailHtml(group),
      attachments
    });
    console.log(`[BOARDING-PASS] ✓ e-mail enviado para ${to.join(', ')} | MessageId: ${info.messageId}`);
    return { sucesso: true, messageId: info.messageId, subject };
  } catch (error) {
    console.error('[BOARDING-PASS] erro ao enviar e-mail:', error.message);
    return { sucesso: false, erro: error.message };
  }
}

module.exports = { buildBoardingPassEmailHtml, buildSubject, sendBoardingPassEmail };
