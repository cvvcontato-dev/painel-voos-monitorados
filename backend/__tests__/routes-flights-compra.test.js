// DB isolado: cada suite roda em processo proprio, mas usar um diretorio
// exclusivo evita disputa pelo arquivo com as demais suites no Windows.
const path = require('path');
const fs = require('fs');
const os = require('os');
process.env.DB_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'flights-compra-'));
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'AdminPass123!';
process.env.NODE_ENV = 'test';

const express = require('express');
const request = require('supertest');
const db = require('../database');
const flightsRouter = require('../routes/flights');

const app = express();
app.use(express.json());
app.use('/api/flights', flightsRouter);

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));

beforeAll(() => new Promise(r => setTimeout(r, 1500))); // espera as migracoes

async function criarVoo({ link, alvo = 1000, atual = null, pax = 1 }) {
  await run(`INSERT INTO flights (cliente, mes_viagem, prioridade, preco_esperado, link_voo, quantidade_pax, preco_atual)
             VALUES ('C','Outubro','Alta',?,?,?,?)`, [alvo, link, pax, atual]);
  return (await get('SELECT * FROM flights WHERE link_voo = ?', [link]));
}

describe('preço de compra congelado', () => {
  test('marcar como comprada congela preco_compra e grava comprado_em', async () => {
    const voo = await criarVoo({ link: 'https://t/1', alvo: 1000, atual: 850, pax: 2 });
    const res = await request(app).put(`/api/flights/${voo.id}`).send({ status: 'passagem comprada' });
    expect(res.status).toBe(200);
    expect(res.body.preco_compra).toBe(850);
    expect(res.body.comprado_em).toBeTruthy();
  });

  test('preco_compra nao muda quando preco_atual muda depois da compra', async () => {
    const voo = await criarVoo({ link: 'https://t/2', alvo: 1000, atual: 800 });
    await request(app).put(`/api/flights/${voo.id}`).send({ status: 'passagem comprada' });
    await run('UPDATE flights SET preco_atual = ? WHERE id = ?', [1500, voo.id]);
    const depois = await get('SELECT preco_compra FROM flights WHERE id = ?', [voo.id]);
    expect(depois.preco_compra).toBe(800);
  });

  test('editar outros campos preserva o preco de compra', async () => {
    const voo = await criarVoo({ link: 'https://t/3', alvo: 1000, atual: 700 });
    await request(app).put(`/api/flights/${voo.id}`).send({ status: 'passagem comprada' });
    const res = await request(app).put(`/api/flights/${voo.id}`).send({ cliente: 'Novo Nome' });
    expect(res.body.cliente).toBe('Novo Nome');
    expect(res.body.preco_compra).toBe(700);
  });

  test('sair de comprada limpa preco_compra e comprado_em', async () => {
    const voo = await criarVoo({ link: 'https://t/4', alvo: 1000, atual: 900 });
    await request(app).put(`/api/flights/${voo.id}`).send({ status: 'passagem comprada' });
    const res = await request(app).put(`/api/flights/${voo.id}`).send({ status: 'ativo' });
    expect(res.body.preco_compra).toBeNull();
    expect(res.body.comprado_em).toBeNull();
  });

  test('voo sem preço coletado é comprado sem congelar valor', async () => {
    const voo = await criarVoo({ link: 'https://t/5', alvo: 1000, atual: null });
    const res = await request(app).put(`/api/flights/${voo.id}`).send({ status: 'passagem comprada' });
    expect(res.body.status).toBe('passagem comprada');
    expect(res.body.preco_compra).toBeNull();
  });
});

describe('GET /:id/price-stats', () => {
  test('sem histórico retorna amostras 0', async () => {
    const voo = await criarVoo({ link: 'https://t/6' });
    const res = await request(app).get(`/api/flights/${voo.id}/price-stats`);
    expect(res.status).toBe(200);
    expect(res.body.amostras).toBe(0);
    expect(res.body.dias).toBe(60);
  });

  test('calcula min, max, média, mediana e p25', async () => {
    const voo = await criarVoo({ link: 'https://t/7' });
    // 5 pontos: 100,200,300,400,500 -> p25 = 200, mediana = 300, media = 300
    for (const p of [300, 100, 500, 200, 400]) {
      await run('INSERT INTO flight_price_history (flight_id, preco) VALUES (?, ?)', [voo.id, p]);
    }
    const { body } = await request(app).get(`/api/flights/${voo.id}/price-stats`);
    expect(body.amostras).toBe(5);
    expect(body.min).toBe(100);
    expect(body.max).toBe(500);
    expect(body.media).toBe(300);
    expect(body.mediana).toBe(300);
    expect(body.p25).toBe(200);
    expect(body.sugerido).toBe(200); // p25 arredondado para a dezena
  });

  test('sugerido arredonda o p25 para a dezena mais próxima', async () => {
    const voo = await criarVoo({ link: 'https://t/8' });
    for (const p of [1234.56, 1234.56, 1500, 1800, 2000]) {
      await run('INSERT INTO flight_price_history (flight_id, preco) VALUES (?, ?)', [voo.id, p]);
    }
    const { body } = await request(app).get(`/api/flights/${voo.id}/price-stats`);
    expect(body.p25).toBeCloseTo(1234.56, 2);
    expect(body.sugerido).toBe(1230);
  });

  test('ignora registros fora da janela de dias', async () => {
    const voo = await criarVoo({ link: 'https://t/9' });
    await run(`INSERT INTO flight_price_history (flight_id, preco, verificado_em)
               VALUES (?, ?, datetime('now','-90 days'))`, [voo.id, 999]);
    await run('INSERT INTO flight_price_history (flight_id, preco) VALUES (?, ?)', [voo.id, 500]);
    const { body } = await request(app).get(`/api/flights/${voo.id}/price-stats?days=60`);
    expect(body.amostras).toBe(1);
    expect(body.min).toBe(500);
  });
});

describe('backfill da migração', () => {
  // Usa o SQL exatamente como está em database.js, para o teste acompanhar o código.
  const sqlBackfill = fs.readFileSync(path.join(__dirname, '..', 'database.js'), 'utf8')
    .match(/`(UPDATE flights SET preco_compra = preco_atual[\s\S]*?)`/)[1];

  test('preenche compras antigas e não toca no resto', async () => {
    // comprado sem preco_compra -> deve ser preenchido
    await run(`INSERT INTO flights (cliente, mes_viagem, prioridade, preco_esperado, link_voo, preco_atual, status, preco_compra)
               VALUES ('C','Out','Alta',1000,'https://bf/1',770,'passagem comprada',NULL)`);
    // comprado que ja tem preco_compra -> nao pode ser sobrescrito
    await run(`INSERT INTO flights (cliente, mes_viagem, prioridade, preco_esperado, link_voo, preco_atual, status, preco_compra)
               VALUES ('C','Out','Alta',1000,'https://bf/2',1500,'passagem comprada',600)`);
    // ativo -> nao deve ganhar preco_compra
    await run(`INSERT INTO flights (cliente, mes_viagem, prioridade, preco_esperado, link_voo, preco_atual, status)
               VALUES ('C','Out','Alta',1000,'https://bf/3',880,'ativo')`);

    await run(sqlBackfill);

    expect((await get('SELECT preco_compra FROM flights WHERE link_voo=?', ['https://bf/1'])).preco_compra).toBe(770);
    expect((await get('SELECT preco_compra FROM flights WHERE link_voo=?', ['https://bf/2'])).preco_compra).toBe(600);
    expect((await get('SELECT preco_compra FROM flights WHERE link_voo=?', ['https://bf/3'])).preco_compra).toBeNull();
  });
});
