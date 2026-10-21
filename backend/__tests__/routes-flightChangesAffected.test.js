process.env.EXTRACTION_MODE = 'stub';
jest.mock('../services/voucherRenderer', () => ({
  renderVoucher: jest.fn(async () => {
    const f = require('path').join(require('os').tmpdir(), `fca-test-${Date.now()}-${Math.random()}.pdf`);
    require('fs').writeFileSync(f, 'pdf');
    return f;
  })
}));
delete process.env.GEMINI_API_KEY;
// extractFlights é um jest.fn: por padrão repassa ao stub; os testes injetam o "print" com mockResolvedValueOnce.
jest.mock('../services/voucherExtractor', () => {
  const actual = jest.requireActual('../services/voucherExtractor');
  return { ...actual, extractFlights: jest.fn((...a) => actual.extractFlights(...a)) };
});
const { extractFlights } = require('../services/voucherExtractor');
const request = require('supertest');
const { makeFlightChangeApp, waitForDb, getCsrfFromResponse } = require('./testApp');
const db = require('../database');
const { transporter } = require('../services/notifier');
const F = require('./fixtures/flightChangeCombined');

let app;
const q = {
  get: (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r))),
  run: (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }))
};
async function waitForFlightChanges() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = await q.get("SELECT name FROM sqlite_master WHERE type='table' AND name='flight_changes'").catch(() => null);
    if (r) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('tabela flight_changes não apareceu');
}
beforeAll(async () => { app = makeFlightChangeApp(); await waitForDb(); await waitForFlightChanges(); });
afterEach(() => { jest.restoreAllMocks(); extractFlights.mockClear(); });

async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const csrf = getCsrfFromResponse(await agent.get('/api/auth/me'));
  return { agent, csrf };
}
const pdf = (b = 'fake') => ({ buf: Buffer.from(b), opts: { filename: 'v.pdf', contentType: 'application/pdf' } });
const url = (id, rest = '') => `/api/flight-changes/${id}${rest}`;
const adminId = async () => (await q.get("SELECT id FROM users WHERE email='admin@test.com'")).id;

/** Caso novo a partir de um voucher combinado (ida ABC123 + volta XYZ789) salvo na aba Vouchers. */
async function casoCombinado(agent, csrf, voucher = F.combinado()) {
  const uid = await adminId();
  const v = await q.run("INSERT INTO vouchers (user_id, carrier, layout_version, unified_json) VALUES (?, ?, 'azul.confirmacao.v1', ?)", [uid, voucher.carrier, JSON.stringify(voucher)]);
  const r = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: v.lastID });
  expect(r.status).toBe(201);
  return r.body;
}
const marcar = (agent, csrf, id, affected) => agent.put(url(id, '/affected')).set('X-CSRF-Token', csrf).send({ affected });
const novoVoucher = (agent, csrf, id) => { const f = pdf('print-' + Math.random()); return agent.post(url(id, '/new-voucher')).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts); };
const printVolta = (o = {}) => ({ carrier: 'azul', locator: null, trips: [F.printTrip('volta', o)] });
const statusOf = (d) => d.diff.trips.map(t => `${t.direction}:${t.status}`);

test('o banco ganhou as colunas affected_json e extracted_json', async () => {
  const cols = await new Promise((res, rej) => db.all('PRAGMA table_info(flight_changes)', (e, r) => e ? rej(e) : res(r.map(c => c.name))));
  expect(cols).toEqual(expect.arrayContaining(['affected_json', 'extracted_json', 'confirmation_email_sent_at']));
});

