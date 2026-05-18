const path = require('path');
const fs = require('fs');

// Load .env from multiple possible locations
const envPaths = [
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../.env'),
    '/data/.env'
];
const envPath = envPaths.find(p => fs.existsSync(p));
if (envPath) {
    require('dotenv').config({ path: envPath });
    console.log(`[ENV] Loaded from ${envPath}`);
} else {
    require('dotenv').config();
    console.log('[ENV] No .env file found, using process env only');
}

const express = require('express');
const cors = require('cors');
const db = require('./database');
const { startScheduler, processFlight } = require('./services/scheduler');
const monitoredFlightsRouter = require('./routes/monitoredFlights');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/monitored-flights', monitoredFlightsRouter);

// --- Validation helpers ---
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES = ['ativo', 'encerrado', 'passagem comprada'];

// --- API Routes ---

// Get all flights
app.get('/api/flights', (req, res) => {
    db.all('SELECT * FROM flights ORDER BY posicao ASC, id DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Bulk check/uncheck all flights
app.put('/api/flights/bulk-check', (req, res) => {
    const { check_diario } = req.body;
    const isCheckDiario = check_diario ? 1 : 0;
    
    db.run('UPDATE flights SET check_diario = ?', [isCheckDiario], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: `Updated all flights check status to ${isCheckDiario}`, changes: this.changes });
    });
});

// Bulk reorder flights manually
app.put('/api/flights/reorder', (req, res) => {
    const { ids } = req.body; // Array of IDs in the desired order
    if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid ids array' });
    }

    db.serialize(() => {
        const stmt = db.prepare('UPDATE flights SET posicao = ? WHERE id = ?');
        ids.forEach((id, index) => {
            stmt.run(index, id);
        });
        stmt.finalize((err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Reordered successfully' });
        });
    });
});

// Get a single flight
app.get('/api/flights/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM flights WHERE id = ?', [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Flight not found' });
        }
        res.json(row);
    });
});

