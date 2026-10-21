const { mergeNewFlights } = require('../helpers/flightChangeMerge');
const { validate } = require('../services/voucherSchema');
const F = require('./fixtures/flightChangeCombined');

const clone = (o) => JSON.parse(JSON.stringify(o));
const erro = (fn) => { try { fn(); } catch (e) { return e; } throw new Error('não lançou'); };
const MSG_AMBIGUO = 'Não consegui identificar qual trecho do print corresponde ao que foi marcado. Envie um print com os rótulos ou só o trecho alterado.';
const warns = (m) => m.meta.mergeWarnings;
const semMeta = (m) => { const c = clone(m); delete c.meta.parsedAt; return c; };

// Ida (índice 0) e volta (índice 1) em reservas separadas; volta alterada.
const voltaNova = (o = {}) => F.printTrip('volta', o);

describe('mergeNewFlights restrito aos trechos afetados', () => {
  test('rotulado: só a volta é trocada; ida, passageiros e bagagem ficam intactos; localizador da volta é preservado', () => {
    const old = F.combinado();
    const m = mergeNewFlights(old, { carrier: 'azul', locator: null, trips: [voltaNova()] }, { affected: [1] });
    expect(m.trips).toHaveLength(2);
    expect(m.trips[0]).toEqual(old.trips[0]);                       // ida intacta (inclui locator ABC123)
    expect(m.trips[1]).toMatchObject({ direction: 'volta', flightNumber: 'AD 4010', dateLabel: '19 SET 2026', locator: 'XYZ789', cabinClass: 'Econômica', status: 'Confirmado' });
    expect(m.passengers).toEqual(old.passengers);
    expect(m.baggage).toEqual(old.baggage);
    expect(m.reservation).toEqual(old.reservation);
    expect(warns(m)).toEqual([]);
    expect(validate(m).ok).toBe(true);
  });

  test('sem rótulo com 1 trecho e 1 afetado: troca por posição e herda a direção do afetado', () => {
    const m = mergeNewFlights(F.combinado(), { trips: [voltaNova({ direction: 'multi' })] }, { affected: [1] });
    expect(m.trips[1]).toMatchObject({ direction: 'volta', flightNumber: 'AD 4010', locator: 'XYZ789' });
    expect(m.trips[0].flightNumber).toBe('AD 4001');
  });

  test('print com ida+volta mas só a volta marcada: a ida do print é ignorada com aviso', () => {
    const old = F.combinado();
    const m = mergeNewFlights(old, { trips: [F.printIda({ flightNumber: 'AD 9999' }), voltaNova()] }, { affected: [1] });
    expect(m.trips[0]).toEqual(old.trips[0]);                       // não foi tocada
    expect(m.trips[1].flightNumber).toBe('AD 4010');
    expect(warns(m).some(w => /^Ignorei trechos do print que não estavam marcados: AD 9999 \(GRU → REC\)/.test(w))).toBe(true);
  });

  test('sem rótulo com mais trechos que afetados: descarta (sem aviso) o que é um trecho NÃO marcado do antigo', () => {
    const old = F.combinado();
    const igualIda = F.printIda({ direction: 'multi' });            // mesmo voo+data da ida não marcada
    const m = mergeNewFlights(old, { trips: [igualIda, voltaNova({ direction: 'multi' })] }, { affected: [1] });
    expect(m.trips[0]).toEqual(old.trips[0]);
    expect(m.trips[1].flightNumber).toBe('AD 4010');
    expect(warns(m)).toEqual([]);
  });

  test('ambíguo: sem rótulo, mais trechos que afetados e nenhum casa com o não marcado => 422', () => {
    const e = erro(() => mergeNewFlights(F.combinado(), {
      trips: [voltaNova({ direction: 'multi', flightNumber: 'AD 1' }), voltaNova({ direction: 'multi', flightNumber: 'AD 2' })]
    }, { affected: [1] }));
    expect(e.status).toBe(422);
    expect(e.body.error).toBe(MSG_AMBIGUO);
  });

  test('ambíguo: menos trechos sem rótulo que afetados, rótulos misturados, ou nada casa com o marcado => 422', () => {
    const tres = F.combinado3();
    // 2 afetados ([1,2]) e 1 trecho sem rótulo
    expect(erro(() => mergeNewFlights(tres, { trips: [voltaNova({ direction: 'multi' })] }, { affected: [1, 2] })).body.error).toBe(MSG_AMBIGUO);
    // rótulos misturados
    expect(erro(() => mergeNewFlights(F.combinado(), { trips: [voltaNova(), voltaNova({ direction: 'multi' })] }, { affected: [1] })).status).toBe(422);
    // print só com a ida, mas só a volta está marcada
    const e = erro(() => mergeNewFlights(F.combinado(), { trips: [F.printIda({ flightNumber: 'AD 9999' })] }, { affected: [1] }));
    expect(e.status).toBe(422); expect(e.body.error).toBe(MSG_AMBIGUO);
  });

  test('2 afetados sem rótulo: pareia por ordem e cada novo herda a direção do afetado', () => {
    const tres = F.combinado3();
    const m = mergeNewFlights(tres, { trips: [
      F.printTrip('multi', { flightNumber: 'AD 5001', departure: { airport: 'REC', airportName: null, datetime: '2026-09-14T10:00:00-03:00' }, arrival: { airport: 'FOR', airportName: null, datetime: '2026-09-14T12:00:00-03:00' } }),
      voltaNova({ direction: 'multi' })
    ] }, { affected: [1, 2] });
    expect(m.trips.map(t => [t.direction, t.flightNumber, t.locator])).toEqual([['ida', 'AD 4001', 'ABC123'], ['interno', 'AD 5001', 'INT111'], ['volta', 'AD 4010', 'XYZ789']]);
  });

  test('localizador novo vale só para a reserva da volta (trips, reservations[], secondaryLocator); ida e reservation.locator intactos', () => {
    const old = F.combinado();
    const m = mergeNewFlights(old, { locator: 'new456', trips: [voltaNova()] }, { affected: [1] });
    expect(m.trips[1].locator).toBe('NEW456');
    expect(m.trips[0].locator).toBe('ABC123');
    expect(m.reservation.locator).toBe('ABC123');
    expect(m.reservation.secondaryLocator).toBe('NEW456');
    expect(m.reservation.reservations).toEqual([
      { code: 'ABC123', carrier: 'azul', appliesTo: 'ida' }, { code: 'NEW456', carrier: 'azul', appliesTo: 'volta' }]);
    expect(warns(m)).toContain('Localizador alterado de XYZ789 para NEW456: confira');
    expect(old.reservation.secondaryLocator).toBe('XYZ789');       // o antigo não é mutado
  });

  test('localizador novo com a IDA marcada: troca reservation.locator e a reserva da ida, não a da volta', () => {
    const m = mergeNewFlights(F.combinado(), { locator: 'NEW123', trips: [F.printIda({ flightNumber: 'AD 4003' })] }, { affected: [0] });
    expect(m.reservation.locator).toBe('NEW123');
    expect(m.reservation.secondaryLocator).toBe('XYZ789');
    expect(m.trips.map(t => t.locator)).toEqual(['NEW123', 'XYZ789']);
    expect(m.reservation.reservations.map(r => r.code)).toEqual(['NEW123', 'XYZ789']);
  });

  test('localizador igual, inválido ou ausente não mexe; afetados de reservas diferentes + um só localizador: não aplica e avisa', () => {
    const old = F.combinado();
    expect(mergeNewFlights(old, { locator: 'xyz789', trips: [voltaNova()] }, { affected: [1] }).reservation).toEqual(old.reservation);
    const inv = mergeNewFlights(old, { locator: '??', trips: [voltaNova()] }, { affected: [1] });
    expect(inv.reservation).toEqual(old.reservation);
    expect(warns(inv)).toContain('Localizador lido da imagem ignorado (formato inválido)');
    const tres = F.combinado3();
    const dois = mergeNewFlights(tres, { locator: 'ZZZ999', trips: [F.printTrip('interno', { flightNumber: 'AD 5001' }), voltaNova()] }, { affected: [1, 2] });
    expect(dois.trips.map(t => t.locator)).toEqual(['ABC123', 'INT111', 'XYZ789']);
    expect(warns(dois).some(w => /ZZZ999 lido da imagem não foi aplicado \(os trechos marcados são de reservas diferentes\)/.test(w))).toBe(true);
  });

  test('ida e volta na MESMA reserva e só a volta marcada: o novo localizador vale para a reserva toda', () => {
    const v = F.ida();
    v.trips.push({ ...clone(v.trips[0]), direction: 'volta', flightNumber: 'AD 4002', departure: { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' }, arrival: { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' }, dateLabel: '19 SET 2026' });
    const m = mergeNewFlights(v, { locator: 'NEW999', trips: [voltaNova()] }, { affected: [1] });
    expect(m.reservation.locator).toBe('NEW999');
    expect(m.trips[0].flightNumber).toBe('AD 4001');
    expect(m.trips[1].flightNumber).toBe('AD 4010');
  });

  test('cia da volta muda (azul -> gol): carrier multi, primary/secondary e reservations[] só da volta', () => {
    const m = mergeNewFlights(F.combinado(), { trips: [voltaNova({ flightNumber: 'G3 1000' })] }, { affected: [1] });
    expect(m.carrier).toBe('multi');
    expect(m.reservation.primaryCarrier).toBe('azul');
    expect(m.reservation.secondaryCarrier).toBe('gol');
    expect(m.reservation.reservations).toEqual([
      { code: 'ABC123', carrier: 'azul', appliesTo: 'ida' }, { code: 'XYZ789', carrier: 'gol', appliesTo: 'volta' }]);
    expect(m.trips[1].airlineDisplayName).toBe('Gol Linhas Aéreas');
    expect(m.trips[0].airlineDisplayName).toBe('Azul Linhas Aéreas');   // ida intocada
    expect(warns(m)).toContain('Ida e volta agora são de companhias diferentes: confira o localizador de cada reserva');
    expect(warns(m)).toContain('Bagagem mantida do voucher antigo, mas a companhia mudou: confira a franquia');
    expect(validate(m).ok).toBe(true);
  });

  test('cia da volta volta a ser igual à da ida (gol -> azul): deixa de ser multi e limpa primary/secondary', () => {
    const m = mergeNewFlights(F.combinadoMulti(), { trips: [voltaNova()] }, { affected: [1] });
    expect(m.carrier).toBe('azul');
    expect(m.reservation.primaryCarrier).toBeUndefined();
    expect(m.reservation.secondaryCarrier).toBeUndefined();
    expect(m.reservation.reservations.map(r => r.carrier)).toEqual(['azul', 'azul']);
    expect(m.reservation.secondaryLocator).toBe('XYZ789');            // a volta segue em reserva separada
    expect(warns(m).some(w => /^Companhia alterada de várias companhias para Azul/.test(w))).toBe(true);
  });

  test('voucher já multi e a volta continua da mesma cia: sem aviso de companhia', () => {
    const old = F.combinadoMulti();
    const m = mergeNewFlights(old, { trips: [voltaNova({ flightNumber: 'G3 1111' })] }, { affected: [1] });
    expect(m.carrier).toBe('multi');
    expect(m.reservation.primaryCarrier).toBe('azul'); expect(m.reservation.secondaryCarrier).toBe('gol');
    expect(m.reservation.reservations).toEqual(old.reservation.reservations);
    expect(warns(m)).toEqual([]);
  });

  test('prefixo desconhecido: avisa e herda a cia do trecho substituído (não a do voucher)', () => {
    const m = mergeNewFlights(F.combinadoMulti(), { carrier: null, trips: [voltaNova({ flightNumber: 'ZZ 123' })] }, { affected: [1] });
    expect(m.carrier).toBe('multi');
    expect(m.trips[1].airlineDisplayName).toBe('Gol Linhas Aéreas');
    expect(warns(m).some(w => /ZZ 123 tem prefixo desconhecido: mantive a companhia do trecho substituído/.test(w))).toBe(true);
  });

  test('conexão: a direção afetada recebe os trechos do print (a sobra é acrescentada) e a rota considera o destino da ida', () => {
    const leg2 = voltaNova({ flightNumber: 'AD 4011', departure: { airport: 'GRU', airportName: null, datetime: '2026-09-19T19:00:00-03:00' }, arrival: { airport: 'CWB', airportName: null, datetime: '2026-09-19T20:00:00-03:00' } });
    const m = mergeNewFlights(F.combinado(), { trips: [voltaNova({ arrival: { airport: 'GRU', airportName: null, datetime: '2026-09-19T18:00:00-03:00' } }), leg2] }, { affected: [1] });
    expect(m.trips.map(t => t.flightNumber)).toEqual(['AD 4001', 'AD 4010', 'AD 4011']);
    expect(m.trips.map(t => t.locator)).toEqual(['ABC123', 'XYZ789', 'XYZ789']);
    expect(m.route).toEqual({ origin: 'GRU', destination: 'REC' });
  });

  test('todos os trechos marcados (ou nenhum) = comportamento atual, byte a byte', () => {
    const old = F.combinado();
    const ext = { carrier: 'azul', locator: 'zzz111', trips: [F.printIda({ flightNumber: 'AD 4003' }), voltaNova()] };
    const base = semMeta(mergeNewFlights(old, clone(ext)));
    expect(semMeta(mergeNewFlights(old, clone(ext), { affected: [0, 1] }))).toEqual(base);
    expect(semMeta(mergeNewFlights(old, clone(ext), { affected: undefined }))).toEqual(base);
    expect(semMeta(mergeNewFlights(old, clone(ext), { affected: [] }))).toEqual(base);
    expect(semMeta(mergeNewFlights(old, clone(ext), null))).toEqual(base);
  });

  test('marcação inválida (fora do intervalo) é ignorada: vira "todos"', () => {
    const old = F.combinado();
    const ext = { trips: [F.printIda({ flightNumber: 'AD 4003' }), voltaNova()] };
    expect(semMeta(mergeNewFlights(old, clone(ext), { affected: [9] }))).toEqual(semMeta(mergeNewFlights(old, clone(ext))));
  });

  test('validações de datas/IATA/voo continuam valendo (trecho ilegível => 422 apontando o trecho)', () => {
    const e = erro(() => mergeNewFlights(F.combinado(), { trips: [voltaNova({ flightNumber: '???' })] }, { affected: [1] }));
    expect(e.status).toBe(422);
    expect(e.body.error).toMatch(/não consegui ler o número do voo/);
  });

  test('campos livres do modelo não vazam: só a whitelist entra no trecho', () => {
    const m = mergeNewFlights(F.combinado(), { trips: [voltaNova({ hack: '<x>', locator: 'ZZZZZZ', passengers: [{ name: 'X' }] })], passengers: [{ name: 'Y' }] }, { affected: [1] });
    expect(m.trips[1].hack).toBeUndefined();
    expect(m.trips[1].locator).toBe('XYZ789');      // o do trecho vem do antigo, nunca do campo livre
    expect(m.passengers).toEqual(F.combinado().passengers);
  });
});