describe('detalhe do caso', () => {
  test('voucher combinado: needs_affected, reservation_groups, nada marcado e sem mensagem de aviso', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    expect(c.needs_affected).toBe(true);
    expect(c.affected).toEqual([0, 1]);
    expect(c.messages.notice).toBeNull();
    expect(c.reservation_groups).toEqual([
      { locator: 'ABC123', carrier: 'azul', appliesTo: 'ida', trips: [{ index: 0, direction: 'ida', label: 'Ida · GRU → REC · 12 SET 2026' }] },
      { locator: 'XYZ789', carrier: 'azul', appliesTo: 'volta', trips: [{ index: 1, direction: 'volta', label: 'Volta · REC → GRU · 19 SET 2026' }] }
    ]);
  });

  test('voucher de uma reserva só: needs_affected=false, aviso normal e um grupo', async () => {
    const { agent, csrf } = await authed();
    const r = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).attach('file', Buffer.from('antigo'), { filename: 'v.pdf', contentType: 'application/pdf' });
    expect(r.body.needs_affected).toBe(false);
    expect(r.body.reservation_groups).toHaveLength(1);
    expect(r.body.affected).toEqual([0, 1]);
    expect(r.body.messages.notice).toContain('*STUB01*');
  });

  test('caso legado já avançado (aviso_enviado / confirmado) com voucher combinado: "todos", sem exigir marcação', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await q.run("UPDATE flight_changes SET status='aviso_enviado' WHERE id=?", [c.id]);
    const d = (await agent.get(url(c.id))).body;
    expect(d.needs_affected).toBe(false);
    expect(d.affected).toEqual([0, 1]);
    expect(d.messages.notice).toContain('no seu voo da reserva *ABC123*');
    // e o novo voucher segue o fluxo antigo (todos os trechos)
    extractFlights.mockResolvedValueOnce({ carrier: 'azul', locator: null, trips: [F.printIda({ flightNumber: 'AD 4003' }), F.printTrip('volta')] });
    const nv = await novoVoucher(agent, csrf, c.id);
    expect(nv.status).toBe(200);
    expect(statusOf(nv.body)).toEqual(['ida:alterado', 'volta:alterado']);
  });
});

describe('guardas escolha_trechos', () => {
  test('new-voucher, notice-sent, send-email (aviso) e email-preview (aviso) devolvem 409 enquanto não marcar', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    const nv = await novoVoucher(agent, csrf, c.id);
    expect(nv.status).toBe(409); expect(nv.body.error).toBe('escolha_trechos');
    expect(nv.body.message).toBe('Marque os trechos alterados antes de continuar');
    expect(extractFlights).not.toHaveBeenCalled();
    const ns = await agent.post(url(c.id, '/notice-sent')).set('X-CSRF-Token', csrf);
    expect(ns.status).toBe(409); expect(ns.body.error).toBe('escolha_trechos');
    const se = await agent.post(url(c.id, '/send-email')).set('X-CSRF-Token', csrf).send({ kind: 'aviso', emails: 'a@b.com' });
    expect(se.status).toBe(409); expect(se.body.error).toBe('escolha_trechos');
    const pv = await agent.get(url(c.id, '/email-preview?kind=aviso'));
    expect(pv.status).toBe(409); expect(pv.body.error).toBe('escolha_trechos');
    expect((await q.get('SELECT status FROM flight_changes WHERE id=?', [c.id])).status).toBe('aviso_pendente');
  });

  test('depois de marcar, tudo libera', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    expect((await marcar(agent, csrf, c.id, [1])).status).toBe(200);
    expect((await agent.get(url(c.id, '/email-preview?kind=aviso'))).status).toBe(200);
    const ns = await agent.post(url(c.id, '/notice-sent')).set('X-CSRF-Token', csrf);
    expect(ns.status).toBe(200); expect(ns.body.status).toBe('aviso_enviado');
  });
});

