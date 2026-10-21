const { mergeNewFlights, reconcileByRoute } = require('../helpers/flightChangeMerge');
const F = require('./fixtures/flightChangeCombined');

const clone = (o) => JSON.parse(JSON.stringify(o));
const warns = (m) => m.meta.mergeWarnings;
const erro = (fn) => { try { fn(); } catch (e) { return e; } throw new Error('não lançou'); };
const ap = (a, dt) => ({ airport: a, airportName: null, datetime: dt });
const leg = (dir, o, d, flight, dep, arr) => F.printTrip(dir, { flightNumber: flight, departure: ap(o, dep), arrival: ap(d, arr) });
const AVISO_VOLTA = 'O print identificava ida mas, pela rota (REC → GRU), usei como volta.';

describe('reconciliação da direção pela rota (caminho restrito)', () => {
  test('(a) volta marcada e print com UM trecho REC→GRU rotulado "ida": troca a volta, ida intacta, com aviso', () => {
    const old = F.combinado();
    const m = mergeNewFlights(old, { trips: [F.printTrip('ida')] }, { affected: [1] });
    expect(m.trips[0]).toEqual(old.trips[0]);
    expect(m.trips[1]).toMatchObject({ direction: 'volta', flightNumber: 'AD 4010', locator: 'XYZ789' });
    expect(warns(m)).toEqual([AVISO_VOLTA]);
  });

  test('(b) rotulado "multi" ou sem rótulo: reconcilia pela rota, sem aviso (não havia rótulo a corrigir)', () => {
    for (const direction of ['multi', null, 'xpto']) {
      const m = mergeNewFlights(F.combinado(), { trips: [F.printTrip(direction)] }, { affected: [1] });
      expect(m.trips[1]).toMatchObject({ direction: 'volta', flightNumber: 'AD 4010' });
      expect(m.trips[0].flightNumber).toBe('AD 4001');
      expect(warns(m)).toEqual([]);
    }
  });

  test('(c) rota do print não casa com nada (aeroporto mudou) e mesmo nº de trechos que marcados: pareia por ordem com aviso', () => {
    const old = F.combinado();
    const t = leg('ida', 'SSA', 'GRU', 'AD 4010', '2026-09-19T15:10:00-03:00', '2026-09-19T18:40:00-03:00');
    const m = mergeNewFlights(old, { trips: [t] }, { affected: [1] });
    expect(m.trips[0]).toEqual(old.trips[0]);
    expect(m.trips[1]).toMatchObject({ direction: 'volta', flightNumber: 'AD 4010', locator: 'XYZ789' });
    expect(m.trips[1].departure.airport).toBe('SSA');
    expect(warns(m)).toEqual(['O print identificava ida mas, pela sua marcação e pela rota (SSA → GRU), usei como volta.']);
  });

  test('trecho do print com a rota de um trecho NÃO marcado (voo/horário mudou) não é candidato da marcação', () => {
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const e = erro(() => mergeNewFlights(F.combinado(), { trips: [F.printIda({ flightNumber: 'AD 9999' })] }, { affected: [1] }));
    expect(e.status).toBe(422);
    log.mockRestore();
  });

  test('(f) conexão marcada (2 trechos) com print rotulado errado: rota casa => ambos viram a direção marcada', () => {
    const old = F.combinado();
    old.trips.push({ ...clone(old.trips[1]), flightNumber: 'AD 4003', departure: { airport: 'GRU', datetime: '2026-09-19T17:00:00-03:00' }, arrival: { airport: 'CWB', datetime: '2026-09-19T18:00:00-03:00' } });
    old.trips[1].arrival = { airport: 'GRU', datetime: '2026-09-19T15:30:00-03:00' };
    const novo = [
      leg('ida', 'REC', 'GRU', 'AD 4010', '2026-09-19T14:00:00-03:00', '2026-09-19T16:00:00-03:00'),
      leg('ida', 'GRU', 'CWB', 'AD 4011', '2026-09-19T17:30:00-03:00', '2026-09-19T18:30:00-03:00')
    ];
    const m = mergeNewFlights(old, { trips: novo }, { affected: [1, 2] });
    expect(m.trips.map(t => [t.direction, t.flightNumber])).toEqual([['ida', 'AD 4001'], ['volta', 'AD 4010'], ['volta', 'AD 4011']]);
    expect(warns(m)).toEqual([
      'O print identificava ida mas, pela rota (REC → GRU), usei como volta.',
      'O print identificava ida mas, pela rota (GRU → CWB), usei como volta.']);
    // rotas mudaram: pareia por ordem cronológica, mesmo se o print vier fora de ordem
    const trocadas = [
      leg('ida', 'SSA', 'CWB', 'AD 4021', '2026-09-19T20:00:00-03:00', '2026-09-19T21:00:00-03:00'),
      leg('ida', 'SSA', 'GRU', 'AD 4020', '2026-09-19T14:00:00-03:00', '2026-09-19T16:00:00-03:00')
    ];
    const m2 = mergeNewFlights(old, { trips: trocadas }, { affected: [1, 2] });
    expect(m2.trips.map(t => [t.direction, t.flightNumber])).toEqual([['ida', 'AD 4001'], ['volta', 'AD 4020'], ['volta', 'AD 4021']]);
    // 1 trecho de rota desconhecida para 2 marcados: 422 claro
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const e = erro(() => mergeNewFlights(old, { trips: [trocadas[0]] }, { affected: [1, 2] }));
    expect(e.status).toBe(422);
    expect(e.body.error).toBe('O print mostra 1 trecho(s) e você marcou 2. Marque exatamente os trechos que aparecem no print, ou envie um print só do trecho alterado.');
    log.mockRestore();
  });
});

