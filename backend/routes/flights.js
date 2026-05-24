const express = require('express');
const router = express.Router();
const db = require('../database');
const { processFlight } = require('../services/scheduler');
const { sendEmail, sendTelegram } = require('../services/notifier');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES = ['ativo', 'encerrado', 'passagem comprada'];

// Get all flights
router.get('/', (req, res) => {
    db.all('SELECT * FROM flights ORDER BY posicao ASC, id DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Bulk check/uncheck all flights
router.put('/bulk-check', (req, res) => {
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
router.put('/reorder', (req, res) => {
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
router.get('/:id', (req, res) => {
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
router.post('/', (req, res) => {
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
router.put('/:id', (req, res) => {
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
router.delete('/:id', (req, res) => {
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

// Check Now (manual immediate verification)
router.post('/:id/check-now', async (req, res) => {
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

// Test notification — sends a fake alert through both channels to validate
// SMTP/Telegram setup without waiting for a real price drop.
// Ignores `alerta_enviado` and uses preco_esperado * 0.9 as a stand-in price
// when the flight has no scraped price yet.
router.post('/:id/test-notification', async (req, res) => {
    const { id } = req.params;

    try {
        const flight = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM flights WHERE id = ?', [id], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!flight) {
            return res.status(404).json({ error: 'Voo não encontrado' });
        }

        // Build a "what an alert would look like" payload
        const testFlight = {
            ...flight,
            preco_atual: flight.preco_atual && flight.preco_atual <= flight.preco_esperado
                ? flight.preco_atual
                : Math.round(flight.preco_esperado * 0.9 * 100) / 100,
        };

        const envCheck = {
            EMAIL_USER:         !!process.env.EMAIL_USER,
            EMAIL_PASS:         !!process.env.EMAIL_PASS,
            TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
        };

        const results = { email: null, telegram: null, env: envCheck };

        if (flight.email_cliente) {
            results.email = await sendEmail(flight.email_cliente, testFlight);
        } else {
            results.email = { sucesso: false, erro: 'Nenhum e-mail configurado para este voo' };
        }

        if (flight.telegram_chat_id) {
            results.telegram = await sendTelegram(flight.telegram_chat_id, testFlight);
        } else {
            results.telegram = { sucesso: false, erro: 'Nenhum chat_id Telegram configurado para este voo' };
        }

        return res.json(results);
    } catch (error) {
        console.error(`[TEST-NOTIF] Erro no voo #${id}:`, error.message);
        return res.status(500).json({ error: error.message });
    }
});

// Price History
router.get('/:id/history', (req, res) => {
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

module.exports = router;
