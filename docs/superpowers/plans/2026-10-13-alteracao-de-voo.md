# Aba "Alterações" de voo + fotos de fundo no backup — Plano de Implementação

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incluir as fotos do banco de fundos no backup diário e criar a aba "Alterações" (aviso ao cliente + confirmação com novo voucher, com comparação automática).

**Architecture:** Backend Express/SQLite reaproveitando `voucherExtractor` (PDF e imagem via Gemini), tabela `vouchers`, `renderVoucher` e `sendVoucherEmail`. Lógica pura (diff e mensagens) em `helpers/`, testável sem I/O. Um registro por caso na tabela `flight_changes`. Frontend: uma aba nova em React/Tailwind no padrão das existentes.

**Tech Stack:** Node/Express, sqlite3, multer, Jest/supertest, React 19 + Vite + Tailwind v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-13-alteracao-de-voo-design.md`

**Convenções:** textos de UI e mensagens em pt-BR; testes em `backend/__tests__/`; rodar testes com `cd backend && npx jest <arquivo> --runInBand`. Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Não usar `git stash`. Não fazer push sem o usuário pedir (push em `origin/main` dispara deploy no Coolify).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `backend/services/backup.js` | Modificar | Copiar fotos de fundo junto do backup; rotacionar; indicar no listing |
| `backend/__tests__/backupFundos.test.js` | Criar | Testes do backup das fotos |
| `backend/helpers/flightChangeDiff.js` | Criar | Comparação pura de dois vouchers unificados |
| `backend/__tests__/flightChangeDiff.test.js` | Criar | Testes do diff |
| `backend/helpers/flightChangeMessage.js` | Criar | Textos de WhatsApp (aviso e confirmação) e link `wa.me` |
| `backend/__tests__/flightChangeMessage.test.js` | Criar | Testes das mensagens |
| `backend/helpers/voucherStore.js` | Criar | Extrair+validar+salvar voucher (compartilhado) |
| `backend/database.js` | Modificar | Tabela `flight_changes` |
| `backend/services/flightChangeEmail.js` | Criar | E-mail de aviso (HTML + envio) |
| `backend/services/notifier.js` | Modificar | `sendVoucherEmail` aceita `subject` opcional |
| `backend/routes/flightChanges.js` | Criar | API REST da aba |
| `backend/server.js` | Modificar | Montar `/api/flight-changes` |
| `backend/__tests__/testApp.js` | Modificar | `makeFlightChangeApp` |
| `backend/__tests__/routes-flightChanges.test.js` | Criar | Testes das rotas |
| `frontend/src/api/flightChangeClient.js` | Criar | Cliente HTTP |
| `frontend/src/components/FlightChangesTab.jsx` | Criar | A aba |
| `frontend/src/App.jsx` | Modificar | Registrar a aba |
| `frontend/src/components/BackupsPanel.jsx` | Modificar | Mostrar "fotos incluídas" |

---

## Task 1: Fotos de fundo no backup

**Files:**
- Modify: `backend/services/backup.js`
- Create: `backend/__tests__/backupFundos.test.js`

Regras: pasta `backups/fundos-<mesmo carimbo do .sqlite>/`; hard link com fallback para cópia; só `.jpg/.png/.webp`; sem pasta de origem → 0 arquivos (sucesso); falha nas fotos nunca impede o backup do banco; rotação usa o mesmo `BACKUP_KEEP`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/__tests__/backupFundos.test.js`:

```js
const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-fundos-'));
process.env.DB_PATH = tmp;
process.env.BACKUP_KEEP = '2';
const backup = require('../services/backup');

const SRC = path.join(tmp, 'promo-backgrounds');
const bgBackups = () => fs.readdirSync(backup.BACKUP_DIR).filter(f => backup.BG_RE.test(f)).sort();

beforeAll(async () => { await new Promise(r => setTimeout(r, 700)); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest __tests__/backupFundos.test.js --runInBand`
Expected: FAIL (`backup.backupBackgrounds is not a function`).

- [ ] **Step 3: Implementar em `backend/services/backup.js`**

Após `const FILE_RE = ...` adicionar:

```js
// Fotos do banco de fundos: <dataDir>/promo-backgrounds → backups/fundos-<carimbo>/
const BG_SRC = path.join(dataDir, 'promo-backgrounds');
const BG_PREFIX = 'fundos-';
const BG_RE = /^fundos-\d{8}-\d{6}(-\d{2})?$/;
const BG_FILE_RE = /^[a-z0-9][a-z0-9-]*\.(jpg|png|webp)$/;
```

Substituir `listBackups` por (acrescenta `fotos` = nº de arquivos da pasta pareada, ou 0):

```js
function fotosDoBackup(arquivo) {
  const pasta = path.join(BACKUP_DIR, BG_PREFIX + arquivo.slice(PREFIX.length, -SUFFIX.length));
  try { return fs.readdirSync(pasta).length; } catch { return 0; }
}

function listBackups() {
  try {
    ensureDir();
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => FILE_RE.test(f))
      .map(f => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return { arquivo: f, bytes: st.size, criado_em: st.mtime.toISOString(), fotos: fotosDoBackup(f) };
      })
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  } catch (err) {
    console.error('[BACKUP] Falha ao listar:', err.message);
    return [];
  }
}
```

Antes de `rotate`, adicionar:

```js
/** Copia as fotos de fundo para backups/fundos-<carimbo>/ (hard link; cópia como fallback). */
function backupBackgrounds(carimbo) {
  try {
    if (!fs.existsSync(BG_SRC)) return { ok: true, arquivos: 0, pasta: null };
    const arquivos = fs.readdirSync(BG_SRC).filter(f => BG_FILE_RE.test(f));
    if (!arquivos.length) return { ok: true, arquivos: 0, pasta: null };
    ensureDir();
    const pasta = path.join(BACKUP_DIR, BG_PREFIX + carimbo);
    fs.mkdirSync(pasta, { recursive: true });
    for (const f of arquivos) {
      const origem = path.join(BG_SRC, f);
      const destino = path.join(pasta, f);
      if (fs.existsSync(destino)) continue;
      try { fs.linkSync(origem, destino); }
      catch { fs.copyFileSync(origem, destino); }
    }
    return { ok: true, arquivos: arquivos.length, pasta: path.basename(pasta) };
  } catch (err) {
    console.error('[BACKUP] Falha ao copiar as fotos de fundo:', err.message);
    return { ok: false, arquivos: 0, erro: err.message };
  }
}

function rotateBackgrounds() {
  const keep = keepCount();
  try {
    const pastas = fs.readdirSync(BACKUP_DIR).filter(f => BG_RE.test(f)).sort().reverse();
    for (const p of pastas.slice(keep)) {
      try { fs.rmSync(path.join(BACKUP_DIR, p), { recursive: true, force: true }); }
      catch (err) { console.error(`[BACKUP] Não consegui apagar ${p}:`, err.message); }
    }
  } catch { /* diretório ainda não existe */ }
}
```

Em `rotate()`, chamar `rotateBackgrounds();` antes do `return apagados;`.

Em `executarBackup`: declarar `let destino, base;` (em vez de `let destino;`), trocar `const base = ...` por `base = ...`, e no callback do `VACUUM INTO`, ANTES de `const apagados = rotate();` (a rotação precisa enxergar a pasta nova), inserir:

```js
      const fotos = backupBackgrounds(base.slice(PREFIX.length));
```

Incluir `fotos` no `resolve({ ok: true, ..., fotos })` e no log: `${fotos.arquivos ? ` | ${fotos.arquivos} foto(s) de fundo` : ''}`.

