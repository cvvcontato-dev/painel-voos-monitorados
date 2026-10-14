const cron = require('node-cron');
const db = require('../database');
const { scrapeFlightPrice } = require('./flightScraper');
const { sendTelegram, sendEmail } = require('./notifier');
const { checkDueFlights } = require('./statusMonitor');

const priceQueue = require('./priceQueue');
let currentJob = null;

/**
 * Process a single flight: scrape price, update DB, send alerts if needed.
 */
/**
 * Registra uma falha de verificação no próprio voo, para a interface conseguir
 * mostrar que aquele preço parou de ser atualizado (antes isso só ia para o log).
 */
function registrarFalha(flightId, motivo) {
    return new Promise((resolve) => {
        db.run(
            `UPDATE flights
                SET falhas_consecutivas = COALESCE(falhas_consecutivas, 0) + 1,
                    ultima_falha = datetime('now'),
                    ultimo_erro = ?
              WHERE id = ?`,
            [motivo, flightId],
            (err) => {
                if (err) console.error(`[SCHEDULER] Não consegui registrar a falha do voo #${flightId}:`, err.message);
                resolve();
            }
        );
    });
}

async function updateFlight(flight) {
    const result = await scrapeFlightPrice(flight.link_voo);

    // Blocked by captcha
    if (result.bloqueado) {
        console.log(`[SCHEDULER] Voo #${flight.id} bloqueado por captcha. Pulando.`);
        await registrarFalha(flight.id, result.motivo
            ? `Bloqueado pelo Google: ${result.motivo}`
            : 'Bloqueado pelo Google (captcha/anti-bot)');
        return { id: flight.id, status: 'bloqueado' };
    }

    // Scraping failed
    if (result.preco === null) {
        console.log(`[SCHEDULER] Voo #${flight.id} — falha no scraping. Preço não obtido.`);
        const motivo = result.motivo || 'Preço não encontrado na página do Google Voos';
        await registrarFalha(flight.id, motivo);
        return { id: flight.id, status: 'falha', motivo };
    }

    const preco = result.preco;

    // Persiste preço e histórico em sequência na conexão SQLite compartilhada.
    await new Promise((resolve, reject) => {
        db.run(
            `UPDATE flights
                SET preco_atual = ?,
                    ultima_verificacao = datetime('now'),
                    falhas_consecutivas = 0,
                    ultima_falha = NULL,
                    ultimo_erro = NULL
              WHERE id = ?`,
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

// Uma única fila compartilhada por atualização individual, em lote e cron.
function activeFlights() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM flights WHERE status = 'ativo' ORDER BY posicao ASC, id ASC", [],
            (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}
async function refreshQueuedFlight(flight) {
    const fresh = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM flights WHERE id = ?', [flight.id],
            (err, row) => err ? reject(err) : resolve(row));
    });
    if (!fresh || fresh.status !== 'ativo') return { id: flight.id, status: 'ignorado' };
    return updateFlight(fresh);
}
function startPriceCheck(source = 'manual') {
    return priceQueue.start({ source, load: activeFlights, process: refreshQueuedFlight });
}
async function processFlight(flight) {
    const job = priceQueue.start({ source: 'individual', load: async () => [flight], process: refreshQueuedFlight });
    const results = await job.done;
    return results[0];
}
async function runCheckCycle() {
    try {
        const job = startPriceCheck('agendado');
        console.log('[SCHEDULER] Atualização de preços iniciada em fila.');
        await job.done;
        console.log('[SCHEDULER] Atualização de preços finalizada:', priceQueue.snapshot());
    } catch (error) {
        if (error.code !== 'PRICE_CHECK_BUSY') throw error;
        console.log('[SCHEDULER] Atualização já em andamento; ciclo sobreposto ignorado.');
    }
}

/**
 * Start the scheduler — runs price checks at 08:00 and 20:00 Brasília time
 * (America/Sao_Paulo). node-cron handles DST automatically via the timezone
 * option, so the times stay locked to local clock regardless of where the
 * container runs (Coolify hosts default to UTC).
 */
function startScheduler() {
    if (currentJob) {
        currentJob.stop();
        currentJob = null;
    }

    const cronExpression = '0 8,20 * * *';
    const timezone = 'America/Sao_Paulo';

    console.log(`[SCHEDULER] Agendador iniciado: 08:00 e 20:00 (${timezone}) — cron: ${cronExpression}`);

    currentJob = cron.schedule(cronExpression, async () => {
        try {
            await runCheckCycle();
        } catch (error) {
            console.error('[SCHEDULER] Erro fatal no ciclo:', error);
        }
    }, { timezone });

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

module.exports = { startScheduler, runCheckCycle, processFlight, startStatusScheduler, startPriceCheck, getPriceCheckStatus: priceQueue.snapshot };
