const { chromium } = require('playwright');
const path = require('path');
const { exportsDir } = require('../helpers/voucherWorkspace');

// Apenas força fundo branco no export (o disclaimer agora é um elemento normal
// no rodapé de cada template, então não precisa mais ser injetado aqui).
const WATERMARK_CSS = `
  html, body { background: #ffffff !important; margin: 0 !important; }
`;

// Núcleo compartilhado: sobe o Playwright, autentica via cookie de sessão,
// navega para uma rota de preview (parametrizável) e captura PDF/PNG.
async function renderPreviewToFile({ previewPath, outNameBase, format, cookieHeader, baseUrl }) {
  // Em produção (Docker) usamos o Chromium do sistema apontado por env;
  // em dev, Playwright cai pro browser baixado dele mesmo.
  const launchOpts = {};
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  // Em container sem privilégios elevados, --no-sandbox é necessário.
  launchOpts.args = ['--no-sandbox', '--disable-setuid-sandbox'];
  const browser = await chromium.launch(launchOpts);
  try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1200 }, colorScheme: 'light' });
    if (cookieHeader) {
      const url = new URL(baseUrl);
      const isHttps = url.protocol === 'https:';
      const cookies = cookieHeader.split(';').map(c => {
        const [name, ...rest] = c.trim().split('=');
        return {
          name,
          value: rest.join('='),
          domain: url.hostname,
          path: '/',
          secure: isHttps,
          sameSite: 'Lax',
          httpOnly: true
        };
      }).filter(c => c.name);
      await context.addCookies(cookies);
    }
    const page = await context.newPage();
    const response = await page.goto(`${baseUrl}${previewPath}?export=1`, { waitUntil: 'networkidle' });
    if (!response || response.status() >= 400) {
      throw new Error(`preview HTTP ${response ? response.status() : 'no-response'}`);
    }
    await page.addStyleTag({ content: WATERMARK_CSS });
    await page.waitForSelector('[data-voucher-ready]', { timeout: 10000 });

    const outName = `${outNameBase}-${Date.now()}.${format}`;
    const outPath = path.join(exportsDir(), outName);
    if (format === 'pdf') {
      await page.pdf({ path: outPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    } else if (format === 'png') {
      await page.screenshot({ path: outPath, fullPage: true });
    } else {
      throw new Error('format deve ser pdf ou png');
    }
    return outPath;
  } finally {
    await browser.close();
  }
}

// Voucher de voo por id (tabela vouchers) — comportamento original preservado.
async function renderVoucher({ voucherId, format, cookieHeader, baseUrl }) {
  return renderPreviewToFile({
    previewPath: `/voucher-preview/${voucherId}`,
    outNameBase: `voucher-${voucherId}`,
    format, cookieHeader, baseUrl
  });
}

// PDF do voucher de voo de um PACOTE — renderiza a partir de packages.package_json.flights
// via a rota de preview escopada por pacote (frontend lê o pacote e usa o template de voo).
async function renderPackageFlightPdf({ packageId, cookieHeader, baseUrl }) {
  return renderPreviewToFile({
    previewPath: `/voucher-preview/pacote/${packageId}`,
    outNameBase: `pacote-voo-${packageId}`,
    format: 'pdf', cookieHeader, baseUrl
  });
}

module.exports = { renderVoucher, renderPreviewToFile, renderPackageFlightPdf };
