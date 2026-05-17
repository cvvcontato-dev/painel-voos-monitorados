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
 * Dismiss suggestion popups (e.g. "Viaje em X por R$ Y") and other overlays
 * that contain prices from different dates.
 */
async function dismissSuggestions(page) {
    try {
        // Close any "suggested dates" popup — look for close/dismiss buttons
        const closeButtons = await page.$$('button[aria-label="Fechar"], button[aria-label="Close"], button[aria-label="Dispensar"]');
        for (const btn of closeButtons) {
            try { await btn.click({ timeout: 1000 }); } catch (e) { /* ignore */ }
        }

        // Also try to click X buttons inside suggestion banners
        const xButtons = await page.$$('[role="dialog"] button, [class*="suggestion"] button, [class*="banner"] button');
        for (const btn of xButtons) {
            try {
                const text = await btn.textContent();
                if (text && text.trim().length <= 3) { // small buttons like "X" or "✕"
                    await btn.click({ timeout: 1000 });
                }
            } catch (e) { /* ignore */ }
        }

        await page.waitForTimeout(500);
    } catch (e) {
        console.log('[SCRAPER] Aviso ao fechar sugestões:', e.message);
    }
}

/**
 * Extract flight prices ONLY from actual flight result rows.
 * Ignores suggestion popups, calendar views, and promotional banners.
 */
async function extractPrices(page) {
    return await page.evaluate(() => {
        const prices = [];
        const seen = new Set();

        // Strategy 1: Target flight result list items specifically
        // Google Flights uses list items (li) inside an ordered/unordered list for results
        const flightRows = document.querySelectorAll(
            'li[class*="pIav2d"], ' +       // flight result item
            'div[class*="yR1fYc"], ' +       // result row container
            'div[class*="Rk10dc"], ' +       // result container
            '[data-ved] li, ' +              // results with tracking
            'ul[class*="Rk10dc"] > li, ' +   // list of flight results
            'ol > li'                         // ordered list items
        );

        // Function to extract R$ value from text
        function parsePrice(text) {
            const match = text.match(/R\$\s*([\d.,]+)/);
            if (!match) return null;
            let numStr = match[1].replace(/\./g, '').replace(',', '.');
            const num = parseFloat(numStr);
            if (isNaN(num) || num < 100 || num > 50000) return null;
            return num;
        }

        // If we found flight row containers, extract prices ONLY from those
        if (flightRows.length > 0) {
            for (const row of flightRows) {
                // Skip if this row is inside a suggestion/promotion area
                const parent = row.closest('[class*="suggestion"], [class*="banner"], [role="dialog"], [class*="calendar"]');
                if (parent) continue;

                // Check if this row contains flight-like content (airline, time, duration)
                const rowText = row.textContent || '';
                const hasFlightIndicators = (
                    /\d{1,2}:\d{2}/.test(rowText) ||          // has time like 06:05
                    /sem escala|escala/i.test(rowText) ||      // has "sem escalas"
                    /\d+h\s*\d*\s*min/i.test(rowText) ||      // has duration like "1h 40 min"
                    /ida e volta/i.test(rowText)               // has "ida e volta"
                );

                if (!hasFlightIndicators) continue;

                // Extract price from this specific row
                const priceEls = row.querySelectorAll('span, div');
                for (const el of priceEls) {
                    const text = el.textContent.trim();
                    // Skip if this element contains suggestion text
                    if (/viaje em|alterar data|sugest|qualquer data/i.test(text)) continue;
                    // Skip very long text blocks (not a price element)
                    if (text.length > 30) continue;

                    const price = parsePrice(text);
                    if (price && !seen.has(price)) {
                        seen.add(price);
                        prices.push({
                            value: price,
                            selector: 'flight-row',
                            text: text.substring(0, 60)
                        });
                    }
                }
            }
        }

        // Strategy 2: If Strategy 1 found nothing, fall back to targeted selectors
        // but EXCLUDE suggestion/promotion areas
        if (prices.length === 0) {
            const excludeSelectors = [
                '[class*="suggestion"]',
                '[class*="banner"]',
                '[class*="calendar"]',
                '[role="dialog"]',
                '[class*="promo"]'
            ].join(', ');

            const allSpans = document.querySelectorAll('span');
            for (const el of allSpans) {
                // Skip elements inside suggestion/promotion areas
                if (el.closest(excludeSelectors)) continue;

                const text = el.textContent.trim();
                // Skip if contains suggestion keywords
                if (/viaje em|alterar data|sugest|qualquer data|monitorar preço/i.test(text)) continue;
                if (text.length > 30) continue;

                const price = parsePrice(text);
                if (price && !seen.has(price)) {
                    // Check if this price is near flight-related content
                    const parentRow = el.closest('li, tr, [role="listitem"]');
                    if (parentRow) {
                        const rowText = parentRow.textContent || '';
                        if (/viaje em|alterar data|sugest/i.test(rowText)) continue;
                    }

                    seen.add(price);
                    prices.push({
                        value: price,
                        selector: 'fallback-span',
                        text: text.substring(0, 60)
                    });
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

            // Dismiss any suggestion popups before extracting prices
            await dismissSuggestions(page);

            // Extract prices from actual flight results only
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

            console.log(`[SCRAPER] ✓ Preço encontrado: R$ ${lowest.value.toFixed(2)} | Via: ${lowest.selector} | Texto: "${lowest.text}"`);
            console.log(`[SCRAPER]   Todos os preços: ${prices.map(p => `R$ ${p.value}`).join(', ')}`);

            return { preco: lowest.value, bloqueado: false };

        } catch (error) {
            console.error(`[SCRAPER] Erro na tentativa ${attempt}:`, error.message);
            if (attempt < MAX_RETRIES) {
                console.log(`[SCRAPER] Aguardando ${RETRY_DELAY_MS}ms antes de tentar novamente...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
        } finally {
            if (browser) {
                try { await browser.close(); } catch (e) { /* ignore */ }
            }
        }
    }

    return { preco: null, bloqueado: false };
}

module.exports = { scrapeFlightPrice };
