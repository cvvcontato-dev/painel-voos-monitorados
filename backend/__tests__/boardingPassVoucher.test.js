const { voucherToPrefill, voucherOptionLabel, tripLabel } = require('../helpers/boardingPassVoucher');

const unified = {
  passengers: [{ order: 1, name: 'SILVA, MARIA' }, { order: 2, name: 'João Souza' }],
  trips: [
    { flightNumber: 'AD 2730', departure: { airport: 'SSA', datetime: '2026-09-24T22:30:00-03:00' }, arrival: { airport: 'REC', datetime: '2026-09-25T00:05:00-03:00' } },
    { flightNumber: 'AZU4050', departure: { airport: 'REC', datetime: '2026-09-30T08:00:00-03:00' }, arrival: { airport: 'SSA', datetime: '2026-09-30T09:20:00-03:00' } }
  ]
};

test('tripLabel: voo sem espaço, cidades e data em horário de Brasília', () => {
  expect(tripLabel(unified.trips[0])).toBe('AD2730 · Salvador → Recife · 24/09');
  expect(tripLabel(unified.trips[1])).toBe('AD4050 · Recife → Salvador · 30/09');
});

test('tripLabel: 23:50 -03:00 NÃO vira o dia seguinte (fuso fixo)', () => {
  expect(tripLabel({ flightNumber: 'G3 1000', departure: { airport: 'GRU', datetime: '2026-09-24T23:50:00-03:00' }, arrival: { airport: 'SSA' } }))
    .toBe('G31000 · São Paulo → Salvador · 24/09');
});

test('voucherToPrefill: um campo de link por trecho para cada passageiro', () => {
  const r = voucherToPrefill(unified);
  expect(r.flightDate).toBe('2026-09-24');
  expect(r.passengers).toHaveLength(2);
  expect(r.passengers[0]).toEqual({
    name: 'SILVA, MARIA',
    segments: [{ label: 'AD2730 · Salvador → Recife · 24/09' }, { label: 'AD4050 · Recife → Salvador · 30/09' }]
  });
});

test('voucherToPrefill: tolera voucher sem trips/datas', () => {
  const r = voucherToPrefill({ passengers: [{ name: 'Maria Silva' }], trips: [] });
  expect(r).toEqual({ passengers: [{ name: 'Maria Silva', segments: [{ label: null }] }], flightDate: null });
});

test('voucherOptionLabel', () => {
  expect(voucherOptionLabel(unified)).toBe('SILVA, MARIA +1 · AD2730 · Salvador → Recife · 24/09');
  expect(voucherOptionLabel({ passengers: [], trips: [] }, 7)).toBe('Voucher #7');
});