Exports: acrescentar `backupBackgrounds, BG_RE`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx jest __tests__/backupFundos.test.js --runInBand`
Expected: PASS (6 testes).

- [ ] **Step 5: Sabotagem (prova de que o teste protege)**

Trocar temporariamente `BG_FILE_RE.test(f)` por `true` em `backupBackgrounds` → o teste 2 deve FALHAR. Reverter. Remover a chamada `rotateBackgrounds();` → o teste de rotação deve FALHAR. Reverter.

- [ ] **Step 6: Painel de backups**

Ler `frontend/src/components/BackupsPanel.jsx` e, na linha de cada cópia, mostrar ao lado do tamanho o texto `· {b.fotos} foto(s) de fundo` quando `b.fotos > 0`, seguindo o padrão visual da linha existente.

- [ ] **Step 7: Commit**

```bash
git add backend/services/backup.js backend/__tests__/backupFundos.test.js frontend/src/components/BackupsPanel.jsx
git commit -m "feat(backup): inclui as fotos do banco de fundos no backup diário"
```

---

## Task 2: Comparação de vouchers (função pura)

**Files:**
- Create: `backend/helpers/flightChangeDiff.js`
- Create: `backend/__tests__/flightChangeDiff.test.js`

- [ ] **Step 1: Escrever os testes**

```js
const { diffVouchers, formatLocal } = require('../helpers/flightChangeDiff');

