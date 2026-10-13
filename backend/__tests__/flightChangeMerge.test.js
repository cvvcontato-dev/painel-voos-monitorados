const { mergeNewFlights, carrierFromFlight } = require('../helpers/flightChangeMerge');
const { diffVouchers } = require('../helpers/flightChangeDiff');
const { validate } = require('../services/voucherSchema');

const MSG_VAZIO = 'Não encontrei voos nessa imagem. Envie um print ou PDF que mostre os voos (partida, chegada e número do voo).';

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
    trip('ida', 'SSA', 'REC', '2026-11-18T07:20:00-03:00', '2026-11-18T08:40:00-03:00', 'G3 1920'),
    trip('volta', 'REC', 'SSA', '2026-11-22T07:10:00-03:00', '2026-11-22T08:30:00-03:00', 'G3 1925')
  ],
  baggage: [{ direction: 'ida', label: 'Bagagem despachada', weightText: '23kg', quantity: 1 }],
  branding: { airlineName: 'Gol', logoUrl: null, primaryColor: '#FF7020' },
  meta: { parsedAt: '2026-10-01T00:00:00Z', parserVersion: 'x', confidence: 0.9, sourceFileHash: 'sha256:antigo' }
});

const idaNova = () => trip('ida', 'SSA', 'REC', '2026-11-17T14:45:00-03:00', '2026-11-17T16:05:00-03:00', 'G3 1922');
const voltaIgual = () => trip('volta', 'REC', 'SSA', '2026-11-22T07:10:00-03:00', '2026-11-22T08:30:00-03:00', 'G3 1925');

const erro = (fn) => { try { fn(); } catch (e) { return e; } throw new Error('não lançou'); };

