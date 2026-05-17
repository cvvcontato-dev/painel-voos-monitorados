const { chromium } = require('playwright');

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;
const NAVIGATION_TIMEOUT = 60000;

/**
 * Detect if the page is blocked by CAPTCHA or anti-bot protection.
 */
async function detectBlock(page) {
    try {
        const title = (await page.title()).toLowerCase();
        const url = page.url();

        if (/unusual traffic|captcha|verify|sorry/i.test(title)) {
            return { bloqueado: true, motivo: `captcha (título: "${title}")` };
        }

        if (url.includes('accounts.google.com') || url.includes('sorry/index')) {
            return { bloqueado: true, motivo: `redirect bloqueio (${url})` };
        }

        const captchaEl = await page.$('#captcha, [class*="captcha"], #recaptcha, .g-recaptcha');
        if (captchaEl) {
            return { bloqueado: true, motivo: 'elemento captcha detectado na página' };
        }

        return { bloqueado: false };
    } catch (e) {
        console.error('[SCRAPER] Erro ao verificar bloqueio:', e.message);
        return { bloqueado: false };
    }
}

/**
 * Extract flight prices from a Google Flights page.
 * Returns the lowest price found between R$100 and R$50,000.
 */
async function extractPrices(page) {
    return await page.evaluate(() => {
        const prices = [];
        const selectors = [
            '[data-gs] span',
            '[jsname="YdtKid"]',
            'span[data-gs]',
            '.YMlIz span', // common Google Flights price container
            'span'
        ];

        const seen = new Set();

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const text = el.textContent.trim();
                // Match R$ patterns: R$ 1.234, R$ 1234, R$1.234,56
                const match = text.match(/R\$\s*([\d.,]+)/);
                if (match) {
                    // Parse Brazilian number format: 1.234,56 -> 1234.56
                    let numStr = match[1]
                        .replace(/\./g, '')  // remove thousand separators
                        .replace(',', '.');  // decimal comma to dot
                    const num = parseFloat(numStr);
                    if (!isNaN(num) && num >= 100 && num <= 50000 && !seen.has(num)) {
                        seen.add(num);
                        prices.push({ value: num, selector, text: text.substring(0, 60) });
                    }
                }
            }
        }

        return prices;
    });
}

/**
 * Scrape the lowest flight price from a Google Flights URL.
 * @param {string} url - The Google Flights URL
 * @returns {Promise<{preco: number|null, bloqueado: boolean, motivo?: string}>}
 */
async function scrapeFlightPrice(url) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let browser = null;
        try {
            console.log(`[SCRAPER] Tentativa ${attempt}/${MAX_RETRIES} para: ${url.substring(0, 80)}...`);

            const launchOptions = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process'
                ]
            };

            // Use system Chromium if available (Docker)
            if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
                console.log(`[SCRAPER] Usando Chromium do sistema: ${launchOptions.executablePath}`);
            }

            browser = await chromium.launch(launchOptions);

            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                viewport: { width: 1366, height: 768 },
                locale: 'pt-BR'
            });

            const page = await context.newPage();
            page.setDefaultTimeout(NAVIGATION_TIMEOUT);

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });

            // Wait for dynamic content to load
            await page.waitForTimeout(8000);

            // Check for CAPTCHA/block
            const blockCheck = await detectBlock(page);
            if (blockCheck.bloqueado) {
                console.log(`[SCRAPER] BLOQUEIO DETECTADO — ${blockCheck.motivo} | URL: ${url.substring(0, 60)}`);
                return { preco: null, bloqueado: true, motivo: blockCheck.motivo };
            }

            // Extract prices
            const prices = await extractPrices(page);

            if (prices.length === 0) {
                console.log(`[SCRAPER] Nenhum preço encontrado na tentativa ${attempt}`);
                if (attempt < MAX_RETRIES) {
                    console.log(`[SCRAPER] Aguardando ${RETRY_DELAY_MS}ms antes de tentar novamente...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                    continue;
                }
                return { preco: null, bloqueado: false };
            }

            // Sort and get the lowest price
            prices.sort((a, b) => a.value - b.value);
            const lowest = prices[0];

            console.log(`[SCRAPER] ✓ Preço encontrado: R$ ${lowest.value.toFixed(2)} | Seletor: ${lowest.selector} | Texto: "${lowest.text}"`);

            return { preco: lowest.value, bloqueado: false };

        } catch (error) {
            console.error(`[SCRAPER] Erro na tentativa ${attempt}:`, error.message);
            if (attempt < MAX_RETRIES) {
                console.log(`[SCRAPER] Aguardando ${RETRY_DELAY_MS}ms antes de tentar novamente...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {
                    console.error('[SCRAPER] Erro ao fechar browser:', e.message);
                }
            }
        }
    }

    return { preco: null, bloqueado: false };
}

module.exports = { scrapeFlightPrice };
