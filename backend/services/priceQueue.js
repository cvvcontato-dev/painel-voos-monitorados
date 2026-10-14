const { randomUUID } = require('crypto');
let current = null;
function snapshot() { return current ? { ...current.public } : null; }
function start({ source, load, process }) {
  if (current?.public.running) {
    const error = new Error('Já existe uma atualização de preços em andamento. Aguarde terminar.');
    error.code = 'PRICE_CHECK_BUSY';
    throw error;
  }
  const job = { public: { id: randomUUID(), source, running: true, total: 0, completed: 0, success: 0, failed: 0, skipped: 0, error: null }, results: [] };
  current = job;
  job.done = (async () => {
    try {
      const flights = await load();
      job.public.total = flights.length;
      for (const flight of flights) {
        try {
          const result = await process(flight);
          job.results.push(result);
          if (result.status === 'sucesso') job.public.success++;
          else if (result.status === 'ignorado') job.public.skipped++;
          else job.public.failed++;
        } catch (error) {
          job.public.failed++;
          job.results.push({ id: flight.id, status: 'falha', motivo: 'Erro ao atualizar este voo' });
          console.error(`[PRICE-QUEUE] Voo #${flight.id}:`, error.message);
        }
        job.public.completed++;
      }
    } catch (error) {
      job.public.error = 'Não foi possível carregar os voos para atualização.';
      console.error('[PRICE-QUEUE]', error.message);
    } finally { job.public.running = false; }
    return job.results;
  })();
  return { status: snapshot(), done: job.done };
}
module.exports = { start, snapshot };
