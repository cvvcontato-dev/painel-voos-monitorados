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

describe('SVG dos QR Codes é bem formado', () => {
  const multi = () => voucher({
    trips: [
      { direction: 'ida', flightNumber: 'AD4050', locator: 'AAA111', departure: { airport: 'VCP', datetime: '2026-09-12T08:30:00-03:00' }, arrival: { airport: 'REC', datetime: '2026-09-12T11:30:00-03:00' } },
      { direction: 'volta', flightNumber: 'AD4051', locator: 'BBB222', departure: { airport: 'REC', datetime: '2026-09-20T08:30:00-03:00' }, arrival: { airport: 'VCP', datetime: '2026-09-20T11:30:00-03:00' } }
    ]
  });
  const svgsOf = (html) => html.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[\s\S]*?<\/svg>/g) || [];
  const qrSvgsOf = (html) => svgsOf(html).filter(s => s.includes('shape-rendering'));

  test.each([['reservas múltiplas + assistência', multi, 3], ['reserva única (só assistência + check-in)', () => voucher(), 2]])('%s', async (_n, mk, esperado) => {
    const html = await renderItinerarioPage({ voucherData: mk(), settings: { contact_phone: '11912345678' } });
    const qrs = qrSvgsOf(html);
    expect(qrs.length).toBeGreaterThanOrEqual(esperado - 1);
    // assistência: 1 QR no <a> com aria-label; reservas: 1 por grupo
    expect(html).toMatch(/aria-label="Falar com a Clube do Voo pelo WhatsApp"[^>]*>\s*<div[^>]*>\s*<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="110" height="110" viewBox=/);
    for (const s of qrs) {
      expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox=')).toBe(true);
      expect(s).not.toContain('<svg <');
      expect(s).not.toContain('<?xml');
      expect((s.match(/<svg/g) || []).length).toBe(1);
      expect((s.match(/<\/svg>/g) || []).length).toBe(1);
      expect(s).toMatch(/<svg [^<>]*>/);            // tag de abertura íntegra
      expect(s).not.toMatch(/width="d\+?"/);
    }
  });

  test('QR por reserva e de assistência usam o mesmo gerador (ambos com xml removido e 110x110)', async () => {
    spy.mockRestore();
    const orig = QRCode.toString;
    spy = jest.spyOn(QRCode, 'toString').mockImplementation(async (t, o) =>
      `<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" width="999" height="999" viewBox="0 0 5 5"><path d="M0 0"/></svg>`);
    const html = await renderItinerarioPage({ voucherData: multi(), settings: { contact_phone: '11912345678' } });
    expect(html).not.toContain('<?');
    expect(html).not.toContain('width="999"');
    expect((html.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="110" height="110" viewBox="0 0 5 5">/g) || []).length).toBe(3);
    void orig;
  });
});

describe('variante de voo reajustado', () => {
  test('padrão (sem flag): exibe Confirmação de reserva e Sua viagem está pronta', async () => {
    const html = await renderItinerarioPage({ voucherData: voucher(), settings: {} });
    expect(html).toContain('Reserva confirmada');
    expect(html).toContain('Confirmação de reserva');
    expect(html).toContain('Sua viagem está pronta.');
    expect(html).not.toContain('Voo reajustado');
    expect(html).not.toContain('Seu voo foi reajustado');
  });

  test('com isFlightChange=true: exibe Voo reajustado e texto específico', async () => {
    const html = await renderItinerarioPage({ voucherData: voucher(), settings: {}, isFlightChange: true });
    expect(html).toContain('Voo reajustado');
    expect(html).toContain('Seu voo foi reajustado; veja abaixo o voucher atualizado.');
    expect(html).not.toContain('Reserva confirmada');
    expect(html).not.toContain('Confirmação de reserva');
    expect(html).not.toContain('Sua viagem está pronta.');
  });

  test('com variant=flight_change: exibe Voo reajustado', async () => {
    const html = await renderItinerarioPage({ voucherData: voucher(), settings: {}, variant: 'flight_change' });
    expect(html).toContain('Voo reajustado');
    expect(html).toContain('Seu voo foi reajustado; veja abaixo o voucher atualizado.');
  });
});
