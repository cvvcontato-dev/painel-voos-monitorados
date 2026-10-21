const J = require('../helpers/flightJourneys');
const { reservationGroups } = require('../helpers/flightChangeReservations');
const { mergeNewFlights } = require('../helpers/flightChangeMerge');
const { diffVouchers } = require('../helpers/flightChangeDiff');
const { buildNoticeText, buildConfirmationText } = require('../helpers/flightChangeMessage');
const F = require('./fixtures/flightChangeCombined');

const clone = (o) => JSON.parse(JSON.stringify(o));
const ap = (a, dt) => ({ airport: a, airportName: null, datetime: dt });
const leg = (dir, o, d, flight, dep, arr) => F.printTrip(dir, { flightNumber: flight, departure: ap(o, dep), arrival: ap(d, arr) });
const erro = (fn) => { try { fn(); } catch (e) { return e; } throw new Error('não lançou'); };
const warns = (m) => m.meta.mergeWarnings;
const direto = (dir = 'volta') => leg(dir, 'REC', 'GRU', 'AD 4020', '2026-09-19T11:00:00-03:00', '2026-09-19T14:30:00-03:00');
const resumo = (m) => m.trips.map(t => `${t.direction}:${t.flightNumber}:${t.locator}`);

describe('journeysOf', () => {
  test('voos consecutivos da mesma direção e reserva, encadeados (<24h) formam uma viagem', () => {
    const j = J.journeysOf(F.combinadoConexao());
    expect(j.map(x => [x.key, x.direction, x.origin, x.destination, x.indexes])).toEqual([
      ['j0', 'ida', 'GRU', 'REC', [0]], ['j1', 'volta', 'REC', 'GRU', [1, 2]]]);
    expect(J.journeyLabel(j[1])).toBe('Volta · REC → BSB → GRU · 19 SET 2026');
    expect(J.journeyLabel(j[0])).toBe('Ida · GRU → REC · 12 SET 2026 · direto');
    expect(J.journeyTitle(j[0])).toBe('Ida · GRU → REC · 12 SET 2026');
  });

  test('não encadeia: intervalo de 24h ou mais, aeroporto diferente, outra direção ou outra reserva', () => {
    const base = F.combinadoConexao();
    const gap = clone(base); gap.trips[2].departure.datetime = '2026-09-20T14:00:00-03:00'; gap.trips[2].arrival.datetime = '2026-09-20T16:00:00-03:00';
    expect(J.journeysOf(gap)).toHaveLength(3);
    const aero = clone(base); aero.trips[2].departure.airport = 'CNF';
    expect(J.journeysOf(aero)).toHaveLength(3);
    const outraReserva = clone(base); outraReserva.trips[2].locator = 'OUTRO1';
    expect(J.journeysOf(outraReserva)).toHaveLength(3);
    const outraDir = clone(base); outraDir.trips[2].direction = 'interno';
    expect(J.journeysOf(outraDir)).toHaveLength(3);
  });
});

describe('chainPrintTrips', () => {
  test('ordena por partida e encadeia, ignorando rótulos; sem encadeamento = viagens separadas', () => {
    const v = J.chainPrintTrips([
      leg('ida', 'BSB', 'GRU', 'AD 2', '2026-09-19T14:00:00-03:00', '2026-09-19T16:00:00-03:00'),
      leg(null, 'REC', 'BSB', 'AD 1', '2026-09-19T10:00:00-03:00', '2026-09-19T12:30:00-03:00')
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].trips.map(t => t.flightNumber)).toEqual(['AD 1', 'AD 2']);
    expect([v[0].origin, v[0].destination, v[0].direction]).toEqual(['REC', 'GRU', 'ida']);
    const soltos = J.chainPrintTrips([
      leg(null, 'REC', 'BSB', 'AD 1', '2026-09-19T10:00:00-03:00', '2026-09-19T12:30:00-03:00'),
      leg(null, 'SSA', 'GRU', 'AD 2', '2026-09-19T14:00:00-03:00', '2026-09-19T16:00:00-03:00')
    ]);
    expect(soltos).toHaveLength(2);
  });

  test('rótulos diferentes desempatam: ida e volta que "encadeiam" por aeroporto/horário continuam separadas', () => {
    const t = [
      leg('ida', 'GRU', 'REC', 'AD 1', '2026-09-12T08:30:00-03:00', '2026-09-12T11:45:00-03:00'),
      leg('volta', 'REC', 'GRU', 'AD 2', '2026-09-12T13:00:00-03:00', '2026-09-12T16:30:00-03:00')
    ];
    expect(J.chainPrintTrips(t)).toHaveLength(2);
    t.forEach(x => { x.direction = null; });
    expect(J.chainPrintTrips(t)).toHaveLength(1);
  });
});