describe('reconciliação pela rota no caminho NÃO restrito', () => {
  const simples = () => {
    const v = F.ida();
    v.trips.push({ ...clone(v.trips[0]), direction: 'volta', flightNumber: 'AD 4002', departure: { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' }, arrival: { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' }, dateLabel: '19 SET 2026' });
    return v;
  };

  test('(e) print só da volta rotulado "ida" (REC→GRU): substitui a VOLTA, não a ida, e avisa', () => {
    for (const opts of [undefined, { affected: [0, 1] }]) {
      const old = simples();
      const m = mergeNewFlights(old, { trips: [F.printTrip('ida')] }, opts);
      expect(m.trips[0].flightNumber).toBe('AD 4001');
      expect(m.trips[1]).toMatchObject({ direction: 'volta', flightNumber: 'AD 4010' });
      expect(warns(m)).toContain(AVISO_VOLTA);
    }
  });

  test('rota correta e rótulo correto: nada muda, sem aviso; trecho sem rótulo continua com a regra antiga', () => {
    const m = mergeNewFlights(simples(), { trips: [F.printTrip('volta')] });
    expect(m.trips.map(t => t.flightNumber)).toEqual(['AD 4001', 'AD 4010']);
    expect(warns(m)).toEqual([]);
  });
});

describe('reconcileByRoute', () => {
  const cand = (dir, o, d) => ({ direction: dir, departure: { airport: o }, arrival: { airport: d } });
  const ext = (dir, o, d) => ({ direction: dir, departure: { airport: o }, arrival: { airport: d } });

  test('(g) rota que casa com mais de uma direção distinta, ou com nenhuma, não é reconciliada', () => {
    const avisos = [];
    const t1 = ext('volta', 'GRU', 'REC'), t2 = ext('ida', 'SSA', 'BSB'), t3 = ext('volta', 'GRU', 'REC');
    reconcileByRoute([cand('ida', 'GRU', 'REC'), cand('interno', 'GRU', 'REC')], [t1, t2, t3], (m) => avisos.push(m), false);
    expect([t1.direction, t2.direction, t3.direction]).toEqual(['volta', 'ida', 'volta']);
    expect(avisos).toEqual([]);
  });

  test('rota que casa com várias viagens da MESMA direção é reconciliada; soRotulados ignora os sem rótulo', () => {
    const a = ext('ida', 'REC', 'GRU'), b = ext(null, 'REC', 'GRU');
    const avisos = [];
    reconcileByRoute([cand('volta', 'REC', 'GRU'), cand('volta', 'REC', 'GRU')], [a, b], (m) => avisos.push(m), true);
    expect(a.direction).toBe('volta'); expect(b.direction).toBeNull();
    expect(avisos).toHaveLength(1);
    reconcileByRoute([cand('volta', 'REC', 'GRU')], [b], () => {}, false);
    expect(b.direction).toBe('volta');
  });
});
