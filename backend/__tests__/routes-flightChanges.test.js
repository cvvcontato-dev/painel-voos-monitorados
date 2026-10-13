process.env.EXTRACTION_MODE = 'stub';
jest.mock('../services/voucherRenderer', () => ({
  renderVoucher: jest.fn(async () => {
    const f = require('path').join(require('os').tmpdir(), `fc-test-${Date.now()}-${Math.random()}.pdf`);
    require('fs').writeFileSync(f, 'pdf');
    return f;
  })
}));
delete process.env.GEMINI_API_KEY;
// extractVoucher segue real (stub); extractFlights é um jest.fn que por padrão repassa ao real (stub).
jest.mock('../services/voucherExtractor', () => {
  const actual = jest.requireActual('../services/voucherExtractor');
  return { ...actual, extractFlights: jest.fn((...a) => actual.extractFlights(...a)) };
});
const { extractFlights } = require('../services/voucherExtractor');
const request = require('supertest');
const { makeFlightChangeApp, waitForDb, getCsrfFromResponse } = require('./testApp');
const db = require('../database');
const { buildNoticeEmailHtml } = require('../services/flightChangeEmail');

let app;
const q = {
  get: (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r))),
  all: (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r))),
  run: (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }))
};
// Espera real: a tabela flight_changes é criada de forma assíncrona após as demais.
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

/** Simula corrida: a primeira leitura do caso devolve um status "velho" (o banco já mudou). */
function staleCaseRead(override) {
  const real = db.get.bind(db);
  let used = false;
  return jest.spyOn(db, 'get').mockImplementation((sql, p, cb) => {
    if (!used && /FROM flight_changes WHERE id/.test(sql)) {
      used = true;
      return real(sql, p, (e, r) => cb(e, r && { ...r, ...override }));
    }
    return real(sql, p, cb);
  });
}
const countVouchers = async () => (await q.get('SELECT COUNT(*) n FROM vouchers')).n;
const voucherRow = (id) => q.get('SELECT * FROM vouchers WHERE id = ?', [id]);

async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const csrf = getCsrfFromResponse(await agent.get('/api/auth/me'));
  return { agent, csrf };
}
const pdf = (b = 'fake') => ({ buf: Buffer.from(b), opts: { filename: 'v.pdf', contentType: 'application/pdf' } });

async function criarCaso(agent, csrf) {
  const f = pdf('antigo');
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  expect(res.status).toBe(201);
  return res.body;
}

/** Caso já confirmado (com voucher novo editado). */
async function criarCasoConfirmado(agent, csrf) {
  const c = await criarCaso(agent, csrf);
  const f = pdf('novo-conf');
  const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const novo = r.body.new;
  novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';
  await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
  const cf = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
  expect(cf.status).toBe(200);
  return { c, novo };
}

test('exige autenticação', async () => {
  expect((await request(app).get('/api/flight-changes')).status).toBe(401);
});

test('POST sem arquivo nem voucher_id: 400', async () => {
  const { agent, csrf } = await authed();
  expect((await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf)).status).toBe(400);
});

test('cria caso por upload: status aviso_pendente, snapshot e mensagem de aviso', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  expect(c.status).toBe('aviso_pendente');
  expect(c.locator).toBe('STUB01');
  expect(c.messages.notice).toContain('*STUB01*');
  expect(c.old.reservation.locator).toBe('STUB01');
});

test('cria caso a partir de voucher salvo (voucher_id)', async () => {
  const { agent, csrf } = await authed();
  const f = pdf('salvo');
  const v = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: v.body.id });
  expect(res.status).toBe(201);
  expect(res.body.old_voucher_id).toBe(v.body.id);
});

test('voucher_id inexistente: 404', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: 999999 });
  expect(res.status).toBe(404);
});

test('lista: pendentes antes dos confirmados', async () => {
  const { agent, csrf } = await authed();
  await criarCasoConfirmado(agent, csrf);
  await criarCaso(agent, csrf);
  const res = await agent.get('/api/flight-changes');
  expect(res.status).toBe(200);
  const ordem = res.body.map(c => c.status === 'confirmado' ? 1 : 0);
  expect(ordem).toContain(1);
  expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
});

test('notice-sent muda status e é idempotente', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const r1 = await agent.post(`/api/flight-changes/${c.id}/notice-sent`).set('X-CSRF-Token', csrf);
  expect(r1.body.status).toBe('aviso_enviado');
  const r2 = await agent.post(`/api/flight-changes/${c.id}/notice-sent`).set('X-CSRF-Token', csrf);
  expect(r2.status).toBe(200); expect(r2.body.status).toBe('aviso_enviado');
});

