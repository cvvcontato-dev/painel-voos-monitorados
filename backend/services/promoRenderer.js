const fs = require('fs');
const path = require('path');
const ws = require('../helpers/promoWorkspace');
const { stripInternal } = require('./promoValidator');
const { brl } = require('./whatsappMessage');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'promo-art.html');
// Logo dentro de backend/static para ser empacotada no container (o Dockerfile copia backend/).
const LOGO = path.join(__dirname, '..', 'static', 'logo.png');
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
  // Linha do hotel: "Nome (3 estrelas, Muito bom 8.1, Cidade)" — sem expor "null" quando vazio.
  const hotelDet = [];
  if (p.hotel_stars) hotelDet.push(`${p.hotel_stars} estrelas`);
  if (p.hotel_rating_value) hotelDet.push(`${p.hotel_rating_text ? p.hotel_rating_text + ' ' : ''}${p.hotel_rating_value}`);
  if (p.destination_city) hotelDet.push(p.destination_city);
  const hotelLine = `${p.hotel_name || ''}${hotelDet.length ? ` (${hotelDet.join(', ')})` : ''}`.trim();
  // Linha de regime só aparece quando há meal_plan (evita ícone solto com texto vazio).
  const mealBlock = p.meal_plan
    ? `<div class="line"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h12z"/><path d="M16 11h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2"/></svg><div class="txt">${esc(p.meal_plan)}</div></div>`
    : '';
  const tokens = {
    BG_CSS: backgroundCss(backgroundUrl),
    LOGO_URL: logoDataUrl(),
    ORIGIN_CITY: esc((p.origin_city || '').toUpperCase()),
    DESTINATION: esc((p.destination_city || '').toUpperCase()),
    META_LINE: esc(`${p.nights} NOITES | ${(p.display_availability || '').toUpperCase()} | ${p.passengers || 2} PESSOAS`),
    FLIGHT_LINE: esc(flightLine),
    HOTEL_LINE: esc(hotelLine),
    MEAL_BLOCK: mealBlock,
    PRICE_LABEL: `POR APENAS ${p.installments || 10}X S/ JUROS DE`,
    PRICE: brl(p.installment_amount),
    PRICE_SUB: `VALOR TOTAL PARA ${p.passengers || 2} PESSOAS`,
    // O botão da arte é fixo "Reserve agora" (padrão dos modelos); o cta_text vai só na mensagem.
    CTA: 'Reserve agora'
  };
  for (const [k, v] of Object.entries(tokens)) html = html.replaceAll(`{{${k}}}`, v);
  return html;
}

// Resolve o CSS do fundo. URLs http(s) (ex.: Pexels) são carregadas pelo Chromium;
// caminhos locais /static/promo-backgrounds/* não resolvem em setContent (sem origem),
// então são inlined como data URL a partir do disco.
function backgroundCss(backgroundUrl) {
  if (!backgroundUrl) return 'none';
  if (/^https?:\/\//i.test(backgroundUrl)) return `url('${backgroundUrl}')`;
  const m = backgroundUrl.match(/\/static\/promo-backgrounds\/([^/?#]+)$/);
  if (m) {
    const file = path.join(__dirname, '..', 'static', 'promo-backgrounds', m[1]);
    try {
      const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
      const b64 = fs.readFileSync(file).toString('base64');
      return `url('data:image/${ext};base64,${b64}')`;
    } catch (e) { return 'none'; }
  }
  return 'none';
}

async function renderImage(promo_id, rawPromo, { backgroundUrl } = {}) {
  const p = stripInternal(rawPromo);
  const html = fillTemplate(p, backgroundUrl);
  const { chromium } = require('playwright');
  // Mesmo padrão de launch do flightScraper: usa o Chromium do sistema em produção
  // (Docker define PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD),
  // e os args --no-sandbox são necessários ao rodar como root no container.
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
  };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const browser = await chromium.launch(launchOptions);
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

module.exports = { renderImage, fillTemplate, backgroundCss, W, H };