const trip = (over = {}) => ({
  direction: 'ida', flightNumber: 'AD 4001', cabinClass: 'Econômica',
  departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
  arrival: { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' }, ...over
});
const v = (over = {}) => ({
  reservation: { locator: 'ABC123' },
  passengers: [{ name: 'JOAO DA SILVA' }, { name: 'Maria Silva' }],
  trips: [trip(), trip({ direction: 'volta', flightNumber: 'AD 4002',
    departure: { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' },
    arrival: { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' } })],
  baggage: [{ direction: 'ida', weightText: '23kg', quantity: 1 }], ...over
});

test('vouchers idênticos: nada mudou', () => {
  const d = diffVouchers(v(), v());
  expect(d.hasChanges).toBe(false);
  expect(d.trips.map(t => t.status)).toEqual(['igual', 'igual']);
});

test('horário de partida alterado vira trecho alterado com antes/depois', () => {
  const novo = v(); novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';
  const d = diffVouchers(v(), novo);
  expect(d.hasChanges).toBe(true);
  expect(d.trips[0].status).toBe('alterado');
  expect(d.trips[0].changes).toEqual([{ campo: 'partida', antes: '12/09/2026 08:30', depois: '12/09/2026 10:15' }]);
  expect(d.trips[1].status).toBe('igual');
});

test('mesmo instante em fusos diferentes não conta como mudança', () => {
  const novo = v(); novo.trips[0].departure.datetime = '2026-09-12T11:30:00Z';
  expect(diffVouchers(v(), novo).trips[0].status).toBe('igual');
});

test('número do voo: espaços e caixa são ignorados; troca real é detectada', () => {
  const a = v(); a.trips[0].flightNumber = 'ad4001';
  expect(diffVouchers(v(), a).trips[0].status).toBe('igual');
  const b = v(); b.trips[0].flightNumber = 'AD 4010';
  expect(diffVouchers(v(), b).trips[0].changes).toEqual([{ campo: 'voo', antes: 'AD 4001', depois: 'AD 4010' }]);
});

test('aeroporto de chegada diferente', () => {
  const n = v(); n.trips[0].arrival.airport = 'SSA';
  expect(diffVouchers(v(), n).trips[0].changes).toEqual([{ campo: 'destino', antes: 'REC', depois: 'SSA' }]);
});

test('classe só conta quando as duas existem', () => {
  const n = v(); n.trips[0].cabinClass = null;
  expect(diffVouchers(v(), n).trips[0].status).toBe('igual');
  const m = v(); m.trips[0].cabinClass = 'Executiva';
  expect(diffVouchers(v(), m).trips[0].changes[0].campo).toBe('classe');
});

test('trecho removido e trecho novo', () => {
  const semVolta = v(); semVolta.trips = [semVolta.trips[0]];
  const d1 = diffVouchers(v(), semVolta);
  expect(d1.trips.map(t => t.status)).toEqual(['igual', 'removido']);
  const d2 = diffVouchers(semVolta, v());
  expect(d2.trips.map(t => t.status)).toEqual(['igual', 'novo']);
  expect(d1.hasChanges && d2.hasChanges).toBe(true);
});

test('pareia por direção + ordem, não por posição absoluta', () => {
  const n = v(); n.trips.reverse();
  expect(diffVouchers(v(), n).hasChanges).toBe(false);
});

test('localizador alterado é destacado', () => {
  const n = v({ reservation: { locator: 'XYZ999' } });
  const d = diffVouchers(v(), n);
  expect(d.locatorChanged).toEqual({ antes: 'ABC123', depois: 'XYZ999' });
  expect(d.hasChanges).toBe(true);
});

test('passageiros: ignora acento/caixa/espaço; detecta troca', () => {
  const ok = v({ passengers: [{ name: 'joão da  silva' }, { name: 'MARIA SILVA' }] });
  expect(diffVouchers(v(), ok).passengers).toEqual({ adicionados: [], removidos: [] });
  const outro = v({ passengers: [{ name: 'JOAO DA SILVA' }, { name: 'PEDRO LIMA' }] });
  const d = diffVouchers(v(), outro);
  expect(d.passengers).toEqual({ adicionados: ['PEDRO LIMA'], removidos: ['Maria Silva'] });
  expect(d.hasChanges).toBe(true);
});

test('bagagem alterada marca baggageChanged', () => {
  const n = v({ baggage: [{ direction: 'ida', weightText: '23kg', quantity: 2 }] });
  const d = diffVouchers(v(), n);
  expect(d.baggageChanged).toBe(true); expect(d.hasChanges).toBe(true);
});

test('entradas vazias/nulas não quebram', () => {
  expect(diffVouchers({}, {}).hasChanges).toBe(false);
  expect(diffVouchers(null, undefined).hasChanges).toBe(false);
});

test('formatLocal usa o horário escrito no ISO (hora local do aeroporto)', () => {
  expect(formatLocal('2026-09-12T08:30:00-03:00')).toBe('12/09/2026 08:30');
  expect(formatLocal('lixo')).toBe('—');
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && npx jest __tests__/flightChangeDiff.test.js` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `backend/helpers/flightChangeDiff.js`**

```js
// Comparação pura entre dois vouchers unificados (schema de services/voucherSchema.js).
// Sem I/O. Casa os trechos por direção + ordem dentro da direção.

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** "12/09/2026 08:30" a partir do horário escrito no ISO (hora local do aeroporto). */
function formatLocal(iso) {
  const m = ISO_LOCAL.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '—';
}

const instant = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };
const compact = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const nameKey = (s) => squash(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// [campo, valor para comparar, valor para exibir, exige os dois lados?]
const FIELDS = [
  ['partida', t => instant(t.departure?.datetime), t => formatLocal(t.departure?.datetime), false],
  ['chegada', t => instant(t.arrival?.datetime),   t => formatLocal(t.arrival?.datetime),   false],
  ['voo',     t => compact(t.flightNumber),        t => squash(t.flightNumber) || '—',      false],
  ['origem',  t => compact(t.departure?.airport),  t => squash(t.departure?.airport) || '—', false],
  ['destino', t => compact(t.arrival?.airport),    t => squash(t.arrival?.airport) || '—',   false],
  ['classe',  t => nameKey(t.cabinClass),          t => squash(t.cabinClass) || '—',         true]
];

function compareTrip(a, b) {
  const changes = [];
  for (const [campo, key, show, needsBoth] of FIELDS) {
    const ka = key(a), kb = key(b);
    if (needsBoth && (!ka || !kb)) continue;
    if (ka !== kb) changes.push({ campo, antes: show(a), depois: show(b) });
  }
  return changes;
}

function groupByDirection(trips) {
  const map = new Map();
  (trips || []).forEach(t => {
    const d = (t && t.direction) || 'multi';
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(t);
  });
  return map;
}

function baggageSignature(list) {
  return (list || []).map(b => `${b.direction}|${b.quantity}|${compact(b.weightText)}`).sort().join(';');
}

function diffVouchers(oldV, newV) {
  const o = oldV || {}, n = newV || {};
  const oldG = groupByDirection(o.trips), newG = groupByDirection(n.trips);
  const trips = [];

  for (const [direction, olds] of oldG) {
    const news = newG.get(direction) || [];
    olds.forEach((old, i) => {
      const nw = news[i];
      if (!nw) return trips.push({ status: 'removido', direction, changes: [], old, new: null });
      const changes = compareTrip(old, nw);
      trips.push({ status: changes.length ? 'alterado' : 'igual', direction, changes, old, new: nw });
    });
  }
  for (const [direction, news] of newG) {
    const qtdOld = (oldG.get(direction) || []).length;
    news.slice(qtdOld).forEach(nw => trips.push({ status: 'novo', direction, changes: [], old: null, new: nw }));
  }

  const la = squash(o.reservation?.locator), lb = squash(n.reservation?.locator);
  const locatorChanged = la && lb && la.toUpperCase() !== lb.toUpperCase() ? { antes: la, depois: lb } : null;

  const oldNames = new Map((o.passengers || []).map(p => [nameKey(p.name), squash(p.name)]));
  const newNames = new Map((n.passengers || []).map(p => [nameKey(p.name), squash(p.name)]));
  const passengers = {
    adicionados: [...newNames].filter(([k]) => !oldNames.has(k)).map(([, v]) => v),
    removidos: [...oldNames].filter(([k]) => !newNames.has(k)).map(([, v]) => v)
  };

  const baggageChanged = baggageSignature(o.baggage) !== baggageSignature(n.baggage);
  const hasChanges = trips.some(t => t.status !== 'igual') || !!locatorChanged
    || passengers.adicionados.length > 0 || passengers.removidos.length > 0 || baggageChanged;

  return { trips, locatorChanged, passengers, baggageChanged, hasChanges };
}

module.exports = { diffVouchers, formatLocal };
```

- [ ] **Step 4: Rodar e ver passar** — `npx jest __tests__/flightChangeDiff.test.js` → PASS (12 testes).

- [ ] **Step 5: Sabotagem** — trocar `instant(...)` do campo `partida` por `t.departure?.datetime` (string): o teste do fuso deve FALHAR. Reverter.

- [ ] **Step 6: Commit**

```bash
git add backend/helpers/flightChangeDiff.js backend/__tests__/flightChangeDiff.test.js
git commit -m "feat(alteracao-voo): comparação pura entre dois vouchers"
```

---

## Task 3: Mensagens de WhatsApp (aviso e confirmação)

**Files:**
- Create: `backend/helpers/flightChangeMessage.js`
- Create: `backend/__tests__/flightChangeMessage.test.js`

- [ ] **Step 1: Testes**

```js
const { buildNoticeText, buildConfirmationText, buildWaLink, noticeClientMessage } = require('../helpers/flightChangeMessage');
const { diffVouchers } = require('../helpers/flightChangeDiff');

const trip = (o = {}) => ({
  direction: 'ida', dateLabel: '12 SET 2026', flightNumber: 'AD 4001',
  departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
  arrival: { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' }, ...o
});
const voucher = (o = {}) => ({
  reservation: { locator: 'ABC123' }, route: { origin: 'GRU', destination: 'REC' },
  passengers: [{ name: 'MARIA SILVA' }], trips: [trip()], ...o
});

test('buildWaLink: só dígitos, prefixo 55 e texto codificado', () => {
  expect(buildWaLink('(48) 99999-1234', 'Olá & tudo?')).toBe('https://wa.me/5548999991234?text=Ol%C3%A1%20%26%20tudo%3F');
  expect(buildWaLink('+55 48 99999-1234', 'a')).toBe('https://wa.me/5548999991234?text=a');
  expect(buildWaLink('', 'a')).toBeNull();
  expect(buildWaLink(null, 'a')).toBeNull();
});

test('aviso: nome, localizador, rota/data originais, sem horários e com link de suporte', () => {
  const t = buildNoticeText(voucher(), { supportPhone: '48999991234' });
  expect(t).toContain('Olá, *Maria*!');
  expect(t).toContain('*ABC123*');
  expect(t).toContain('GRU → REC');
  expect(t).toContain('12 SET 2026');
  expect(t).toContain('https://wa.me/5548999991234?text=');
  expect(t).not.toMatch(/\d{2}:\d{2}/);           // nenhum horário
});

test('aviso sem telefone de suporte omite o convite com link', () => {
  const t = buildNoticeText(voucher(), {});
  expect(t).not.toContain('wa.me');
  expect(t).toContain('Entraremos em contato pelo WhatsApp');
});

test('mensagem pré-preenchida do cliente leva nome e localizador', () => {
  const m = noticeClientMessage(voucher());
  expect(m).toContain('ABC123'); expect(m).toContain('Maria');
});

test('confirmação: só trechos alterados, antes → depois e nota do e-mail', () => {
  const novo = voucher({ trips: [trip({ departure: { airport: 'GRU', datetime: '2026-09-12T10:15:00-03:00' } }),
    trip({ direction: 'volta', flightNumber: 'AD 4002' })] });
  const antigo = voucher({ trips: [trip(), trip({ direction: 'volta', flightNumber: 'AD 4002' })] });
  const diff = diffVouchers(antigo, novo);
  const t = buildConfirmationText(novo, diff, { emailSent: true });
  expect(t).toContain('Seu voo foi reajustado ✅');
  expect(t).toContain('*Ida (GRU → REC)*');
  expect(t).toContain('Partida: 12/09/2026 08:30 → 12/09/2026 10:15');
  expect(t).not.toContain('Volta');                 // trecho igual omitido
  expect(t).toContain('novo voucher por e-mail');
});

test('confirmação: trecho removido e localizador novo', () => {
  const antigo = voucher({ trips: [trip(), trip({ direction: 'volta' })] });
  const novo = voucher({ reservation: { locator: 'XYZ999' }, trips: [trip()] });
  const t = buildConfirmationText(novo, diffVouchers(antigo, novo), { emailSent: false });
  expect(t).toContain('Trecho cancelado');
  expect(t).toContain('Novo localizador: *XYZ999*');
  expect(t).toContain('Em instantes enviamos o novo voucher');
});
```

- [ ] **Step 2:** Rodar → FAIL.

- [ ] **Step 3: Implementar `backend/helpers/flightChangeMessage.js`**

```js
// Textos de WhatsApp do fluxo de alteração de voo. Puro, sem I/O.
// *texto* = negrito no WhatsApp (mesmo padrão dos outros módulos).
const { firstNameOf } = require('./voucherCarrier');

const DIRECTION_LABEL = { ida: 'Ida', volta: 'Volta', interno: 'Trecho interno', multi: 'Trecho' };
const FIELD_LABEL = {
  partida: 'Partida', chegada: 'Chegada', voo: 'Voo', origem: 'Origem', destino: 'Destino', classe: 'Classe'
};

function buildWaLink(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 11) digits = '55' + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const greetingName = (v) => firstNameOf(v?.passengers?.[0]?.name) || '';
const hello = (v, emoji) => {
  const n = greetingName(v);
  return `Olá${n ? `, *${n}*` : ''}! ${emoji}`;
};
const routeOf = (v) => {
  const o = v?.route?.origin || v?.trips?.[0]?.departure?.airport;
  const d = v?.route?.destination || v?.trips?.[0]?.arrival?.airport;
  return o && d ? `${o} → ${d}` : '';
};
const tripLabel = (t) => {
  const base = DIRECTION_LABEL[t.direction] || 'Trecho';
  const o = t.departure?.airport, d = t.arrival?.airport;
  return o && d ? `${base} (${o} → ${d})` : base;
};

/** Mensagem que o CLIENTE envia para nós ao tocar no link (pré-preenchida). */
function noticeClientMessage(v) {
  const n = greetingName(v);
  const loc = v?.reservation?.locator || '';
  return `Olá! Recebi o aviso de alteração do meu voo.${loc ? ` Reserva ${loc}` : ''}${n ? ` — ${n}` : ''}.`;
}

function buildNoticeText(v, { supportPhone } = {}) {
  const loc = v?.reservation?.locator;
  const rota = routeOf(v);
  const data = v?.trips?.[0]?.dateLabel;
  const detalhe = [rota, data].filter(Boolean).join(', ');
  const link = buildWaLink(supportPhone, noticeClientMessage(v));
  const linhas = [
    hello(v, '✈️'), '',
    `A companhia aérea fez uma alteração no seu voo${loc ? ` da reserva *${loc}*` : ''}${detalhe ? ` (${detalhe})` : ''}.`, '',
    'Entraremos em contato pelo WhatsApp com os detalhes.'
  ];
  if (link) linhas.push(`Se preferir, é só nos chamar: ${link}`);
  return linhas.join('\n');
}

function buildConfirmationText(newV, diff, { emailSent = false } = {}) {
  const loc = newV?.reservation?.locator;
  const linhas = [hello(newV, '✅'), '', `Seu voo foi reajustado ✅${loc ? ` Reserva *${loc}*` : ''}`];
  if (diff?.locatorChanged) linhas.push(`Novo localizador: *${diff.locatorChanged.depois}*`);

  for (const t of diff?.trips || []) {
    if (t.status === 'igual') continue;
    linhas.push('');
    if (t.status === 'removido') {
      linhas.push(`*${tripLabel(t.old)}*`, '• Trecho cancelado');
    } else if (t.status === 'novo') {
      linhas.push(`*${tripLabel(t.new)}*`, '• Trecho incluído', `• Voo: ${t.new.flightNumber || '—'}`);
    } else {
      linhas.push(`*${tripLabel(t.new)}*`);
      t.changes.forEach(c => linhas.push(`• ${FIELD_LABEL[c.campo] || c.campo}: ${c.antes} → ${c.depois}`));
    }
  }
  linhas.push('', emailSent
    ? 'Enviamos o novo voucher por e-mail 📧'
    : 'Em instantes enviamos o novo voucher.');
  return linhas.join('\n');
}

module.exports = { buildWaLink, buildNoticeText, buildConfirmationText, noticeClientMessage };
```

- [ ] **Step 4:** Rodar → PASS (6 testes).
- [ ] **Step 5:** Commit:

```bash
git add backend/helpers/flightChangeMessage.js backend/__tests__/flightChangeMessage.test.js
git commit -m "feat(alteracao-voo): mensagens de WhatsApp (aviso e confirmação)"
```

---

## Task 4: Tabela, helper de voucher, e-mails e rotas

**Files:**
- Modify: `backend/database.js` (após o bloco da tabela `vouchers`)
- Create: `backend/helpers/voucherStore.js`
- Modify: `backend/services/notifier.js:929,938` (subject opcional)
- Create: `backend/services/flightChangeEmail.js`
- Create: `backend/routes/flightChanges.js`
- Modify: `backend/server.js`, `backend/__tests__/testApp.js`
- Create: `backend/__tests__/routes-flightChanges.test.js`

- [ ] **Step 1: Tabela** — em `database.js`, logo após o bloco `CREATE TABLE IF NOT EXISTS vouchers (...)` (e seu índice), adicionar:

```js
    db.run(`CREATE TABLE IF NOT EXISTS flight_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        old_voucher_id INTEGER,
        new_voucher_id INTEGER,
        status TEXT NOT NULL DEFAULT 'aviso_pendente',
        client_name TEXT,
        locator TEXT,
        old_json TEXT NOT NULL,
        new_json TEXT,
        diff_json TEXT,
        notice_sent_at TEXT,
        confirmed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
        if (err) console.error('Error creating flight_changes table:', err.message);
        else db.run(`CREATE INDEX IF NOT EXISTS idx_flight_changes_user ON flight_changes(user_id, status)`);
    });
```

`old_json` é um snapshot de propósito: `voucherRetention` apaga o arquivo do voucher após 30 dias, e o caso não pode depender dele.

- [ ] **Step 2: `sendVoucherEmail` com assunto opcional** — em `notifier.js`, acrescentar `subject: subjectOverride` à desestruturação de parâmetros (linha 929) e trocar a linha 938 por `const subject = subjectOverride || 'Eba! Sua viagem está confirmada';`.

- [ ] **Step 3: `backend/helpers/voucherStore.js`**

```js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { extractVoucher } = require('../services/voucherExtractor');
const { validate } = require('../services/voucherSchema');
const { uploadsDir } = require('./voucherWorkspace');

/** Extrai e valida. Lança { status, body } em caso de falha (mesmos códigos de routes/vouchers.js). */
async function extractAndValidate(file) {
  let unified;
  try {
    unified = await extractVoucher(file.buffer, file.mimetype);
  } catch (err) {
    console.error('[VOUCHER-STORE] extração falhou:', err.message);
    if (err.code === 'gemini_unavailable' || /503|service unavailable|high demand/i.test(err.message)) {
      throw { status: 503, body: { error: 'Serviço de extração (Gemini) com alta demanda. Tente novamente em instantes.', retryable: true } };
    }
    if (/quota|exceeded/i.test(err.message)) {
      throw { status: 429, body: { error: 'Cota da API Gemini esgotada. Aguarde alguns minutos.', retryable: true } };
    }
    if (/mimetype não suportado/.test(err.message)) {
      throw { status: 400, body: { error: 'Formato não suportado. Envie PDF, PNG, JPG ou WebP.' } };
    }
    throw { status: 500, body: { error: 'erro ao processar voucher' } };
  }
  const v = validate(unified);
  if (!v.ok) throw { status: 422, body: { error: 'schema inválido após extração', details: v.errors } };
  unified.meta.sourceFileHash = 'sha256:' + crypto.createHash('sha256').update(file.buffer).digest('hex');
  return unified;
}

/** Grava o arquivo + linha em `vouchers`. Resolve com o id. */
function saveVoucher({ userId, file, unified }) {
  const hash = unified.meta.sourceFileHash;
  const filename = `${Date.now()}-${hash.slice(7, 19)}${path.extname(file.originalname || '') || ''}`;
  const filePath = path.join(uploadsDir(), filename);
  fs.writeFileSync(filePath, file.buffer);
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO vouchers (user_id, carrier, layout_version, source_file_path, source_file_hash, unified_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, unified.carrier, unified.layoutVersion, filePath, hash, JSON.stringify(unified)],
      function (err) {
        if (err) { fs.unlink(filePath, () => {}); return reject(err); }
        resolve(this.lastID);
      }
    );
  });
}

module.exports = { extractAndValidate, saveVoucher };
```

- [ ] **Step 4: `backend/services/flightChangeEmail.js`** (e-mail do aviso, mesmo visual do cartão de embarque)

```js
const fs = require('fs');
const { transporter, AGENCY_LOGO_PATH, AGENCY_LOGO_CID } = require('./notifier');
const { firstNameOf } = require('../helpers/voucherCarrier');
const { buildWaLink, noticeClientMessage } = require('../helpers/flightChangeMessage');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const SUBJECT = 'Importante: houve uma alteração no seu voo ✈️';

function buildNoticeEmailHtml(v, { supportPhone } = {}) {
  const nome = firstNameOf(v?.passengers?.[0]?.name);
  const loc = v?.reservation?.locator;
  const rota = v?.route?.origin && v?.route?.destination ? `${v.route.origin} → ${v.route.destination}` : '';
  const data = v?.trips?.[0]?.dateLabel || '';
  const detalhe = [rota, data].filter(Boolean).join(' · ');
  const link = buildWaLink(supportPhone, noticeClientMessage(v));
  const botao = link ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr>
      <td bgcolor="#25D366" style="background:#25D366;border-radius:8px;">
        <a href="${esc(link)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">Falar com a gente no WhatsApp</a>
      </td></tr></table>` : '';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alteração no seu voo</title></head>
<body style="margin:0;padding:0;background:#E2E8F0;font-family:Inter,Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#E2E8F0" style="background:#E2E8F0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#ffffff" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;">
        <tr><td bgcolor="#00539C" style="background:#00539C;padding:22px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" width="56" style="padding-right:14px;"><img src="cid:${esc(AGENCY_LOGO_CID)}" alt="Clube do Voo" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:9999px;border:0;"></td>
            <td valign="middle" style="color:#fff;"><div style="font-size:19px;font-weight:700;">Clube do Voo Viagens</div><div style="font-size:13px;opacity:0.9;margin-top:3px;">Aviso sobre o seu voo</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 24px;">
          <div style="color:#00539C;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Olá${nome ? `, ${esc(nome)}` : ''}</div>
          <h2 style="font-size:24px;font-weight:700;color:#2D3748;margin:6px 0 10px;">Houve uma alteração no seu voo</h2>
          <p style="font-size:15px;color:#4A5568;line-height:1.55;margin:0 0 8px;">A companhia aérea fez uma alteração no seu voo${loc ? ` da reserva <strong>${esc(loc)}</strong>` : ''}${detalhe ? ` (${esc(detalhe)})` : ''}.</p>
          <p style="font-size:15px;color:#4A5568;line-height:1.55;margin:0;">Entraremos em contato pelo WhatsApp com os detalhes${link ? '. Se preferir, é só nos chamar pelo botão abaixo:' : '.'}</p>
          ${botao}
          <div style="border-top:1px solid #E5E7EB;padding-top:18px;margin-top:20px;">
            <p style="color:#718096;font-size:13px;margin:0;">— Clube do Voo Viagens</p>
          </div>
        </td></tr>
        <tr><td align="center" bgcolor="#1A202C" style="background:#1A202C;padding:20px;color:#fff;">
          <a href="https://www.clubedovooviagens.com.br" style="color:#fff;text-decoration:none;font-size:13px;font-weight:600;">www.clubedovooviagens.com.br</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendNoticeEmail({ to, bcc, voucher, supportPhone }) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return { sucesso: false, erro: 'Credenciais de e-mail não configuradas' };
    }
    const attachments = [];
    if (fs.existsSync(AGENCY_LOGO_PATH)) {
      attachments.push({ filename: 'logo.png', path: AGENCY_LOGO_PATH, cid: AGENCY_LOGO_CID, contentDisposition: 'inline' });
    }
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: to.join(', '), bcc: bcc || undefined,
      subject: SUBJECT, html: buildNoticeEmailHtml(voucher, { supportPhone }), attachments
    });
    return { sucesso: true, messageId: info.messageId, subject: SUBJECT };
  } catch (error) {
    console.error('[FLIGHT-CHANGE] erro ao enviar aviso:', error.message);
    return { sucesso: false, erro: error.message };
  }
}

module.exports = { buildNoticeEmailHtml, sendNoticeEmail, SUBJECT };
```

Acrescentar um teste curto em `routes-flightChanges.test.js` (ou arquivo próprio) que chama `buildNoticeEmailHtml` e confere: contém `wa.me` quando há telefone, não contém quando não há, escapa HTML no nome (`<script>` vira `&lt;script&gt;`).

- [ ] **Step 5: Testes das rotas (escrever primeiro)** — em `testApp.js`, criar `makeFlightChangeApp` (cópia de `makeVoucherApp` que monta também `app.use('/api/vouchers', vouchersRouter)` e `app.use('/api/flight-changes', require('../routes/flightChanges'))`) e exportá-lo. Depois criar `routes-flightChanges.test.js`:

```js
process.env.EXTRACTION_MODE = 'stub';
delete process.env.GEMINI_API_KEY;
const request = require('supertest');
const db = require('../database');
const { makeFlightChangeApp, waitForDb, getCsrfFromResponse } = require('./testApp');
const { buildNoticeEmailHtml } = require('../services/flightChangeEmail');

let app;
beforeAll(async () => { app = makeFlightChangeApp(); await waitForDb(); await new Promise(r => setTimeout(r, 600)); });

async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const csrf = getCsrfFromResponse(await agent.get('/api/auth/me'));
  return { agent, csrf };
}
const pdf = (b = 'fake') => ({ buf: Buffer.from(b), opts: { filename: 'v.pdf', contentType: 'application/pdf' } });

async function criarCaso(agent, csrf) {
  const f = pdf('antigo');
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  expect(res.status).toBe(201);
  return res.body;
}

test('exige autenticação', async () => {
  expect((await request(app).get('/api/flight-changes')).status).toBe(401);
});

test('POST sem arquivo nem voucher_id: 400', async () => {
  const { agent, csrf } = await authed();
  expect((await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf)).status).toBe(400);
});

test('cria caso por upload: status aviso_pendente, snapshot e mensagem de aviso', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  expect(c.status).toBe('aviso_pendente');
  expect(c.locator).toBe('STUB01');
  expect(c.messages.notice).toContain('*STUB01*');
  expect(c.old.reservation.locator).toBe('STUB01');
});

test('cria caso a partir de voucher salvo (voucher_id)', async () => {
  const { agent, csrf } = await authed();
  const f = pdf('salvo');
  const v = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: v.body.id });
  expect(res.status).toBe(201);
  expect(res.body.old_voucher_id).toBe(v.body.id);
});

