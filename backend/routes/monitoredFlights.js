const express = require('express');
const db = require('../database');
const { nowUtcIso, addMinutesUtc } = require('../helpers/time');
const { checkOne } = require('../services/statusMonitor');

const router = express.Router();

const NUMERO_VOO_REGEX = /^[A-Z0-9]{2}\d{1,4}$/i;
const DATA_VOO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_CADENCIAS = [15, 30, 60, 120, 240, 360, 720, 1440];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function validateCreatePayload(body) {
  const { cliente, numero_voo, data_voo, email_cliente, cadencia_minutos, link_gerenciamento } = body;
  if (!cliente || typeof cliente !== 'string') return 'cliente é obrigatório';
  if (!numero_voo || !NUMERO_VOO_REGEX.test(numero_voo))
    return 'numero_voo inválido (ex.: LA8084, G31234)';
  if (!data_voo || !DATA_VOO_REGEX.test(data_voo)) return 'data_voo inválido (use YYYY-MM-DD)';

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const flightDate = new Date(`${data_voo}T00:00:00.000Z`);
  const daysDiff = (flightDate - today) / (24 * 3600 * 1000);
  if (daysDiff < -30) return 'data_voo está muito no passado (>30 dias)';
  if (daysDiff > 365) return 'data_voo está muito no futuro (>365 dias)';

  if (email_cliente && !EMAIL_REGEX.test(email_cliente)) return 'email_cliente inválido';
  if (cadencia_minutos !== undefined && !ALLOWED_CADENCIAS.includes(Number(cadencia_minutos)))
    return `cadencia_minutos deve ser um de: ${ALLOWED_CADENCIAS.join(', ')}`;
  if (link_gerenciamento && !isValidUrl(link_gerenciamento))
    return 'link_gerenciamento deve ser uma URL http(s) válida';

  return null;
}

// GET all
router.get('/', (req, res) => {
  db.all(
    `SELECT * FROM monitored_flights_status ORDER BY (proxima_verificacao IS NULL), proxima_verificacao ASC, id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// GET one + history
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id], (err, flight) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    db.all(
      `SELECT * FROM flight_status_history WHERE monitored_flight_id = ?
       ORDER BY verificado_em DESC LIMIT 100`,
      [req.params.id],
      (err, history) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ flight, history: history || [] });
      }
    );
  });
});

// POST create
router.post('/', (req, res) => {
  const err = validateCreatePayload(req.body);
  if (err) return res.status(400).json({ error: err });

  const now = nowUtcIso();
  const cadencia = Number(req.body.cadencia_minutos || 60);
  const proxima = addMinutesUtc(now, 0); // due immediately on first cycle
  const params = [
    req.body.cliente,
    req.body.numero_voo.toUpperCase(),
    req.body.data_voo,
    req.body.email_cliente || null,
    req.body.telegram_chat_id || null,
    cadencia,
    proxima,
    req.body.link_gerenciamento || null,
    now, now
  ];

  db.run(
    `INSERT INTO monitored_flights_status
       (cliente, numero_voo, data_voo, email_cliente, telegram_chat_id,
        cadencia_minutos, proxima_verificacao, link_gerenciamento, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params,
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed'))
          return res.status(409).json({ error: 'Voo já cadastrado (cliente + número + data)' });
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [this.lastID], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json(row);
      });
    }
  );
});

