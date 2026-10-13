const { mergeNewFlights, carrierFromFlight, isoToDateLabel } = require('../helpers/flightChangeMerge');
const { diffVouchers } = require('../helpers/flightChangeDiff');
const { validate } = require('../services/voucherSchema');

const MSG_VAZIO = 'Não encontrei voos nessa imagem. Envie um print ou PDF que mostre os voos (partida, chegada e número do voo).';
const MSG_AMBIGUO = 'Não consegui identificar quais trechos são da ida e da volta. Envie um print com os rótulos "Voo da ida"/"Voo da volta".';

const trip = (direction, dep, arr, depDt, arrDt, flight, extra = {}) => ({
  direction, dateLabel: depDt.slice(0, 10),
  departure: { airport: dep, airportName: null, datetime: depDt },
  arrival: { airport: arr, airportName: null, datetime: arrDt },
  flightNumber: flight, durationText: '1h20', cabinClass: null,
  airlineDisplayName: 'Gol Linhas Aéreas', status: 'Confirmado', ...extra
});

const oldVoucher = () => ({
  carrier: 'gol', layoutVersion: 'azul.confirmacao.v1',
  reservation: { locator: 'ABC123', status: 'Confirmada', summaryText: null },
  route: { origin: 'SSA', destination: 'REC' },
  passengers: [
    { order: 1, name: 'ANA PAULA SOUZA', type: 'adulto', documento: null, loyaltyNumber: '111' },
    { order: 2, name: 'CARLOS SOUZA', type: 'adulto', documento: null, loyaltyNumber: '222' }
  ],
  trips: [
    trip('ida', 'SSA', 'REC', '2026-11-18T07:20:00-03:00', '2026-11-18T08:40:00-03:00', 'G3 1920', { cabinClass: 'Econômica' }),
    trip('volta', 'REC', 'SSA', '2026-11-22T07:10:00-03:00', '2026-11-22T08:30:00-03:00', 'G3 1925', { cabinClass: 'Econômica' })
  ],
  baggage: [{ direction: 'ida', label: 'Bagagem despachada', weightText: '23kg', quantity: 1 }],
  branding: { airlineName: 'Gol', logoUrl: null, primaryColor: '#FF7020' },
  meta: { parsedAt: '2026-10-01T00:00:00Z', parserVersion: 'x', sourceFileHash: 'sha256:antigo' }
});
const oldAzul = () => {
  const o = oldVoucher();
  o.carrier = 'azul'; o.branding = { airlineName: 'Azul', logoUrl: null, primaryColor: '#003DA5' };
  o.trips[0].flightNumber = 'AD 4001'; o.trips[1].flightNumber = 'AD 4002';
  o.trips.forEach(t => { t.airlineDisplayName = 'Azul Linhas Aéreas'; });
  return o;
};

const idaNova = (extra) => trip('ida', 'SSA', 'REC', '2026-11-17T14:45:00-03:00', '2026-11-17T16:05:00-03:00', 'G3 1922', extra);
const voltaIgual = () => trip('volta', 'REC', 'SSA', '2026-11-22T07:10:00-03:00', '2026-11-22T08:30:00-03:00', 'G3 1925');

const erro = (fn) => { try { fn(); } catch (e) { return e; } throw new Error('não lançou'); };
const warns = (m) => m.meta.mergeWarnings;

