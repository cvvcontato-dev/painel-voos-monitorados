const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DB_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfstore-'));

let mockRenderDelay = 0;
jest.mock('../services/voucherRenderer', () => ({
  renderVoucher: jest.fn(async ({ voucherId }) => {
    if (mockRenderDelay) await new Promise(r => setTimeout(r, mockRenderDelay));
    const f = require('path').join(process.env.DB_PATH, `render-${voucherId}-${Math.random()}.pdf`);
    require('fs').writeFileSync(f, `pdf-${Date.now()}-${Math.random()}`);
    return f;
  })
}));
const { renderVoucher } = require('../services/voucherRenderer');
const store = require('../services/voucherPdfStore');

const dir = () => path.join(process.env.DB_PATH, 'voucher-pdfs');
const files = () => fs.existsSync(dir()) ? fs.readdirSync(dir()).sort() : [];
const args = (over = {}) => ({ voucherId: 7, unifiedJson: '{"a":1}', cookieHeader: 'cvv.sid=x', baseUrl: 'http://localhost:3000', ...over });

beforeEach(() => { renderVoucher.mockClear(); mockRenderDelay = 0; fs.rmSync(dir(), { recursive: true, force: true }); });

test('hashOf: sha256 hex de 12 chars, estável e sensível ao conteúdo', () => {
  expect(store.hashOf('{"a":1}')).toMatch(/^[0-9a-f]{12}$/);
  expect(store.hashOf('{"a":1}')).toBe(store.hashOf('{"a":1}'));
  expect(store.hashOf('{"a":1}')).not.toBe(store.hashOf('{"a":2}'));
});

test('ensure cria voucher-<id>-<hash>.pdf, repassa a sessão ao render e apaga o temporário', async () => {
  const p = await store.ensure(args());
  expect(path.basename(p)).toBe(`voucher-7-${store.hashOf('{"a":1}')}.pdf`);
  expect(fs.existsSync(p)).toBe(true);
  expect(renderVoucher).toHaveBeenCalledWith({ voucherId: 7, format: 'pdf', cookieHeader: 'cvv.sid=x', baseUrl: 'http://localhost:3000' });
  expect(fs.readdirSync(process.env.DB_PATH).filter(f => f.startsWith('render-'))).toEqual([]);
  expect(files()).toHaveLength(1);
});

test('ensure reaproveita o arquivo do hash atual (não renderiza de novo)', async () => {
  const a = await store.ensure(args());
  const b = await store.ensure(args());
  expect(b).toBe(a);
  expect(renderVoucher).toHaveBeenCalledTimes(1);
});

test('conteúdo novo gera outro arquivo e apaga as versões antigas só deste voucher', async () => {
  await store.ensure(args({ voucherId: 8 }));
  await store.ensure(args());
  const novo = await store.ensure(args({ unifiedJson: '{"a":2}' }));
  expect(files().filter(f => f.startsWith('voucher-7-'))).toEqual([path.basename(novo)]);
  expect(files().filter(f => f.startsWith('voucher-8-'))).toHaveLength(1);
  expect(store.exists(7, '{"a":1}')).toBe(false);
  expect(store.exists(7, '{"a":2}')).toBe(true);
});

test('chamadas concorrentes da mesma versão renderizam uma única vez', async () => {
  mockRenderDelay = 40;
  const [a, b, c] = await Promise.all([store.ensure(args()), store.ensure(args()), store.ensure(args())]);
  expect(a).toBe(b); expect(b).toBe(c);
  expect(renderVoucher).toHaveBeenCalledTimes(1);
});

test('falha do render rejeita, não deixa arquivo e permite nova tentativa', async () => {
  renderVoucher.mockRejectedValueOnce(new Error('boom'));
  await expect(store.ensure(args())).rejects.toThrow('boom');
  expect(files()).toEqual([]);
  await expect(store.ensure(args())).resolves.toBeTruthy();
});

test('purge remove todas as versões do voucher e preserva os de outros', async () => {
  await store.ensure(args({ voucherId: 8 }));
  await store.ensure(args());
  fs.writeFileSync(path.join(dir(), 'voucher-7-aaaaaaaaaaaa.pdf'), 'velho');
  expect(store.purge(7)).toBe(2);
  expect(files().filter(f => f.startsWith('voucher-7-'))).toEqual([]);
  expect(files().filter(f => f.startsWith('voucher-8-'))).toHaveLength(1);
  expect(store.purge(7)).toBe(0);
});

test.each(['../x', '7/../8', '0', -1, 1.5, 'abc', null, undefined, '7 '])('id inválido %p é rejeitado (sem path traversal)', async (id) => {
  await expect(store.ensure(args({ voucherId: id }))).rejects.toThrow(/inválido/);
  expect(() => store.filePath(id, '{}')).toThrow(/inválido/);
  expect(store.exists(id, '{}')).toBe(false);
  expect(store.purge(id)).toBe(0);
  expect(renderVoucher).not.toHaveBeenCalled();
});
