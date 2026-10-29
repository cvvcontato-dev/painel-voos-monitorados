const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-fundos-'));
process.env.DB_PATH = tmp;
process.env.BACKUP_KEEP = '2';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'AdminPass123!';
const backup = require('../services/backup');

const SRC = path.join(tmp, 'promo-backgrounds');
const bgBackups = () => fs.readdirSync(backup.BACKUP_DIR).filter(f => backup.BG_RE.test(f)).sort();

beforeAll(async () => { await new Promise(r => setTimeout(r, 700)); });
afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows mantém o banco aberto */ } });
beforeEach(() => {
  fs.rmSync(SRC, { recursive: true, force: true });
  fs.rmSync(backup.BACKUP_DIR, { recursive: true, force: true });
});

test('sem pasta de origem: sucesso com 0 arquivos e sem criar pasta', () => {
  const r = backup.backupBackgrounds('20260101-000000');
  expect(r).toEqual({ ok: true, arquivos: 0, pasta: null });
  expect(fs.existsSync(backup.BACKUP_DIR) ? bgBackups() : []).toEqual([]);
});

test('copia só imagens válidas e preserva o conteúdo', () => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'maceio-aaaaaaaaaa.jpg'), 'JPG');
  fs.writeFileSync(path.join(SRC, 'recife-bbbbbbbbbb.png'), 'PNG');
  fs.writeFileSync(path.join(SRC, '.gitkeep'), '');
  fs.writeFileSync(path.join(SRC, 'notas.txt'), 'x');
  const r = backup.backupBackgrounds('20260101-000000');
  expect(r.ok).toBe(true); expect(r.arquivos).toBe(2);
  const dir = path.join(backup.BACKUP_DIR, 'fundos-20260101-000000');
  expect(fs.readdirSync(dir).sort()).toEqual(['maceio-aaaaaaaaaa.jpg', 'recife-bbbbbbbbbb.png']);
  expect(fs.readFileSync(path.join(dir, 'maceio-aaaaaaaaaa.jpg'), 'utf8')).toBe('JPG');
});

test('apagar a foto original depois não afeta a cópia do backup', () => {
  fs.mkdirSync(SRC, { recursive: true });
  const f = path.join(SRC, 'natal-cccccccccc.webp');
  fs.writeFileSync(f, 'WEBP');
  backup.backupBackgrounds('20260101-000000');
  fs.unlinkSync(f);
  expect(fs.readFileSync(path.join(backup.BACKUP_DIR, 'fundos-20260101-000000', 'natal-cccccccccc.webp'), 'utf8')).toBe('WEBP');
});

test('runBackup inclui as fotos e listBackups informa quantas', async () => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'salvador-dddddddddd.jpg'), 'J');
  const r = await backup.runBackup();
  expect(r.ok).toBe(true);
  expect(r.fotos).toMatchObject({ ok: true, arquivos: 1 });
  expect(backup.listBackups()[0].fotos).toBe(1);
});

test('falha ao copiar as fotos não derruba o backup do banco', async () => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'x-eeeeeeeeee.jpg'), 'J');
  const l = jest.spyOn(fs, 'linkSync').mockImplementation(() => { const e = new Error('sem link'); e.code = 'EXDEV'; throw e; });
  const c = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => { throw new Error('disco cheio'); });
  try {
    const r = await backup.runBackup();
    expect(r.ok).toBe(true);                    // o banco foi salvo
    expect(r.fotos.ok).toBe(false);             // só as fotos falharam
    expect(r.fotos.erro).toMatch(/disco cheio/);
  } finally { l.mockRestore(); c.mockRestore(); }
});

test('fallback: hard link falha com EXDEV e a cópia funciona', () => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'bh-1111111111.jpg'), 'BH');
  const l = jest.spyOn(fs, 'linkSync').mockImplementation(() => { const e = new Error('x'); e.code = 'EXDEV'; throw e; });
  try {
    const r = backup.backupBackgrounds('20260101-000000');
    expect(r).toMatchObject({ ok: true, arquivos: 1 });
    expect(fs.readFileSync(path.join(backup.BACKUP_DIR, 'fundos-20260101-000000', 'bh-1111111111.jpg'), 'utf8')).toBe('BH');
  } finally { l.mockRestore(); }
});

test('foto removida durante a cópia (ENOENT) é pulada e as demais seguem', () => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'a-2222222222.jpg'), 'A');
  fs.writeFileSync(path.join(SRC, 'b-3333333333.jpg'), 'B');
  const orig = fs.linkSync;
  const l = jest.spyOn(fs, 'linkSync').mockImplementation((o, d) => {
    if (o.includes('a-2222222222')) { const e = new Error('sumiu'); e.code = 'ENOENT'; throw e; }
    return orig(o, d);
  });
  try {
    const r = backup.backupBackgrounds('20260101-000000');
    expect(r).toMatchObject({ ok: true, arquivos: 1 });
    expect(fs.readdirSync(path.join(backup.BACKUP_DIR, 'fundos-20260101-000000'))).toEqual(['b-3333333333.jpg']);
  } finally { l.mockRestore(); }
});

