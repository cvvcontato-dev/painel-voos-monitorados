const sqlite3 = require('sqlite3');
const { ensureColumns } = require('../helpers/dbColumns');

const run = (db, sql) => new Promise((res, rej) => db.run(sql, (e) => (e ? rej(e) : res())));
const cols = (db, t) => new Promise((res, rej) => db.all(`PRAGMA table_info(${t})`, (e, r) => (e ? rej(e) : res(r.map(c => c.name)))));
const migrate = (db) => new Promise((res) => ensureColumns(db, 'flight_changes', [['affected_json', 'TEXT'], ['extracted_json', 'TEXT']], res));

describe('migração das colunas de trechos afetados', () => {
  test('banco antigo ganha as colunas e rodar 2x é idempotente (sem erro, sem perder dados)', async () => {
    const db = new sqlite3.Database(':memory:');
    await run(db, 'CREATE TABLE flight_changes (id INTEGER PRIMARY KEY, old_json TEXT)');
    await run(db, "INSERT INTO flight_changes (old_json) VALUES ('{}')");
    expect(await migrate(db)).toBeNull();
    expect(await cols(db, 'flight_changes')).toEqual(['id', 'old_json', 'affected_json', 'extracted_json']);
    expect(await migrate(db)).toBeNull();   // 2ª vez: 'duplicate column name' é ignorado
    expect(await cols(db, 'flight_changes')).toEqual(['id', 'old_json', 'affected_json', 'extracted_json']);
    const row = await new Promise((res) => db.get('SELECT * FROM flight_changes', (e, r) => res(r)));
    expect(row).toEqual({ id: 1, old_json: '{}', affected_json: null, extracted_json: null });
    db.close();
  });

  test('erro inesperado é devolvido (tabela inexistente)', async () => {
    const db = new sqlite3.Database(':memory:');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = await migrate(db);
    expect(err).toBeTruthy();
    spy.mockRestore();
    db.close();
  });
});
