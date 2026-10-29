const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { startScheduler } = require('../services/scheduler');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/^image\/(png|jpe?g|webp|svg\+xml)$/i.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato inválido. Envie uma imagem PNG, JPG, WebP ou SVG.'));
        }
    }
});

// GET /api/settings/logo
router.get('/logo', (req, res) => {
    try {
        const logoPath = path.resolve(__dirname, '../static/agency-logo.png');
        if (!fs.existsSync(logoPath)) {
            return res.json({ exists: false, url: null });
        }
        const stat = fs.statSync(logoPath);
        res.json({
            exists: true,
            url: `/voucher-assets/agency-logo.png?v=${stat.mtimeMs}`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/logo
router.post('/logo', (req, res) => {
    upload.single('logo')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Nenhum arquivo enviado' });
            }
            const staticDir = path.resolve(__dirname, '../static');
            if (!fs.existsSync(staticDir)) {
                fs.mkdirSync(staticDir, { recursive: true });
            }
            const agencyLogoPath = path.join(staticDir, 'agency-logo.png');
            const defaultLogoPath = path.join(staticDir, 'logo.png');

            fs.writeFileSync(agencyLogoPath, req.file.buffer);
            fs.writeFileSync(defaultLogoPath, req.file.buffer);

            const stat = fs.statSync(agencyLogoPath);
            res.json({
                message: 'Logo da agência atualizada com sucesso',
                url: `/voucher-assets/agency-logo.png?v=${stat.mtimeMs}`
            });
        } catch (error) {
            console.error('[SETTINGS] Erro ao salvar logo:', error.message);
            res.status(500).json({ error: error.message });
        }
    });
});

// GET /api/settings
router.get('/', (req, res) => {
    res.json({
        telegram_bot_token_set: !!process.env.TELEGRAM_BOT_TOKEN,
        email_user_set: !!process.env.EMAIL_USER,
        email_pass_set: !!process.env.EMAIL_PASS,
        email_host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        email_port: parseInt(process.env.EMAIL_PORT || '465', 10),
        check_interval_hours: parseInt(process.env.CHECK_INTERVAL_HOURS || '6', 10),
        max_concurrent_scrapers: 1,
        alert_reset_threshold: parseFloat(process.env.ALERT_RESET_THRESHOLD || '1.10')
    });
});

// PUT /api/settings
router.put('/', (req, res) => {
    try {
        const envPath = path.resolve(__dirname, '../../.env');
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

module.exports = router;