test('falha no meio não deixa pasta parcial nem .tmp', () => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'a-4444444444.jpg'), 'A');
  fs.writeFileSync(path.join(SRC, 'b-5555555555.jpg'), 'B');
  const orig = fs.linkSync; let n = 0;
  const l = jest.spyOn(fs, 'linkSync').mockImplementation((o, d) => {
    if (++n === 2) throw new Error('falha de E/S');
    return orig(o, d);
  });
  try {
    const r = backup.backupBackgrounds('20260101-000000');
    expect(r.ok).toBe(false);
    expect(fs.readdirSync(backup.BACKUP_DIR)).toEqual([]);
  } finally { l.mockRestore(); }
});

test('varre .tmp órfão e listBackups conta só imagens válidas', () => {
  fs.mkdirSync(backup.BACKUP_DIR, { recursive: true });
  fs.mkdirSync(path.join(backup.BACKUP_DIR, 'fundos-20250101-000000.tmp'));
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'z-7777777777.jpg'), 'Z');
  backup.backupBackgrounds('20260101-000000');
  expect(fs.existsSync(path.join(backup.BACKUP_DIR, 'fundos-20250101-000000.tmp'))).toBe(false);
  fs.writeFileSync(path.join(backup.BACKUP_DIR, 'database-20260202-000000.sqlite'), 'db');
  const pasta = path.join(backup.BACKUP_DIR, 'fundos-20260202-000000');
  fs.mkdirSync(pasta);
  fs.writeFileSync(path.join(pasta, 'ok-6666666666.jpg'), 'J');
  fs.writeFileSync(path.join(pasta, 'lixo.txt'), 'x');
  expect(backup.listBackups()[0].fotos).toBe(1);
});

test('rotação apaga as pastas de fotos cujo .sqlite foi removido', () => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'a-ffffffffff.jpg'), 'J');
  fs.mkdirSync(backup.BACKUP_DIR, { recursive: true });
  ['20260101-000001', '20260101-000002', '20260101-000003'].forEach((s, i) => {
    const f = path.join(backup.BACKUP_DIR, `database-${s}.sqlite`);
    fs.writeFileSync(f, 'db');
    const t = new Date(2026, 0, 1, 0, 0, i + 1);
    fs.utimesSync(f, t, t);
    backup.backupBackgrounds(s);
  });
  backup.rotate();
  expect(fs.readdirSync(backup.BACKUP_DIR).filter(f => backup.BG_RE.test(f)).sort())
    .toEqual(['fundos-20260101-000002', 'fundos-20260101-000003']);
});

test('pasta que não casa BG_RE nunca é apagada pela rotação', () => {
  const lixo = path.join(backup.BACKUP_DIR, 'fundos-lixo');
  fs.mkdirSync(lixo, { recursive: true });
  backup.rotate();
  expect(fs.existsSync(lixo)).toBe(true);
});

test('se listBackups retornar vazio, rotateBackgrounds não apaga pastas de fundos existentes', () => {
  fs.mkdirSync(backup.BACKUP_DIR, { recursive: true });
  const pastaFundo = path.join(backup.BACKUP_DIR, 'fundos-20260101-000001');
  fs.mkdirSync(pastaFundo, { recursive: true });
  fs.writeFileSync(path.join(pastaFundo, 'foto-1111111111.jpg'), 'FOTO');

  // Sem nenhum .sqlite (ou lista de conhecidos vazia)
  backup.rotateBackgrounds([]);
  expect(fs.existsSync(pastaFundo)).toBe(true);

  // Também via rotate direto quando listBackups for mockado para retornar vazio
  const listSpy = jest.spyOn(backup, 'listBackups').mockReturnValue([]);
  try {
    backup.rotate();
    expect(fs.existsSync(pastaFundo)).toBe(true);
  } finally {
    listSpy.mockRestore();
  }
});

test('falha de statSync em um arquivo não descarta os demais arquivos em listBackups', () => {
  fs.mkdirSync(backup.BACKUP_DIR, { recursive: true });
  const f1 = path.join(backup.BACKUP_DIR, 'database-20260101-000001.sqlite');
  const f2 = path.join(backup.BACKUP_DIR, 'database-20260101-000002.sqlite');
  fs.writeFileSync(f1, 'db1');
  fs.writeFileSync(f2, 'db2');

  const realStat = fs.statSync;
  const statSpy = jest.spyOn(fs, 'statSync').mockImplementation((p, ...args) => {
    if (String(p).includes('database-20260101-000001.sqlite')) {
      throw new Error('EACCES simulado');
    }
    return realStat(p, ...args);
  });

  try {
    const list = backup.listBackups();
    expect(list.some(b => b.arquivo === 'database-20260101-000002.sqlite')).toBe(true);
  } finally {
    statSpy.mockRestore();
  }
});
