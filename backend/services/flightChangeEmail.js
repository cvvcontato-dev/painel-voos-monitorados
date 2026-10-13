const fs = require('fs');
const { transporter, AGENCY_LOGO_PATH, AGENCY_LOGO_CID } = require('./notifier');
const { firstNameOf } = require('../helpers/voucherCarrier');
const { buildWaLink, noticeClientMessage, noticeDetail } = require('../helpers/flightChangeMessage');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const SUBJECT = 'Importante: houve uma alteração no seu voo ✈️';

function buildNoticeEmailHtml(v, { supportPhone } = {}) {
  const nome = firstNameOf(v?.passengers?.[0]?.name);
  const loc = v?.reservation?.locator;
  const detalhe = noticeDetail(v);
  const link = buildWaLink(supportPhone, noticeClientMessage(v));
  const botao = link ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr>
      <td bgcolor="#25D366" style="background:#25D366;border-radius:8px;">
        <a href="${esc(link)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">Falar com a gente no WhatsApp</a>
      </td></tr></table>` : '';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alteração no seu voo</title></head>
<body style="margin:0;padding:0;background:#E2E8F0;font-family:Inter,Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#E2E8F0" style="background:#E2E8F0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#ffffff" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;">
        <tr><td bgcolor="#00539C" style="background:#00539C;padding:22px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" width="56" style="padding-right:14px;"><img src="cid:${esc(AGENCY_LOGO_CID)}" alt="Clube do Voo" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:9999px;border:0;"></td>
            <td valign="middle" style="color:#fff;"><div style="font-size:19px;font-weight:700;">Clube do Voo Viagens</div><div style="font-size:13px;opacity:0.9;margin-top:3px;">Aviso sobre o seu voo</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 24px;">
          <div style="color:#00539C;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Olá${nome ? `, ${esc(nome)}` : ''}</div>
          <h2 style="font-size:24px;font-weight:700;color:#2D3748;margin:6px 0 10px;">Houve uma alteração no seu voo</h2>
          <p style="font-size:15px;color:#4A5568;line-height:1.55;margin:0 0 8px;">A companhia aérea fez uma alteração no seu voo${loc ? ` da reserva <strong>${esc(loc)}</strong>` : ''}${detalhe ? ` (${esc(detalhe)})` : ''}.</p>
          <p style="font-size:15px;color:#4A5568;line-height:1.55;margin:0;">Entraremos em contato pelo WhatsApp com os detalhes${link ? '. Se preferir, é só nos chamar pelo botão abaixo:' : '.'}</p>
          ${botao}
          <div style="border-top:1px solid #E5E7EB;padding-top:18px;margin-top:20px;">
            <p style="color:#718096;font-size:13px;margin:0;">— Clube do Voo Viagens</p>
          </div>
        </td></tr>
        <tr><td align="center" bgcolor="#1A202C" style="background:#1A202C;padding:20px;color:#fff;">
          <a href="https://www.clubedovooviagens.com.br" style="color:#fff;text-decoration:none;font-size:13px;font-weight:600;">www.clubedovooviagens.com.br</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendNoticeEmail({ to, bcc, voucher, supportPhone }) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return { sucesso: false, erro: 'Credenciais de e-mail não configuradas' };
    }
    const attachments = [];
    if (fs.existsSync(AGENCY_LOGO_PATH)) {
      attachments.push({ filename: 'logo.png', path: AGENCY_LOGO_PATH, cid: AGENCY_LOGO_CID, contentDisposition: 'inline' });
    }
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: to.join(', '), bcc: bcc || undefined,
      subject: SUBJECT, html: buildNoticeEmailHtml(voucher, { supportPhone }), attachments
    });
    return { sucesso: true, messageId: info.messageId, subject: SUBJECT };
  } catch (error) {
    console.error('[FLIGHT-CHANGE] erro ao enviar aviso:', error.message);
    return { sucesso: false, erro: error.message };
  }
}

module.exports = { buildNoticeEmailHtml, sendNoticeEmail, SUBJECT };