test('confirm sem voucher novo: 409', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  expect((await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf)).status).toBe(409);
});

test('voucher novo idêntico: diff sem mudanças e confirm bloqueado (nada_mudou)', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('novo');
  const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  expect(r.status).toBe(200);
  expect(r.body.diff.hasChanges).toBe(false);
  const cf = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
  expect(cf.status).toBe(409); expect(cf.body.error).toBe('nada_mudou');
});

test('editar o voucher novo recalcula o diff; confirm então funciona', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('novo2');
  const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const novo = r.body.new;
  novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';
  const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
  expect(put.status).toBe(200);
  expect(put.body.diff.hasChanges).toBe(true);
  expect(put.body.messages.confirmation).toContain('Seu voo foi reajustado');
  expect(put.body.messages.confirmation).toContain('Partida: 12/09/2026 08:30 → 12/09/2026 10:15');
  const cf = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
  expect(cf.status).toBe(200); expect(cf.body.status).toBe('confirmado');
});

test('PUT /new com payload inválido: 422', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('n3');
  await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const res = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: { x: 1 } });
  expect(res.status).toBe(422);
});

test('caso confirmado: novo voucher e edição do novo retornam 409', async () => {
  const { agent, csrf } = await authed();
  const { c, novo } = await criarCasoConfirmado(agent, csrf);
  const f = pdf('outro');
  const nv = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  expect(nv.status).toBe(409);
  const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
  expect(put.status).toBe(409);
});

test('upload com mimetype não suportado: 400 (não 500)', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('texto'), { filename: 'a.txt', contentType: 'text/plain' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/Formato não suportado/);
});

test('arquivo acima de 15MB: 413 (não 500 genérico)', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.alloc(15 * 1024 * 1024 + 10), { filename: 'g.pdf', contentType: 'application/pdf' });
  expect(res.status).toBe(413);
});

test('send-email valida destinatários, tipo e pré-requisitos', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const post = (body) => agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf).send(body);
  expect((await post({ kind: 'aviso' })).status).toBe(400);
  expect((await post({ kind: 'aviso', emails: 'nao-e-email' })).status).toBe(400);
  expect((await post({ kind: 'x', emails: 'a@b.com' })).status).toBe(400);
  expect((await post({ kind: 'confirmacao', emails: 'a@b.com' })).status).toBe(409);
});

test('send-email do aviso sem credenciais de e-mail: 500 com mensagem clara', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const old = { u: process.env.EMAIL_USER, p: process.env.EMAIL_PASS };
  delete process.env.EMAIL_USER; delete process.env.EMAIL_PASS;
  try {
    const res = await agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf)
      .send({ kind: 'aviso', emails: 'a@b.com' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('falha ao enviar e-mail');
    expect(res.body.details).toMatch(/Credenciais de e-mail/);
  } finally {
    if (old.u !== undefined) process.env.EMAIL_USER = old.u;
    if (old.p !== undefined) process.env.EMAIL_PASS = old.p;
  }
});

test('GET e DELETE de caso inexistente: 404; delete remove', async () => {
  const { agent, csrf } = await authed();
  expect((await agent.get('/api/flight-changes/999999')).status).toBe(404);
  expect((await agent.delete('/api/flight-changes/999999').set('X-CSRF-Token', csrf)).status).toBe(404);
  const c = await criarCaso(agent, csrf);
  expect((await agent.delete(`/api/flight-changes/${c.id}`).set('X-CSRF-Token', csrf)).status).toBe(204);
  expect((await agent.get(`/api/flight-changes/${c.id}`)).status).toBe(404);
});

