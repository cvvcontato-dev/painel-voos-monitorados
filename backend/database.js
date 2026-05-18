const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { hash: hashPassword } = require('./helpers/password');

// Use /data volume in production (Docker), fallback to local dir
const dbDir = process.env.DB_PATH || __dirname;
const dbPath = path.resolve(dbDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log(`Connected to SQLite database at ${dbPath}`);
        // SQLite disables foreign keys by default — enable per-connection so that
        // ON DELETE CASCADE on flight_status_history actually cascades.
        db.run('PRAGMA foreign_keys = ON');
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

async function seedAdminIfNeeded() {
    return new Promise((resolve) => {
        db.get('SELECT COUNT(*) as cnt FROM users', [], async (err, row) => {
            if (err || row.cnt > 0) return resolve();

            const email = process.env.ADMIN_EMAIL;
            const password = process.env.ADMIN_PASSWORD;

            if (!email || !password) {
                console.error(
                    '[AUTH] FATAL: users table is empty but ADMIN_EMAIL and ADMIN_PASSWORD are not set. ' +
                    'Cannot start without an initial admin account.'
                );
                process.exit(1);
            }

            const password_hash = await hashPassword(password);
            db.run(
                `INSERT INTO users (email, nome, password_hash, role, criado_em)
                 VALUES (?, ?, ?, 'admin', datetime('now'))`,
                [email.toLowerCase(), email.split('@')[0], password_hash],
                function(err) {
                    if (err) {
                        console.error('[AUTH] Failed to seed admin:', err.message);
                    } else {
                        console.log(`[AUTH] Admin account seeded for ${email}`);
                        db.run(
                            `INSERT INTO auth_audit_log (timestamp, evento, user_id, ip, user_agent, success)
                             VALUES (datetime('now'), 'admin_seeded', ?, 'server', 'seed', 1)`,
                            [this.lastID]
                        );
                    }
                    resolve();
                }
            );
        });
    });
}

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

    // --- Status monitoring tables ---
    db.run(`CREATE TABLE IF NOT EXISTS monitored_flights_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT NOT NULL,
        numero_voo TEXT NOT NULL,
        data_voo TEXT NOT NULL,
        origem TEXT,
        destino TEXT,
        companhia TEXT,
        email_cliente TEXT,
        telegram_chat_id TEXT,
        cadencia_minutos INTEGER NOT NULL DEFAULT 60,
        status_atual TEXT,
        partida_programada TEXT,
        partida_estimada TEXT,
        chegada_programada TEXT,
        chegada_estimada TEXT,
        portao TEXT,
        terminal TEXT,
        monitoramento_ativo INTEGER NOT NULL DEFAULT 1,
        ultima_verificacao TEXT,
        proxima_verificacao TEXT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        UNIQUE(numero_voo, data_voo, cliente)
    )`, (err) => {
        if (err) {
            console.error('Error creating monitored_flights_status table:', err.message);
        } else {
            console.log('monitored_flights_status table created or already exists.');
            db.run(`CREATE INDEX IF NOT EXISTS idx_msf_proxima
                    ON monitored_flights_status(proxima_verificacao)
                    WHERE monitoramento_ativo = 1`, (err) => {
                if (err) console.error('Error creating idx_msf_proxima:', err.message);
            });
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS flight_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitored_flight_id INTEGER NOT NULL,
        verificado_em TEXT NOT NULL,
        evento TEXT NOT NULL,
        payload_json TEXT,
        notificado INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (monitored_flight_id) REFERENCES monitored_flights_status(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating flight_status_history table:', err.message);
        } else {
            console.log('flight_status_history table created or already exists.');
            db.run(`CREATE INDEX IF NOT EXISTS idx_fsh_flight_evento
                    ON flight_status_history(monitored_flight_id, evento, verificado_em DESC)`, (err) => {
                if (err) console.error('Error creating idx_fsh_flight_evento:', err.message);
            });
        }
    });

    // --- Auth tables ---
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','user')) DEFAULT 'user',
        criado_em TEXT NOT NULL,
        ultimo_login TEXT
    )`, async (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
            return;
        }
        console.log('users table created or already exists.');
        await seedAdminIfNeeded();
    });

    db.run(`CREATE TABLE IF NOT EXISTS auth_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        evento TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip TEXT,
        user_agent TEXT,
        success INTEGER NOT NULL,
        metadata_json TEXT
    )`, (err) => {
        if (err) console.error('Error creating auth_audit_log table:', err.message);
        else {
            console.log('auth_audit_log table created or already exists.');
            db.run(`CREATE INDEX IF NOT EXISTS idx_audit_user_time
                    ON auth_audit_log(user_id, timestamp DESC)`, (err) => {
                if (err) console.error('Error creating audit index:', err.message);
            });
        }
    });
}

module.exports = db;
