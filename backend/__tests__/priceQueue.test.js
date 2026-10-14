let queue;
beforeEach(() => { jest.resetModules(); queue = require('../services/priceQueue'); });
function deferred() { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise, resolve}; }
test('reserva antes de carregar, impedindo sobreposição manual e agendada', async () => {
  const pending = deferred();
  const first = queue.start({source:'manual',load:()=>pending.promise,process:jest.fn()});
  expect(queue.snapshot().running).toBe(true);
  expect(() => queue.start({source:'agendado',load:async()=>[],process:jest.fn()})).toThrow('Já existe');
  pending.resolve([]); await first.done;
  expect(queue.snapshot().running).toBe(false);
  await queue.start({source:'agendado',load:async()=>[],process:jest.fn()}).done;
});
test('processa um por vez, continua após exceção e informa resultados', async () => {
  const pending=deferred(); const seen=[];
  const process=jest.fn(async f => {seen.push(f.id); if(f.id===1){await pending.promise;return {status:'sucesso'}} if(f.id===2)throw Error('falha simulada');return {status:'ignorado'};});
  const log=jest.spyOn(console,'error').mockImplementation(()=>{});
  const job=queue.start({source:'manual',load:async()=>[{id:1},{id:2},{id:3}],process});
  await Promise.resolve(); expect(seen).toEqual([1]);
  expect(() => queue.start({source:'individual',load:async()=>[],process})).toThrow();
  pending.resolve();await job.done;
  expect(seen).toEqual([1,2,3]);
  expect(queue.snapshot()).toMatchObject({running:false,total:3,completed:3,success:1,failed:1,skipped:1});
  log.mockRestore();
});
test('libera fila se carregar voos falhar', async()=>{
  const log=jest.spyOn(console,'error').mockImplementation(()=>{});
  await queue.start({source:'manual',load:async()=>{throw Error('db')},process:jest.fn()}).done;
  expect(queue.snapshot()).toMatchObject({running:false,total:0,error:expect.any(String)});
  await queue.start({source:'manual',load:async()=>[],process:jest.fn()}).done;
  expect(queue.snapshot().error).toBeNull();log.mockRestore();
});