describe('marcação por viagem', () => {
  test('expandAffected: qualquer voo marcado marca a viagem inteira', () => {
    const v = F.combinadoConexao();
    expect(J.expandAffected(v, [2])).toEqual([1, 2]);
    expect(J.expandAffected(v, [1])).toEqual([1, 2]);
    expect(J.expandAffected(v, [0, 2])).toEqual([0, 1, 2]);
    expect(J.expandAffected(v, [])).toBeNull();
    expect(J.expandAffected(v, [9])).toBeNull();
  });

  test('reservation_groups[].journeys: key, direção, origem/destino, rótulo com conexões, segments e voos', () => {
    const g = reservationGroups(F.combinadoConexao());
    expect(g[1].trips.map(t => t.index)).toEqual([1, 2]);            // compat: voos
    expect(g[1].journeys).toEqual([{
      key: 'j1', direction: 'volta', origin: 'REC', destination: 'GRU', label: 'Volta · REC → BSB → GRU · 19 SET 2026', segments: 2,
      trips: [{ index: 1, label: 'Volta · REC → BSB · 19 SET 2026' }, { index: 2, label: 'Volta · BSB → GRU · 19 SET 2026' }]
    }]);
    expect(g[0].journeys[0]).toMatchObject({ key: 'j0', segments: 1, label: 'Ida · GRU → REC · 12 SET 2026 · direto' });
  });
});

