const QRCode = require('qrcode');
const { renderItinerarioPage } = require('../helpers/itinerarioPage');

const voucher = (over = {}) => ({
  carrier: 'azul',
  reservation: { locator: 'ABC123' },
  passengers: [{ name: 'SILVA, MAYARA' }],
  route: { origin: 'VCP', destination: 'REC' },
  trips: [{
    direction: 'ida', flightNumber: 'AD4050', locator: 'ABC123',
    departure: { airport: 'VCP', datetime: '2026-09-12T08:30:00-03:00' },
    arrival: { airport: 'REC', datetime: '2026-09-12T11:30:00-03:00' }
  }],
  ...over
});

let spy;
const encoded = () => spy.mock.calls.map(c => c[0]);
beforeEach(() => { spy = jest.spyOn(QRCode, 'toString'); });
afterEach(() => spy.mockRestore());

describe('QR de assistência', () => {
  test('com telefone válido: QR codifica o wa.me da agência com localizador e primeiro nome', async () => {
    const html = await renderItinerarioPage({ voucherData: voucher(), settings: { contact_phone: '(11) 91234-5678' } });
    const waText = 'Olá! Preciso de ajuda com a minha reserva ABC123 (Mayara).';
    const target = `https://wa.me/5511912345678?text=${encodeURIComponent(waText)}`;
    expect(encoded()).toContain(target);
    // o <a> envolve o SVG do QR de assistência
    const m = /<a href="([^"]+)" target="_blank" rel="noopener noreferrer" aria-label="Falar com a Clube do Voo pelo WhatsApp"[^>]*>\s*<div[^>]*>\s*<svg/.exec(html);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(target);
    expect(html).toContain('escaneie ou toque no QR para falar conosco no WhatsApp');
  });

  test('o QR de assistência não é o link da companhia (que segue no check-in)', async () => {
    const html = await renderItinerarioPage({ voucherData: voucher(), settings: { contact_phone: '11912345678' } });
    const calls = encoded();
    const company = calls.find(t => !t.startsWith('https://wa.me/'));
    expect(company).toBeTruthy(); // QR por reserva continua apontando para a companhia
    const assist = /aria-label="Falar com a Clube do Voo pelo WhatsApp"/.exec(html);
    expect(assist).not.toBeNull();
    const href = /<a href="([^"]+)"[^>]*aria-label="Falar/.exec(html)[1];
    expect(href).not.toBe(company);
    expect(href.startsWith('https://wa.me/')).toBe(true);
  });

  test('sem telefone válido: fallback para o site da agência, nunca a companhia', async () => {
    const html = await renderItinerarioPage({ voucherData: voucher(), settings: { contact_phone: '123', contact_site: 'agencia.example' } });
    const href = /<a href="([^"]+)"[^>]*aria-label="Abrir o site da Clube do Voo"/.exec(html)[1];
    expect(href).toBe('https://agencia.example');
    expect(encoded()).toContain('https://agencia.example');
    expect(html).not.toContain('escaneie ou toque no QR para falar conosco no WhatsApp');
  });

  test('mensagem omite partes vazias (sem nome de passageiro)', async () => {
    await renderItinerarioPage({ voucherData: voucher({ passengers: [] }), settings: { contact_phone: '11912345678' } });
    const wa = encoded().find(t => t.startsWith('https://wa.me/'));
    expect(decodeURIComponent(wa.split('?text=')[1])).toBe('Olá! Preciso de ajuda com a minha reserva ABC123.');
  });

  test('escapa HTML no href (localizador malicioso)', async () => {
    const html = await renderItinerarioPage({
      voucherData: voucher({ reservation: { locator: '"><script>x</script>' } }),
      settings: { contact_phone: '11912345678' }
    });
    expect(html).not.toContain('"><script>x</script>');
    expect(html).not.toMatch(/<script>x<\/script>/);
  });
});