test('voucher_id inexistente: 404', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/flight-changes').set('X-CSRF-Token', csrf).send({ voucher_id: 999999 });
  expect(res.status).toBe(404);
});

test('lista: pendentes antes dos confirmados', async () => {
  const { agent } = await authed();
  const res = await agent.get('/api/flight-changes');
  expect(res.status).toBe(200);
  const ordem = res.body.map(c => c.status === 'confirmado' ? 1 : 0);
  expect([...ordem].sort()).toEqual(ordem);
});

test('notice-sent muda status e é idempotente', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const r1 = await agent.post(`/api/flight-changes/${c.id}/notice-sent`).set('X-CSRF-Token', csrf);
  expect(r1.body.status).toBe('aviso_enviado');
  const r2 = await agent.post(`/api/flight-changes/${c.id}/notice-sent`).set('X-CSRF-Token', csrf);
  expect(r2.status).toBe(200); expect(r2.body.status).toBe('aviso_enviado');
});

test('confirm sem voucher novo: 409', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  expect((await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf)).status).toBe(409);
});

test('voucher novo idêntico: diff sem mudanças e confirm bloqueado (nada_mudou)', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('novo');
  const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  expect(r.status).toBe(200);
  expect(r.body.diff.hasChanges).toBe(false);
  const cf = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
  expect(cf.status).toBe(409); expect(cf.body.error).toBe('nada_mudou');
});

