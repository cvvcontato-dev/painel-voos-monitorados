const { buildNoticeText, buildConfirmationText, buildChangeSummaryLines, buildWaLink, noticeClientMessage } = require('../helpers/flightChangeMessage');
const { diffVouchers } = require('../helpers/flightChangeDiff');

const trip = (o = {}) => ({
  direction: 'ida', dateLabel: '12 SET 2026', flightNumber: 'AD 4001',
  departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
  arrival: { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' }, ...o
});
const voucher = (o = {}) => ({
  reservation: { locator: 'ABC123' }, route: { origin: 'GRU', destination: 'REC' },
  passengers: [{ name: 'MARIA SILVA' }], trips: [trip()], ...o
});

test('buildWaLink: só dígitos, prefixo 55 e texto codificado', () => {
  expect(buildWaLink('(48) 99999-1234', 'Olá & tudo?')).toBe('https://wa.me/5548999991234?text=Ol%C3%A1%20%26%20tudo%3F');
  expect(buildWaLink('+55 48 99999-1234', 'a')).toBe('https://wa.me/5548999991234?text=a');
  expect(buildWaLink('', 'a')).toBeNull();
  expect(buildWaLink(null, 'a')).toBeNull();
});

test('aviso: nome, localizador, rota/data originais, sem horários e com link de suporte', () => {
  const t = buildNoticeText(voucher(), { supportPhone: '48999991234' });
  expect(t).toContain('Olá, *Maria*!');
  expect(t).toContain('*ABC123*');
  expect(t).toContain('GRU → REC');
  expect(t).toContain('12 SET 2026');
  expect(t).toContain('https://wa.me/5548999991234?text=');
  expect(t).not.toMatch(/\d{2}:\d{2}/);           // nenhum horário
});

test('aviso sem telefone de suporte omite o convite com link', () => {
  const t = buildNoticeText(voucher(), {});
  expect(t).not.toContain('wa.me');
  expect(t).toContain('Entraremos em contato pelo WhatsApp');
});

test('mensagem pré-preenchida do cliente leva nome e localizador', () => {
  const m = noticeClientMessage(voucher());
  expect(m).toContain('ABC123'); expect(m).toContain('Maria');
});

test('confirmação: só trechos alterados, antes → depois e nota do e-mail', () => {
  const novo = voucher({ trips: [trip({ departure: { airport: 'GRU', datetime: '2026-09-12T10:15:00-03:00' } }),
    trip({ direction: 'volta', flightNumber: 'AD 4002' })] });
  const antigo = voucher({ trips: [trip(), trip({ direction: 'volta', flightNumber: 'AD 4002' })] });
  const diff = diffVouchers(antigo, novo);
  const t = buildConfirmationText(novo, diff, { emailSent: true });
  expect(t).toContain('Seu voo foi reajustado ✅');
  expect(t).toContain('*Ida (GRU → REC)*');
  expect(t).toContain('Partida: 12/09/2026 08:30 → 12/09/2026 10:15');
  expect(t).not.toContain('Volta');                 // trecho igual omitido
  expect(t).toContain('Também enviamos o PDF por e-mail');
});

test('confirmação: trecho removido e localizador novo', () => {
  const antigo = voucher({ trips: [trip(), trip({ direction: 'volta' })] });
  const novo = voucher({ reservation: { locator: 'XYZ999' }, trips: [trip()] });
  const t = buildConfirmationText(novo, diffVouchers(antigo, novo), { emailSent: false });
  expect(t).toContain('Trecho cancelado');
  expect(t).toContain('Novo localizador: *XYZ999*');
  expect(t).toContain('Em instantes enviamos o novo voucher');
});

test('buildWaLink: 12–13 dígitos já com 55 ficam intactos; curto demais é null', () => {
  expect(buildWaLink('5548999991234', 'a')).toBe('https://wa.me/5548999991234?text=a');
  expect(buildWaLink('554832221234', 'a')).toBe('https://wa.me/554832221234?text=a');
  expect(buildWaLink('123456789', 'a')).toBeNull();
});

test('saudação sem passageiro não deixa asteriscos vazios; nome em caixa alta com acento', () => {
  expect(buildNoticeText(voucher({ passengers: [] }), {})).toContain('Olá! ✈️');
  expect(buildNoticeText(voucher({ passengers: [{ name: '' }] }), {})).not.toContain('**');
  expect(buildNoticeText(voucher({ passengers: [{ name: 'JOÃO PEREIRA' }] }), {})).toContain('Olá, *João*!');
});

test('aviso nunca contém horário, mesmo se dateLabel vier com hora', () => {
  const v = voucher({ trips: [trip({ dateLabel: '12 SET 2026 08:30' })] });
  expect(buildNoticeText(v, { supportPhone: '48999991234' })).not.toMatch(/\d{1,2}:\d{2}/);
});

test('confirmação: trecho alterado com direction multi e caracteres de formatação neutralizados', () => {
  const antigo = voucher({ trips: [trip({ direction: 'multi' })] });
  const novo = voucher({ reservation: { locator: 'A*B_C' }, passengers: [{ name: 'Ma*ria' }],
    trips: [trip({ direction: 'multi', flightNumber: 'AD 9999' })] });
  const t = buildConfirmationText(novo, diffVouchers(antigo, novo), {});
  expect(t).toContain('Reserva *AB_C*');
  expect(t).toContain('*Trecho (GRU → REC)*');
  expect(t).toContain('Voo: AD 4001 → AD 9999');
  expect(t).toContain('*AB_C*');
  expect(t).toContain('Olá, *Maria*!');
});

test('C1 buildWaLink: zeros iniciais, DDI estrangeiro e tamanhos 12/13', () => {
  expect(buildWaLink('048999991234', 'a')).toBe('https://wa.me/5548999991234?text=a');
  expect(buildWaLink('0 48 99999-1234', 'a')).toBe('https://wa.me/5548999991234?text=a');
  expect(buildWaLink('+1 305 555 1234', 'a')).toBeNull();
  expect(buildWaLink('554832221234', 'a')).toBe('https://wa.me/554832221234?text=a');
  // 12 dígitos começando com 55 passam como estão (normalizePhone não distingue DDD+8 de 55+DDD+8)
  expect(buildWaLink('554899991234', 'a')).toBe('https://wa.me/554899991234?text=a');
  expect(buildWaLink('', 'a')).toBeNull();
  expect(buildWaLink(null, 'a')).toBeNull();
});

test('I1 aviso com ida e volta cita rota completa e as duas datas', () => {
  const v = voucher({ trips: [trip(), trip({ direction: 'volta', dateLabel: '20 SET 2026',
    departure: { airport: 'REC' }, arrival: { airport: 'GRU' } })] });
  const t = buildNoticeText(v, {});
  expect(t).toContain('12 SET 2026 e 20 SET 2026');
  const sem = buildNoticeText({ ...v, route: undefined }, {});
  expect(sem).toContain('GRU → GRU');
  const tres = buildNoticeText(voucher({ trips: [trip(), trip({ dateLabel: '13 SET 2026' }), trip({ dateLabel: '14 SET 2026' })] }), {});
  expect(tres).toContain('12 SET 2026, 13 SET 2026, 14 SET 2026');
});

test('I2 dateLabel: extrai a data sem hora; rótulo fora do padrão é omitido', () => {
  const com = buildNoticeText(voucher({ trips: [trip({ dateLabel: '12 SET 2026 08:30' })] }), {});
  expect(com).toContain('(GRU → REC, 12 SET 2026)');
  const sem = buildNoticeText(voucher({ trips: [trip({ dateLabel: 'Hora 08:30' })] }), {});
  expect(sem).toContain('(GRU → REC)');
  expect(sem).not.toMatch(/\d{1,2}:\d{2}/);
});

test('I3 localizador preserva _; nome com _ vira espaço', () => {
  expect(buildNoticeText(voucher({ reservation: { locator: 'A_1' } }), {})).toContain('*A_1*');
  expect(buildNoticeText(voucher({ passengers: [{ name: 'ANA_MARIA' }] }), {})).toContain('Olá, *Ana*!');
});

test('I4 confirmação sem mudanças aponta para o novo voucher', () => {
  const v = voucher();
  const t = buildConfirmationText(v, diffVouchers(v, v), { emailSent: true });
  expect(t).toContain('Os detalhes estão no novo voucher.');
  const novo = voucher({ trips: [trip({ flightNumber: 'AD 1' })] });
  expect(buildConfirmationText(novo, diffVouchers(v, novo), {})).not.toContain('Os detalhes estão');
});

test('I5 saudação da confirmação usa 😊', () => {
  const t = buildConfirmationText(voucher(), diffVouchers(voucher(), voucher()), {});
  expect(t).toContain('Olá, *Maria*! 😊');
  expect(t).toContain('Seu voo foi reajustado ✅');
});

test('M4 mensagem do cliente sem travessão solto', () => {
  const m = noticeClientMessage(voucher({ reservation: {} }));
  expect(m).toBe('Olá! Recebi o aviso de alteração do meu voo. Maria.');
  expect(noticeClientMessage(voucher({ passengers: [] }))).toBe('Olá! Recebi o aviso de alteração do meu voo. Reserva ABC123.');
  expect(noticeClientMessage(voucher())).toBe('Olá! Recebi o aviso de alteração do meu voo. Reserva ABC123 — Maria.');
});

describe('link do voucher e resumo de mudanças', () => {
  const antigo = voucher({ trips: [trip(), trip({ direction: 'volta', flightNumber: 'AD 4002' })] });
  const novo = voucher({ reservation: { locator: 'XYZ999' }, trips: [trip({ departure: { airport: 'GRU', datetime: '2026-09-12T10:15:00-03:00' } }),
    trip({ direction: 'volta', flightNumber: 'AD 4002' })] });
  const diff = diffVouchers(antigo, novo);
  const URL = 'https://x.com/itinerario/abc.123.sig';

  test('com link: linha do voucher e URL na linha seguinte', () => {
    const t = buildConfirmationText(novo, diff, { voucherUrl: URL });
    const l = t.split('\n');
    expect(l[l.indexOf('Seu novo voucher já está disponível:') + 1]).toBe(URL);
    expect(t).not.toContain('Em instantes');
    expect(t).not.toContain('Também enviamos');
  });
  test('link + e-mail enviado', () => {
    const t = buildConfirmationText(novo, diff, { voucherUrl: URL, emailSent: true });
    expect(t).toContain(URL); expect(t).toContain('Também enviamos o PDF por e-mail 📧');
  });
  test('sem link e sem e-mail: "Em instantes"; só e-mail: sem linha do link', () => {
    expect(buildConfirmationText(novo, diff, {})).toContain('Em instantes enviamos o novo voucher.');
    const t = buildConfirmationText(novo, diff, { emailSent: true });
    expect(t).not.toContain('já está disponível');
  });
  test('buildChangeSummaryLines: texto puro, só mudanças, e confirmação a reutiliza', () => {
    const lines = buildChangeSummaryLines(diff);
    expect(lines).toEqual([
      'Novo localizador: XYZ999', '',
      'Ida (GRU → REC)', '• Partida: 12/09/2026 08:30 → 12/09/2026 10:15'
    ]);
    expect(lines.join('\n')).not.toContain('*');
    expect(buildChangeSummaryLines(diffVouchers(antigo, antigo))).toEqual([]);
    const t = buildConfirmationText(novo, diff, {});
    expect(t).toContain('Novo localizador: *XYZ999*\n\n*Ida (GRU → REC)*\n• Partida: 12/09/2026 08:30 → 12/09/2026 10:15');
  });
});
