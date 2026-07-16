const { blockHtml, packageSummaryText, packagePeriod, fmtTime, fmtDate } = require('../helpers/packageItemHtml');
const { STUBS } = require('../services/packagePrompts');
const { normalizeItem } = require('../services/packageNormalizer');
const { buildTimeline } = require('../helpers/packageBlocks');

const hotel = normalizeItem(STUBS.hotel, 'hotel');
const car = normalizeItem(STUBS.car, 'car');
const tour = normalizeItem(STUBS.tour, 'tour');
const transfer = normalizeItem(STUBS.transfer, 'transfer');

describe('packageItemHtml', () => {
  test('fmtTime lê hora local do ISO sem converter fuso', () => {
    expect(fmtTime('2026-11-05T14:00:00+01:00')).toBe('14:00');
    expect(fmtDate('2026-11-05T14:00:00+01:00')).toBe('05/11/2026');
  });

  test('hotel card tem nome + check-in + sem undefined', () => {
    const html = blockHtml({ kind: 'hotel', item: hotel });
    expect(html).toContain(hotel.name);
    expect(html).toContain('Check-in');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('[object');
  });

  test('car/tour/transfer cards renderizam sem undefined', () => {
    for (const [kind, item] of [['car', car], ['tour', tour], ['transfer', transfer]]) {
      const html = blockHtml({ kind, item });
      expect(html.length).toBeGreaterThan(50);
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('[object');
    }
    // transfer com 2 legs mostra os dois destinos
    const th = blockHtml({ kind: 'transfer', item: transfer });
    expect(th).toContain('Hotel Genova');
  });

  test('summary + period a partir de um pacote', () => {
    const pkg = {
      flights: { carrier: 'azul', reservation: { locator: 'F1', reservations: [{ code: 'F1', carrier: 'azul', appliesTo: 'ida' }] },
        trips: [{ direction: 'ida', departure: { airport: 'GRU', datetime: '2026-10-20T08:00:00-03:00' }, arrival: { airport: 'POA', datetime: '2026-10-20T10:00:00-03:00' }, locator: 'F1', flightNumber: 'AD1' }] },
      hotels: [hotel], addons: [car, tour]
    };
    expect(packageSummaryText(pkg)).toContain('hotel');
    expect(packageSummaryText(pkg)).toContain('adicionais');
    const blocks = buildTimeline(pkg);
    expect(packagePeriod(blocks)).toBeTruthy();
  });
});
