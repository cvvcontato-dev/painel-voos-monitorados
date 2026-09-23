const { parseBoardingPassLink, decodeGoogleWalletJwt, isAllowedHost } = require('../helpers/boardingPassLink');
const { AZUL_CLEAN, AZUL_RAW, AZUL_RAW_ENCODED, LATAM_RAW, LATAM_CLEAN } = require('./fixtures/boardingPassLinks');

describe('parseBoardingPassLink', () => {
  test('Azul: extrai exatamente o trecho entre continue= e &followup=', () => {
    const r = parseBoardingPassLink(AZUL_RAW);
    expect(r.ok).toBe(true);
    expect(r.cleanUrl).toBe(AZUL_CLEAN);
    expect(r.recognized).toBe(true);
    expect(r.carrier).toBe('azul');
  });

  test('Azul: lê voo, data, trecho e localizador do JWT', () => {
    const r = parseBoardingPassLink(AZUL_RAW);
    expect(r.data).toEqual({
      carrierCode: 'AD', flightNumber: 'AD2730', date: '2026-09-24',
      origin: 'SSA', destination: 'REC', locator: 'RNWDKT'
    });
  });

  test('Azul percent-encoded também é limpo', () => {
    expect(parseBoardingPassLink(AZUL_RAW_ENCODED).cleanUrl).toBe(AZUL_CLEAN);
  });

  test('link pay.google.com colado direto já é considerado limpo', () => {
    const r = parseBoardingPassLink(`  ${AZUL_CLEAN}  `);
    expect(r.cleanUrl).toBe(AZUL_CLEAN);
    expect(r.recognized).toBe(true);
  });

  test('Latam: remove utm_* e messageId, preserva o resto na ordem', () => {
    const r = parseBoardingPassLink(LATAM_RAW);
    expect(r.ok).toBe(true);
    expect(r.cleanUrl).toBe(LATAM_CLEAN);
    expect(r.carrier).toBe('latam');
    expect(r.data).toEqual({ orderId: 'LA9573044YXJW', lastName: 'Carneiro', segmentIndex: 0 });
  });

  test('URL desconhecida: aceita como está, não reconhecida', () => {
    const r = parseBoardingPassLink('https://exemplo.com/cartao?x=1');
    expect(r).toEqual({ ok: true, cleanUrl: 'https://exemplo.com/cartao?x=1', carrier: null, recognized: false, data: null });
  });

  test('texto que não é URL → erro', () => {
    expect(parseBoardingPassLink('isso não é link').ok).toBe(false);
    expect(parseBoardingPassLink('').ok).toBe(false);
  });

  test('accounts.google.com sem continue= → erro', () => {
    const r = parseBoardingPassLink('https://accounts.google.com/v3/signin/identifier?osid=1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/continue/);
  });
});

describe('decodeGoogleWalletJwt', () => {
  test('JWT corrompido → null, sem lançar', () => {
    expect(decodeGoogleWalletJwt('https://pay.google.com/gp/v/save/abc.%%%.def')).toBeNull();
    expect(decodeGoogleWalletJwt('https://pay.google.com/gp/v/save/')).toBeNull();
  });
});

describe('isAllowedHost', () => {
  test.each([
    ['https://pay.google.com/gp/v/save/x', true],
    ['https://www.latamairlines.com/br/pt/boarding-pass', true],
    ['https://b2c.voegol.com.br/x', true],
    ['https://www.voeazul.com.br/x', true],
    ['https://evil.com/?pay.google.com', false],
    ['https://pay.google.com.evil.com/x', false],
    ['javascript:alert(1)', false]
  ])('%s → %s', (url, expected) => {
    expect(isAllowedHost(url)).toBe(expected);
  });
});
