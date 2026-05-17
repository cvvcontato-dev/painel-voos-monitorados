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
            link_voo TEXT NOT NULL UNIQUE,
            quantidade_pax INTEGER NOT NULL DEFAULT 1,
            posicao INTEGER NOT NULL DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error('Error creating table', err.message);
            } else {
                console.log('Flights table created or already exists.');
                runMigrations();
            }
        });
    }
});

function runMigrations() {
    const migrations = [
        // Existing migrations
        "ALTER TABLE flights ADD COLUMN quantidade_pax INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE flights ADD COLUMN posicao INTEGER NOT NULL DEFAULT 0",
        // New migrations — monitoring system
        "ALTER TABLE flights ADD COLUMN email_cliente TEXT",
        "ALTER TABLE flights ADD COLUMN telegram_chat_id TEXT",
        "ALTER TABLE flights ADD COLUMN preco_atual REAL",
        "ALTER TABLE flights ADD COLUMN ultima_verificacao TEXT",
        "ALTER TABLE flights ADD COLUMN alerta_enviado INTEGER DEFAULT 0",
        "ALTER TABLE flights ADD COLUMN status TEXT DEFAULT 'ativo'"
    ];

    migrations.forEach(sql => {
        db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Migration error:', err.message);
            }
        });
    });

    // Create price history table
    db.run(`CREATE TABLE IF NOT EXISTS flight_price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flight_id INTEGER NOT NULL,
        preco REAL NOT NULL,
        verificado_em TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating flight_price_history table:', err.message);
        } else {
            console.log('flight_price_history table created or already exists.');
            // Create index for optimized history queries
            db.run(`CREATE INDEX IF NOT EXISTS idx_flight_price_history_flight_id
                    ON flight_price_history (flight_id)`, (err) => {
                if (err) console.error('Error creating index:', err.message);
            });
        }
    });
}

module.exports = db;