// Create a flight
app.post('/api/flights', (req, res) => {
    const { cliente, mes_viagem, prioridade, preco_esperado, check_diario, link_voo,
            quantidade_pax, posicao, email_cliente, telegram_chat_id, status } = req.body;
    
    if (!cliente || !mes_viagem || !prioridade || preco_esperado == null || !link_voo) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validation
    if (email_cliente && !EMAIL_REGEX.test(email_cliente)) {
        return res.status(400).json({ error: 'Formato de e-mail inválido' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Status inválido. Use: ativo, encerrado ou passagem comprada' });
    }
    if (parseFloat(preco_esperado) <= 0) {
        return res.status(400).json({ error: 'Preço esperado deve ser positivo' });
    }

    const isCheckDiario = check_diario ? 1 : 0;
    const paxQty = quantidade_pax != null ? parseInt(quantidade_pax, 10) : 1;
    const pos = posicao != null ? parseInt(posicao, 10) : 0;
    const flightStatus = status || 'ativo';

    const sql = `INSERT INTO flights (cliente, mes_viagem, prioridade, preco_esperado, check_diario, link_voo, 
                 quantidade_pax, posicao, email_cliente, telegram_chat_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [cliente, mes_viagem, prioridade, preco_esperado, isCheckDiario, link_voo,
                    paxQty, pos, email_cliente || null, telegram_chat_id || null, flightStatus];

    db.run(sql, params, function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Link already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        // Return the full created row
        db.get('SELECT * FROM flights WHERE id = ?', [this.lastID], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json(row);
        });
    });
});

// Update a flight
app.put('/api/flights/:id', (req, res) => {
    const { id } = req.params;
    const { cliente, mes_viagem, prioridade, preco_esperado, check_diario, link_voo,
            quantidade_pax, posicao, email_cliente, telegram_chat_id, status } = req.body;

    // Validation
    if (email_cliente !== undefined && email_cliente !== null && email_cliente !== '' && !EMAIL_REGEX.test(email_cliente)) {
        return res.status(400).json({ error: 'Formato de e-mail inválido' });
    }
    if (status !== undefined && status !== null && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Status inválido. Use: ativo, encerrado ou passagem comprada' });
    }
    if (preco_esperado !== undefined && preco_esperado !== null && parseFloat(preco_esperado) <= 0) {
        return res.status(400).json({ error: 'Preço esperado deve ser positivo' });
    }

    const isCheckDiario = check_diario !== undefined ? (check_diario ? 1 : 0) : null;
    const paxQty = quantidade_pax !== undefined ? parseInt(quantidade_pax, 10) : null;
    const pos = posicao !== undefined ? parseInt(posicao, 10) : null;

    const sql = `UPDATE flights 
                 SET cliente = COALESCE(?, cliente), 
                     mes_viagem = COALESCE(?, mes_viagem), 
                     prioridade = COALESCE(?, prioridade), 
                     preco_esperado = COALESCE(?, preco_esperado), 
                     check_diario = COALESCE(?, check_diario, check_diario), 
                     link_voo = COALESCE(?, link_voo),
                     quantidade_pax = COALESCE(?, quantidade_pax),
                     posicao = COALESCE(?, posicao),
                     email_cliente = ?,
                     telegram_chat_id = ?,
                     status = COALESCE(?, status)
                 WHERE id = ?`;

    // For email and telegram: if they were provided in the body (even as empty string),
    // pass the value (or null to clear). If not provided, keep the existing value.
    const emailValue = email_cliente !== undefined ? (email_cliente || null) : undefined;
    const telegramValue = telegram_chat_id !== undefined ? (telegram_chat_id || null) : undefined;

    // We need to handle the "keep existing" case by first fetching the current row
    db.get('SELECT email_cliente, telegram_chat_id FROM flights WHERE id = ?', [id], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!existing) return res.status(404).json({ error: 'Flight not found' });

        const finalEmail = emailValue !== undefined ? emailValue : existing.email_cliente;
        const finalTelegram = telegramValue !== undefined ? telegramValue : existing.telegram_chat_id;
                 
        const params = [cliente, mes_viagem, prioridade, preco_esperado, isCheckDiario, link_voo,
                        paxQty, pos, finalEmail, finalTelegram, status, id];

        db.run(sql, params, function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Link already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Flight not found' });
            }
            // Return updated flight
            db.get('SELECT * FROM flights WHERE id = ?', [id], (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(row);
            });
        });
    });
});

// Delete a flight
app.delete('/api/flights/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM flights WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Flight not found' });
        }
        res.json({ message: 'Flight deleted successfully' });
    });
});

// --- Check Now (manual immediate verification) ---
app.post('/api/flights/:id/check-now', async (req, res) => {
    const { id } = req.params;

    try {
        const flight = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM flights WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!flight) {
            return res.status(404).json({ sucesso: false, preco_encontrado: null, bloqueado: false, alerta_disparado: false, erro: 'Voo não encontrado' });
        }

        const result = await processFlight(flight);

        if (result.status === 'bloqueado') {
            return res.json({ sucesso: false, preco_encontrado: null, bloqueado: true, alerta_disparado: false, erro: null });
        }

        if (result.status === 'falha') {
            return res.json({ sucesso: false, preco_encontrado: null, bloqueado: false, alerta_disparado: false, erro: 'Não foi possível obter o preço' });
        }

        // Get the updated flight data
        const updatedFlight = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM flights WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        return res.json({
            sucesso: true,
            preco_encontrado: result.preco,
            bloqueado: false,
            alerta_disparado: result.alertaDisparado || false,
            erro: null,
            flight: updatedFlight
        });
    } catch (error) {
        console.error(`[CHECK-NOW] Erro no voo #${id}:`, error.message);
        return res.status(500).json({ sucesso: false, preco_encontrado: null, bloqueado: false, alerta_disparado: false, erro: error.message });
    }
});

// --- Price History ---
app.get('/api/flights/:id/history', (req, res) => {
    const { id } = req.params;
    db.all(
        `SELECT preco, verificado_em FROM flight_price_history 
         WHERE flight_id = ? ORDER BY verificado_em DESC LIMIT 30`,
        [id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// --- Settings ---
app.get('/api/settings', (req, res) => {
    res.json({
        telegram_bot_token_set: !!process.env.TELEGRAM_BOT_TOKEN,
        email_user_set: !!process.env.EMAIL_USER,
        email_pass_set: !!process.env.EMAIL_PASS,
        email_host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        email_port: parseInt(process.env.EMAIL_PORT || '465', 10),
        check_interval_hours: parseInt(process.env.CHECK_INTERVAL_HOURS || '6', 10),
        max_concurrent_scrapers: parseInt(process.env.MAX_CONCURRENT_SCRAPERS || '3', 10),
        alert_reset_threshold: parseFloat(process.env.ALERT_RESET_THRESHOLD || '1.10')
    });
});

app.put('/api/settings', (req, res) => {
    try {
        const envPath = path.resolve(__dirname, '../.env');
        let envContent = '';

        // Read existing .env if it exists
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }

        // Helper to set or update an env variable in the .env file content
        function setEnvVar(content, key, value) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            const line = `${key}=${value}`;
            if (regex.test(content)) {
                return content.replace(regex, line);
            } else {
                return content.trim() + '\n' + line;
            }
        }

        const fields = {
            'TELEGRAM_BOT_TOKEN': req.body.telegram_bot_token,
            'EMAIL_HOST': req.body.email_host,
            'EMAIL_PORT': req.body.email_port,
            'EMAIL_USER': req.body.email_user,
            'EMAIL_PASS': req.body.email_pass,
            'EMAIL_FROM': req.body.email_from,
            'CHECK_INTERVAL_HOURS': req.body.check_interval_hours,
            'MAX_CONCURRENT_SCRAPERS': req.body.max_concurrent_scrapers,
            'ALERT_RESET_THRESHOLD': req.body.alert_reset_threshold
        };

        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) {
                envContent = setEnvVar(envContent, key, value);
                process.env[key] = String(value);
            }
        }

        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');

        // Restart scheduler with new interval if changed
        if (req.body.check_interval_hours !== undefined) {
            startScheduler();
        }

        res.json({ message: 'Configurações salvas com sucesso' });
    } catch (error) {
        console.error('[SETTINGS] Erro ao salvar:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Serve Frontend (Production) ---
// In production, serve the built React app
const frontendPath = path.join(__dirname, 'public');
app.use(express.static(frontendPath));

// All non-API routes serve the React app (SPA fallback)
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    // Start the scheduler after server is up
    startScheduler();
});
