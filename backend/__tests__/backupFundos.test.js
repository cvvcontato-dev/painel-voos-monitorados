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
  const origCopy = fs.copyFileSync; const origLink = fs.linkSync;
  fs.linkSync = () => { throw new Error('sem link'); };
  fs.copyFileSync = () => { throw new Error('disco cheio'); };
  try {
    const r = await backup.runBackup();
    expect(r.ok).toBe(true);                    // o banco foi salvo
    expect(r.fotos.ok).toBe(false);             // só as fotos falharam
    expect(r.fotos.erro).toMatch(/disco cheio/);
  } finally { fs.copyFileSync = origCopy; fs.linkSync = origLink; }
});

test('rotação mantém só as BACKUP_KEEP pastas de fotos mais recentes', () => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'a-ffffffffff.jpg'), 'J');
  ['20260101-000001', '20260101-000002', '20260101-000003'].forEach(s => backup.backupBackgrounds(s));
  backup.rotate();
  expect(bgBackups()).toEqual(['fundos-20260101-000002', 'fundos-20260101-000003']);
});