test('caso de outro usuário não é acessível (isolamento por user_id)', async () => {
  const { agent, csrf } = await authed();
  const outro = await new Promise((res, rej) =>
    db.run(`INSERT INTO users (email, nome, password_hash, role, criado_em) VALUES ('outro-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com', 'Outro', 'x', 'user', datetime('now'))`, function (e) { e ? rej(e) : res(this.lastID); }));
  const id = await new Promise((res, rej) =>
    db.run(`INSERT INTO flight_changes (user_id, old_json) VALUES (?, '{}')`, [outro], function (e) { e ? rej(e) : res(this.lastID); }));
  expect((await agent.get(`/api/flight-changes/${id}`)).status).toBe(404);
  expect((await agent.delete(`/api/flight-changes/${id}`).set('X-CSRF-Token', csrf)).status).toBe(404);
  expect((await agent.post(`/api/flight-changes/${id}/notice-sent`).set('X-CSRF-Token', csrf)).status).toBe(404);
  const f = pdf('x');
  expect((await agent.post(`/api/flight-changes/${id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts)).status).toBe(404);
  expect((await agent.put(`/api/flight-changes/${id}/new`).set('X-CSRF-Token', csrf).send({ unified: {} })).status).toBe(404);
  expect((await agent.post(`/api/flight-changes/${id}/confirm`).set('X-CSRF-Token', csrf)).status).toBe(404);
  expect((await agent.post(`/api/flight-changes/${id}/send-email`).set('X-CSRF-Token', csrf).send({ kind: 'aviso', emails: 'a@b.com' })).status).toBe(404);
});

describe('revisão de qualidade (Task 4)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('notice-sent nunca regride um caso confirmado (leitura velha)', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    staleCaseRead({ status: 'aviso_pendente' });
    const r = await agent.post(`/api/flight-changes/${c.id}/notice-sent`).set('X-CSRF-Token', csrf);
    expect(r.status).toBe(200);
    expect((await q.get('SELECT status FROM flight_changes WHERE id=?', [c.id])).status).toBe('confirmado');
  });

  test('new-voucher em caso confirmado entre leitura e escrita: 409 e sem voucher órfão', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    const antes = await countVouchers();
    staleCaseRead({ status: 'aviso_enviado' });
    const f = pdf('corrida');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    expect(r.status).toBe(409);
    expect(await countVouchers()).toBe(antes);
  });

  test('PUT /new em caso confirmado entre leitura e escrita: 409 e nada alterado', async () => {
    const { agent, csrf } = await authed();
    const { c, novo } = await criarCasoConfirmado(agent, csrf);
    const antes = (await q.get('SELECT new_json FROM flight_changes WHERE id=?', [c.id])).new_json;
    staleCaseRead({ status: 'aviso_enviado' });
    const alterado = JSON.parse(JSON.stringify(novo));
    alterado.trips[0].departure.datetime = '2026-09-12T23:00:00-03:00';
    const r = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: alterado });
    expect(r.status).toBe(409);
    expect((await q.get('SELECT new_json FROM flight_changes WHERE id=?', [c.id])).new_json).toBe(antes);
  });

  test('re-upload do voucher novo apaga o novo anterior, nunca o antigo', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const f1 = pdf('novo-a'), f2 = pdf('novo-b');
    const r1 = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f1.buf, f1.opts);
    const id1 = r1.body.new_voucher_id;
    const path1 = (await voucherRow(id1)).source_file_path;
    const r2 = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f2.buf, f2.opts);
    expect(r2.body.new_voucher_id).not.toBe(id1);
    expect(await voucherRow(id1)).toBeUndefined();
    expect(require('fs').existsSync(path1)).toBe(false);
    expect(await voucherRow(c.old_voucher_id)).toBeDefined();
    expect(await voucherRow(r2.body.new_voucher_id)).toBeDefined();
  });

  test('DELETE do caso remove o voucher novo e mantém o antigo', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const f = pdf('novo-del');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const newId = r.body.new_voucher_id;
    const newPath = (await voucherRow(newId)).source_file_path;
    expect((await agent.delete(`/api/flight-changes/${c.id}`).set('X-CSRF-Token', csrf)).status).toBe(204);
    expect(await voucherRow(newId)).toBeUndefined();
    expect(require('fs').existsSync(newPath)).toBe(false);
    expect(await voucherRow(c.old_voucher_id)).toBeDefined();
  });

  test('voucher antigo reaproveitado da aba Vouchers fica inalterado (new-voucher, PUT /new, confirm, delete)', async () => {
    const { agent, csrf } = await authed();
    const f = pdf('aba-vouchers');
    const v = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const antes = (await voucherRow(v.body.id)).unified_json;
    const c = (await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: v.body.id })).body;
    const f2 = pdf('novo-aba');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f2.buf, f2.opts);
    const novo = r.body.new;
    novo.trips[0].departure.datetime = '2026-09-12T11:00:00-03:00';
    expect((await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo })).status).toBe(200);
    expect((await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf)).status).toBe(200);
    expect((await voucherRow(v.body.id)).unified_json).toBe(antes);
    await agent.delete(`/api/flight-changes/${c.id}`).set('X-CSRF-Token', csrf);
    expect((await voucherRow(v.body.id)).unified_json).toBe(antes);
  });

  test('PUT /new ignora meta do corpo (sourceFileHash falso não é gravado)', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const f = pdf('meta');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const hashReal = r.body.new.meta.sourceFileHash;
    const novo = r.body.new;
    novo.meta = { ...novo.meta, sourceFileHash: 'sha256:falso' };
    const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
    expect(put.status).toBe(200);
    expect(put.body.new.meta.sourceFileHash).toBe(hashReal);
  });

  test('PUT /new com unified não-objeto: 422', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const f = pdf('str');
    await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: 'texto' });
    expect(put.status).toBe(422);
  });

  test('new_json corrompido: confirm devolve 500 voucher_corrompido e não confirma', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    await q.run("UPDATE flight_changes SET new_json='{lixo' WHERE id=?", [c.id]);
    const r = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('voucher_corrompido');
    expect((await q.get('SELECT status FROM flight_changes WHERE id=?', [c.id])).status).not.toBe('confirmado');
    expect((await agent.get(`/api/flight-changes/${c.id}`)).status).toBe(200);
  });

  test('old_json corrompido: detalhe não lança e confirm devolve voucher_corrompido', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const f = pdf('corr-old');
    await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    await q.run("UPDATE flight_changes SET old_json='{lixo' WHERE id=?", [c.id]);
    expect((await agent.get(`/api/flight-changes/${c.id}`)).status).toBe(200);
    const r = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
    expect(r.status).toBe(500); expect(r.body.error).toBe('voucher_corrompido');
  });

  test('send-email confirmacao: voucher novo removido da tabela vouchers: 409', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    const row = await q.get('SELECT new_voucher_id FROM flight_changes WHERE id=?', [c.id]);
    await q.run('DELETE FROM vouchers WHERE id=?', [row.new_voucher_id]);
    const r = await agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf).send({ kind: 'confirmacao', emails: 'a@b.com' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('voucher_novo_removido');
  });

  test('PUT /new mantém vouchers.unified_json em sincronia com o caso', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    const row = await q.get('SELECT new_json, new_voucher_id FROM flight_changes WHERE id=?', [c.id]);
    expect((await voucherRow(row.new_voucher_id)).unified_json).toBe(row.new_json);
  });

  test('confirmation_email_sent_at alimenta o texto; body.emailSent do cliente é ignorado', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    expect((await agent.get(`/api/flight-changes/${c.id}`)).body.messages.confirmation).not.toContain('Também enviamos');
    await q.run("UPDATE flight_changes SET confirmation_email_sent_at=datetime('now') WHERE id=?", [c.id]);
    expect((await agent.get(`/api/flight-changes/${c.id}`)).body.messages.confirmation).toContain('Também enviamos o PDF por e-mail');
    const c2 = await criarCasoConfirmado(agent, csrf);
    const r = await agent.post(`/api/flight-changes/${c2.c.id}/confirm`).set('X-CSRF-Token', csrf).send({ emailSent: true });
    expect(r.body.messages.confirmation).not.toContain('Também enviamos');
  });

  test('voucher_id de outro usuário: 404 (IDOR)', async () => {
    const { agent, csrf } = await authed();
    const outro = await q.run(`INSERT INTO users (email, nome, password_hash, role, criado_em) VALUES ('idor-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com', 'X', 'x', 'user', datetime('now'))`);
    const vid = (await q.run("INSERT INTO vouchers (user_id, carrier, layout_version, unified_json) VALUES (?, 'azul', 'azul.confirmacao.v1', '{}')", [outro.lastID])).lastID;
    const r = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: vid });
    expect(r.status).toBe(404);
  });

  test('e-mail do aviso: telefone malicioso não gera link perigoso', () => {
    const v = { reservation: { locator: 'A1' }, passengers: [{ name: 'Maria' }], trips: [] };
    for (const phone of ['javascript:alert(1)', '"><script>alert(1)</script>', "48999991234' onclick='x"]) {
      const html = buildNoticeEmailHtml(v, { supportPhone: phone });
      expect(html).not.toMatch(/href="javascript:/i);
      expect(html).not.toContain('<script>');
      expect(html).not.toContain("onclick='");
    }
  });
});

describe('ajustes finais', () => {
  test('PUT /new e re-upload zeram confirmation_email_sent_at', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const f = pdf('zera-1');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const novo = r.body.new;
    novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';
    await q.run("UPDATE flight_changes SET confirmation_email_sent_at=datetime('now') WHERE id=?", [c.id]);
    const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
    expect(put.status).toBe(200);
    expect(put.body.messages.confirmation).not.toContain('Também enviamos');
    expect((await q.get('SELECT confirmation_email_sent_at x FROM flight_changes WHERE id=?', [c.id])).x).toBeNull();

    await q.run("UPDATE flight_changes SET confirmation_email_sent_at=datetime('now') WHERE id=?", [c.id]);
    const f2 = pdf('zera-2');
    await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f2.buf, f2.opts);
    expect((await q.get('SELECT confirmation_email_sent_at x FROM flight_changes WHERE id=?', [c.id])).x).toBeNull();
  });

  test('apagar o caso A mantém o voucher novo dele quando o caso B o usa como antigo', async () => {
    const { agent, csrf } = await authed();
    const a = await criarCaso(agent, csrf);
    const f = pdf('compartilhado');
    const r = await agent.post(`/api/flight-changes/${a.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const shared = r.body.new_voucher_id;
    const p = (await voucherRow(shared)).source_file_path;
    const b = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: shared });
    expect(b.status).toBe(201);
    expect((await agent.delete(`/api/flight-changes/${a.id}`).set('X-CSRF-Token', csrf)).status).toBe(204);
    expect(await voucherRow(shared)).toBeDefined();
    expect(require('fs').existsSync(p)).toBe(true);
  });
});

