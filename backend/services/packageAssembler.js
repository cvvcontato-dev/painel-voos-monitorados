const { combineVouchers } = require('./voucherCombiner');
const { lastNameOf } = require('../helpers/voucherCarrier');

// items = [{ item, kind }] já extraídos/normalizados.
function assemblePackage(items) {
  const flights = items.filter(x => x.kind === 'flight').map(x => x.item);
  const hotels = items.filter(x => x.kind === 'hotel').map(x => x.item);
  const addons = items.filter(x => ['car', 'tour', 'transfer'].includes(x.kind)).map(x => x.item);
  if (flights.length < 1) throw new Error('pacote exige ao menos 1 voo');
  if (hotels.length < 1) throw new Error('pacote exige ao menos 1 hotel');

  let flightUnified;
  if (flights.length === 1) {
    flightUnified = flights[0];
  } else {
    // >1 voucher de voo: 1º = ida, último = volta, meio = interno; combina.
    const roleFor = (i, n) => (i === 0 ? 'ida' : (i === n - 1 ? 'volta' : 'interno'));
    flightUnified = combineVouchers(flights.map((v, i) => ({ voucher: v, role: roleFor(i, flights.length) })));
  }

  const holder = flightUnified.passengers?.[0]?.name || hotels[0]?.guests?.[0]?.name || '';
  const dest = flightUnified.route?.destination || '';
  const lastName = lastNameOf(holder) || holder;
  const title = `Pacote${dest ? ' ' + dest : ''}${lastName ? ' — ' + lastName : ''}`.trim();

  return {
    title,
    holder,
    flights: flightUnified,
    hotels,
    addons,
    meta: {
      combined: true,
      createdAt: new Date().toISOString(),
      sources: items.map(x => ({ hash: (x.item && x.item.meta && x.item.meta.sourceFileHash) || null, kind: x.kind }))
    }
  };
}

module.exports = { assemblePackage };
