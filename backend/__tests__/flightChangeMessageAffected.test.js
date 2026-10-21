const { buildNoticeText, buildConfirmationText, noticeClientMessage, noticeDetail } = require('../helpers/flightChangeMessage');
const { diffVouchers } = require('../helpers/flightChangeDiff');
const { mergeNewFlights } = require('../helpers/flightChangeMerge');
const { buildNoticeEmailHtml } = require('../services/flightChangeEmail');
const F = require('./fixtures/flightChangeCombined');

const clone = (o) => JSON.parse(JSON.stringify(o));
const PHONE = '48999991234';
const linkText = (t) => decodeURIComponent(/text=(\S+)/.exec(t)[1]);

describe('aviso só dos trechos afetados', () => {
  test('só a volta: cita volta, reserva e rota/data dela; nada da ida', () => {
    const t = buildNoticeText(F.combinado(), { supportPhone: PHONE, affected: [1] });
    expect(t).toContain('A companhia aérea fez uma alteração no seu voo de *volta* da reserva *XYZ789* (REC → GRU, 19 SET 2026).');
    expect(t).not.toContain('ABC123');
    expect(t).not.toContain('12 SET');
    expect(t).not.toMatch(/\d{2}:\d{2}/);
    expect(t).toContain('Olá, *Joao*!');
    expect(linkText(t)).toContain('Reserva XYZ789');
    expect(linkText(t)).not.toContain('ABC123');
  });

  test('só a ida: cita a reserva da ida', () => {
    const t = buildNoticeText(F.combinado(), { supportPhone: PHONE, affected: [0] });
    expect(t).toContain('no seu voo de *ida* da reserva *ABC123* (GRU → REC, 12 SET 2026).');
    expect(t).not.toContain('XYZ789');
  });

  test('duas reservas afetadas: lista curta por reserva e mensagem do cliente com as duas', () => {
    const t = buildNoticeText(F.combinado3(), { supportPhone: PHONE, affected: [0, 2] });
    expect(t).toContain('no seu voo de *ida* da reserva *ABC123* (GRU → REC, 12 SET 2026) e no voo de *volta* da reserva *XYZ789* (REC → GRU, 19 SET 2026).');
    expect(t).not.toContain('INT111');
    expect(linkText(t)).toContain('Reservas ABC123 e XYZ789');
  });

  test('três reservas: vírgulas e "e no" antes da última', () => {
    const v = F.combinado3();
    v.trips.push({ ...clone(v.trips[2]), direction: 'volta', locator: 'EXT222', departure: { airport: 'GRU', datetime: '2026-09-20T10:00:00-03:00' }, arrival: { airport: 'CWB', datetime: '2026-09-20T11:00:00-03:00' }, dateLabel: '20 SET 2026' });
    const t = buildNoticeText(v, { affected: [0, 1, 3] });
    expect(t).toContain('no seu voo de *ida* da reserva *ABC123* (GRU → REC, 12 SET 2026), no trecho interno da reserva *INT111* (REC → FOR, 14 SET 2026) e no voo de *volta* da reserva *EXT222* (GRU → CWB, 20 SET 2026).');
  });

  test('mesma reserva com ida e volta afetadas: um só segmento "ida e volta" com rota até o destino da ida', () => {
    const v = F.ida();
    v.trips.push({ ...clone(v.trips[0]), direction: 'volta', departure: { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' }, arrival: { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' }, dateLabel: '19 SET 2026' });
    v.trips.push({ ...clone(v.trips[0]), direction: 'ida', flightNumber: 'AD 4003' });   // 3 trechos: o 3º não é afetado
    const t = buildNoticeText(v, { affected: [0, 1] });
    expect(t).toContain('no seu voo de *ida* e *volta* da reserva *ABC123* (GRU → REC, 12 SET 2026 e 19 SET 2026).');
  });

  test('sem affected, vazio, null ou cobrindo todos os trechos: texto idêntico ao de sempre', () => {
    const v = F.combinado();
    const base = buildNoticeText(v, { supportPhone: PHONE });
    expect(base).toContain('no seu voo da reserva *ABC123* (GRU → REC, 12 SET 2026 e 19 SET 2026).');
    for (const affected of [undefined, null, [], [0, 1], [9]]) {
      expect(buildNoticeText(v, { supportPhone: PHONE, affected })).toBe(base);
    }
    expect(noticeClientMessage(v)).toBe(noticeClientMessage(v, { affected: [0, 1] }));
    expect(noticeDetail(v, { affected: [0, 1] })).toBe(noticeDetail(v));
  });

  test('noticeDetail e noticeClientMessage restritos', () => {
    expect(noticeDetail(F.combinado(), { affected: [1] })).toBe('REC → GRU, 19 SET 2026');
    expect(noticeClientMessage(F.combinado(), { affected: [1] })).toBe('Olá! Recebi o aviso de alteração do meu voo. Reserva XYZ789 — Joao.');
  });

  test('e-mail do aviso: mesma frase com <strong>, sem a reserva/data dos não afetados e com escape de HTML', () => {
    const v = F.combinado();
    const html = buildNoticeEmailHtml(v, { supportPhone: PHONE, affected: [1] });
    expect(html).toContain('no seu voo de <strong>volta</strong> da reserva <strong>XYZ789</strong> (REC → GRU, 19 SET 2026).');
    expect(html).not.toContain('ABC123');
    expect(decodeURIComponent(/wa\.me\/[^?]+\?text=([^"]+)"/.exec(html)[1])).toContain('Reserva XYZ789');
    v.trips[1].locator = '<img src=x>';
    const mau = buildNoticeEmailHtml(v, { affected: [1] });
    expect(mau).not.toContain('<IMG');
    expect(mau).toContain('&lt;IMG SRC=X&gt;');
    expect(buildNoticeEmailHtml(F.combinado(), { supportPhone: PHONE })).toBe(buildNoticeEmailHtml(F.combinado(), { supportPhone: PHONE, affected: [0, 1] }));
  });
});

describe('confirmação cita a reserva afetada', () => {
  const restrito = (old, ext, affected) => {
    const novo = mergeNewFlights(old, ext, { affected });
    return { novo, diff: diffVouchers(old, novo, { affected }) };
  };

  test('nova reserva só na volta: abertura com o localizador novo da volta, "Novo localizador" e só o trecho alterado', () => {
    const old = F.combinado();
    const { novo, diff } = restrito(old, { locator: 'NEW456', trips: [F.printTrip('volta')] }, [1]);
    const t = buildConfirmationText(novo, diff, { emailSent: true, voucherUrl: 'https://app.test/itinerario/T' });
    expect(t.split('\n').slice(0, 3)).toEqual(['Olá, *Joao*! 😊', '', 'Seu voo foi reajustado ✅ Reserva *NEW456*']);
    expect(t).toContain('Novo localizador: *NEW456*');
    expect(t).toContain('*Volta (REC → GRU)*');
    expect(t).toContain('Partida: 19/09/2026 13:00 → 19/09/2026 15:10');
    expect(t).not.toContain('ABC123');
    expect(t).not.toContain('Ida (');
    expect(t).toContain('Seu novo voucher já está disponível:\nhttps://app.test/itinerario/T');
    expect(t).toContain('Também enviamos o PDF por e-mail');
  });

  test('localizador não mudou: abertura cita a reserva da volta (não a da ida) e não há "Novo localizador"', () => {
    const old = F.combinado();
    const { novo, diff } = restrito(old, { trips: [F.printTrip('volta')] }, [1]);
    const t = buildConfirmationText(novo, diff, {});
    expect(t).toContain('Seu voo foi reajustado ✅ Reserva *XYZ789*');
    expect(t).not.toContain('Novo localizador');
    expect(t).not.toContain('ABC123');
  });

  test('duas reservas com localizador novo: "Reservas A e B" e uma linha por reserva com a direção', () => {
    const old = F.combinado();
    const novo = mergeNewFlights(old, { trips: [F.printIda({ flightNumber: 'AD 4003' }), F.printTrip('volta')] }, { affected: [0, 1] });
    novo.trips[0].locator = 'NEWIDA'; novo.trips[1].locator = 'NEWVOL';
    const diff = diffVouchers(old, novo);
    const t = buildConfirmationText(novo, diff, {});
    expect(t).toContain('Novo localizador (ida): *NEWIDA*');
    expect(t).toContain('Novo localizador (volta): *NEWVOL*');
    const restritoDiff = diffVouchers(old, novo, { affected: [0] });
    expect(buildConfirmationText(novo, restritoDiff, {})).toContain('Seu voo foi reajustado ✅ Reserva *NEWIDA*');
  });

  test('legado: voucher simples com localizador novo continua "Reserva *novo*" + "Novo localizador: *novo*"', () => {
    const old = F.ida(), novo = clone(old);
    novo.reservation.locator = 'XYZ999';
    const t = buildConfirmationText(novo, diffVouchers(old, novo), {});
    expect(t).toContain('Seu voo foi reajustado ✅ Reserva *XYZ999*\nNovo localizador: *XYZ999*');
  });
});