describe('PUT /:id/affected', () => {
  test('marca só a volta: grava, needs_affected=false e o aviso/e-mail citam só a volta', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    const r = await marcar(agent, csrf, c.id, [1]);
    expect(r.status).toBe(200);
    expect(r.body.affected).toEqual([1]);
    expect(r.body.needs_affected).toBe(false);
    expect(r.body.messages.notice).toContain('no seu voo de *volta* da reserva *XYZ789* (REC → GRU, 19 SET 2026).');
    expect(r.body.messages.notice).not.toContain('ABC123');
    expect((await q.get('SELECT affected_json a FROM flight_changes WHERE id=?', [c.id])).a).toBe('[1]');
    const pv = await agent.get(url(c.id, '/email-preview?kind=aviso'));
    expect(pv.body.html).toContain('voo de <strong>volta</strong> da reserva <strong>XYZ789</strong>');
    expect(pv.body.html).not.toContain('ABC123');
  });

  test('ordena e aceita marcar tudo (continua válido e libera o fluxo)', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    const r = await marcar(agent, csrf, c.id, [1, 0]);
    expect(r.status).toBe(200);
    expect(r.body.affected).toEqual([0, 1]);
    expect(r.body.needs_affected).toBe(false);
    expect(r.body.messages.notice).toContain('no seu voo da reserva *ABC123*');   // todos = texto de sempre
  });

  test('payload inválido: 400 e nada gravado', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    for (const bad of [[], [5], [-1], [0, 0], ['1'], [1.5], 'x', null, undefined, [0, 1, 1], { 0: 1 }]) {
      const r = await marcar(agent, csrf, c.id, bad);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('trechos_invalidos');
    }
    expect((await agent.put(url(c.id, '/affected')).set('X-CSRF-Token', csrf)).status).toBe(400);
    expect((await q.get('SELECT affected_json a FROM flight_changes WHERE id=?', [c.id])).a).toBeNull();
    expect((await agent.get(url(c.id))).body.needs_affected).toBe(true);
  });

  test('caso confirmado: 409; caso inexistente ou de outro usuário: 404; exige autenticação', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [1]);
    extractFlights.mockResolvedValueOnce(printVolta());
    expect((await novoVoucher(agent, csrf, c.id)).status).toBe(200);
    expect((await agent.post(url(c.id, '/confirm')).set('X-CSRF-Token', csrf)).status).toBe(200);
    const conf = await marcar(agent, csrf, c.id, [0]);
    expect(conf.status).toBe(409);
    expect((await q.get('SELECT affected_json a FROM flight_changes WHERE id=?', [c.id])).a).toBe('[1]');

    expect((await marcar(agent, csrf, 999999, [0])).status).toBe(404);
    const outro = await q.run(`INSERT INTO users (email, nome, password_hash, role, criado_em) VALUES ('aff-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com', 'Outro', 'x', 'user', datetime('now'))`);
    const alheio = await q.run('INSERT INTO flight_changes (user_id, old_json) VALUES (?, ?)', [outro.lastID, JSON.stringify(F.combinado())]);
    expect((await marcar(agent, csrf, alheio.lastID, [0])).status).toBe(404);
    expect((await q.get('SELECT affected_json a FROM flight_changes WHERE id=?', [alheio.lastID])).a).toBeNull();
    expect((await request(app).get(url(c.id))).status).toBe(401);
    expect([401, 403]).toContain((await request(app).put(url(c.id, '/affected')).send({ affected: [0] })).status);
  });
});

