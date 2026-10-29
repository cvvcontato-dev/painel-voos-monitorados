// Mocka o Playwright para não abrir um browser real; captura a URL do goto e opções de launch.
let lastGotoUrl = null;
let lastLaunchOpts = null;
jest.mock('playwright', () => ({
  chromium: {
    launch: async (opts) => {
      lastLaunchOpts = opts;
      return {
      newContext: async () => ({
        addCookies: async () => {},
        newPage: async () => ({
          goto: async (url) => { lastGotoUrl = url; return { status: () => 200 }; },
          addStyleTag: async () => {},
          waitForSelector: async () => {},
          pdf: async () => {},
          screenshot: async () => {}
        })
      }),
      close: async () => {}
    };
    }
  }
}));

const { renderVoucher, renderPackageFlightPdf, renderPreviewToFile } = require('../services/voucherRenderer');

describe('voucherRenderer', () => {
  beforeEach(() => { lastGotoUrl = null; lastLaunchOpts = null; });

  test('launch do Chromium inclui headless e flags de container (--disable-dev-shm-usage, --disable-gpu)', async () => {
    await renderVoucher({ voucherId: 1, format: 'pdf', cookieHeader: 's=1', baseUrl: 'http://localhost:3000' });
    expect(lastLaunchOpts).toBeDefined();
    expect(lastLaunchOpts.headless).toBe(true);
    expect(lastLaunchOpts.args).toContain('--no-sandbox');
    expect(lastLaunchOpts.args).toContain('--disable-setuid-sandbox');
    expect(lastLaunchOpts.args).toContain('--disable-dev-shm-usage');
    expect(lastLaunchOpts.args).toContain('--disable-gpu');
  });

  test('renderVoucher navega para /voucher-preview/:id', async () => {
    const out = await renderVoucher({ voucherId: 42, format: 'pdf', cookieHeader: 'cvv.sid=x', baseUrl: 'http://localhost:3000' });
    expect(lastGotoUrl).toBe('http://localhost:3000/voucher-preview/42?export=1');
    expect(out).toMatch(/voucher-42-\d+\.pdf$/);
  });

  test('renderPackageFlightPdf navega para /voucher-preview/pacote/:id', async () => {
    const out = await renderPackageFlightPdf({ packageId: 7, cookieHeader: 'cvv.sid=x', baseUrl: 'http://localhost:3000' });
    expect(lastGotoUrl).toBe('http://localhost:3000/voucher-preview/pacote/7?export=1');
    expect(out).toMatch(/pacote-voo-7-\d+\.pdf$/);
  });

  test('renderPreviewToFile rejeita format inválido', async () => {
    await expect(renderPreviewToFile({ previewPath: '/x', outNameBase: 'y', format: 'gif', baseUrl: 'http://localhost:3000' }))
      .rejects.toThrow(/format/);
  });
});
