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
  expect(d1.hasChanges).toBe(true);
  expect(d2.hasChanges).toBe(true);
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

test('datetime inválido: textos diferentes => alterado; iguais => igual; nulo vs válido => alterado', () => {
  const mk = (dt) => { const x = v(); x.trips[0].departure.datetime = dt; return x; };
  const d = diffVouchers(mk('x'), mk('z'));
  expect(d.trips[0].status).toBe('alterado');
  expect(d.trips[0].changes).toEqual([{ campo: 'partida', antes: 'x', depois: 'z' }]);
  expect(diffVouchers(mk('x'), mk('x')).trips[0].status).toBe('igual');
  expect(diffVouchers(mk(null), v()).trips[0].status).toBe('alterado');
});

test('pareamento: trecho removido no meio não vira alterado + removido', () => {
  const mk = (flightNumber, dep) => trip({ direction: 'multi', flightNumber,
    departure: { airport: 'GRU', datetime: dep } });
  const a = v({ trips: [mk('G3 1234', '2026-09-10T08:00:00-03:00'), mk('A1', '2026-09-11T09:00:00-03:00')] });
  const b = v({ trips: [mk('A1', '2026-09-11T09:00:00-03:00')] });
  expect(diffVouchers(a, b).trips.map(t => t.status)).toEqual(['removido', 'igual']);
});

test('pareamento: troca de voo no mesmo dia/direção cai no passe por ordem', () => {
  const n = v(); n.trips[0].flightNumber = 'AD 9999';
  const d = diffVouchers(v(), n);
  expect(d.trips[0].status).toBe('alterado');
  expect(d.trips[0].changes.map(c => c.campo)).toEqual(['voo']);
});

test('datetime sem offset é tratado como -03:00', () => {
  const n = v(); n.trips[0].departure.datetime = '2026-09-12T08:30:00';
  expect(diffVouchers(v(), n).trips[0].status).toBe('igual');
});

test('passageiros sem nome são ignorados', () => {
  const n = v({ passengers: [...v().passengers, {}, { name: '  ' }] });
  expect(diffVouchers(v(), n).passengers).toEqual({ adicionados: [], removidos: [] });
});

test('voo "G3 1234" vs "G31234" => igual; quantity "1" vs 1 => sem mudança', () => {
  const a = v(); a.trips[0].flightNumber = 'G3 1234';
  const b = v(); b.trips[0].flightNumber = 'G31234';
  expect(diffVouchers(a, b).trips[0].status).toBe('igual');
  const c = v({ baggage: [{ direction: 'ida', weightText: '23kg', quantity: '1' }] });
  expect(diffVouchers(v(), c).baggageChanged).toBe(false);
});

describe('nomes de passageiros: conjunto de tokens', () => {
  const pax = (...names) => names.map(name => ({ name }));
  const dp = (a, b) => diffVouchers(v({ passengers: pax(...a) }), v({ passengers: pax(...b) })).passengers;

  test('caso real: 4 pessoas em formato "SOBRENOME, NOME" vs "NOME SOBRENOME" não mudam', () => {
    const a = ['BRITO, ALCIMARA', 'GONZAGA, TIELE', 'SILVA, JOSE', 'LIMA, ANA'];
    const b = ['ALCIMARA BRITO', 'TIELE GONZAGA', 'Jose  Silva', 'Ana Lima'];
    expect(dp(a, b)).toEqual({ adicionados: [], removidos: [] });
    expect(dp(b, a)).toEqual({ adicionados: [], removidos: [] });
  });
  test('acentos, pontuação, iniciais e preposições são ignorados', () => {
    expect(dp(['JOÃO P. DE SOUZA'], ['Souza, Joao'])).toEqual({ adicionados: [], removidos: [] });
    expect(dp(['MARIA-CLARA DOS SANTOS'], ['SANTOS MARIA CLARA'])).toEqual({ adicionados: [], removidos: [] });
  });
  test('subconjunto estrito (menor com ≥2 tokens) é o mesmo passageiro', () => {
    expect(dp(['MARIA SILVA'], ['MARIA DE FATIMA SILVA'])).toEqual({ adicionados: [], removidos: [] });
    expect(dp(['MARIA DE FATIMA SILVA'], ['SILVA, MARIA'])).toEqual({ adicionados: [], removidos: [] });
  });
  test('homônimo parcial de 1 token NÃO casa', () => {
    expect(dp(['MARIA'], ['MARIA SILVA'])).toEqual({ adicionados: ['MARIA SILVA'], removidos: ['MARIA'] });
  });
  test('pessoa realmente diferente continua detectada (nome original exibido)', () => {
    expect(dp(['BRITO, ALCIMARA', 'LIMA, ANA'], ['ALCIMARA BRITO', 'Pedro Costa']))
      .toEqual({ adicionados: ['Pedro Costa'], removidos: ['LIMA, ANA'] });
  });
  test('mesmo sobrenome, nome diferente não casa', () => {
    expect(dp(['ANA SILVA'], ['BIA SILVA'])).toEqual({ adicionados: ['BIA SILVA'], removidos: ['ANA SILVA'] });
  });
});

