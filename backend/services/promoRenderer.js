const fs = require('fs');
const path = require('path');
const ws = require('../helpers/promoWorkspace');
const { stripInternal } = require('./promoValidator');
const { brl } = require('./whatsappMessage');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'promo-art.html');
const LOGO = path.join(__dirname, '..', '..', 'Logo.png');
const W = 1080, H = 1620;

function logoDataUrl() {
  try { return 'data:image/png;base64,' + fs.readFileSync(LOGO).toString('base64'); }
  catch (e) { return ''; }
}

function baggageLabel(b = []) {
  const parts = [];
  if (b.includes('carry_on')) parts.push('bagagem de mão');
  if (b.includes('checked')) parts.push('bagagem despachada');
  return parts.length ? ' - Incluso ' + parts.join(' + ') : '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fillTemplate(p, backgroundUrl) {
  let html = fs.readFileSync(TEMPLATE, 'utf8');
  const flightLine = `Voo (${p.flight_type || 'Direto'}${p.airlines?.length ? ' - ' + p.airlines.join('/') : ''}${baggageLabel(p.baggage)})`;
  const hotelLine = `${p.hotel_name}${p.hotel_stars ? ` (${p.hotel_stars} estrelas` : ''}${p.hotel_rating_value ? `, ${p.hotel_rating_text || ''} ${p.hotel_rating_value})` : p.hotel_stars ? ')' : ''}`;
  const tokens = {
    BG_CSS: backgroundUrl ? `url('${backgroundUrl}')` : 'none',
    LOGO_URL: logoDataUrl(),
    ORIGIN_CITY: esc((p.origin_city || '').toUpperCase()),
    DESTINATION: esc((p.destination_city || '').toUpperCase()),
    META_LINE: esc(`${p.nights} NOITES | ${(p.display_availability || '').toUpperCase()} | ${p.passengers || 2} PESSOAS`),
    FLIGHT_LINE: esc(flightLine),
    HOTEL_LINE: esc(hotelLine),
    MEAL_PLAN: esc(p.meal_plan || ''),
    PRICE_LABEL: `POR APENAS ${p.installments || 10}X S/ JUROS DE`,
    PRICE: brl(p.installment_amount),
    PRICE_SUB: `VALOR TOTAL PARA ${p.passengers || 2} PESSOAS`,
    CTA: esc(p.cta_text || 'Reserve agora')
  };
  for (const [k, v] of Object.entries(tokens)) html = html.replaceAll(`{{${k}}}`, v);
  return html;
}

async function renderImage(promo_id, rawPromo, { backgroundUrl } = {}) {
  const p = stripInternal(rawPromo);
  const html = fillTemplate(p, backgroundUrl);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    const outPath = ws.resolveFile(promo_id, 'promocao_final.png');
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: W, height: H } });
    return {
      image_url: ws.publicUrl(promo_id, 'promocao_final.png'),
      image_width: W, image_height: H,
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    };
  } finally {
    await browser.close();
  }
}

module.exports = { renderImage, fillTemplate, W, H };
