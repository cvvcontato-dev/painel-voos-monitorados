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

// Ícone sólido (Material) de café para o bloco de regime.
const COFFEE_ICON = '<svg class="icon" viewBox="0 0 24 24"><path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.9 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/></svg>';

function fillTemplate(p, backgroundUrl) {
  let html = fs.readFileSync(TEMPLATE, 'utf8');
  // Linhas com HTML: rótulo/nome em <b>, restante regular (esc só nos valores dinâmicos).
  const flightDetail = `${esc(p.flight_type || 'Direto')}${p.airlines?.length ? ' - ' + esc(p.airlines.join('/')) : ''}${esc(baggageLabel(p.baggage))}`;
  const flightLineHtml = `<b>Voo</b> (${flightDetail})`;

  // Linha do hotel: nome em negrito + "(3 estrelas, Muito bom 8.1, Cidade)" regular; sem "null".
  const hotelDet = [];
  if (p.hotel_stars) hotelDet.push(`${esc(p.hotel_stars)} estrelas`);
  if (p.hotel_rating_value) hotelDet.push(`${p.hotel_rating_text ? esc(p.hotel_rating_text) + ' ' : ''}${esc(p.hotel_rating_value)}`);
  if (p.destination_city) hotelDet.push(esc(p.destination_city));
  const hotelLineHtml = p.hotel_name
    ? `<b>${esc(p.hotel_name)}</b>${hotelDet.length ? ` (${hotelDet.join(', ')})` : ''}`
    : (hotelDet.length ? `(${hotelDet.join(', ')})` : '');

  // Linha de regime só aparece quando há meal_plan (evita ícone solto com texto vazio).
  const mealBlock = p.meal_plan
    ? `<div class="line">${COFFEE_ICON}<div class="txt"><b>${esc(p.meal_plan)}</b></div></div>`
    : '';
  const tokens = {
    BG_CSS: backgroundCss(backgroundUrl),
    LOGO_URL: logoDataUrl(),
    ORIGIN_CITY: esc((p.origin_city || '').toUpperCase()),
    DESTINATION: esc((p.destination_city || '').toUpperCase()),
    META_LINE: esc(`${p.nights} NOITES | ${(p.display_availability || '').toUpperCase()} | ${p.passengers || 2} PESSOAS`),
    FLIGHT_LINE: flightLineHtml,
    HOTEL_LINE: hotelLineHtml,
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

    // Auto-fit do título: reduz a fonte até que nenhuma palavra ultrapasse a
    // largura do card (evita quebra no meio da palavra) e o bloco caiba na
    // altura reservada (evita empurrar o restante do layout). Nomes curtos
    // como "ARUBA" continuam em 118px; compostos/longos como
    // "FERNANDO DE NORONHA" ou "FLORIANÓPOLIS" encolhem o suficiente.
    await page.evaluate(() => {
      const el = document.querySelector('.dest');
      if (!el) return;
      const MAX = 118, MIN = 46, MAX_HEIGHT = 360, STEP = 2;
      let size = MAX;
      el.style.fontSize = size + 'px';
      const fits = () => el.scrollWidth <= el.clientWidth && el.offsetHeight <= MAX_HEIGHT;
      while (size > MIN && !fits()) {
        size -= STEP;
        el.style.fontSize = size + 'px';
      }
    });

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