describe('bagagem: normalização por tipo/kg/qty', () => {
  const bag = (...b) => diffVouchers(v({ baggage: [{ direction: 'ida', weightText: '23kg', quantity: 1 }] }), v({ baggage: b }));
  const same = (...b) => expect(bag(...b).baggageChanged).toBe(false);

  test('23kg, 23 KG e "Até 23 kg" são iguais; label diferente com mesmo conteúdo também', () => {
    same({ direction: 'ida', weightText: '23 KG', quantity: 1 });
    same({ direction: 'ida', weightText: 'Até 23 kg', quantity: 1 });
    same({ direction: 'ida', label: 'Bagagem de porão', weightText: '23kg', quantity: 1 });
    same({ direction: 'ida', label: 'Despachada 23 kg', quantity: 1 });
  });
  test('ida+volta vs uma entrada: igual (maior qty por chave, ignora direction)', () => {
    same({ direction: 'ida', weightText: '23kg', quantity: 1 }, { direction: 'volta', weightText: '23kg', quantity: 1 });
  });
  test('um lado sem bagagem é desconhecido: sem mudança', () => {
    expect(bag().baggageChanged).toBe(false);
    expect(bag().baggageDetail).toBeNull();
    const d = diffVouchers(v({ baggage: [] }), v());
    expect(d.baggageChanged).toBe(false);
  });
  test('23kg → 32kg mudou, com detalhe', () => {
    const d = bag({ direction: 'ida', weightText: '32kg', quantity: 1 });
    expect(d.baggageChanged).toBe(true); expect(d.hasChanges).toBe(true);
    expect(d.baggageDetail).toEqual({ antes: ['1× despachada 23kg'], depois: ['1× despachada 32kg'] });
  });
  test('qty 1 → 2 mudou', () => {
    expect(bag({ direction: 'ida', weightText: '23kg', quantity: 2 }).baggageChanged).toBe(true);
  });
  test('item de mão adicionado mudou', () => {
    const d = bag({ direction: 'ida', weightText: '23kg', quantity: 1 }, { direction: 'ida', label: 'Bagagem de mão', weightText: '10kg', quantity: 1 });
    expect(d.baggageChanged).toBe(true);
    expect(d.baggageDetail.depois).toContain('1× mão 10kg');
  });
  test('kg decimal com vírgula', () => {
    same({ direction: 'ida', weightText: '23,0 kg', quantity: 1 });
  });
});

