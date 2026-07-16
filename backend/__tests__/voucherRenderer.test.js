// Mocka o Playwright para não abrir um browser real; captura a URL do goto.
let lastGotoUrl = null;
jest.mock('playwright', () => ({
  chromium: {
    launch: async () => ({
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
    })
  }
}));

const { renderVoucher, renderPackageFlightPdf, renderPreviewToFile } = require('../services/voucherRenderer');

describe('voucherRenderer', () => {
  beforeEach(() => { lastGotoUrl = null; });

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