describe('e-mail do aviso', () => {
  const v = { reservation: { locator: 'ABC123' }, route: { origin: 'GRU', destination: 'REC' },
    passengers: [{ name: '<script>x</script> MARIA' }], trips: [{ dateLabel: '12 SET 2026' }] };
  test('inclui o botão de WhatsApp só quando há telefone de suporte', () => {
    expect(buildNoticeEmailHtml(v, { supportPhone: '48999991234' })).toContain('https://wa.me/5548999991234?text=');
    expect(buildNoticeEmailHtml(v, {})).not.toContain('wa.me');
  });
  test('escapa HTML vindo do voucher', () => {
    expect(buildNoticeEmailHtml(v, {})).not.toContain('<script>');
  });
  test('ida e volta citam as duas datas', () => {
    const iv = { ...v, trips: [{ dateLabel: '12 SET 2026' }, { dateLabel: '19 SET 2026' }] };
    expect(buildNoticeEmailHtml(iv, {})).toContain('GRU → REC, 12 SET 2026 e 19 SET 2026');
  });
});

describe('link do voucher novo e preview do e-mail', () => {
  const { transporter } = require('../services/notifier');
  const { verify } = require('../helpers/voucherToken');
  const emailEnv = {};
  beforeAll(() => { emailEnv.u = process.env.EMAIL_USER; emailEnv.p = process.env.EMAIL_PASS; process.env.EMAIL_USER = 'u@test.com'; process.env.EMAIL_PASS = 'x'; emailEnv.b = process.env.PUBLIC_BASE_URL; process.env.PUBLIC_BASE_URL = 'https://app.test'; });
  afterAll(() => { for (const [k, v] of [['EMAIL_USER', emailEnv.u], ['EMAIL_PASS', emailEnv.p], ['PUBLIC_BASE_URL', emailEnv.b]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  afterEach(() => jest.restoreAllMocks());
  const preview = (agent, id, kind) => agent.get(`/api/flight-changes/${id}/email-preview${kind ? `?kind=${kind}` : ''}`);
  // O token do itinerario embute o instante de emissao (segundos): mascara-o ao comparar e valida-o a parte.
  const noLogo = (h) => h.replace(/src="(cid:|data:image\/png;base64,)[^"]*"/g, 'src="LOGO"').replace(/\/itinerario\/[^"\s<]+/g, '/itinerario/TOKEN');

  test('detalhe devolve new_voucher_url assinado e a mensagem o usa; antes do voucher novo é null', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    expect(c.new_voucher_url).toBeNull();
    const { c: cc } = await criarCasoConfirmado(agent, csrf);
    const d = (await agent.get(`/api/flight-changes/${cc.id}`)).body;
    const m = /^https?:\/\/[^/]+\/itinerario\/(.+)$/.exec(d.new_voucher_url);
    expect(m).not.toBeNull();
    expect(verify(m[1])).toMatchObject({ ok: true, voucherId: d.new_voucher_id });
    expect(d.messages.confirmation).toContain(`Seu novo voucher já está disponível:\n${d.new_voucher_url}`);
  });

  test('preview do aviso == html do aviso; logo vira data URI', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const r = await preview(agent, c.id, 'aviso');
    expect(r.status).toBe(200);
    expect(r.body.subject).toBe(require('../services/flightChangeEmail').SUBJECT);
    expect(r.body.html).not.toContain('cid:');
    expect(r.body.html).toContain('data:image/png;base64,');
    expect(noLogo(r.body.html)).toBe(noLogo(buildNoticeEmailHtml(c.old, { supportPhone: c.support_phone })));
  });

  test('preview da confirmação == html que o send-email enviaria (mesmos parâmetros)', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    const sendMail = jest.spyOn(transporter, 'sendMail').mockResolvedValue({ messageId: 'm1' });
    const s = await agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf).send({ kind: 'confirmacao', emails: 'cli@x.com' });
    expect(s.status).toBe(200);
    const sent = sendMail.mock.calls[0][0];
    const r = await preview(agent, c.id, 'confirmacao');
    expect(r.status).toBe(200);
    expect(r.body.subject).toBe(sent.subject);
    expect(r.body.subject).toBe('Seu voo foi reajustado ✈️ Novo voucher em anexo');
    expect(noLogo(r.body.html)).toBe(noLogo(sent.html));
    const d = (await agent.get(`/api/flight-changes/${c.id}`)).body;
    for (const h of [sent.html, r.body.html]) {
      const t = /https:\/\/app\.test\/itinerario\/([^"\s<]+)/.exec(h);
      expect(verify(t[1])).toMatchObject({ ok: true, voucherId: d.new_voucher_id });
    }
    expect(sent.html).toContain('Seu voo foi reajustado. Veja o que mudou:');
    expect(sent.html).toContain('Partida: 12/09/2026 08:30');
  });

  test('preview: kind inválido 400, sem voucher novo 409, outro usuário 404, sem login 401', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    expect((await preview(agent, c.id)).status).toBe(400);
    expect((await preview(agent, c.id, 'x')).status).toBe(400);
    const r = await preview(agent, c.id, 'confirmacao');
    expect(r.status).toBe(409); expect(r.body.error).toBe('sem_voucher_novo');
    const u = await q.run(`INSERT INTO users (email, nome, password_hash, role, criado_em) VALUES ('prev-${Date.now()}@test.com', 'X', 'x', 'user', datetime('now'))`);
    const outro = await q.run(`INSERT INTO flight_changes (user_id, client_name, locator, old_json) VALUES (?, 'X', 'Z', '{}')`, [u.lastID]);
    expect((await preview(agent, outro.lastID, 'aviso')).status).toBe(404);
    expect((await request(app).get(`/api/flight-changes/${c.id}/email-preview?kind=aviso`)).status).toBe(401);
  });

  test('preview com new_json corrompido: 500 voucher_corrompido', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    await q.run("UPDATE flight_changes SET new_json='{lixo' WHERE id=?", [c.id]);
    const r = await preview(agent, c.id, 'confirmacao');
    expect(r.status).toBe(500); expect(r.body.error).toBe('voucher_corrompido');
  });
});