test('editar o voucher novo recalcula o diff; confirm então funciona', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('novo2');
  const r = await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const novo = r.body.new;
  novo.trips[0].departure.datetime = '2026-09-12T10:15:00-03:00';
  const put = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: novo });
  expect(put.status).toBe(200);
  expect(put.body.diff.hasChanges).toBe(true);
  expect(put.body.messages.confirmation).toContain('Seu voo foi reajustado');
  expect(put.body.messages.confirmation).toContain('Partida: 12/09/2026 08:30 → 12/09/2026 10:15');
  const cf = await agent.post(`/api/flight-changes/${c.id}/confirm`).set('X-CSRF-Token', csrf);
  expect(cf.status).toBe(200); expect(cf.body.status).toBe('confirmado');
});

test('PUT /new com payload inválido: 422', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const f = pdf('n3');
  await agent.post(`/api/flight-changes/${c.id}/new-voucher`).set('X-CSRF-Token', csrf).attach('file', f.buf, f.opts);
  const res = await agent.put(`/api/flight-changes/${c.id}/new`).set('X-CSRF-Token', csrf).send({ unified: { x: 1 } });
  expect(res.status).toBe(422);
});

test('send-email valida destinatários, tipo e pré-requisitos', async () => {
  const { agent, csrf } = await authed();
  const c = await criarCaso(agent, csrf);
  const post = (body) => agent.post(`/api/flight-changes/${c.id}/send-email`).set('X-CSRF-Token', csrf).send(body);
  expect((await post({ kind: 'aviso' })).status).toBe(400);
  expect((await post({ kind: 'aviso', emails: 'nao-e-email' })).status).toBe(400);
  expect((await post({ kind: 'x', emails: 'a@b.com' })).status).toBe(400);
  expect((await post({ kind: 'confirmacao', emails: 'a@b.com' })).status).toBe(409);
});