describe('merge por viagem', () => {
  const merge = (old, trips, affected, extra = {}) => mergeNewFlights(old, { carrier: 'azul', locator: null, trips, ...extra }, { affected });

  test('conexão -> direto: o bloco inteiro da volta vira 1 voo, reserva e direção herdadas', () => {
    for (const affected of [[1], [2], [1, 2]]) {
      const old = F.combinadoConexao();
      const m = merge(old, [direto()], affected);
      expect(resumo(m)).toEqual(['ida:AD 4001:ABC123', 'volta:AD 4020:XYZ789']);
      expect(m.trips[0]).toEqual(old.trips[0]);
      expect(m.route).toEqual({ origin: 'GRU', destination: 'REC' });
      expect(warns(m)).toEqual([]);
    }
  });

  test('conexão -> direto com o print rotulado "ida": reconcilia pela viagem inteira com UM aviso', () => {
    const m = merge(F.combinadoConexao(), [direto('ida')], [1, 2]);
    expect(resumo(m)).toEqual(['ida:AD 4001:ABC123', 'volta:AD 4020:XYZ789']);
    expect(warns(m)).toEqual(['O print identificava ida mas, pela rota (REC → GRU), usei como volta.']);
  });

  test('direto -> conexão: a volta direta vira 2 voos', () => {
    const m = merge(F.combinado(), [
      leg('volta', 'REC', 'SSA', 'AD 5001', '2026-09-19T09:00:00-03:00', '2026-09-19T10:30:00-03:00'),
      leg('volta', 'SSA', 'GRU', 'AD 5002', '2026-09-19T12:00:00-03:00', '2026-09-19T15:00:00-03:00')], [1]);
    expect(resumo(m)).toEqual(['ida:AD 4001:ABC123', 'volta:AD 5001:XYZ789', 'volta:AD 5002:XYZ789']);
    expect(m.trips[1].cabinClass).toBe('Econômica');          // herdado por posição
    expect(m.trips[2].cabinClass).toBe('Econômica');           // voo extra herda o do ÚLTIMO voo da viagem antiga
    expect(m.trips[2].status).toBe('Confirmado');
    expect(warns(m)).toEqual([]);
  });

  test('conexão -> conexão por outra escala, e mesma rota com horário novo', () => {
    const outra = merge(F.combinadoConexao(), [
      leg('volta', 'REC', 'SSA', 'AD 5001', '2026-09-19T09:00:00-03:00', '2026-09-19T10:30:00-03:00'),
      leg('volta', 'SSA', 'GRU', 'AD 5002', '2026-09-19T12:00:00-03:00', '2026-09-19T15:00:00-03:00')], [1, 2]);
    expect(resumo(outra)).toEqual(['ida:AD 4001:ABC123', 'volta:AD 5001:XYZ789', 'volta:AD 5002:XYZ789']);
    const horario = merge(F.combinadoConexao(), [
      leg('volta', 'REC', 'BSB', 'AD 4002', '2026-09-19T11:00:00-03:00', '2026-09-19T13:30:00-03:00'),
      leg('volta', 'BSB', 'GRU', 'AD 4012', '2026-09-19T15:00:00-03:00', '2026-09-19T17:00:00-03:00')], [1, 2]);
    expect(horario.trips.map(t => t.departure.datetime.slice(11, 16))).toEqual(['08:30', '11:00', '15:00']);
  });

  test('print com ida (igual) e volta, só a volta marcada: a ida é descartada em silêncio', () => {
    const m = merge(F.combinadoConexao(), [F.printIda(), direto()], [1, 2]);
    expect(resumo(m)).toEqual(['ida:AD 4001:ABC123', 'volta:AD 4020:XYZ789']);
    expect(warns(m)).toEqual([]);
  });

  test('dois voos do print que não se encadeiam são 2 viagens: 422 em viagens (1 marcada)', () => {
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const e = erro(() => merge(F.combinadoConexao(), [
      leg('volta', 'SSA', 'FOR', 'AD 1', '2026-09-19T09:00:00-03:00', '2026-09-19T10:30:00-03:00'),
      leg('volta', 'BSB', 'CWB', 'AD 2', '2026-09-19T12:00:00-03:00', '2026-09-19T15:00:00-03:00')], [1, 2]));
    expect(e.status).toBe(422);
    expect(e.body.error).toBe('O print mostra 2 viagem(ns) e você marcou 1. Marque exatamente as viagens que aparecem no print, ou envie um print só da viagem alterada.');
    log.mockRestore();
  });

  test('sem marcação (legado): conexão -> direto troca o bloco da direção, inclusive com rótulo errado', () => {
    const simples = F.combinadoConexao();
    simples.trips.forEach(t => { t.locator = 'ABC123'; });
    simples.reservation = { locator: 'ABC123', status: 'Confirmada' };
    const certo = mergeNewFlights(clone(simples), { trips: [direto('volta')] });
    expect(certo.trips.map(t => `${t.direction}:${t.flightNumber}`)).toEqual(['ida:AD 4001', 'volta:AD 4020']);
    const errado = mergeNewFlights(clone(simples), { trips: [direto('ida')] });
    expect(errado.trips.map(t => `${t.direction}:${t.flightNumber}`)).toEqual(['ida:AD 4001', 'volta:AD 4020']);
    expect(warns(errado)).toContain('O print identificava ida mas, pela rota (REC → GRU), usei como volta.');
  });
});

describe('diff por viagem', () => {
  const novoDireto = (old) => mergeNewFlights(old, { trips: [direto()] }, { affected: [1, 2] });

  test('conexão -> direto: UMA entrada "alterado" por viagem, com itinerario, partida e chegada', () => {
    const old = F.combinadoConexao();
    const d = diffVouchers(old, novoDireto(old), { affected: [1, 2] });
    expect(d.trips.map(t => `${t.direction}:${t.status}`)).toEqual(['ida:igual', 'volta:alterado']);
    const v = d.trips[1];
    expect(v.journey).toBe(true);
    expect(v.changes).toEqual([
      { campo: 'itinerario', antes: 'REC → BSB → GRU (AD 4002 + AD 4012)', depois: 'REC → GRU (AD 4020, direto)' },
      { campo: 'partida', antes: '19/09/2026 10:00', depois: '19/09/2026 11:00' },
      { campo: 'chegada', antes: '19/09/2026 16:00', depois: '19/09/2026 14:30' }
    ]);
    expect([v.new.departure.airport, v.new.arrival.airport, v.old.arrival.airport, v.new.flightNumber, v.old.flightNumber])
      .toEqual(['REC', 'GRU', 'GRU', 'AD 4020', 'AD 4002 + AD 4012']);
    expect(d.hasChanges).toBe(true);
    expect(d.affectedReservations).toEqual([{ locator: 'XYZ789', directions: ['volta'] }]);
  });

  test('direto -> conexão também gera uma só entrada; mesma estrutura segue voo a voo', () => {
    const old = F.combinado();
    const novo = mergeNewFlights(old, { trips: [
      leg('volta', 'REC', 'SSA', 'AD 5001', '2026-09-19T09:00:00-03:00', '2026-09-19T10:30:00-03:00'),
      leg('volta', 'SSA', 'GRU', 'AD 5002', '2026-09-19T12:00:00-03:00', '2026-09-19T15:00:00-03:00')] }, { affected: [1] });
    const d = diffVouchers(old, novo, { affected: [1] });
    expect(d.trips.map(t => `${t.direction}:${t.status}`)).toEqual(['ida:igual', 'volta:alterado']);
    expect(d.trips[1].changes[0]).toEqual({ campo: 'itinerario', antes: 'REC → GRU (AD 4002, direto)', depois: 'REC → SSA → GRU (AD 5001 + AD 5002)' });
    const con = F.combinadoConexao();
    const horario = clone(con); horario.trips[2].arrival.datetime = '2026-09-19T17:00:00-03:00';
    const d2 = diffVouchers(con, horario, { affected: [1, 2] });
    expect(d2.trips.map(t => `${t.direction}:${t.status}`)).toEqual(['ida:igual', 'volta:igual', 'volta:alterado']);
    expect(d2.trips[2].journey).toBeUndefined();
  });
});

