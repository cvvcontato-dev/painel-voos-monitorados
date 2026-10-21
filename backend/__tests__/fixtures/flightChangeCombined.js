// Vouchers combinados (ida e volta em RESERVAS SEPARADAS) para os testes da escolha de trechos alterados.
// Montados com o combineVouchers real a partir de dois vouchers stub de localizadores/cias diferentes.
const { combineVouchers } = require('../../services/voucherCombiner');

const NOMES = { azul: 'Azul Linhas Aéreas', gol: 'Gol Linhas Aéreas', latam: 'Latam Airlines' };
const BRAND = { azul: { airlineName: 'Azul', primaryColor: '#003DA5' }, gol: { airlineName: 'Gol', primaryColor: '#FF7020' }, latam: { airlineName: 'Latam', primaryColor: '#1B0088' } };

/** Voucher de UMA reserva, de 1 trecho. */
function single({ carrier = 'azul', locator, flight, dep, arr, depDt, arrDt, dateLabel, direction = 'ida' }) {
  return {
    carrier, layoutVersion: 'azul.confirmacao.v1',
    reservation: { locator, status: 'Confirmada', summaryText: null },
    route: { origin: dep, destination: arr },
    passengers: [
      { order: 1, name: 'JOAO DA SILVA', type: 'adulto', documento: null, loyaltyNumber: '1234567890' },
      { order: 2, name: 'MARIA SILVA', type: 'adulto', documento: null, loyaltyNumber: '1234567891' }
    ],
    trips: [{
      direction, dateLabel,
      departure: { airport: dep, airportName: null, datetime: depDt },
      arrival: { airport: arr, airportName: null, datetime: arrDt },
      flightNumber: flight, durationText: '3h15', cabinClass: 'Econômica',
      airlineDisplayName: NOMES[carrier], status: 'Confirmado'
    }],
    baggage: [{ direction, label: 'Bagagem despachada', weightText: '23kg', quantity: 1 }],
    branding: { ...BRAND[carrier], logoUrl: null },
    meta: { parsedAt: '2026-10-01T00:00:00Z', parserVersion: 'x', sourceFileHash: 'sha256:' + locator }
  };
}

const ida = (o = {}) => single({ carrier: 'azul', locator: 'ABC123', flight: 'AD 4001', dep: 'GRU', arr: 'REC',
  depDt: '2026-09-12T08:30:00-03:00', arrDt: '2026-09-12T11:45:00-03:00', dateLabel: '12 SET 2026', ...o });
const volta = (o = {}) => single({ carrier: 'azul', locator: 'XYZ789', flight: 'AD 4002', dep: 'REC', arr: 'GRU',
  depDt: '2026-09-19T13:00:00-03:00', arrDt: '2026-09-19T16:30:00-03:00', dateLabel: '19 SET 2026', direction: 'volta', ...o });

/** Ida ABC123 (Azul) + volta XYZ789 (Azul): trips[0] = ida, trips[1] = volta. */
const combinado = (idaOpts, voltaOpts) => combineVouchers([
  { voucher: ida(idaOpts), role: 'ida' }, { voucher: volta(voltaOpts), role: 'volta' }
]);
/** Ida ABC123 (Azul) + volta XYZ789 (Gol): carrier 'multi'. */
const combinadoMulti = () => combinado({}, { carrier: 'gol', flight: 'G3 1925' });

/** Trecho no formato que o extractFlights devolve (entrada do mergeNewFlights). */
const printTrip = (direction, o = {}) => ({
  direction, dateLabel: null,
  departure: { airport: 'REC', airportName: null, datetime: '2026-09-19T15:10:00-03:00' },
  arrival: { airport: 'GRU', airportName: null, datetime: '2026-09-19T18:40:00-03:00' },
  flightNumber: 'AD 4010', durationText: '3h30', cabinClass: null, airlineDisplayName: null, status: null, ...o
});
const printIda = (o = {}) => printTrip('ida', {
  departure: { airport: 'GRU', airportName: null, datetime: '2026-09-12T08:30:00-03:00' },
  arrival: { airport: 'REC', airportName: null, datetime: '2026-09-12T11:45:00-03:00' },
  flightNumber: 'AD 4001', ...o
});

module.exports = { ida, volta, combinado, combinadoMulti, printTrip, printIda };