describe('merge e diff restritos nas rotas', () => {
  test('new-voucher com a volta marcada: só a volta muda, ida intacta, diff/mensagem só da volta e extracted_json gravado', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [1]);
    extractFlights.mockResolvedValueOnce({ carrier: 'azul', locator: 'NEW456', trips: [F.printIda({ flightNumber: 'AD 9999' }), F.printTrip('volta')] });
    const r = await novoVoucher(agent, csrf, c.id);
    expect(r.status).toBe(200);
    expect(r.body.new.trips[0]).toEqual(c.old.trips[0]);
    expect(r.body.new.trips[1]).toMatchObject({ flightNumber: 'AD 4010', locator: 'NEW456' });
    expect(r.body.new.reservation.locator).toBe('ABC123');
    expect(r.body.new.reservation.secondaryLocator).toBe('NEW456');
    expect(statusOf(r.body)).toEqual(['ida:igual', 'volta:alterado']);
    expect(r.body.diff.reservationChanges).toEqual([{ direction: 'volta', antes: 'XYZ789', depois: 'NEW456' }]);
    expect(r.body.warnings.some(w => w.includes('Ignorei trechos do print que não estavam marcados'))).toBe(true);
    const conf = r.body.messages.confirmation;
    expect(conf).toContain('Seu voo foi reajustado ✅ Reserva *NEW456*');
    expect(conf).toContain('Novo localizador: *NEW456*');
    expect(conf).toContain('*Volta (REC → GRU)*');
    expect(conf).not.toContain('Ida (');
    const row = await q.get('SELECT extracted_json e, new_json n FROM flight_changes WHERE id=?', [c.id]);
    expect(JSON.parse(row.e).locator).toBe('NEW456');
    expect(JSON.parse(row.e).trips).toHaveLength(2);
    expect((await q.get('SELECT unified_json u FROM vouchers WHERE id=?', [r.body.new_voucher_id])).u).toBe(row.n);
  });

  test('print ambíguo para a marcação: 422 sem criar voucher novo', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [1]);
    extractFlights.mockResolvedValueOnce({ carrier: 'azul', locator: null, trips: [F.printIda({ flightNumber: 'AD 9999' })] });
    const r = await novoVoucher(agent, csrf, c.id);
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('O print mostra 1 trecho(s) e você marcou 1. Marque exatamente os trechos que aparecem no print, ou envie um print só do trecho alterado.');
    expect((await q.get('SELECT new_json n FROM flight_changes WHERE id=?', [c.id])).n).toBeNull();
  });

  test('PUT /:id/affected com voucher novo refaz o merge SEM nova chamada à IA, sincroniza vouchers e zera o e-mail enviado', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [1]);
    extractFlights.mockResolvedValueOnce({ carrier: 'azul', locator: null, trips: [F.printIda({ flightNumber: 'AD 4003' }), F.printTrip('volta')] });
    const r1 = await novoVoucher(agent, csrf, c.id);
    expect(r1.body.new.trips.map(t => t.flightNumber)).toEqual(['AD 4001', 'AD 4010']);
    await q.run("UPDATE flight_changes SET confirmation_email_sent_at=datetime('now') WHERE id=?", [c.id]);
    const chamadas = extractFlights.mock.calls.length;

    const r2 = await marcar(agent, csrf, c.id, [0]);
    expect(r2.status).toBe(200);
    expect(extractFlights.mock.calls.length).toBe(chamadas);            // nenhuma nova extração
    expect(r2.body.new.trips.map(t => t.flightNumber)).toEqual(['AD 4003', 'AD 4002']);   // agora só a ida foi trocada
    expect(statusOf(r2.body)).toEqual(['ida:alterado', 'volta:igual']);
    expect(r2.body.new_voucher_id).toBe(r1.body.new_voucher_id);
    expect(r2.body.confirmation_email_sent_at).toBeNull();
    expect(r2.body.messages.confirmation).toContain('Reserva *ABC123*');
    expect(r2.body.messages.confirmation).not.toContain('Também enviamos');
    const row = await q.get('SELECT new_json n, diff_json d, affected_json a, confirmation_email_sent_at c FROM flight_changes WHERE id=?', [c.id]);
    expect(row.a).toBe('[0]'); expect(row.c).toBeNull();
    expect(JSON.parse(row.d).trips.map(t => t.status)).toEqual(['alterado', 'igual']);
    expect((await q.get('SELECT unified_json u FROM vouchers WHERE id=?', [r1.body.new_voucher_id])).u).toBe(row.n);
    expect(r2.body.new.meta.sourceFileHash).toBe(r1.body.new.meta.sourceFileHash);   // preserva o hash do arquivo enviado
  });

  test('re-merge impossível (422): o caso permanece exatamente como estava', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [1]);
    extractFlights.mockResolvedValueOnce(printVolta());
    await novoVoucher(agent, csrf, c.id);
    const antes = await q.get('SELECT new_json n, diff_json d, affected_json a FROM flight_changes WHERE id=?', [c.id]);
    const r = await marcar(agent, csrf, c.id, [0]);       // o print só tem a volta
    expect(r.status).toBe(422);
    expect(await q.get('SELECT new_json n, diff_json d, affected_json a FROM flight_changes WHERE id=?', [c.id])).toEqual(antes);
  });

  test('I3: voucher novo sem extracted_json (anterior à migração): 409 sem_extracao e nada gravado', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [0, 1]);
    extractFlights.mockResolvedValueOnce({ carrier: 'azul', locator: null, trips: [F.printIda({ flightNumber: 'AD 4003' }), F.printTrip('volta')] });
    const r1 = await novoVoucher(agent, csrf, c.id);
    expect(statusOf(r1.body)).toEqual(['ida:alterado', 'volta:alterado']);
    await q.run('UPDATE flight_changes SET extracted_json=NULL WHERE id=?', [c.id]);
    const antes = await q.get('SELECT * FROM flight_changes WHERE id=?', [c.id]);
    const r2 = await marcar(agent, csrf, c.id, [1]);
    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe('sem_extracao');
    expect(r2.body.message).toBe('Este voucher novo foi lido antes desta versão. Envie o voucher novo de novo para aplicar a nova marcação.');
    expect(await q.get('SELECT * FROM flight_changes WHERE id=?', [c.id])).toEqual(antes);
  });

  test('M1: PUT /affected devolve remerged (true com voucher novo, false sem)', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    expect((await marcar(agent, csrf, c.id, [1])).body.remerged).toBe(false);
    extractFlights.mockResolvedValueOnce(printVolta());
    await novoVoucher(agent, csrf, c.id);
    expect((await marcar(agent, csrf, c.id, [1])).body.remerged).toBe(true);
  });

  test('marcação explícita com TODOS os trechos num voucher combinado usa o merge restrito (new-voucher)', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [0, 1]);
    extractFlights.mockResolvedValueOnce({ carrier: 'azul', locator: 'NEW456', trips: [F.printTrip('volta')] });
    const r = await novoVoucher(agent, csrf, c.id);
    expect(r.status).toBe(200);
    expect(r.body.new.reservation.locator).toBe('ABC123');     // não vazou para a reserva da ida
    expect(r.body.new.trips.map(t => t.locator)).toEqual(['ABC123', 'XYZ789']);
    expect(r.body.warnings.some(w => w.includes('reservas diferentes'))).toBe(true);
  });

  /** Corrida: a 1ª leitura do caso devolve valores "velhos" (o banco já mudou). */
  const staleCaseRead = (override) => {
    const real = db.get.bind(db);
    let used = false;
    return jest.spyOn(db, 'get').mockImplementation((sql, p, cb) => {
      if (!used && /FROM flight_changes WHERE id/.test(sql)) {
        used = true;
        return real(sql, p, (e, r) => cb(e, r && { ...r, ...override }));
      }
      return real(sql, p, cb);
    });
  };

  test('I2: new-voucher × PUT /affected — marcação mudou entre a leitura e a escrita: 409 marcacao_alterada e sem voucher órfão', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [1]);
    const vouchers = async () => (await q.get('SELECT COUNT(*) n FROM vouchers')).n;
    const antes = await vouchers();
    staleCaseRead({ affected_json: '[0,1]' });        // a leitura viu [0,1]; no banco está [1]
    extractFlights.mockResolvedValueOnce(printVolta());
    const r = await novoVoucher(agent, csrf, c.id);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('marcacao_alterada');
    expect(r.body.message).toBe('A marcação dos trechos mudou enquanto o voucher era lido. Envie o voucher novamente.');
    expect(await vouchers()).toBe(antes);
    const row = await q.get('SELECT new_json n, affected_json a FROM flight_changes WHERE id=?', [c.id]);
    expect(row.n).toBeNull(); expect(row.a).toBe('[1]');
  });

  test('I2: PUT /affected — caso mudou entre a leitura e a escrita: 409 caso_alterado e nada alterado (sem e com voucher novo)', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    // sem voucher novo na leitura, mas o banco já tem new_json
    await marcar(agent, csrf, c.id, [1]);
    extractFlights.mockResolvedValueOnce(printVolta());
    await novoVoucher(agent, csrf, c.id);
    const antes = await q.get('SELECT * FROM flight_changes WHERE id=?', [c.id]);
    staleCaseRead({ new_json: null });
    let r = await marcar(agent, csrf, c.id, [0, 1]);
    expect(r.status).toBe(409); expect(r.body.error).toBe('caso_alterado');
    expect(r.body.message).toBe('O caso mudou enquanto a marcação era salva. Recarregue e tente de novo.');
    expect(await q.get('SELECT * FROM flight_changes WHERE id=?', [c.id])).toEqual(antes);
    jest.restoreAllMocks();
    // com voucher novo na leitura, mas o new_json do banco é outro
    staleCaseRead({ new_json: antes.new_json.replace('AD 4001', 'AD 4999') });
    r = await marcar(agent, csrf, c.id, [0, 1]);
    expect(r.status).toBe(409); expect(r.body.error).toBe('caso_alterado');
    expect(await q.get('SELECT * FROM flight_changes WHERE id=?', [c.id])).toEqual(antes);
  });

  test('PUT /new respeita a marcação: mexer num trecho NÃO marcado não conta como mudança', async () => {
    const { agent, csrf } = await authed();
    const c = await casoCombinado(agent, csrf);
    await marcar(agent, csrf, c.id, [1]);
    extractFlights.mockResolvedValueOnce(printVolta());
    const r = await novoVoucher(agent, csrf, c.id);
    const novo = r.body.new;
    novo.trips[0].departure.datetime = '2026-09-12T23:00:00-03:00';       // edição manual na ida (não marcada)
    const put = await agent.put(url(c.id, '/new')).set('X-CSRF-Token', csrf).send({ unified: novo });
    expect(put.status).toBe(200);
    expect(statusOf(put.body)).toEqual(['ida:igual', 'volta:alterado']);
    expect(put.body.messages.confirmation).not.toContain('Ida (');
  });

  test('confirmação por e-mail: voucher COMPLETO, resumo só do trecho afetado; preview == envio', async () => {
    const prev = { u: process.env.EMAIL_USER, p: process.env.EMAIL_PASS };
    process.env.EMAIL_USER = 'u@test.com'; process.env.EMAIL_PASS = 'x';
    try {
      const { agent, csrf } = await authed();
      const c = await casoCombinado(agent, csrf);
      await marcar(agent, csrf, c.id, [1]);
      extractFlights.mockResolvedValueOnce({ carrier: 'azul', locator: 'NEW456', trips: [F.printTrip('volta')] });
      await novoVoucher(agent, csrf, c.id);
      expect((await agent.post(url(c.id, '/confirm')).set('X-CSRF-Token', csrf)).status).toBe(200);
      const sendMail = jest.spyOn(transporter, 'sendMail').mockResolvedValue({ messageId: 'm1' });
      const s = await agent.post(url(c.id, '/send-email')).set('X-CSRF-Token', csrf).send({ kind: 'confirmacao', emails: 'cli@x.com' });
      expect(s.status).toBe(200);
      const sent = sendMail.mock.calls[0][0];
      expect(sent.html).toContain('Partida: 19/09/2026 13:00');                // resumo do afetado
      expect(sent.html).not.toContain('Partida: 12/09/2026');                  // nada da ida no resumo
      expect(sent.html).toContain('NEW456');
      const pv = await agent.get(url(c.id, '/email-preview?kind=confirmacao'));
      const sem = (h) => h.replace(/src="(cid:|data:image\/png;base64,)[^"]*"/g, 'src="LOGO"').replace(/\/itinerario\/[^"\s<]+/g, '/itinerario/TOKEN');
      expect(sem(pv.body.html)).toBe(sem(sent.html));
      // o voucher guardado para o PDF é o COMPLETO (ida + volta)
      const guardado = JSON.parse((await q.get('SELECT unified_json u FROM vouchers WHERE id=?', [(await agent.get(url(c.id))).body.new_voucher_id])).u);
      expect(guardado.trips.map(t => t.flightNumber)).toEqual(['AD 4001', 'AD 4010']);
    } finally {
      for (const [k, v] of [['EMAIL_USER', prev.u], ['EMAIL_PASS', prev.p]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
});
