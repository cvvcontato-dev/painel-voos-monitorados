const { waitForDb } = require('./testApp'); // define DB_PATH/ADMIN_* e recria o banco de teste
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const db = require('../database');
const { sign } = require('../helpers/voucherToken');
const pdfStore = require('../services/voucherPdfStore');

const app = express();
app.use('/itinerario', require('../routes/itinerario'));

const q = {
  get: (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r))),
  run: (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }))
};
const unified = (loc = 'ABC123') => JSON.stringify({
  carrier: 'azul', reservation: { locator: loc }, passengers: [{ name: 'SILVA, MAYARA' }],
  route: { origin: 'VCP', destination: 'REC' },
  trips: [{ direction: 'ida', flightNumber: 'AD4050', departure: { airport: 'VCP', datetime: '2026-09-12T08:30:00-03:00' }, arrival: { airport: 'REC', datetime: '2026-09-12T11:30:00-03:00' } }]
});
let userId;
async function novoVoucher(json = unified()) {
  const r = await q.run(`INSERT INTO vouchers (user_id, carrier, layout_version, source_file_hash, unified_json) VALUES (?, 'azul', 'azul.confirmacao.v1', 'h', ?)`, [userId, json]);
  return r.lastID;
}
const guardaPdf = (id, json, conteudo = '%PDF-1.4 fake') => {
  const p = pdfStore.filePath(id, json);
  fs.writeFileSync(p, conteudo);
  return p;
};
const BTN = 'BAIXAR VOUCHER (PDF)';

beforeAll(async () => {
  await waitForDb();
  const deadline = Date.now() + 5000;
  while (!userId && Date.now() < deadline) {
    const u = await q.get('SELECT id FROM users LIMIT 1').catch(() => null);
    if (u) userId = u.id; else await new Promise(r => setTimeout(r, 50));
  }
  if (!userId) throw new Error('usuário admin não foi criado');
});
const created = [];
afterAll(() => created.forEach(id => pdfStore.purge(id)));

describe('GET /itinerario/:token/voucher.pdf', () => {
  test('token válido + PDF da versão atual: 200 application/pdf com headers de download', async () => {
    const json = unified('XYZ789');
    const id = await novoVoucher(json); created.push(id);
    guardaPdf(id, json, '%PDF-1.4 conteudo-real');
    const res = await request(app).get(`/itinerario/${sign(id)}/voucher.pdf`).buffer(true).parse((r, cb) => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="Voucher-XYZ789.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex,nofollow');
    expect(res.body.toString()).toBe('%PDF-1.4 conteudo-real');
  });

  test('localizador é sanitizado no nome do arquivo', async () => {
    const json = unified('A"B/../C\r\nX');
    const id = await novoVoucher(json); created.push(id);
    guardaPdf(id, json);
    const res = await request(app).get(`/itinerario/${sign(id)}/voucher.pdf`);
    expect(res.headers['content-disposition']).toBe('attachment; filename="Voucher-ABCX.pdf"');
  });

  test('token inválido, adulterado ou tipado: 403 sem PDF', async () => {
    const json = unified();
    const id = await novoVoucher(json); created.push(id);
    guardaPdf(id, json);
    const bom = sign(id);
    for (const t of ['lixo', bom + 'x', bom.replace(/^\d+/, String(id + 1)), sign(id, 3600, 'pkg')]) {
      const res = await request(app).get(`/itinerario/${t}/voucher.pdf`);
      expect(res.status).toBe(403);
      expect(res.headers['content-type']).toMatch(/html/);
    }
  });

  test('PDF ausente: 404 amigável (html)', async () => {
    const id = await novoVoucher(); created.push(id);
    const res = await request(app).get(`/itinerario/${sign(id)}/voucher.pdf`);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('indisponível');
  });

  test('hash desatualizado: após alterar unified_json o PDF antigo não é servido (404) e a página perde o botão', async () => {
    const json = unified();
    const id = await novoVoucher(json); created.push(id);
    guardaPdf(id, json);
    const token = sign(id);
    expect((await request(app).get(`/itinerario/${token}/voucher.pdf`)).status).toBe(200);
    await q.run(`UPDATE vouchers SET unified_json = ? WHERE id = ?`, [unified('NOVO999'), id]);
    expect((await request(app).get(`/itinerario/${token}/voucher.pdf`)).status).toBe(404);
    expect((await request(app).get(`/itinerario/${token}`)).text).not.toContain(BTN);
  });

  test('envia nosniff junto dos demais cabeçalhos', async () => {
    const json = unified();
    const id = await novoVoucher(json); created.push(id);
    guardaPdf(id, json);
    const res = await request(app).get(`/itinerario/${sign(id)}/voucher.pdf`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('erro ao abrir o arquivo: 404 HTML, sem Content-Type pdf nem Content-Disposition', async () => {
    const json = unified();
    const id = await novoVoucher(json); created.push(id);
    guardaPdf(id, json);
    const { Readable } = require('stream');
    const spy = jest.spyOn(fs, 'createReadStream').mockImplementation(() => { const s = new Readable({ read() {} }); process.nextTick(() => s.destroy(new Error('EIO'))); return s; });
    try {
      const res = await request(app).get(`/itinerario/${sign(id)}/voucher.pdf`);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.headers['content-type']).not.toMatch(/pdf/);
      expect(res.headers['content-disposition']).toBeUndefined();
    } finally { spy.mockRestore(); }
  });

  test('voucher inexistente: 404', async () => {
    expect((await request(app).get(`/itinerario/${sign(99999999)}/voucher.pdf`)).status).toBe(404);
  });
});

describe('GET /itinerario/:token (botão do PDF)', () => {
  test('mostra o botão com link relativo para o PDF só quando existe PDF da versão atual', async () => {
    const json = unified();
    const id = await novoVoucher(json); created.push(id);
    const token = sign(id);
    const sem = await request(app).get(`/itinerario/${token}`);
    expect(sem.status).toBe(200);
    expect(sem.text).not.toContain(BTN);
    expect(sem.text).not.toContain('voucher.pdf');

    guardaPdf(id, json);
    const com = await request(app).get(`/itinerario/${token}`);
    expect(com.text).toContain(BTN);
    expect(com.text).toMatch(new RegExp(`<a href="/itinerario/${token.replace(/\./g, '\\.')}/voucher\\.pdf" download`));
  });

  test('token inválido continua 403', async () => {
    expect((await request(app).get('/itinerario/lixo')).status).toBe(403);
  });

  test('voucher vinculado como new_voucher_id em flight_changes exibe variante Voo reajustado', async () => {
    const json = unified('CHG123');
    const id = await novoVoucher(json); created.push(id);
    await q.run(`INSERT INTO flight_changes (user_id, client_name, locator, old_json, new_voucher_id, new_json) VALUES (?, 'Cliente Teste', 'CHG123', '{}', ?, ?)`, [userId, id, json]);
    const token = sign(id);
    const res = await request(app).get(`/itinerario/${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Voo reajustado');
    expect(res.text).toContain('Seu voo foi reajustado; veja abaixo o voucher atualizado.');
    expect(res.text).not.toContain('Sua viagem está pronta.');
  });
});
