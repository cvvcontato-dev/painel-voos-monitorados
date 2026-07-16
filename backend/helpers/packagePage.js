// Página hospedada do pacote (/pacote/:token). CSS livre (não é e-mail).
// Reaproveita os cards de packageItemHtml + a timeline cronológica.
const { buildTimeline } = require('./packageBlocks');
const pkgHtml = require('./packageItemHtml');

async function renderPackagePage({ packageData, settings }) {
  const pkg = packageData || {};
  const s = settings || {};
  const blocks = buildTimeline(pkg);
  const title = pkg.title || 'Seu pacote de viagem';
  const holder = pkg.holder || '';
  const summary = pkgHtml.packageSummaryText(pkg);
  const period = pkgHtml.packagePeriod(blocks);
  const timelineHtml = blocks.map(b => pkgHtml.blockHtml(b)).join('');

  const contactPhone = s.contact_phone || '';
  const contactEmail = s.contact_email || '';
  const contactSite = s.contact_site || 'www.clubedovooviagens.com.br';
  const contactSiteHref = /^https?:\/\//i.test(contactSite) ? contactSite : `https://${contactSite}`;
  const e = pkgHtml.escapeHtml;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#eef1f5; font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif; color:#0e1726; }
  .shell { max-width:680px; margin:0 auto; padding:0 0 40px; }
  .header { background:#00539C; color:#fff; padding:28px 28px 24px; }
  .header .brand { font-size:13px; opacity:0.9; letter-spacing:1px; text-transform:uppercase; }
  .header h1 { font-size:26px; margin:8px 0 6px; font-weight:800; }
  .header .meta { font-size:13.5px; opacity:0.92; }
  .body { padding:24px 28px; }
  .body > div { margin-bottom:0; }
  .footer { text-align:center; padding:26px; color:#6c757d; font-size:13px; }
  .footer a { color:#00539C; text-decoration:none; }
  @media (max-width:520px){ .header, .body { padding-left:16px; padding-right:16px; } }
</style></head>
<body>
  <div class="shell">
    <div class="header">
      <div class="brand">Clube do Voo Viagens · Pacote de viagem</div>
      <h1>${e(title)}</h1>
      <div class="meta">${e([holder, period, summary].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="body">
      ${timelineHtml}
    </div>
    <div class="footer">
      ${contactPhone ? `<div><strong>WhatsApp:</strong> ${e(contactPhone)}</div>` : ''}
      ${contactEmail ? `<div><strong>E-mail:</strong> ${e(contactEmail)}</div>` : ''}
      <div style="margin-top:8px;"><a href="${e(contactSiteHref)}">${e(contactSite)}</a></div>
    </div>
  </div>
</body></html>`;
}

module.exports = { renderPackagePage };