test('GET e DELETE de caso inexistente: 404; delete remove', async () => {
  const { agent, csrf } = await authed();
  expect((await agent.get('/api/flight-changes/999999')).status).toBe(404);
  const c = await criarCaso(agent, csrf);
  expect((await agent.delete(`/api/flight-changes/${c.id}`).set('X-CSRF-Token', csrf)).status).toBe(204);
  expect((await agent.get(`/api/flight-changes/${c.id}`)).status).toBe(404);
});

test('caso de outro usuário não é acessível (isolamento por user_id)', async () => {
  const { agent, csrf } = await authed();
  const id = await new Promise((res, rej) =>
    db.run(`INSERT INTO flight_changes (user_id, old_json) VALUES (99999, '{}')`, function (e) { e ? rej(e) : res(this.lastID); }));
  expect((await agent.get(`/api/flight-changes/${id}`)).status).toBe(404);
  expect((await agent.delete(`/api/flight-changes/${id}`).set('X-CSRF-Token', csrf)).status).toBe(404);
  expect((await agent.post(`/api/flight-changes/${id}/notice-sent`).set('X-CSRF-Token', csrf)).status).toBe(404);
});

describe('e-mail do aviso', () => {
  const v = { reservation: { locator: 'ABC123' }, route: { origin: 'GRU', destination: 'REC' },
    passengers: [{ name: '<script>x</script> MARIA' }], trips: [{ dateLabel: '12 SET 2026' }] };
  test('inclui o botão de WhatsApp só quando há telefone de suporte', () => {
    expect(buildNoticeEmailHtml(v, { supportPhone: '48999991234' })).toContain('https://wa.me/5548999991234?text=');
    expect(buildNoticeEmailHtml(v, {})).not.toContain('wa.me');
  });
  test('escapa HTML vindo do voucher', () => {
    expect(buildNoticeEmailHtml(v, {})).not.toContain('<script>');
  });
});
```

- [ ] **Step 6: Rodar** → FAIL (rota não existe).

- [ ] **Step 7: Implementar `backend/routes/flightChanges.js`**

```js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const db = require('../database');
const { validate } = require('../services/voucherSchema');
const { renderVoucher } = require('../services/voucherRenderer');
const { sendVoucherEmail } = require('../services/notifier');
const { sendNoticeEmail } = require('../services/flightChangeEmail');
const { extractAndValidate, saveVoucher } = require('../helpers/voucherStore');
const { diffVouchers } = require('../helpers/flightChangeDiff');
const { buildNoticeText, buildConfirmationText } = require('../helpers/flightChangeMessage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const get = (sql, p) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const run = (sql, p) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const fail = (res, e) => {
  if (e && e.status && e.body) return res.status(e.status).json(e.body);
  console.error('[FLIGHT-CHANGES]', e && e.message);
  return res.status(500).json({ error: 'erro interno' });
};

async function supportPhone() {
  const s = await get(`SELECT contact_phone FROM voucher_settings WHERE id = 1`, []);
  return (s && s.contact_phone) || '';
}

function parse(json) { try { return json ? JSON.parse(json) : null; } catch { return null; } }

/** Monta a resposta de detalhe (inclui diff e as mensagens prontas). */
async function detail(row, { emailSent = false } = {}) {
  const old = parse(row.old_json), novo = parse(row.new_json);
  const diff = novo ? diffVouchers(old, novo) : null;
  const phone = await supportPhone();
  return {
    id: row.id, status: row.status, client_name: row.client_name, locator: row.locator,
    old_voucher_id: row.old_voucher_id, new_voucher_id: row.new_voucher_id,
    notice_sent_at: row.notice_sent_at, confirmed_at: row.confirmed_at, created_at: row.created_at,
    old, new: novo, diff, support_phone: phone,
    messages: {
      notice: buildNoticeText(old, { supportPhone: phone }),
      confirmation: novo && diff ? buildConfirmationText(novo, diff, { emailSent }) : null
    }
  };
}

const own = (id, userId) => get(`SELECT * FROM flight_changes WHERE id = ? AND user_id = ?`, [id, userId]);

