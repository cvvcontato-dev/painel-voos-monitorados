const { diffVouchers, formatLocal } = require('../helpers/flightChangeDiff');

const trip = (over = {}) => ({
  direction: 'ida', flightNumber: 'AD 4001', cabinClass: 'Econômica',
  departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
  arrival: { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' }, ...over
});
const v = (over = {}) => ({
  reservation: { locator: 'ABC123' },
  passengers: [{ name: 'JOAO DA SILVA' }, { name: 'Maria Silva' }],
  trips: [trip(), trip({ direction: 'volta', flightNumber: 'AD 4002',
    departure: { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' },
    arrival: { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' } })],
  baggage: [{ direction: 'ida', weightText: '23kg', quantity: 1 }], ...over
});

test('vouchers idênticos: nada mudou', () => {
  const d = diffVouchers(v(), v());
  expect(d.hasChanges).toBe(false);
  expect(d.trips.map(t => t.status)).toEqual(['igual', 'igual']);
});

test('horário de partida alterado vira trecho alterado com antes/depois', () => {
  const novo = v(); novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';
  const d = diffVouchers(v(), novo);
  expect(d.hasChanges).toBe(true);
  expect(d.trips[0].status).toBe('alterado');
  expect(d.trips[0].changes).toEqual([{ campo: 'partida', antes: '12/09/2026 08:30', depois: '12/09/2026 10:15' }]);
  expect(d.trips[1].status).toBe('igual');
});

test('mesmo instante em fusos diferentes não conta como mudança', () => {
  const novo = v(); novo.trips[0].departure.datetime = '2026-09-12T11:30:00Z';
  expect(diffVouchers(v(), novo).trips[0].status).toBe('igual');
});

test('número do voo: espaços e caixa são ignorados; troca real é detectada', () => {
  const a = v(); a.trips[0].flightNumber = 'ad4001';
  expect(diffVouchers(v(), a).trips[0].status).toBe('igual');
  const b = v(); b.trips[0].flightNumber = 'AD 4010';
  expect(diffVouchers(v(), b).trips[0].changes).toEqual([{ campo: 'voo', antes: 'AD 4001', depois: 'AD 4010' }]);
});

test('aeroporto de chegada diferente', () => {
  const n = v(); n.trips[0].arrival.airport = 'SSA';
  expect(diffVouchers(v(), n).trips[0].changes).toEqual([{ campo: 'destino', antes: 'REC', depois: 'SSA' }]);
});

test('classe só conta quando as duas existem', () => {
  const n = v(); n.trips[0].cabinClass = null;
  expect(diffVouchers(v(), n).trips[0].status).toBe('igual');
  const m = v(); m.trips[0].cabinClass = 'Executiva';
  expect(diffVouchers(v(), m).trips[0].changes[0].campo).toBe('classe');
});

test('trecho removido e trecho novo', () => {
  const semVolta = v(); semVolta.trips = [semVolta.trips[0]];
  const d1 = diffVouchers(v(), semVolta);
  expect(d1.trips.map(t => t.status)).toEqual(['igual', 'removido']);
  const d2 = diffVouchers(semVolta, v());
  expect(d2.trips.map(t => t.status)).toEqual(['igual', 'novo']);
  expect(d1.hasChanges && d2.hasChanges).toBe(true);
});

test('pareia por direção + ordem, não por posição absoluta', () => {
  const n = v(); n.trips.reverse();
  expect(diffVouchers(v(), n).hasChanges).toBe(false);
});

test('localizador alterado é destacado', () => {
  const n = v({ reservation: { locator: 'XYZ999' } });
  const d = diffVouchers(v(), n);
  expect(d.locatorChanged).toEqual({ antes: 'ABC123', depois: 'XYZ999' });
  expect(d.hasChanges).toBe(true);
});

test('passageiros: ignora acento/caixa/espaço; detecta troca', () => {
  const ok = v({ passengers: [{ name: 'joão da  silva' }, { name: 'MARIA SILVA' }] });
  expect(diffVouchers(v(), ok).passengers).toEqual({ adicionados: [], removidos: [] });
  const outro = v({ passengers: [{ name: 'JOAO DA SILVA' }, { name: 'PEDRO LIMA' }] });
  const d = diffVouchers(v(), outro);
  expect(d.passengers).toEqual({ adicionados: ['PEDRO LIMA'], removidos: ['Maria Silva'] });
  expect(d.hasChanges).toBe(true);
});

test('bagagem alterada marca baggageChanged', () => {
  const n = v({ baggage: [{ direction: 'ida', weightText: '23kg', quantity: 2 }] });
  const d = diffVouchers(v(), n);
  expect(d.baggageChanged).toBe(true); expect(d.hasChanges).toBe(true);
});

test('entradas vazias/nulas não quebram', () => {
  expect(diffVouchers({}, {}).hasChanges).toBe(false);
  expect(diffVouchers(null, undefined).hasChanges).toBe(false);
});

test('formatLocal usa o horário escrito no ISO (hora local do aeroporto)', () => {
  expect(formatLocal('2026-09-12T08:30:00-03:00')).toBe('12/09/2026 08:30');
  expect(formatLocal('lixo')).toBe('—');
});

test('itens nulos em trips/passengers/baggage são ignorados sem quebrar', () => {
  const a = v(); a.trips.unshift(null); a.passengers.push(null); a.baggage.push(null);
  const d = diffVouchers(a, v());
  expect(d.hasChanges).toBe(false);
  expect(d.trips.map(t => t.status)).toEqual(['igual', 'igual']);
});

test('passageiro sem name e número de voo numérico não quebram', () => {
  const a = v({ passengers: [{ name: 'A B' }, {}] });
  expect(() => diffVouchers(a, v())).not.toThrow();
  const x = v(); x.trips[0].flightNumber = 4001;
  const y = v(); y.trips[0].flightNumber = '4001';
  expect(diffVouchers(x, y).trips[0].status).toBe('igual');
});