describe('mergeNewFlights', () => {
  test('(a) caso real: troca a ida, mantém passageiros/bagagem e o diff só tem trechos', () => {
    const old = oldVoucher();
    const m = mergeNewFlights(old, { carrier: 'gol', locator: null, trips: [idaNova(), voltaIgual()] });
    expect(m.passengers).toEqual(old.passengers);
    expect(m.baggage).toEqual(old.baggage);
    expect(m.reservation.status).toBe('Confirmada');
    expect(m.trips[0].flightNumber).toBe('G3 1922');
    expect(m.trips[0].dateLabel).toBe('17 NOV 2026');
    const diff = diffVouchers(old, m);
    expect(diff.hasChanges).toBe(true);
    expect(diff.trips.find(t => t.direction === 'ida').status).toBe('alterado');
    expect(diff.trips.find(t => t.direction === 'volta').status).toBe('igual');
    expect(diff.passengers).toEqual({ adicionados: [], removidos: [] });
    expect(diff.baggageChanged).toBe(false);
    expect(warns(m)).toEqual([]);
    expect(m.meta.flightsOnly).toBeUndefined();
    expect(m.meta.confidence).toBeUndefined();
  });

  test('(b) extração só com a ida: a volta permanece como no antigo', () => {
    const old = oldVoucher();
    const m = mergeNewFlights(old, { trips: [idaNova()] });
    expect(m.trips).toHaveLength(2);
    expect(m.trips[1]).toEqual(old.trips[1]);
  });

  test('(c) mais trechos na direção acrescenta; menos remove os restantes daquela direção', () => {
    const extra = trip('ida', 'REC', 'FOR', '2026-11-17T18:00:00-03:00', '2026-11-17T19:00:00-03:00', 'G3 1930');
    const m = mergeNewFlights(oldVoucher(), { trips: [idaNova(), extra] });
    expect(m.trips.map(t => t.flightNumber)).toEqual(['G3 1922', 'G3 1930', 'G3 1925']);
    const old2 = oldVoucher();
    old2.trips.splice(1, 0, trip('ida', 'REC', 'FOR', '2026-11-18T10:00:00-03:00', '2026-11-18T11:00:00-03:00', 'G3 1921'));
    expect(mergeNewFlights(old2, { trips: [idaNova()] }).trips.map(t => t.flightNumber)).toEqual(['G3 1922', 'G3 1925']);
  });

  test('(C1) ida com conexão: destino = chegada do ÚLTIMO trecho da ida', () => {
    const a = trip('ida', 'SSA', 'VCP', '2026-11-17T06:00:00-03:00', '2026-11-17T08:00:00-03:00', 'G3 1100');
    const b = trip('ida', 'VCP', 'GRU', '2026-11-17T09:00:00-03:00', '2026-11-17T09:40:00-03:00', 'G3 1101');
    const m = mergeNewFlights(oldVoucher(), { trips: [a, b, voltaIgual()] });
    expect(m.route).toEqual({ origin: 'SSA', destination: 'GRU' });
    // sem 'ida' no voucher final: chegada do último trecho
    const o = oldVoucher(); o.trips = [trip('interno', 'SSA', 'REC', '2026-11-18T07:20:00-03:00', '2026-11-18T08:40:00-03:00', 'G3 1920')];
    const m2 = mergeNewFlights(o, { trips: [trip('multi', 'SSA', 'FOR', '2026-11-18T07:00:00-03:00', '2026-11-18T09:00:00-03:00', 'G3 1')] });
    expect(m2.route.destination).toBe('FOR');
  });

  describe('(C2) direções sem rótulo', () => {
    test('antigo ida/volta + trechos "multi" em quantidade diferente => 422 ambíguo', () => {
      const e = erro(() => mergeNewFlights(oldVoucher(), { trips: [trip('multi', 'SSA', 'REC', '2026-11-17T14:45:00-03:00', '2026-11-17T16:05:00-03:00', 'G3 1922')] }));
      expect(e.status).toBe(422);
      expect(e.body.error).toBe(MSG_AMBIGUO);
    });
    test('direção inválida do modelo conta como ausente (não vira multi no voucher)', () => {
      const t = idaNova(); t.direction = 'xpto';
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [t] })).body.error).toBe(MSG_AMBIGUO);
    });
    test('mesma quantidade de trechos que o antigo: substitui por posição mantendo as direções do antigo', () => {
      const m = mergeNewFlights(oldVoucher(), { trips: [idaNova({ direction: 'multi' }), { ...voltaIgual(), direction: null }] });
      expect(m.trips.map(t => t.direction)).toEqual(['ida', 'volta']);
      expect(m.trips[0].flightNumber).toBe('G3 1922');
    });
    test('só direções que não existem no antigo => 422', () => {
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [{ ...idaNova(), direction: 'interno' }] })).status).toBe(422);
    });
    test('antigo multi/interno: substitui por posição (inclusive com quantidade diferente)', () => {
      const o = oldVoucher();
      o.trips = [{ ...o.trips[0], direction: 'interno' }, { ...o.trips[1], direction: 'multi' }];
      const novos = [idaNova({ direction: 'multi' }), voltaIgual()];
      novos[1].direction = 'multi';
      const m = mergeNewFlights(o, { trips: novos });
      expect(m.trips.map(t => t.direction)).toEqual(['interno', 'multi']);
      expect(m.trips.map(t => t.flightNumber)).toEqual(['G3 1922', 'G3 1925']);
      const m1 = mergeNewFlights(o, { trips: [idaNova({ direction: 'multi' })] });
      expect(m1.trips.map(t => t.flightNumber)).toEqual(['G3 1922', 'G3 1925']);   // o que o print não cobre permanece
      const tres = mergeNewFlights(o, { trips: [...novos, trip('multi', 'REC', 'FOR', '2026-11-23T10:00:00-03:00', '2026-11-23T11:00:00-03:00', 'G3 9')] });
      expect(tres.trips).toHaveLength(3);
    });
  });

  describe('(C3) companhia por trecho', () => {
    test('mudou de azul para gol (todos os trechos): atualiza carrier/branding, limpa campos multi e avisa', () => {
      const old = oldAzul();
      old.reservation.reservations = [{ code: 'ABC123', carrier: 'azul', appliesTo: 'ida' }];
      old.reservation.secondaryLocator = 'ZZZ999';
      const m = mergeNewFlights(old, { carrier: 'azul', trips: [idaNova(), voltaIgual()] });   // dica errada é ignorada: vale o prefixo
      expect(m.carrier).toBe('gol');
      expect(m.branding).toMatchObject({ airlineName: 'Gol', logoUrl: null, primaryColor: null });
      expect(m.reservation.reservations).toBeUndefined();
      expect(m.reservation.secondaryLocator).toBeUndefined();
      expect(warns(m)).toContain('Companhia alterada de Azul para Gol: confira o localizador e a bagagem');
      expect(warns(m)).toContain('Bagagem mantida do voucher antigo, mas a companhia mudou: confira a franquia');
    });
    test('mesma cia: branding antigo intacto e sem avisos', () => {
      const m = mergeNewFlights(oldVoucher(), { trips: [idaNova()] });
      expect(m.branding.primaryColor).toBe('#FF7020');
      expect(warns(m)).toEqual([]);
    });
    test('só a ida muda para Azul e a volta segue Gol => carrier multi com primary/secondary e aviso', () => {
      const ida = trip('ida', 'SSA', 'REC', '2026-11-17T14:45:00-03:00', '2026-11-17T16:05:00-03:00', 'AD 4001');
      const m = mergeNewFlights(oldVoucher(), { trips: [ida] });
      expect(m.carrier).toBe('multi');
      expect(m.reservation.primaryCarrier).toBe('azul');
      expect(m.reservation.secondaryCarrier).toBe('gol');
      expect(m.reservation.locator).toBe('ABC123');
      expect(warns(m)).toContain('Ida e volta agora são de companhias diferentes: confira o localizador de cada reserva');
      expect(validate(m).ok).toBe(true);
    });
    test('airlineDisplayName é definido por trecho pela cia (ignora o texto do modelo)', () => {
      const m = mergeNewFlights(oldVoucher(), { trips: [idaNova({ airlineDisplayName: 'Qualquer Coisa SA' })] });
      expect(new Set(m.trips.map(t => t.airlineDisplayName))).toEqual(new Set(['Gol Linhas Aéreas']));
      const old = oldVoucher(); old.trips[1].airlineDisplayName = 'GOL';   // variante antiga é normalizada
      expect(new Set(mergeNewFlights(old, { trips: [idaNova()] }).trips.map(t => t.airlineDisplayName)).size).toBe(1);
    });
    test('prefixo desconhecido: mantém a cia do antigo e avisa', () => {
      const t = trip('ida', 'SSA', 'REC', '2026-11-17T14:45:00-03:00', '2026-11-17T16:05:00-03:00', 'XX 123');
      const m = mergeNewFlights(oldVoucher(), { trips: [t] });
      expect(m.carrier).toBe('gol');
      expect(warns(m).some(w => /prefixo desconhecido/.test(w))).toBe(true);
    });
    test('prefixos', () => {
      expect(carrierFromFlight('AD 4001')).toBe('azul');
      expect(carrierFromFlight('G3 1922')).toBe('gol');
      expect(carrierFromFlight('GLO 12')).toBe('gol');
      expect(carrierFromFlight('LA 3456')).toBe('latam');
      expect(carrierFromFlight('JJ3456')).toBe('latam');
      expect(carrierFromFlight('XX 1')).toBeNull();
    });
  });

  test('(d) localizador: válido novo sobrescreve com aviso; ausente mantém; inválido é ignorado com aviso', () => {
    const m = mergeNewFlights(oldVoucher(), { locator: 'zzz999', trips: [idaNova()] });
    expect(m.reservation.locator).toBe('ZZZ999');
    expect(warns(m)).toContain('Localizador alterado de ABC123 para ZZZ999: confira');
    expect(mergeNewFlights(oldVoucher(), { locator: null, trips: [idaNova()] }).reservation.locator).toBe('ABC123');
    const bad = mergeNewFlights(oldVoucher(), { locator: 'RESERVA DE VOO', trips: [idaNova()] });
    expect(bad.reservation.locator).toBe('ABC123');
    expect(warns(bad)).toContain('Localizador lido da imagem ignorado (formato inválido)');
    expect(warns(mergeNewFlights(oldVoucher(), { locator: 'abc123', trips: [idaNova()] }))).toEqual([]);
  });

  test('(f) trips vazio => 422 com a mensagem; resposta não-objeto/trips não-array => 422 "não consegui ler"', () => {
    for (const ex of [{ trips: [] }]) {
      const e = erro(() => mergeNewFlights(oldVoucher(), ex));
      expect(e.status).toBe(422);
      expect(e.body.error).toBe(MSG_VAZIO);
    }
    for (const ex of [null, undefined, 'x', [], {}, { trips: 'abc' }, { trips: null }]) {
      const e = erro(() => mergeNewFlights(oldVoucher(), ex));
      expect(e.status).toBe(422);
      expect(e.body.error).toMatch(/^Não consegui ler os voos nessa imagem/);
    }
  });

  describe('(g) validação dos trechos', () => {
    test('datetime inválido / ausente / não-string => 422 apontando o trecho', () => {
      const ruim = idaNova(); ruim.arrival.datetime = '17/11 às 16h';
      const e = erro(() => mergeNewFlights(oldVoucher(), { trips: [voltaIgual(), ruim] }));
      expect(e.status).toBe(422);
      expect(e.body.error).toMatch(/Trecho 2 \(G3 1922\).*chegada/);
      const sem = idaNova(); delete sem.departure;
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [sem] })).body.error).toMatch(/Trecho 1.*partida/);
      const num = idaNova(); num.departure.datetime = 12345;
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [num] })).status).toBe(422);
    });
    test('data inexistente (31/02, 25h) e chegada antes da partida => 422', () => {
      const a = idaNova(); a.departure.datetime = '2026-02-31T14:45:00-03:00';
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [a] })).body.error).toMatch(/Trecho 1.*partida/);
      const b = idaNova(); b.arrival.datetime = '2026-11-17T25:05:00-03:00';
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [b] })).body.error).toMatch(/chegada/);
      const c = idaNova(); c.arrival.datetime = '2026-11-17T13:05:00-03:00';
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [c] })).body.error).toMatch(/Trecho 1.*anterior à partida/);
    });
  });

  describe('(I2) lista branca e limites', () => {
    test('campos extras não chegam ao voucher final; strings cortadas em 80', () => {
      const t = idaNova({ evil: '<script>', locator: 'XXXXXX', durationText: 'x'.repeat(200) });
      t.departure.extra = 1; t.departure.airportName = 'A'.repeat(300);
      const m = mergeNewFlights(oldVoucher(), { evil: 1, trips: [t] });
      const n = m.trips[0];
      expect(n.evil).toBeUndefined();
      expect(n.locator).toBeUndefined();
      expect(n.departure.extra).toBeUndefined();
      expect(n.durationText).toHaveLength(80);
      expect(n.departure.airportName).toHaveLength(80);
      expect(Object.keys(n).sort()).toEqual(['airlineDisplayName', 'arrival', 'cabinClass', 'dateLabel', 'departure', 'direction', 'durationText', 'flightNumber', 'status']);
    });
    test('mais de 12 trechos => 422', () => {
      const lista = Array.from({ length: 13 }, () => idaNova());
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: lista })).status).toBe(422);
    });
    test('aeroporto e número do voo inválidos => 422 apontando o trecho', () => {
      const a = idaNova(); a.departure.airport = 'SALVADOR';
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [a] })).body.error).toMatch(/Trecho 1.*aeroporto de partida/);
      const b = idaNova(); b.arrival.airport = null;
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [b] })).body.error).toMatch(/aeroporto de chegada/);
      const c = idaNova(); c.flightNumber = 'voo de ida muito longo';
      expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [c] })).body.error).toMatch(/número do voo/);
    });
    test('IATA minúsculo é normalizado; número do voo ganha espaço (G31922 -> G3 1922)', () => {
      const t = idaNova({ flightNumber: 'g31922' }); t.departure.airport = ' ssa ';
      const n = mergeNewFlights(oldVoucher(), { trips: [t] }).trips[0];
      expect(n.departure.airport).toBe('SSA');
      expect(n.flightNumber).toBe('G3 1922');
    });
  });

  test('(I4) dateLabel é regerado do datetime (ignora o do modelo); formato dd MMM AAAA', () => {
    const m = mergeNewFlights(oldVoucher(), { trips: [idaNova({ dateLabel: 'lixo' })] });
    expect(m.trips[0].dateLabel).toBe('17 NOV 2026');
    expect(isoToDateLabel('2026-01-05T23:50:00-03:00')).toBe('05 JAN 2026');
    expect(isoToDateLabel('lixo')).toBe('');
  });

  test('(I7) trecho pareado herda classe/status do antigo quando vêm vazios; classe nova do print vence', () => {
    const m = mergeNewFlights(oldVoucher(), { trips: [idaNova({ status: null })] });
    expect(m.trips[0].cabinClass).toBe('Econômica');
    expect(m.trips[0].status).toBe('Confirmado');
    expect(mergeNewFlights(oldVoucher(), { trips: [idaNova({ cabinClass: 'Executiva' })] }).trips[0].cabinClass).toBe('Executiva');
  });

  test('(h) resultado passa em validate; não altera o voucher antigo; passageiros nunca vêm da extração', () => {
    const old = oldVoucher();
    const snap = JSON.stringify(old);
    const m = mergeNewFlights(old, { passengers: [{ name: 'FULANO', type: 'adulto' }], trips: [idaNova()] });
    expect(JSON.stringify(old)).toBe(snap);
    expect(validate(m).ok).toBe(true);
    expect(m.passengers.map(p => p.name)).toEqual(['ANA PAULA SOUZA', 'CARLOS SOUZA']);
  });
});