router.get('/', async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, status, client_name, locator, notice_sent_at, confirmed_at, created_at
         FROM flight_changes WHERE user_id = ?
        ORDER BY CASE status WHEN 'confirmado' THEN 1 ELSE 0 END, created_at DESC, id DESC`, [req.session.userId]);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const userId = req.session.userId;
    let unified, voucherId = null;
    const vid = req.body && req.body.voucher_id;
    if (req.file) {
      unified = await extractAndValidate(req.file);
      voucherId = await saveVoucher({ userId, file: req.file, unified });
    } else if (vid) {
      const v = await get(`SELECT id, unified_json FROM vouchers WHERE id = ? AND user_id = ?`, [vid, userId]);
      if (!v) return res.status(404).json({ error: 'voucher não encontrado' });
      unified = parse(v.unified_json);
      if (!unified) return res.status(500).json({ error: 'voucher corrompido' });
      voucherId = v.id;
    } else {
      return res.status(400).json({ error: 'envie um arquivo ou voucher_id' });
    }
    const r = await run(
      `INSERT INTO flight_changes (user_id, old_voucher_id, client_name, locator, old_json) VALUES (?, ?, ?, ?, ?)`,
      [userId, voucherId, unified.passengers?.[0]?.name || null, unified.reservation?.locator || null, JSON.stringify(unified)]);
    res.status(201).json(await detail(await own(r.lastID, userId)));
  } catch (e) { fail(res, e); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    res.json(await detail(row));
  } catch (e) { fail(res, e); }
});

router.post('/:id/notice-sent', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (row.status === 'aviso_pendente') {
      await run(`UPDATE flight_changes SET status='aviso_enviado', notice_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [row.id]);
    }
    res.json(await detail(await own(row.id, req.session.userId)));
  } catch (e) { fail(res, e); }
});

router.post('/:id/new-voucher', upload.single('file'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (row.status === 'confirmado') return res.status(409).json({ error: 'caso já confirmado' });
    if (!req.file) return res.status(400).json({ error: 'arquivo obrigatório (campo "file")' });
    const unified = await extractAndValidate(req.file);
    const newId = await saveVoucher({ userId, file: req.file, unified });
    const diff = diffVouchers(parse(row.old_json), unified);
    await run(`UPDATE flight_changes SET new_voucher_id=?, new_json=?, diff_json=?, updated_at=datetime('now') WHERE id=?`,
      [newId, JSON.stringify(unified), JSON.stringify(diff), row.id]);
    res.json(await detail(await own(row.id, userId)));
  } catch (e) { fail(res, e); }
});

router.put('/:id/new', async (req, res) => {
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (!row.new_json) return res.status(409).json({ error: 'sem voucher novo' });
    if (row.status === 'confirmado') return res.status(409).json({ error: 'caso já confirmado' });
    const unified = req.body && req.body.unified;
    const atual = parse(row.new_json);
    if (unified && typeof unified === 'object' && !unified.meta) unified.meta = atual.meta;   // meta não é editável
    const v = validate(unified);
    if (!v.ok) return res.status(422).json({ error: 'dados inválidos', details: v.errors });
    unified.meta = { ...atual.meta, ...unified.meta };
    const diff = diffVouchers(parse(row.old_json), unified);
    await run(`UPDATE flight_changes SET new_json=?, diff_json=?, updated_at=datetime('now') WHERE id=?`,
      [JSON.stringify(unified), JSON.stringify(diff), row.id]);
    // O PDF enviado por e-mail é renderizado a partir da linha em `vouchers`: mantém em sincronia.
    if (row.new_voucher_id) {
      await run(`UPDATE vouchers SET unified_json=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
        [JSON.stringify(unified), row.new_voucher_id, userId]);
    }
    res.json(await detail(await own(row.id, userId)));
  } catch (e) { fail(res, e); }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    const row = await own(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    if (!row.new_json) return res.status(409).json({ error: 'sem_voucher_novo' });
    const diff = diffVouchers(parse(row.old_json), parse(row.new_json));
    if (!diff.hasChanges) return res.status(409).json({ error: 'nada_mudou' });
    if (row.status !== 'confirmado') {
      await run(`UPDATE flight_changes SET status='confirmado', confirmed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [row.id]);
    }
    res.json(await detail(await own(row.id, req.session.userId), { emailSent: !!(req.body && req.body.emailSent) }));
  } catch (e) { fail(res, e); }
});

