const { buildNoticeText, buildConfirmationText, buildWaLink, noticeClientMessage } = require('../helpers/flightChangeMessage');
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
  expect(t).toContain('novo voucher por e-mail');
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
  expect(t).toContain('*Trecho (GRU → REC)*');
  expect(t).toContain('Voo: AD 4001 → AD 9999');
  expect(t).toContain('*ABC*');
  expect(t).toContain('Olá, *Maria*!');
});