describe('revisão: link só com PUBLIC_BASE_URL, preview sem mudanças e escape', () => {
  const { transporter } = require('../services/notifier');
  let saved;
  beforeEach(() => { saved = { b: process.env.PUBLIC_BASE_URL, u: process.env.EMAIL_USER, p: process.env.EMAIL_PASS }; process.env.EMAIL_USER = 'u@test.com'; process.env.EMAIL_PASS = 'x'; });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const [k, v] of [['PUBLIC_BASE_URL', saved.b], ['EMAIL_USER', saved.u], ['EMAIL_PASS', saved.p]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  test('sem PUBLIC_BASE_URL: new_voucher_url null (Host forjado ignorado), mensagem e e-mail sem link', async () => {
    delete process.env.PUBLIC_BASE_URL;
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    const d = (await agent.get(`/api/flight-changes/${c.id}`).set('Host', 'evil.example')).body;
    expect(d.new_voucher_url).toBeNull();
    expect(d.messages.confirmation).not.toContain('já está disponível');
    expect(d.messages.confirmation).not.toContain('evil.example');
    const sendMail = jest.spyOn(transporter, 'sendMail').mockResolvedValue({ messageId: 'm' });
    const s = await agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf).set('Host', 'evil.example').send({ kind: 'confirmacao', emails: 'a@b.com' });
    expect(s.status).toBe(200);
    expect(sendMail.mock.calls[0][0].html).not.toContain('evil.example');
    expect(sendMail.mock.calls[0][0].html).not.toContain('/itinerario/');
  });

  test('com PUBLIC_BASE_URL (espaços e barra final removidos): usa a variável mesmo com Host forjado', async () => {
    process.env.PUBLIC_BASE_URL = '  https://app.test//  ';
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    const d = (await agent.get(`/api/flight-changes/${c.id}`).set('Host', 'evil.example')).body;
    expect(d.new_voucher_url).toMatch(/^https:\/\/app\.test\/itinerario\/[^/]+$/);
  });

  test('aviso de boot em produção sem PUBLIC_BASE_URL', () => {
    delete process.env.PUBLIC_BASE_URL;
    const envOld = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try { jest.isolateModules(() => { require('../routes/flightChanges'); }); }
    finally { process.env.NODE_ENV = envOld; }
    expect(warn.mock.calls.filter(c => /PUBLIC_BASE_URL ausente: links de voucher novo desativados/.test(c[0]))).toHaveLength(1);
  });

  test('preview da confirmação sem mudanças: 409 nada_mudou', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const f = pdf('novo-igual');
    await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const r = await agent.get(`/api/flight-changes/${c.id}/email-preview?kind=confirmacao`);
    expect(r.status).toBe(409); expect(r.body.error).toBe('nada_mudou');
  });

  test('preview da confirmação escapa HTML vindo dos dados do voucher', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const f = pdf('novo-xss');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const novo = r.body.new;
    novo.passengers[0].name = '<script>alert(1)</script> Silva';
    novo.trips[0].flightNumber = '<script>alert(2)</script>';
    const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
    expect(put.status).toBe(200);
    const p = await agent.get(`/api/flight-changes/${c.id}/email-preview?kind=confirmacao`);
    expect(p.status).toBe(200);
    expect(p.body.html).not.toContain('<script>');
    expect(p.body.html).toContain('&lt;script&gt;');
  });
});