router.post('/:id/send-email', async (req, res) => {
  let raw = req.body && req.body.emails;
  if (Array.isArray(raw)) raw = raw.join(',');
  if (typeof raw !== 'string' || !raw.trim()) return res.status(400).json({ error: 'destinatários obrigatórios' });
  const emails = Array.from(new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)));
  if (!emails.length || emails.some(e => !EMAIL_RE.test(e))) return res.status(400).json({ error: 'e-mail inválido' });
  const kind = req.body && req.body.kind;
  if (kind !== 'aviso' && kind !== 'confirmacao') return res.status(400).json({ error: 'kind deve ser "aviso" ou "confirmacao"' });

  let pdfPath = null;
  try {
    const userId = req.session.userId;
    const row = await own(req.params.id, userId);
    if (!row) return res.status(404).json({ error: 'não encontrado' });
    const bcc = process.env.EMAIL_USER || null;
    let result;
    if (kind === 'aviso') {
      result = await sendNoticeEmail({ to: emails, bcc, voucher: parse(row.old_json), supportPhone: await supportPhone() });
    } else {
      if (!row.new_json || !row.new_voucher_id) return res.status(409).json({ error: 'sem_voucher_novo' });
      const novo = parse(row.new_json);
      const diff = diffVouchers(parse(row.old_json), novo);
      if (!diff.hasChanges) return res.status(409).json({ error: 'nada_mudou' });
      const settings = (await get(`SELECT contact_phone, contact_email, contact_site, contact_extra FROM voucher_settings WHERE id = 1`, [])) || {};
      const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      pdfPath = await renderVoucher({ voucherId: row.new_voucher_id, format: 'pdf', cookieHeader: req.headers.cookie, baseUrl });
      result = await sendVoucherEmail({
        to: emails, bcc, voucherData: novo, settings, attachmentPath: pdfPath,
        subject: 'Seu voo foi reajustado ✈️ Novo voucher em anexo',
        customMessage: buildConfirmationText(novo, diff, { emailSent: true }).replace(/\*/g, '')
      });
    }
    if (!result.sucesso) return res.status(500).json({ error: 'falha ao enviar e-mail', details: result.erro });
    res.json({ sent: emails.length, messageId: result.messageId, subject: result.subject });
  } catch (e) { fail(res, e); }
  finally { if (pdfPath) fs.unlink(pdfPath, () => {}); }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await run(`DELETE FROM flight_changes WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId]);
    if (!r.changes) return res.status(404).json({ error: 'não encontrado' });
    res.status(204).end();
  } catch (e) { fail(res, e); }
});

module.exports = router;
```

- [ ] **Step 8: Montar em `server.js`** — `const flightChangesRouter = require('./routes/flightChanges');` junto dos outros `require`, e `app.use('/api/flight-changes', flightChangesRouter);` logo após a linha de `/api/boarding-passes`.

- [ ] **Step 9: Rodar** `cd backend && npx jest __tests__/routes-flightChanges.test.js __tests__/routes-vouchers.test.js --runInBand` → PASS (os de vouchers são regressão do `sendVoucherEmail`).

- [ ] **Step 10: Sabotagem** — remover `AND user_id = ?` da função `own()`: o teste de isolamento deve FALHAR. Reverter.

- [ ] **Step 11: Commit**

```bash
git add backend/database.js backend/helpers/voucherStore.js backend/services/flightChangeEmail.js backend/services/notifier.js backend/routes/flightChanges.js backend/server.js backend/__tests__/testApp.js backend/__tests__/routes-flightChanges.test.js
git commit -m "feat(alteracao-voo): tabela, rotas e e-mails de aviso/confirmação"
```

---

## Task 5: Frontend — cliente e aba "Alterações"

**Files:**
- Create: `frontend/src/api/flightChangeClient.js`
- Create: `frontend/src/components/FlightChangesTab.jsx`
- Modify: `frontend/src/App.jsx` (import, item em `TABS`, render)

Antes de escrever, ler `BoardingPassesTab.jsx` e `VouchersTab.jsx` para copiar o padrão de lista/cartões, `showToast(msg, tipo)`, classes Tailwind e modo escuro; e `App.jsx` (linhas 25-35 e 100-110) para o formato de `TABS`.

- [ ] **Step 1: Cliente** `frontend/src/api/flightChangeClient.js`:

```js
import api from '../hooks/useApi';

const BASE = '/api/flight-changes';
const form = (file) => { const fd = new FormData(); fd.append('file', file); return fd; };

export const errorMessage = (err) => err?.response?.data?.error || err?.message || 'Erro inesperado';
export const list = () => api.get(BASE).then(r => r.data);
export const get = (id) => api.get(`${BASE}/${id}`).then(r => r.data);
export const createFromFile = (file) => api.post(BASE, form(file)).then(r => r.data);
export const createFromVoucher = (voucher_id) => api.post(BASE, { voucher_id }).then(r => r.data);
export const markNoticeSent = (id) => api.post(`${BASE}/${id}/notice-sent`).then(r => r.data);
export const uploadNewVoucher = (id, file) => api.post(`${BASE}/${id}/new-voucher`, form(file)).then(r => r.data);
export const saveNew = (id, unified) => api.put(`${BASE}/${id}/new`, { unified }).then(r => r.data);
export const confirm = (id, emailSent) => api.post(`${BASE}/${id}/confirm`, { emailSent }).then(r => r.data);
export const sendEmail = (id, kind, emails) => api.post(`${BASE}/${id}/send-email`, { kind, emails }).then(r => r.data);
export const remove = (id) => api.delete(`${BASE}/${id}`);
export const voucherList = () => api.get('/api/vouchers').then(r => r.data);
```

(Conferir antes o shape de `GET /api/vouchers` em `routes/vouchers.js:159` para montar o `<select>` de vouchers salvos.)

- [ ] **Step 2: Aba `FlightChangesTab.jsx`** — componente com estes pedaços (se o arquivo passar de ~400 linhas, separar `FlightDiffView` e `UploadZone` em `components/flight-changes/`):
  1. **Lista (coluna esquerda):** `list()` ao montar; badge por status (`aviso_pendente` âmbar "Aviso pendente", `aviso_enviado` azul "Aviso enviado", `confirmado` verde "Confirmado"); cada item mostra `client_name`, `locator` e data; botão "Nova alteração"; lixeira com `window.confirm` antes de `remove`.
  2. **Nova alteração:** duas opções — selecionar voucher salvo (`voucherList()`, `<select>` com "LOCALIZADOR — passageiro") ou `UploadZone`. Cria via `createFromVoucher`/`createFromFile` e abre o caso. Durante a requisição mostrar "Lendo o voucher…" (a extração leva alguns segundos); em erro, `showToast(errorMessage(e), 'error')`.
  3. **`UploadZone`:** `<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp">`, arrastar-e-soltar (`onDragOver`/`onDrop`) e `onPaste` (lê `clipboardData.files[0]`). Texto: "Clique, arraste ou cole (Ctrl+V) o voucher — PDF ou imagem". Rejeitar tipo diferente com toast.
  4. **Caso aberto, passo 1 — Aviso:** resumo do voucher antigo (cliente, localizador, rota, trechos); `messages.notice` em `<textarea readOnly>`; botões "Copiar" (`navigator.clipboard.writeText`) e "Abrir no WhatsApp" (`https://wa.me/?text=` + `encodeURIComponent(texto)`); campo de e-mails + "Enviar e-mail do aviso" (`sendEmail(id,'aviso',emails)`); botão "Marcar aviso como enviado" (`markNoticeSent`). Se `support_phone` vazio, mostrar: "Configure o telefone de contato em Vouchers → Configurações para incluir o botão de WhatsApp."
  5. **Caso aberto, passo 2 — Confirmação:** habilitado quando `status !== 'aviso_pendente'` ou ao clicar em "Pular aviso (cliente já avisado)". `UploadZone` para o voucher novo (`uploadNewVoucher`). Depois do upload, `FlightDiffView` mostra cada trecho (`igual` cinza discreto; `alterado` âmbar com `antes` riscado → `depois`; `novo` verde; `removido` vermelho), localizador alterado, passageiros e bagagem. Se `!diff.hasChanges`: faixa amarela "Nenhuma diferença encontrada entre os vouchers" e botões de gerar/confirmar desabilitados.
  6. **Correção manual:** botão "Corrigir dados lidos" abre mini-formulário por trecho (campos `departure.datetime`, `arrival.datetime`, `flightNumber`, `departure.airport`, `arrival.airport`; `<input type="datetime-local">` convertido para ISO com sufixo `-03:00`), salva com `saveNew` e atualiza diff e mensagens.
  7. **Saída da confirmação:** `messages.confirmation` em `<textarea readOnly>`; "Copiar"; "Abrir no WhatsApp"; e-mails + "Enviar e-mail com novo voucher (opcional)" (`sendEmail(id,'confirmacao',emails)`; em sucesso guardar `emailSent=true` no estado e regenerar a mensagem via `get(id)`/`confirm`); botão "Confirmar alteração" → `confirm(id, emailSent)`; ao concluir o badge vira "Confirmado" e a lista recarrega.
  8. **Regras de UI:** tudo em pt-BR; classes `dark:` como nas outras abas; `max-h` + `overflow-y-auto` nos painéis longos; botões com `disabled:opacity-50` durante requisições.

- [ ] **Step 3: Registrar** em `App.jsx`: `import FlightChangesTab from './components/FlightChangesTab';`; item `{ value: 'alteracoes', label: 'Alterações', icon: <RefreshCw className="w-4 h-4" /> }` em `TABS` (importar `RefreshCw` de `lucide-react`); e `{activeTab === 'alteracoes' && <FlightChangesTab showToast={showToast} />}` junto dos outros.

- [ ] **Step 4: Build** — `cd frontend && npm run build` → sem erros.

- [ ] **Step 5: Verificação E2E no navegador** — subir o backend com `EXTRACTION_MODE=stub` e o `npm run dev` do frontend; no navegador da aplicação: criar caso por upload, copiar o aviso, marcar enviado, subir o voucher novo (o stub devolve o mesmo voucher → conferir a faixa "Nenhuma diferença"), corrigir um horário em "Corrigir dados lidos", ver diff e mensagem de confirmação, confirmar e conferir o badge. Tirar capturas do passo 1 e do passo 2 para mostrar ao usuário.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(alteracao-voo): aba Alterações no frontend"
```

---

## Task 6: Verificação final e documentação

- [ ] **Step 1:** `cd backend && npx jest --runInBand` — registrar o resultado. Falhas pré-existentes conhecidas: `auth.test.js` e `users.test.js` (19 testes); qualquer outra falha deve ser investigada.
- [ ] **Step 2:** Atualizar `backend/.env.example` com a nota: o backup agora inclui `promo-backgrounds/` em `backups/fundos-*`; a restauração das fotos é manual (copiar a pasta de volta para `<DB_PATH>/promo-backgrounds/`).
- [ ] **Step 3:** Atualizar o handoff/README existente (procurar por `docs/` ou `HANDOFF*.md`) com uma seção "Aba Alterações de voo".
- [ ] **Step 4:** Commit `docs: nota de backup das fotos e da aba Alterações`.
- [ ] **Step 5:** Usar `superpowers:finishing-a-development-branch`. Não fazer push sem o usuário pedir.
