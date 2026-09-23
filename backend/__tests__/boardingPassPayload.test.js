const { validateSendPayload, normalizePhone } = require('../helpers/boardingPassPayload');
const { AZUL_RAW, AZUL_CLEAN, LATAM_RAW } = require('./fixtures/boardingPassLinks');

function body(overrides = {}) {
  return {
    passengers: [{ name: 'Maria Silva', email: 'Maria@X.com', phone: '(75) 99202-0012', segments: [{ url: AZUL_RAW }] }],
    emailMode: 'individual', whatsappMode: 'individual',
    ...overrides
  };
}

describe('normalizePhone', () => {
  test.each([
    ['(75) 99202-0012', '5575992020012'],
    ['7532020012', '557532020012'],
    ['+55 75 99202-0012', '5575992020012'],
    ['', null],
    ['123', undefined]
  ])('%s → %s', (input, out) => expect(normalizePhone(input)).toBe(out));
});

describe('validateSendPayload', () => {
  test('válido: normaliza e-mail/telefone e gera links limpos', () => {
    const r = validateSendPayload(body());
    expect(r.ok).toBe(true);
    expect(r.payload.passengers[0]).toEqual({
      name: 'Maria Silva', email: 'maria@x.com', phone: '5575992020012',
      segments: [{ url: AZUL_RAW, label: null }]
    });
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toMatchObject({ passengerIndex: 0, segmentIndex: 0, originalUrl: AZUL_RAW, cleanUrl: AZUL_CLEAN, carrier: 'azul', recognized: true });
    expect(r.flightDate).toBe('2026-09-24');
    expect(r.voucherId).toBeNull();
  });

  test('nome com uma palavra só → erro', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria', segments: [{ url: AZUL_RAW }] }] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/nome e sobrenome/);
  });

  test('formato "SOBRENOME, NOME" conta como 2 palavras', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'SILVA, MARIA', segments: [{ url: AZUL_RAW }] }] }));
    expect(r.ok).toBe(true);
  });

  test('passageiro sem nenhum link → erro; campos vazios são ignorados', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria Silva', segments: [{ url: '  ' }] }] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/pelo menos um link/);
  });

  test('link preenchido e inválido → erro', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria Silva', segments: [{ url: AZUL_RAW }, { url: 'lixo' }] }] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/trecho 2/);
  });

  test('segmentIndex é contínuo mesmo com campo vazio no meio', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria Silva', segments: [{ url: AZUL_RAW }, { url: '' }, { url: LATAM_RAW }] }] }));
    expect(r.ok).toBe(true);
    expect(r.links.map(l => l.segmentIndex)).toEqual([0, 1]);
  });

  test('e-mail e telefone inválidos → erro', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria Silva', email: 'x@', phone: '12', segments: [{ url: AZUL_RAW }] }] }));
    expect(r.errors.join()).toMatch(/e-mail inválido/);
    expect(r.errors.join()).toMatch(/WhatsApp inválido/);
  });

  test('modo single: exige e valida e-mail(s) e telefone únicos', () => {
    expect(validateSendPayload(body({ emailMode: 'single', singleEmail: '' })).ok).toBe(false);
    const r = validateSendPayload(body({ emailMode: 'single', singleEmail: 'A@x.com, b@y.com', whatsappMode: 'single', singlePhone: '75992020012' }));
    expect(r.ok).toBe(true);
    expect(r.payload.singleEmail).toBe('a@x.com, b@y.com');
    expect(r.payload.singlePhone).toBe('5575992020012');
  });

  test('0 ou mais de 9 passageiros → erro', () => {
    expect(validateSendPayload(body({ passengers: [] })).ok).toBe(false);
    const ten = Array.from({ length: 10 }, () => ({ name: 'Maria Silva', segments: [{ url: AZUL_RAW }] }));
    expect(validateSendPayload(body({ passengers: ten })).ok).toBe(false);
  });

  test('flightDate: usa data do JWT; senão a informada; voucherId numérico', () => {
    const r = validateSendPayload(body({
      passengers: [{ name: 'Maria Silva', segments: [{ url: LATAM_RAW }] }],
      flightDate: '2026-10-01', voucherId: '12'
    }));
    expect(r.flightDate).toBe('2026-10-01');
    expect(r.voucherId).toBe(12);
  });
});