describe('PDF guardado para o link do cliente (voucher-pdfs)', () => {
  const fs = require('fs');
  const path = require('path');
  const { renderVoucher } = require('../services/voucherRenderer');
  const { transporter } = require('../services/notifier');
  const { pdfsDir } = require('../helpers/voucherWorkspace');
  const stored = (vid) => fs.readdirSync(pdfsDir()).filter(f => f.startsWith(`voucher-${vid}-`));
  const until = async (fn, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 25)); }
    return false;
  };
  const novoDe = async (agent, csrf) => {
    const c = await criarCaso(agent, csrf);
    const f = pdf('novo-pdf');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    return { c, r };
  };

  const envSaved = {};
  beforeAll(() => { envSaved.u = process.env.EMAIL_USER; envSaved.p = process.env.EMAIL_PASS; process.env.EMAIL_USER = 'u@test.com'; process.env.EMAIL_PASS = 'x'; });
  afterAll(() => { for (const [k, v] of [['EMAIL_USER', envSaved.u], ['EMAIL_PASS', envSaved.p]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const spies = [];
  const spy = (obj, m) => { const s = jest.spyOn(obj, m); spies.push(s); return s; };
  afterEach(() => { spies.splice(0).forEach(s => s.mockRestore()); });   // não usar restoreAllMocks: zera o mock do renderVoucher

  test('new-voucher guarda o PDF em segundo plano usando a sessão do operador', async () => {
    const { agent, csrf } = await authed();
    renderVoucher.mockClear();
    const { r } = await novoDe(agent, csrf);
    expect(r.status).toBe(200);
    const vid = r.body.new_voucher_id;
    expect(await until(() => stored(vid).length === 1)).toBe(true);
    const call = renderVoucher.mock.calls.find(c => c[0].voucherId === vid)[0];
    expect(call.format).toBe('pdf');
    expect(call.cookieHeader).toMatch(/cvv\.sid=/);
    const unified = (await voucherRow(vid)).unified_json;
    expect(stored(vid)[0]).toBe(`voucher-${vid}-${require('../services/voucherPdfStore').hashOf(unified)}.pdf`);
  });

  test('new-voucher: não espera o render e responde 200 mesmo se ele falhar (só loga)', async () => {
    const { agent, csrf } = await authed();
    const err = spy(console, 'error').mockImplementation(() => {});
    renderVoucher.mockImplementationOnce(() => new Promise((_, rej) => setTimeout(() => rej(new Error('chromium caiu')), 400)));
    const t0 = Date.now();
    const { r } = await novoDe(agent, csrf);
    expect(r.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(380);   // não aguardou os 400 ms do render
    expect(await until(() => err.mock.calls.some(c => c[0] === '[FLIGHT-CHANGES] pdf:' && /chromium caiu/.test(c[1])), 3000)).toBe(true);
    expect(stored(r.body.new_voucher_id)).toEqual([]);
  });

  test('PUT /new gera o PDF da nova versão e apaga o da anterior', async () => {
    const { agent, csrf } = await authed();
    const { c, r } = await novoDe(agent, csrf);
    const vid = r.body.new_voucher_id;
    expect(await until(() => stored(vid).length === 1)).toBe(true);
    const antes = stored(vid)[0];
    const novo = r.body.new;
    novo.trips[0].departure.datetime = '2026-09-12T10:45:00-03:00';
    expect((await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo })).status).toBe(200);
    expect(await until(() => stored(vid).length === 1 && stored(vid)[0] !== antes)).toBe(true);
  });

  test('send-email confirmacao anexa o PDF guardado e NÃO o apaga', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    const d = (await agent.get(`/api/flight-changes/${c.id}`)).body;
    const sendMail = spy(transporter, 'sendMail').mockResolvedValue({ messageId: 'm1' });
    const s = await agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf).send({ kind: 'confirmacao', emails: 'cli@x.com' });
    expect(s.status).toBe(200);
    const att = sendMail.mock.calls[0][0].attachments.find(a => /\.pdf$/.test(a.filename));
    expect(path.dirname(att.path)).toBe(pdfsDir());
    expect(path.basename(att.path)).toMatch(new RegExp(`^voucher-${d.new_voucher_id}-[0-9a-f]{12}\\.pdf$`));
    await new Promise(r => setTimeout(r, 50));
    expect(fs.existsSync(att.path)).toBe(true);
  });

  test('DELETE do caso e re-upload do voucher novo purgam os PDFs guardados', async () => {
    const { agent, csrf } = await authed();
    const { c, r } = await novoDe(agent, csrf);
    const v1 = r.body.new_voucher_id;
    expect(await until(() => stored(v1).length === 1)).toBe(true);
    // re-upload: o voucher novo anterior é descartado junto com o PDF
    const f = pdf('novo-pdf-2');
    const r2 = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    const v2 = r2.body.new_voucher_id;
    expect(v2).not.toBe(v1);
    expect(stored(v1)).toEqual([]);
    expect(await until(() => stored(v2).length === 1)).toBe(true);
    expect((await agent.delete(`/api/flight-changes/${c.id}`).set('X-CSRF-Token', csrf)).status).toBe(204);
    expect(stored(v2)).toEqual([]);
  });
});


