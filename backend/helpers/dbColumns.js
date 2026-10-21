// Migração idempotente de colunas: ALTER TABLE ADD COLUMN encadeado (um por vez, nos callbacks, porque o
// node-sqlite3 executa queries em paralelo). 'duplicate column name' é esperado em bancos já migrados.
// defs = [['nome_coluna', 'TIPO']]; `done` (opcional) roda ao final, com o último erro inesperado (ou null).
function ensureColumns(db, table, defs, done) {
  let falha = null;
  const next = (i) => {
    if (i >= defs.length) return done && done(falha);
    const [col, tipo] = defs[i];
    db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${tipo}`, (err) => {
      if (err && !String(err.message).includes('duplicate column name')) {
        falha = err;
        console.error('Migration error:', err.message);
      }
      next(i + 1);
    });
  };
  next(0);
}

module.exports = { ensureColumns };
