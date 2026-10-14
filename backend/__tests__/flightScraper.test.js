jest.mock('playwright', () => ({ chromium: { launch: jest.fn() } }));
const { chromium } = require('playwright');
const { scrapeFlightPrice } = require('../services/flightScraper');
beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
test('queda na inicialização preserva o motivo após duas tentativas', async () => {
  chromium.launch.mockRejectedValue(new Error('Browser closed'));
  const pending = scrapeFlightPrice('https://www.google.com/travel/flights');
  await jest.runAllTimersAsync();
  expect(await pending).toEqual({preco:null, bloqueado:false, motivo:'Falha ao iniciar o Chromium no servidor'});
  expect(chromium.launch).toHaveBeenCalledTimes(2);
  expect(chromium.launch.mock.calls[0][0].args).not.toContain('--single-process');
});
test('erro de navegação preserva etapa e fecha navegadores', async () => {
  const page = {setDefaultTimeout:jest.fn(), goto:jest.fn().mockRejectedValue(new Error('Timeout'))};
  const browser = {newContext:jest.fn().mockResolvedValue({newPage:jest.fn().mockResolvedValue(page)}), close:jest.fn()};
  chromium.launch.mockResolvedValue(browser);
  const pending = scrapeFlightPrice('https://www.google.com/travel/flights');
  await jest.runAllTimersAsync();
  expect((await pending).motivo).toBe('Falha ao abrir a página do Google Voos');
  expect(browser.close).toHaveBeenCalledTimes(2);
});
test('sucesso retorna menor preço com timeout de 30 segundos', async () => {
  const page = {setDefaultTimeout:jest.fn(), goto:jest.fn(), waitForFunction:jest.fn(), waitForTimeout:jest.fn(), title:jest.fn().mockResolvedValue('Google Voos'), url:jest.fn().mockReturnValue('https://www.google.com/travel/flights'), $:jest.fn().mockResolvedValue(null), $$:jest.fn().mockResolvedValue([]), evaluate:jest.fn().mockResolvedValue([{value:1200,selector:'flight-row',text:'R$ 1.200'}, {value:1100,selector:'flight-row',text:'R$ 1.100'}])};
  const browser = {newContext:jest.fn().mockResolvedValue({newPage:jest.fn().mockResolvedValue(page)}),close:jest.fn()};
  chromium.launch.mockResolvedValue(browser);
  expect(await scrapeFlightPrice('https://www.google.com/travel/flights')).toEqual({preco:1100,bloqueado:false});
  expect(page.waitForFunction).toHaveBeenCalledWith(expect.any(Function), undefined, {timeout:30000});
  expect(browser.close).toHaveBeenCalledTimes(1);
});
