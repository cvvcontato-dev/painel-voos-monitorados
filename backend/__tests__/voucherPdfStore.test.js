const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DB_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfstore-'));

// "Banco" falso: id -> unified_json corrente (ausente = voucher removido).
const mockDbRows = new Map();
jest.mock('../database', () => ({
  get: (sql, params, cb) => {
    const id = Number(params[0]);
    setImmediate(() => cb(null, mockDbRows.has(id) ? { unified_json: mockDbRows.get(id) } : undefined));
  }
}));

let mockRenderDelay = 0;
let mockRenderHook = null;
let mockActive = 0;
let mockMaxActive = 0;
jest.mock('../services/voucherRenderer', () => ({
  renderVoucher: jest.fn(async ({ voucherId }) => {
    mockActive++; mockMaxActive = Math.max(mockMaxActive, mockActive);
    try {
      if (mockRenderDelay) await new Promise(r => setTimeout(r, mockRenderDelay));
      if (mockRenderHook) await mockRenderHook(voucherId);
      const f = require('path').join(process.env.DB_PATH, `render-${voucherId}-${Math.random()}.pdf`);
      require('fs').writeFileSync(f, `pdf-${Date.now()}-${Math.random()}`);
      return f;
    } finally { mockActive--; }
  })
}));
const { renderVoucher } = require('../services/voucherRenderer');
const store = require('../services/voucherPdfStore');

const dir = () => path.join(process.env.DB_PATH, 'voucher-pdfs');
const files = () => fs.existsSync(dir()) ? fs.readdirSync(dir()).sort() : [];
// Cada chamada registra o conteúdo "no banco" (o render real lê dele).
const args = (over = {}) => {
  const a = { voucherId: 7, unifiedJson: '{"a":1}', cookieHeader: 'cvv.sid=x', baseUrl: 'http://localhost:3000', ...over };
  if (Number.isSafeInteger(Number(a.voucherId)) && Number(a.voucherId) > 0) mockDbRows.set(Number(a.voucherId), a.unifiedJson);
  return a;
};
const old = (f, ms) => { const t = new Date(Date.now() - ms); fs.utimesSync(path.join(dir(), f), t, t); };
const DAY = 86400000;

beforeEach(() => {
  renderVoucher.mockClear(); mockRenderDelay = 0; mockRenderHook = null; mockMaxActive = 0; mockDbRows.clear();
  fs.rmSync(dir(), { recursive: true, force: true });
  fs.readdirSync(process.env.DB_PATH).filter(f => f.startsWith('render-')).forEach(f => fs.unlinkSync(path.join(process.env.DB_PATH, f)));
});

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

test('fila global: renders de vouchers diferentes rodam um por vez, em ordem (FIFO)', async () => {
  mockRenderDelay = 30;
  const ordem = [];
  await Promise.all([1, 2, 3, 4].map(id => store.ensure(args({ voucherId: id })).then(() => ordem.push(id))));
  expect(mockMaxActive).toBe(1);
  expect(ordem).toEqual([1, 2, 3, 4]);
  expect(renderVoucher.mock.calls.map(c => c[0].voucherId)).toEqual([1, 2, 3, 4]);
});

test('falha de um render não trava a fila: o seguinte roda', async () => {
  renderVoucher.mockRejectedValueOnce(new Error('boom'));
  const [r1, r2] = await Promise.allSettled([store.ensure(args({ voucherId: 1 })), store.ensure(args({ voucherId: 2 }))]);
  expect(r1.status).toBe('rejected');
  expect(r1.reason.message).toBe('boom');
  expect(r2.status).toBe('fulfilled');
  expect(files()).toEqual([expect.stringMatching(/^voucher-2-/)]);
  await expect(store.ensure(args({ voucherId: 1 }))).resolves.toBeTruthy();   // e a mesma chave pode ser tentada de novo
});