describe('mergeNewFlights', () => {
  test('(a) caso real: troca a ida, mantém passageiros/bagagem e o diff só tem trechos', () => {
    const old = oldVoucher();
    const m = mergeNewFlights(old, { carrier: 'gol', locator: null, trips: [idaNova(), voltaIgual()] });
    expect(m.passengers).toEqual(old.passengers);
    expect(m.baggage).toEqual(old.baggage);
    expect(m.reservation.status).toBe('Confirmada');
    expect(m.trips).toHaveLength(2);
    expect(m.trips[0].flightNumber).toBe('G3 1922');
    expect(m.meta.flightsOnly).toBe(true);
    const diff = diffVouchers(old, m);
    expect(diff.hasChanges).toBe(true);
    expect(diff.trips.find(t => t.direction === 'ida').status).toBe('alterado');
    expect(diff.trips.find(t => t.direction === 'volta').status).toBe('igual');
    expect(diff.passengers).toEqual({ adicionados: [], removidos: [] });
    expect(diff.baggageChanged).toBe(false);
  });

  test('(b) extração só com a ida: a volta permanece como no antigo', () => {
    const old = oldVoucher();
    const m = mergeNewFlights(old, { trips: [idaNova()] });
    expect(m.trips).toHaveLength(2);
    expect(m.trips[1]).toEqual(old.trips[1]);
    const diff = diffVouchers(old, m);
    expect(diff.trips.find(t => t.direction === 'volta').status).toBe('igual');
  });

  test('(c) mais trechos na direção acrescenta; menos remove os restantes daquela direção', () => {
    const old = oldVoucher();
    const extra = trip('ida', 'REC', 'FOR', '2026-11-17T18:00:00-03:00', '2026-11-17T19:00:00-03:00', 'G3 1930');
    const m = mergeNewFlights(old, { trips: [idaNova(), extra] });
    expect(m.trips.map(t => t.flightNumber)).toEqual(['G3 1922', 'G3 1930', 'G3 1925']);

    const old2 = oldVoucher();
    old2.trips.splice(1, 0, trip('ida', 'REC', 'FOR', '2026-11-18T10:00:00-03:00', '2026-11-18T11:00:00-03:00', 'G3 1921'));
    const m2 = mergeNewFlights(old2, { trips: [idaNova()] });
    expect(m2.trips.map(t => t.flightNumber)).toEqual(['G3 1922', 'G3 1925']);
  });

  test('(d) localizador: o extraído sobrescreve; ausente mantém o antigo', () => {
    expect(mergeNewFlights(oldVoucher(), { locator: 'ZZZ999', trips: [idaNova()] }).reservation.locator).toBe('ZZZ999');
    expect(mergeNewFlights(oldVoucher(), { locator: '  ', trips: [idaNova()] }).reservation.locator).toBe('ABC123');
    expect(mergeNewFlights(oldVoucher(), { locator: null, trips: [idaNova()] }).reservation.locator).toBe('ABC123');
  });

  test('(e) cia muda (azul -> gol): atualiza carrier e branding; sem carrier deduz pelo prefixo', () => {
    const old = oldVoucher();
    old.carrier = 'azul'; old.branding = { airlineName: 'Azul', logoUrl: null, primaryColor: '#003DA5' };
    const m = mergeNewFlights(old, { carrier: 'gol', trips: [idaNova()] });
    expect(m.carrier).toBe('gol');
    expect(m.branding.airlineName).toBe('Gol');
    expect(m.branding.primaryColor).toBeNull();
    const m2 = mergeNewFlights(old, { carrier: null, trips: [idaNova()] });
    expect(m2.carrier).toBe('gol');
    // mesma cia: branding antigo intacto
    const same = mergeNewFlights(oldVoucher(), { carrier: 'gol', trips: [idaNova()] });
    expect(same.branding.primaryColor).toBe('#FF7020');
  });

  test('(e2) prefixos de voo', () => {
    expect(carrierFromFlight('AD 4001')).toBe('azul');
    expect(carrierFromFlight('G3 1922')).toBe('gol');
    expect(carrierFromFlight('GLO 12')).toBe('gol');
    expect(carrierFromFlight('LA 3456')).toBe('latam');
    expect(carrierFromFlight('JJ3456')).toBe('latam');
    expect(carrierFromFlight('XX 1')).toBeNull();
  });

  test('(f) trips vazio => 422 com a mensagem ao operador', () => {
    for (const ex of [{ trips: [] }, {}, null]) {
      const e = erro(() => mergeNewFlights(oldVoucher(), ex));
      expect(e.status).toBe(422);
      expect(e.body.error).toBe(MSG_VAZIO);
    }
  });

  test('(g) datetime inválido => 422 apontando o trecho', () => {
    const ruim = idaNova(); ruim.arrival.datetime = '17/11 às 16h';
    const e = erro(() => mergeNewFlights(oldVoucher(), { trips: [voltaIgual(), ruim] }));
    expect(e.status).toBe(422);
    expect(e.body.error).toMatch(/Trecho 2 \(G3 1922\).*chegada/);
    const sem = idaNova(); delete sem.departure;
    expect(erro(() => mergeNewFlights(oldVoucher(), { trips: [sem] })).body.error).toMatch(/Trecho 1.*partida/);
  });

  test('(h) resultado passa em validate e a rota é recalculada', () => {
    const m = mergeNewFlights(oldVoucher(), { trips: [trip('ida', 'SSA', 'FOR', '2026-11-17T14:45:00-03:00', '2026-11-17T16:45:00-03:00', 'G3 1922')] });
    expect(validate(m).ok).toBe(true);
    expect(m.route).toEqual({ origin: 'SSA', destination: 'FOR' });
  });

  test('não altera o voucher antigo recebido e passageiros nunca vêm da extração', () => {
    const old = oldVoucher();
    const snap = JSON.stringify(old);
    const m = mergeNewFlights(old, { passengers: [{ name: 'FULANO', type: 'adulto' }], trips: [idaNova()] });
    expect(JSON.stringify(old)).toBe(snap);
    expect(m.passengers.map(p => p.name)).toEqual(['ANA PAULA SOUZA', 'CARLOS SOUZA']);
  });
});
