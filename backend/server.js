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

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('[AUTH] FATAL: SESSION_SECRET is not set. Generate one with: openssl rand -hex 32');
    process.exit(1);
}

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const SqliteStore = require('connect-sqlite3')(session);
const csrfMiddleware = require('./middleware/csrf');
const requireAuth = require('./middleware/requireAuth');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const { startScheduler, startStatusScheduler } = require('./services/scheduler');
const { startJob: startVoucherRetention } = require('./services/voucherRetention');
const monitoredFlightsRouter = require('./routes/monitoredFlights');
const flightsRouter = require('./routes/flights');
const settingsRouter = require('./routes/settings');
const promotionsRouter = require('./routes/promotions');
const vouchersRouter = require('./routes/vouchers');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());

app.use(cookieParser());
app.use(session({
    store: new SqliteStore({
        db: 'sessions.sqlite',
        dir: process.env.DB_PATH || __dirname,
        cleanupInterval: 3600
    }),
    name: 'cvv.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
    }
}));

// 1. CSRF middleware for all /api routes
app.use('/api', csrfMiddleware);

// 2. Auth router BEFORE global requireAuth
app.use('/api/auth', authRouter);

// 3. Global auth guard — all /api/* after this point requires a valid session
app.use('/api', requireAuth);

// 4. Business routes (all protected by requireAuth above)
app.use('/api/monitored-flights', monitoredFlightsRouter);
app.use('/api/flights', flightsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/users', usersRouter);
app.use('/api/promotions', promotionsRouter);
app.use('/api/vouchers', vouchersRouter);

// Serve local static assets (e.g. background images for promo rendering)
app.use('/static', express.static(path.join(__dirname, 'static')));

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
    startVoucherRetention();
    // Limpa pastas de trabalho de promoções no boot e a cada hora (TTL 24h),
    // honrando o expires_at retornado por /render-image.
    const { cleanupExpired } = require('./helpers/promoWorkspace');
    cleanupExpired();
    setInterval(() => cleanupExpired(), 3600 * 1000).unref();
});