test('versões em sequência rápida (A depois B): sobra só o arquivo do hash corrente do banco', async () => {
  mockRenderDelay = 20;
  const pA = store.ensure(args({ unifiedJson: '{"v":"A"}' }));
  const pB = store.ensure(args({ unifiedJson: '{"v":"B"}' }));   // o banco agora tem B
  await Promise.all([pA, pB]);
  expect(files()).toEqual([`voucher-7-${store.hashOf('{"v":"B"}')}.pdf`]);
});

test('A termina de renderizar depois que o banco já virou B: nunca apaga o corrente nem deixa A', async () => {
  mockRenderHook = async () => { mockDbRows.set(7, '{"v":"B"}'); };
  const pA = store.ensure(args({ unifiedJson: '{"v":"A"}' }));
  mockDbRows.set(7, '{"v":"A"}');
  await pA;
  expect(files()).toEqual([`voucher-7-${store.hashOf('{"v":"B"}')}.pdf`]);
});

test('voucher removido durante o render: rejeita e não sobra nenhum arquivo (nem .tmp)', async () => {
  mockRenderHook = async () => { mockDbRows.delete(7); };
  await expect(store.ensure(args())).rejects.toThrow(/removido/);
  expect(files()).toEqual([]);
  expect(fs.readdirSync(process.env.DB_PATH).filter(f => f.startsWith('render-'))).toEqual([]);
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

describe('sweep', () => {
  const put = (name) => { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(path.join(dir(), name), 'x'); return name; };

  test('apaga PDF de voucher que não existe mais; preserva o de voucher existente e recente', async () => {
    mockDbRows.set(1, '{}');
    put('voucher-1-aaaaaaaaaaaa.pdf'); put('voucher-2-bbbbbbbbbbbb.pdf');
    expect(await store.sweep()).toEqual({ removed: 1 });
    expect(files()).toEqual(['voucher-1-aaaaaaaaaaaa.pdf']);
  });

  test('apaga PDF acima do prazo mesmo com voucher existente; respeita maxAgeDays e o padrão de 90 dias', async () => {
    mockDbRows.set(1, '{}'); mockDbRows.set(2, '{}'); mockDbRows.set(3, '{}');
    put('voucher-1-aaaaaaaaaaaa.pdf'); old('voucher-1-aaaaaaaaaaaa.pdf', 91 * DAY);
    put('voucher-2-bbbbbbbbbbbb.pdf'); old('voucher-2-bbbbbbbbbbbb.pdf', 60 * DAY);
    put('voucher-3-cccccccccccc.pdf'); old('voucher-3-cccccccccccc.pdf', 10 * DAY);
    await store.sweep();
    expect(files()).toEqual(['voucher-2-bbbbbbbbbbbb.pdf', 'voucher-3-cccccccccccc.pdf']);
    await store.sweep({ maxAgeDays: 30 });
    expect(files()).toEqual(['voucher-3-cccccccccccc.pdf']);
  });

  test('VOUCHER_PDF_RETENTION_DAYS define o prazo padrão', async () => {
    mockDbRows.set(1, '{}');
    put('voucher-1-aaaaaaaaaaaa.pdf'); old('voucher-1-aaaaaaaaaaaa.pdf', 20 * DAY);
    process.env.VOUCHER_PDF_RETENTION_DAYS = '15';
    try { await store.sweep(); } finally { delete process.env.VOUCHER_PDF_RETENTION_DAYS; }
    expect(files()).toEqual([]);
  });

  test('.tmp com mais de 1 hora é apagado; .tmp recente é preservado', async () => {
    mockDbRows.set(1, '{}');
    const velho = put('voucher-1-aaaaaaaaaaaa.pdf.123.1700000000000.tmp'); old(velho, 2 * 3600000);
    put('voucher-1-aaaaaaaaaaaa.pdf.123.1700000000001.tmp');
    await store.sweep();
    expect(files()).toEqual(['voucher-1-aaaaaaaaaaaa.pdf.123.1700000000001.tmp']);
  });

  test('não mexe em arquivos que não seguem o padrão', async () => {
    put('leiame.txt'); old('leiame.txt', 400 * DAY);
    await store.sweep();
    expect(files()).toEqual(['leiame.txt']);
  });
});