describe('revisão: nomes (iniciais, GDS, sufixos) e bagagem (unidade, qty, direção)', () => {
  const pax = (...names) => names.map(name => ({ name }));
  const dp = (a, b) => diffVouchers(v({ passengers: pax(...a) }), v({ passengers: pax(...b) })).passengers;
  const NONE = { adicionados: [], removidos: [] };

  test('iniciais contam na chave exata: J SILVA != A SILVA; "J S" não some das listas', () => {
    expect(dp(['J SILVA'], ['A SILVA'])).toEqual({ adicionados: ['A SILVA'], removidos: ['J SILVA'] });
    expect(dp(['J S'], ['A B'])).toEqual({ adicionados: ['A B'], removidos: ['J S'] });
    expect(dp(['J S'], ['J S'])).toEqual(NONE);
  });
  test('iniciais só ajudam no pareamento flexível', () => {
    expect(dp(['JOAO P SOUZA'], ['SOUZA, JOAO'])).toEqual(NONE);
    expect(dp(['JOAO P SOUZA'], ['SOUZA, JOAO R'])).toEqual(NONE);
  });
  test('formato GDS com "/" e títulos', () => {
    expect(dp(['SILVA/JOSE MR'], ['JOSE SILVA'])).toEqual(NONE);
    expect(dp(['SANTOS/ANA MRS', 'LIMA/BIA MISS'], ['Ana Santos', 'Bia Lima'])).toEqual(NONE);
    expect(dp(['SOUZA/LEO CHD'], ['LEO SOUZA'])).toEqual(NONE);
  });
  test('subconjunto não vale se o token extra é sufixo (JUNIOR, FILHO...)', () => {
    expect(dp(['JOSE SILVA'], ['JOSE SILVA JUNIOR'])).toEqual({ adicionados: ['JOSE SILVA JUNIOR'], removidos: ['JOSE SILVA'] });
    expect(dp(['JOSE SILVA'], ['JOSE SILVA FILHO']).adicionados).toEqual(['JOSE SILVA FILHO']);
    expect(dp(['JOSE SILVA'], ['JOSE CARLOS SILVA'])).toEqual(NONE);   // limitação documentada
  });

  const bag = (a, b) => diffVouchers(v({ baggage: a }), v({ baggage: b }));
  const item = (weightText, o = {}) => ({ direction: 'ida', weightText, ...o });

  test('"1 mala despachada" vs "2 malas despachadas": mudou por quantidade, não por kg', () => {
    const d = bag([item('1 mala despachada')], [item('2 malas despachadas')]);
    expect(d.baggageChanged).toBe(true);
    expect(d.baggageDetail).toEqual({ antes: ['1× despachada'], depois: ['2× despachada'] });
  });
  test('"23kg" vs "1 peça de 23kg" igual; "1 mala" dos dois lados igual; 23kg→32kg mudou', () => {
    expect(bag([item('23kg', { quantity: 1 })], [item('1 peça de 23kg')]).baggageChanged).toBe(false);
    expect(bag([item('1 mala')], [item('1 mala', { direction: 'volta' })]).baggageChanged).toBe(false);
    expect(bag([item('23kg')], [item('32kg')]).baggageChanged).toBe(true);
  });
  test('número solto só vale se weightText inteiro for um número', () => {
    expect(bag([item('23')], [item('23 kg')]).baggageChanged).toBe(false);
    expect(bag([item('23')], [item('32')]).baggageChanged).toBe(true);
  });
  test('kg desconhecido em um lado é curinga quando há um único item do tipo em cada lado', () => {
    expect(bag([item('', { label: 'Bagagem despachada', quantity: 1 })], [item('23kg')]).baggageChanged).toBe(false);
    expect(bag([item('', { label: 'Bagagem despachada', quantity: 1 })], [item('23kg', { quantity: 2 })]).baggageChanged).toBe(true);
    // dois itens do tipo em um lado: sem curinga
    expect(bag([item('', { label: 'Bagagem despachada' })], [item('23kg'), item('32kg')]).baggageChanged).toBe(true);
  });
  test('soma dentro da direção, máximo entre direções', () => {
    expect(bag([item('23kg')], [item('23kg'), item('23kg')]).baggageChanged).toBe(true);
    expect(bag([item('23kg')], [item('23kg'), item('23kg', { direction: 'volta' })]).baggageChanged).toBe(false);
    expect(bag([item('23kg'), item('23kg', { direction: 'volta' })], [item('23kg', { direction: undefined })]).baggageChanged).toBe(false);
  });
});
