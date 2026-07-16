const { validateItem, validatePackage, KINDS, ADDON_KINDS } = require('../services/packageSchema');

const hotel = { kind: 'hotel', locator: 'H1', provider: 'X', name: 'Hotel Y', address: 'Rua Z',
  checkIn: { date: '2026-10-20', time: '14:00' }, checkOut: { date: '2026-10-25', time: '12:00' },
  nights: 5, rooms: [{ type: 'Duplo' }], guests: [{ name: 'A' }], guestCount: 2, sortDate: '2026-10-20T14:00:00-03:00' };
const car = { kind: 'car', locator: 'C1', provider: 'Movida', holder: 'A', driver: 'A', rentalDays: 5,
  pickup: { datetime: '2026-10-20T16:30:00-03:00', location: 'Aeroporto' },
  dropoff: { datetime: '2026-10-25T16:30:00-03:00', location: 'Aeroporto' }, sortDate: '2026-10-20T16:30:00-03:00' };
const flights = { carrier: 'azul', layoutVersion: 'azul.confirmacao.v1', reservation: { locator: 'F1' },
  route: { origin: 'GRU', destination: 'POA' }, passengers: [{ order:1, name:'A', type:'adulto' }],
  trips: [{ direction:'ida', departure:{airport:'GRU',datetime:'2026-10-20T08:00:00-03:00'}, arrival:{airport:'POA',datetime:'2026-10-20T10:00:00-03:00'}, flightNumber:'AD1' }],
  baggage: [], branding: {}, meta: { parsedAt:'x', parserVersion:'x', confidence:0.9 } };

describe('packageSchema', () => {
  test('enums expostos', () => {
    expect(KINDS).toContain('flight'); expect(KINDS).toContain('hotel');
    expect(ADDON_KINDS).toEqual(['car','tour','transfer']);
  });
  test('valida hotelItem ok', () => expect(validateItem(hotel).ok).toBe(true));
  test('valida carItem ok', () => expect(validateItem(car).ok).toBe(true));
  test('rejeita kind inválido', () => expect(validateItem({ kind: 'foo' }).ok).toBe(false));
  test('rejeita item sem sortDate', () => {
    const h = { ...hotel }; delete h.sortDate;
    expect(validateItem(h).ok).toBe(false);
  });
  test('validatePackage exige flights e >=1 hotel', () => {
    expect(validatePackage({ flights, hotels: [hotel], addons: [] }).ok).toBe(true);
    expect(validatePackage({ flights: null, hotels: [hotel], addons: [] }).ok).toBe(false);
    expect(validatePackage({ flights, hotels: [], addons: [] }).ok).toBe(false);
  });
});
