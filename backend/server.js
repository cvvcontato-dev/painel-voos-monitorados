const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- API Routes ---

// Get all flights
app.get('/api/flights', (req, res) => {
    db.all('SELECT * FROM flights ORDER BY id DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
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
    const { cliente, mes_viagem, prioridade, preco_esperado, check_diario, link_voo } = req.body;
    
    if (!cliente || !mes_viagem || !prioridade || preco_esperado == null || !link_voo) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const isCheckDiario = check_diario ? 1 : 0;

    const sql = `INSERT INTO flights (cliente, mes_viagem, prioridade, preco_esperado, check_diario, link_voo)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [cliente, mes_viagem, prioridade, preco_esperado, isCheckDiario, link_voo];

    db.run(sql, params, function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Link already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, cliente, mes_viagem, prioridade, preco_esperado, check_diario: isCheckDiario, link_voo });
    });
});

// Update a flight
app.put('/api/flights/:id', (req, res) => {
    const { id } = req.params;
    const { cliente, mes_viagem, prioridade, preco_esperado, check_diario, link_voo } = req.body;

    const isCheckDiario = check_diario ? 1 : 0;

    const sql = `UPDATE flights 
                 SET cliente = COALESCE(?, cliente), 
                     mes_viagem = COALESCE(?, mes_viagem), 
                     prioridade = COALESCE(?, prioridade), 
                     preco_esperado = COALESCE(?, preco_esperado), 
                     check_diario = COALESCE(?, check_diario), 
                     link_voo = COALESCE(?, link_voo)
                 WHERE id = ?`;
                 
    const params = [cliente, mes_viagem, prioridade, preco_esperado, isCheckDiario, link_voo, id];

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
        res.json({ message: 'Flight updated successfully' });
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
});
