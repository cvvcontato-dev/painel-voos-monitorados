const { chromium } = require('playwright');
const path = require('path');
const { exportsDir } = require('../helpers/voucherWorkspace');

const WATERMARK_CSS = `
  html, body { background: #ffffff !important; margin: 0 !important; }
  body::after {
    content: "Documento gerado pela Clube do Voo Viagens. Não substitui o voucher oficial da companhia aérea.";
    position: fixed; bottom: 8px; left: 0; right: 0;
    text-align: center; font-size: 9px; color: #666; font-family: Arial, sans-serif;
  }
`;

async function renderVoucher({ voucherId, format, cookieHeader, baseUrl }) {
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
    const response = await page.goto(`${baseUrl}/voucher-preview/${voucherId}?export=1`, { waitUntil: 'networkidle' });
    if (!response || response.status() >= 400) {
      throw new Error(`preview HTTP ${response ? response.status() : 'no-response'}`);
    }
    await page.addStyleTag({ content: WATERMARK_CSS });
    await page.waitForSelector('[data-voucher-ready]', { timeout: 10000 });

    const outName = `voucher-${voucherId}-${Date.now()}.${format}`;
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

module.exports = { renderVoucher };