describe('mensagens por viagem', () => {
  const fluxo = (old, trips, affected) => {
    const novo = mergeNewFlights(old, { trips }, { affected });
    return { novo, diff: diffVouchers(old, novo, { affected }) };
  };

  test('aviso cita origem/destino da VIAGEM inteira (nunca o 1º voo isolado), mesmo marcando só um voo', () => {
    const old = F.combinadoConexao();
    for (const affected of [[1], [2], [1, 2]]) {
      const t = buildNoticeText(old, { affected });
      expect(t).toContain('A companhia aérea fez uma alteração no seu voo de *volta* da reserva *XYZ789* (REC → GRU, 19 SET 2026).');
      expect(t).not.toContain('BSB');
    }
  });

  test('(a) volta com conexão -> direto: confirmação com título da viagem e linha Itinerário', () => {
    const old = F.combinadoConexao();
    const { novo, diff } = fluxo(old, [direto()], [1, 2]);
    const t = buildConfirmationText(novo, diff, {});
    expect(t).toBe([
      'Olá, *Joao*! 😊', '',
      'Seu voo foi reajustado ✅ Reserva *XYZ789*', '',
      '*Volta (REC → GRU)*',
      '• Itinerário: de REC → BSB → GRU (AD 4002 + AD 4012) para REC → GRU (AD 4020, direto)',
      '• Partida: 19/09/2026 10:00 → 19/09/2026 11:00',
      '• Chegada: 19/09/2026 16:00 → 19/09/2026 14:30', '',
      'Em instantes enviamos o novo voucher.'].join('\n'));
  });

  test('(b) ida direta -> com 1 conexão: aviso e confirmação', () => {
    const old = F.combinado();
    const { novo, diff } = fluxo(old, [
      leg('ida', 'GRU', 'BSB', 'AD 6001', '2026-09-12T07:00:00-03:00', '2026-09-12T08:40:00-03:00'),
      leg('ida', 'BSB', 'REC', 'AD 6002', '2026-09-12T10:00:00-03:00', '2026-09-12T12:30:00-03:00')], [0]);
    expect(buildNoticeText(old, { affected: [0] })).toContain('no seu voo de *ida* da reserva *ABC123* (GRU → REC, 12 SET 2026).');
    const t = buildConfirmationText(novo, diff, {});
    expect(t).toContain('Seu voo foi reajustado ✅ Reserva *ABC123*');
    expect(t).toContain('*Ida (GRU → REC)*');
    expect(t).toContain('• Itinerário: de GRU → REC (AD 4001, direto) para GRU → BSB → REC (AD 6001 + AD 6002)');
    expect(t).toContain('• Partida: 12/09/2026 08:30 → 12/09/2026 07:00');
    expect(t).not.toContain('Volta');
  });
});

