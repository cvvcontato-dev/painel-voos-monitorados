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
const { startScheduler, startStatusScheduler } = require('./services/scheduler');
const monitoredFlightsRouter = require('./routes/monitoredFlights');
const flightsRouter = require('./routes/flights');
const settingsRouter = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/monitored-flights', monitoredFlightsRouter);
app.use('/api/flights', flightsRouter);
app.use('/api/settings', settingsRouter);

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
    startStatusScheduler();
});
