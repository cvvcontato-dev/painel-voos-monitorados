const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use /data volume in production (Docker), fallback to local dir
const dbDir = process.env.DB_PATH || __dirname;
const dbPath = path.resolve(dbDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log(`Connected to SQLite database at ${dbPath}`);
        db.run(`CREATE TABLE IF NOT EXISTS flights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente TEXT NOT NULL,
            mes_viagem TEXT NOT NULL,
            prioridade TEXT NOT NULL CHECK(prioridade IN ('Urgente', 'Alta', 'Média', 'Baixa')),
            preco_esperado REAL NOT NULL,
            check_diario BOOLEAN NOT NULL DEFAULT 0,
            link_voo TEXT NOT NULL UNIQUE
        )`, (err) => {
            if (err) {
                console.error('Error creating table', err.message);
            } else {
                console.log('Flights table created or already exists.');
            }
        });
    }
});

module.exports = db;