describe('revisão: classe, viagens inteiras removidas/incluídas e normalização', () => {
  const diretoComClasse = (cabinClass) => leg('volta', 'REC', 'GRU', 'AD 4020', '2026-09-19T11:00:00-03:00', '2026-09-19T14:30:00-03:00');

  test('conexão -> direto com classe nova: o diff e a confirmação mostram "Classe: antes → depois"', () => {
    const old = F.combinadoConexao();
    const novoTrip = diretoComClasse(); novoTrip.cabinClass = 'Executiva';
    const novo = mergeNewFlights(old, { trips: [novoTrip] }, { affected: [1, 2] });
    const d = diffVouchers(old, novo, { affected: [1, 2] });
    expect(d.trips[1].changes.map(c => c.campo)).toEqual(['itinerario', 'partida', 'chegada', 'classe']);
    expect(d.trips[1].changes[3]).toEqual({ campo: 'classe', antes: 'Econômica', depois: 'Executiva' });
    expect(buildConfirmationText(novo, d, {})).toContain('• Classe: Econômica → Executiva');
  });

  test('classe: lista quando os voos divergem; sem classe de um dos lados não conta', () => {
    const old = F.combinadoConexao();
    old.trips[2].cabinClass = 'Executiva';
    const novoTrip = diretoComClasse(); novoTrip.cabinClass = 'Econômica';
    const d = diffVouchers(old, mergeNewFlights(old, { trips: [novoTrip] }, { affected: [1] }), { affected: [1] });
    expect(d.trips[1].changes.find(c => c.campo === 'classe')).toEqual({ campo: 'classe', antes: 'Econômica + Executiva', depois: 'Econômica' });
    const sem = F.combinadoConexao();
    sem.trips.forEach(t => { t.cabinClass = null; });
    const novoTrip2 = diretoComClasse(); novoTrip2.cabinClass = 'Executiva';
    const d2 = diffVouchers(sem, mergeNewFlights(sem, { trips: [novoTrip2] }, { affected: [1] }), { affected: [1] });
    expect(d2.trips[1].changes.some(c => c.campo === 'classe')).toBe(false);
  });

  test('viagem com conexão cancelada: UMA entrada "removido" (journey) e uma só linha "Viagem cancelada"', () => {
    const old = F.combinadoConexao();
    const novo = clone(old); novo.trips = [novo.trips[0]];
    const d = diffVouchers(old, novo, { affected: [1, 2] });
    expect(d.trips.map(t => `${t.direction}:${t.status}`)).toEqual(['ida:igual', 'volta:removido']);
    expect(d.trips[1]).toMatchObject({ journey: true, new: null });
    const t = buildConfirmationText(novo, d, {});
    expect(t).toContain('*Volta (REC → GRU)*\n• Viagem cancelada\n• Itinerário: REC → BSB → GRU (AD 4002 + AD 4012)');
    expect(t).not.toContain('Trecho cancelado');
    expect(d.hasChanges).toBe(true);
  });

  test('viagem com conexão incluída: UMA entrada "novo" (journey) com o itinerário; voo simples segue como antes', () => {
    const novo = F.combinadoConexao();
    const old = clone(novo); old.trips = [old.trips[0]];
    const d = diffVouchers(old, novo);
    expect(d.trips.map(t => `${t.direction}:${t.status}`)).toEqual(['ida:igual', 'volta:novo']);
    expect(buildConfirmationText(novo, d, {})).toContain('*Volta (REC → GRU)*\n• Viagem incluída\n• Itinerário: REC → BSB → GRU (AD 4002 + AD 4012)');
    const simples = F.combinado(); simples.trips = [simples.trips[0]];
    const d2 = diffVouchers(simples, F.combinado());
    expect(buildConfirmationText(F.combinado(), d2, {})).toContain('• Trecho incluído');
  });

  test('itinerário normaliza o número do voo (espaços repetidos)', () => {
    const t = [{ flightNumber: ' AD   4002 ', departure: { airport: 'REC' }, arrival: { airport: 'GRU' } }];
    expect(J.itineraryText(t)).toBe('REC → GRU (AD 4002, direto)');
    const old = F.combinadoConexao();
    old.trips[1].flightNumber = 'AD  4002';
    const novo = mergeNewFlights(old, { trips: [direto()] }, { affected: [1] });
    expect(diffVouchers(old, novo, { affected: [1] }).trips[1].changes[0].antes).toBe('REC → BSB → GRU (AD 4002 + AD 4012)');
  });
});
