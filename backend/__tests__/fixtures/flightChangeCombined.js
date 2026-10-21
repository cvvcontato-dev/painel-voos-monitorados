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

const interno = (o = {}) => single({ carrier: 'azul', locator: 'INT111', flight: 'AD 5000', dep: 'REC', arr: 'FOR',
  depDt: '2026-09-14T09:00:00-03:00', arrDt: '2026-09-14T11:00:00-03:00', dateLabel: '14 SET 2026', direction: 'interno', ...o });

/** Ida ABC123 + interno INT111 + volta XYZ789 (3 reservas, todas Azul): índices 0, 1, 2. */
const combinado3 = () => combineVouchers([
  { voucher: ida(), role: 'ida' }, { voucher: interno(), role: 'interno' }, { voucher: volta(), role: 'volta' }
]);

/** Ida ABC123 (Azul) + volta XYZ789 (Azul): trips[0] = ida, trips[1] = volta. */
const combinado = (idaOpts, voltaOpts) => combineVouchers([
  { voucher: ida(idaOpts), role: 'ida' }, { voucher: volta(voltaOpts), role: 'volta' }
]);
/** Como `combinado`, mas a VOLTA tem conexão: REC → BSB (AD 4002) + BSB → GRU (AD 4012); índices 0 (ida), 1 e 2 (volta). */
const combinadoConexao = () => {
  const c = combinado();
  const v = c.trips[1];
  const a = { ...JSON.parse(JSON.stringify(v)), flightNumber: 'AD 4002', departure: { airport: 'REC', datetime: '2026-09-19T10:00:00-03:00' }, arrival: { airport: 'BSB', datetime: '2026-09-19T12:30:00-03:00' } };
  const b = { ...JSON.parse(JSON.stringify(v)), flightNumber: 'AD 4012', departure: { airport: 'BSB', datetime: '2026-09-19T14:00:00-03:00' }, arrival: { airport: 'GRU', datetime: '2026-09-19T16:00:00-03:00' } };
  c.trips.splice(1, 1, a, b);
  return c;
};
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

module.exports = { single, ida, volta, interno, combinado3, combinadoConexao, combinado, combinadoMulti, printTrip, printIda };