// PUT update
router.put('/:id', (req, res) => {
  const { cliente, email_cliente, telegram_chat_id, cadencia_minutos, monitoramento_ativo, link_gerenciamento,
          override_ativo, override_partida_programada, override_partida_estimada } = req.body;

  if (email_cliente !== undefined && email_cliente !== '' && email_cliente !== null
      && !EMAIL_REGEX.test(email_cliente))
    return res.status(400).json({ error: 'email_cliente inválido' });
  if (cadencia_minutos !== undefined && !ALLOWED_CADENCIAS.includes(Number(cadencia_minutos)))
    return res.status(400).json({ error: `cadencia_minutos deve ser um de: ${ALLOWED_CADENCIAS.join(', ')}` });
  if (link_gerenciamento !== undefined && link_gerenciamento !== '' && link_gerenciamento !== null
      && !isValidUrl(link_gerenciamento))
    return res.status(400).json({ error: 'link_gerenciamento deve ser uma URL http(s) válida' });

  // Validação do override: se ativando, precisa de partida_programada ISO válida
  if (override_ativo === 1) {
    if (!override_partida_programada || isNaN(Date.parse(override_partida_programada)))
      return res.status(400).json({ error: 'override_partida_programada deve ser uma data ISO válida' });
    if (override_partida_estimada && isNaN(Date.parse(override_partida_estimada)))
      return res.status(400).json({ error: 'override_partida_estimada deve ser uma data ISO válida' });
  }

  db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!existing) return res.status(404).json({ error: 'Flight not found' });

    const now = nowUtcIso();
    const newCadencia = cadencia_minutos !== undefined ? Number(cadencia_minutos) : existing.cadencia_minutos;
    const newProxima = cadencia_minutos !== undefined
      ? addMinutesUtc(now, newCadencia)
      : existing.proxima_verificacao;

    // Resolve override: quando ativando, escreve os horários nos campos atuais
    // (partida_programada / partida_estimada). Quando desativando, mantém os
    // valores atuais — o próximo ciclo da API vai refrescar com dados reais.
    let newPartidaProg = existing.partida_programada;
    let newPartidaEst  = existing.partida_estimada;
    let newOverride    = existing.override_ativo;
    if (override_ativo === 1) {
      newPartidaProg = override_partida_programada;
      newPartidaEst  = override_partida_estimada || override_partida_programada;
      newOverride    = 1;
    } else if (override_ativo === 0) {
      newOverride = 0;
    }

    db.run(
      `UPDATE monitored_flights_status SET
         cliente = COALESCE(?, cliente),
         email_cliente = ?,
         telegram_chat_id = ?,
         cadencia_minutos = ?,
         monitoramento_ativo = COALESCE(?, monitoramento_ativo),
         proxima_verificacao = ?,
         link_gerenciamento = ?,
         partida_programada = ?,
         partida_estimada = ?,
         override_ativo = ?,
         atualizado_em = ?
       WHERE id = ?`,
      [
        cliente !== undefined ? cliente : null,
        email_cliente !== undefined ? (email_cliente || null) : existing.email_cliente,
        telegram_chat_id !== undefined ? (telegram_chat_id || null) : existing.telegram_chat_id,
        newCadencia,
        monitoramento_ativo !== undefined ? (monitoramento_ativo ? 1 : 0) : null,
        newProxima,
        link_gerenciamento !== undefined ? (link_gerenciamento || null) : existing.link_gerenciamento,
        newPartidaProg,
        newPartidaEst,
        newOverride,
        now,
        req.params.id
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id], (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(row);
        });
      }
    );
  });
});

// POST toggle
router.post('/:id/toggle', (req, res) => {
  db.get('SELECT monitoramento_ativo FROM monitored_flights_status WHERE id = ?',
    [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Flight not found' });
      const next = row.monitoramento_ativo ? 0 : 1;
      db.run(`UPDATE monitored_flights_status SET monitoramento_ativo = ?, atualizado_em = ? WHERE id = ?`,
        [next, nowUtcIso(), req.params.id], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(row);
          });
        });
    });
});

// DELETE
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM monitored_flights_status WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Flight not found' });
    res.json({ message: 'Deleted' });
  });
});

// POST check-now
router.post('/:id/check-now', async (req, res) => {
  try {
    const result = await checkOne(req.params.id);
    if (!result.ok && result.error === 'not_found')
      return res.status(404).json({ error: 'Flight not found' });
    if (!result.ok)
      return res.status(502).json({ sucesso: false, erro: result.error });
    const flight = await new Promise((r, j) =>
      db.get('SELECT * FROM monitored_flights_status WHERE id = ?', [req.params.id],
        (e, row) => e ? j(e) : r(row)));
    return res.json({ sucesso: true, status_atual: result.status_atual, events: result.events, flight });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