describe('POST /:id/new-voucher com print só de voos', () => {
  const tr = (direction, dep, arr, d1, d2, flight) => ({
    direction, dateLabel: d1.slice(0, 10),
    departure: { airport: dep, airportName: null, datetime: d1 },
    arrival: { airport: arr, airportName: null, datetime: d2 },
    flightNumber: flight, durationText: '1h20', cabinClass: null, airlineDisplayName: 'Gol Linhas Aéreas', status: null
  });

  test('mantém passageiros do antigo, troca a ida e a mensagem traz Partida: antes → depois', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    extractFlights.mockResolvedValueOnce({
      carrier: 'gol', locator: null,
      trips: [
        tr('ida', 'GRU', 'REC', '2026-09-12T14:45:00-03:00', '2026-09-12T16:05:00-03:00', 'G3 1922'),
        tr('volta', 'REC', 'GRU', '2026-09-19T13:00:00-03:00', '2026-09-19T16:30:00-03:00', 'AD 4002')
      ]
    });
    const f = pdf('print');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, { filename: 'p.png', contentType: 'image/png' });
    expect(r.status).toBe(200);
    expect(r.body.new.passengers).toEqual(c.old.passengers);
    expect(r.body.new.trips[0].flightNumber).toBe('G3 1922');
    expect(r.body.new.carrier).toBe('gol');
    expect(r.body.diff.passengers).toEqual({ adicionados: [], removidos: [] });
    expect(r.body.messages.confirmation).toMatch(/Partida: .* → /);
  });

  test('extração sem voos: 422 com a mensagem ao operador e nada é salvo', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const antes = await countVouchers();
    extractFlights.mockResolvedValueOnce({ carrier: null, locator: null, trips: [] });
    const f = pdf('vazio');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('Não encontrei voos nessa imagem. Envie um print ou PDF que mostre os voos (partida, chegada e número do voo).');
    expect(await countVouchers()).toBe(antes);
  });

  test('mimetype inválido: 400', async () => {
    const { agent, csrf } = await authed();
    const c = await criarCaso(agent, csrf);
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', Buffer.from('a,b'), { filename: 'x.csv', contentType: 'text/csv' });
    expect(r.status).toBe(400);
  });

  test('caso confirmado continua devolvendo 409', async () => {
    const { agent, csrf } = await authed();
    const { c } = await criarCasoConfirmado(agent, csrf);
    const f = pdf('outro');
    const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
    expect(r.status).toBe(409);
  });
});
