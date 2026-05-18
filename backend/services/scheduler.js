const cron = require('node-cron');
const db = require('../database');
const { scrapeFlightPrice } = require('./flightScraper');
const { sendTelegram, sendEmail } = require('./notifier');
const { checkDueFlights } = require('./statusMonitor');

let currentJob = null;

/**
 * Process a single flight: scrape price, update DB, send alerts if needed.
 */
async function processFlight(flight) {
    const result = await scrapeFlightPrice(flight.link_voo);

    // Blocked by captcha
    if (result.bloqueado) {
        console.log(`[SCHEDULER] Voo #${flight.id} bloqueado por captcha. Pulando.`);
        return { id: flight.id, status: 'bloqueado' };
    }

    // Scraping failed
    if (result.preco === null) {
        console.log(`[SCHEDULER] Voo #${flight.id} — falha no scraping. Preço não obtido.`);
        return { id: flight.id, status: 'falha' };
    }

    const preco = result.preco;

    // Persist UPDATE then INSERT sequentially. No explicit BEGIN/COMMIT here:
    // processBatch runs multiple processFlight concurrently, and SQLite cannot
    // nest BEGIN on the same connection — that previously crashed the process
    // with "cannot start a transaction within a transaction".
    await new Promise((resolve, reject) => {
        db.run(
            `UPDATE flights SET preco_atual = ?, ultima_verificacao = datetime('now') WHERE id = ?`,
            [preco, flight.id],
            function(err) {
                if (err) {
                    console.error(`[SCHEDULER] Erro ao atualizar voo #${flight.id}:`, err.message);
                    return reject(err);
                }
                resolve();
            }
        );
    });

    await new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO flight_price_history (flight_id, preco) VALUES (?, ?)`,
            [flight.id, preco],
            function(err) {
                if (err) {
                    console.error(`[SCHEDULER] Erro ao inserir histórico do voo #${flight.id}:`, err.message);
                    return reject(err);
                }
                resolve();
            }
        );
    });

    let alertaDisparado = false;
    const threshold = parseFloat(process.env.ALERT_RESET_THRESHOLD || '1.10');

    // Check alert condition: price at or below target
    if (preco <= flight.preco_esperado && !flight.alerta_enviado) {
        const updatedFlight = { ...flight, preco_atual: preco };

        if (flight.telegram_chat_id) {
            const tgResult = await sendTelegram(flight.telegram_chat_id, updatedFlight);
            console.log(`[SCHEDULER] Telegram voo #${flight.id}: ${tgResult.sucesso ? 'sucesso' : 'falha — ' + tgResult.erro}`);
        }

        if (flight.email_cliente) {
            const emailResult = await sendEmail(flight.email_cliente, updatedFlight);
            console.log(`[SCHEDULER] Email voo #${flight.id}: ${emailResult.sucesso ? 'sucesso' : 'falha — ' + emailResult.erro}`);
        }

        db.run('UPDATE flights SET alerta_enviado = 1 WHERE id = ?', [flight.id]);
        alertaDisparado = true;
    }

    // Reset alert if price rises above threshold
    if (preco > flight.preco_esperado * threshold && flight.alerta_enviado) {
        db.run('UPDATE flights SET alerta_enviado = 0 WHERE id = ?', [flight.id]);
        console.log(`[SCHEDULER] Voo #${flight.id} — preço subiu, alerta resetado.`);
    }

    console.log(`[SCHEDULER] Voo #${flight.id} (${flight.cliente}) | Atual: R$ ${preco.toFixed(2)} | Alvo: R$ ${flight.preco_esperado.toFixed(2)} | Alerta: ${alertaDisparado ? 'sim' : 'não'}`);

    return { id: flight.id, status: 'sucesso', preco, alertaDisparado };
}

/**
 * Process flights in batches of concurrent scrapers.
 */
async function processBatch(flights, concurrency) {
    const results = [];
    for (let i = 0; i < flights.length; i += concurrency) {
        const batch = flights.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
            batch.map(flight => processFlight(flight))
        );
        results.push(...batchResults);
    }
    return results;
}

/**
 * Run a full check cycle on all active flights.
 */
async function runCheckCycle() {
    const startTime = new Date();
    console.log(`\n[SCHEDULER] ═══════════════════════════════════════════`);
    console.log(`[SCHEDULER] Ciclo iniciado em ${startTime.toISOString()}`);

    const flights = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM flights WHERE status = 'ativo'", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });

    if (flights.length === 0) {
        console.log('[SCHEDULER] Nenhum voo ativo para verificar.');
        return;
    }

    console.log(`[SCHEDULER] ${flights.length} voo(s) ativo(s) para verificar.`);

    const concurrency = parseInt(process.env.MAX_CONCURRENT_SCRAPERS || '3', 10);
    await processBatch(flights, concurrency);

    const endTime = new Date();
    const durationMs = endTime - startTime;
    console.log(`[SCHEDULER] Ciclo finalizado em ${endTime.toISOString()} (${(durationMs / 1000).toFixed(1)}s)`);
    console.log(`[SCHEDULER] Total de voos processados: ${flights.length}`);
    console.log(`[SCHEDULER] ═══════════════════════════════════════════\n`);
}

/**
 * Start the scheduler with the configured interval.
 */
function startScheduler() {
    // Stop any existing job
    if (currentJob) {
        currentJob.stop();
        currentJob = null;
    }

    const hours = parseInt(process.env.CHECK_INTERVAL_HOURS || '6', 10);
    const cronExpression = `0 */${hours} * * *`;

    console.log(`[SCHEDULER] Agendador iniciado: a cada ${hours}h (cron: ${cronExpression})`);

    currentJob = cron.schedule(cronExpression, async () => {
        try {
            await runCheckCycle();
        } catch (error) {
            console.error('[SCHEDULER] Erro fatal no ciclo:', error);
        }
    });

    return currentJob;
}

let statusCronJob = null;
function startStatusScheduler() {
  if (statusCronJob) { statusCronJob.stop(); statusCronJob = null; }
  console.log('[STATUS-MON] Cron iniciado: */5 * * * *');
  statusCronJob = cron.schedule('*/5 * * * *', async () => {
    try {
      const results = await checkDueFlights();
      if (results.length > 0) {
        console.log(`[STATUS-MON] Processados ${results.length} voo(s).`);
      }
    } catch (err) {
      console.error('[STATUS-MON] Erro fatal:', err);
    }
  });
  return statusCronJob;
}

module.exports = { startScheduler, runCheckCycle, processFlight, startStatusScheduler };
