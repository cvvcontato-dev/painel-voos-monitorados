# Aba Vouchers — MVP (Azul Confirmação v1) — Plano de Implementação

> **Para agentes:** OBRIGATÓRIO usar superpowers:subagent-driven-development (se houver subagents) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Adicionar aba "Vouchers" ao painel atual que recebe um voucher Azul em PDF/imagem, extrai dados via Gemini, permite edição e exporta um PDF/PNG visualmente equivalente com marca d'água e disclaimer.

**Architecture:** Reaproveita 100% da stack atual (Express + sqlite3 + Playwright + Gemini no backend; React 19 + Vite + Tailwind v4 no frontend). Segue o padrão do módulo `promotions` já existente: `geminiExtractor` clona para `voucherExtractor`, `promoRenderer` clona para `voucherRenderer`, rota nova `vouchers.js`. Persistência em 1 tabela única com JSON em `TEXT`. Template como componente React renderizado em rota interna autenticada; Playwright captura essa rota.

**Tech Stack:** Node 20, Express 5, sqlite3 (callback), `@google/generative-ai`, Playwright (Chromium), React 19 JSX, Tailwind v4, react-hook-form, Jest + Supertest.

**Destinatário do voucher:** **cliente final** (passageiro). Logo: marca d'água, disclaimer no rodapé, retenção curta do arquivo original (30 dias), audit log obrigatório.

**Fora de escopo desta Fase 1:** Gol, Latam, múltiplas versões Azul, diff visual automatizado, parser determinístico (heurístico), preview lado-a-lado com o original, histórico/listagem rica de vouchers (só lista mínima funcional).

---

## Decisões fechadas (referência rápida)

| Tema | Decisão |
|---|---|
| Schema canônico | Datetime em ISO (`departure.datetime`); campos derivados de exibição calculados no renderer |
| `layoutVersion` | Enum controlado no backend (`azul.confirmacao.v1`); resposta do Gemini é normalizada/validada contra a lista |
| Persistência | 1 tabela `vouchers` com coluna `unified_json TEXT` |
| Parsing | Gemini multimodal direto (PDF/imagem → JSON canônico). Sem OCR clássico no MVP |
| Template | Componente React em `frontend/src/components/voucher-templates/AzulConfirmacaoV1.jsx`, renderizado na rota autenticada `/voucher-preview/:id`; Playwright (rodando com a sessão de quem disparou) imprime essa rota |
| UI | Tela única `VouchersTab` com upload → editor de campos → preview ao vivo (iframe) → botão exportar |
| Marca d'água | Faixa diagonal "REEMISSÃO — CÓPIA NÃO-OFICIAL" no PDF/PNG, opacidade ~12% |
| Disclaimer | Rodapé fixo: "Documento gerado pela Clube do Voo Viagens. Não substitui o voucher oficial da companhia aérea." |
| Retenção | Arquivo original deletado após 30 dias por job diário; `unified_json` e metadados ficam |
| Audit log | `voucher_audit_log` registra create/update/export com `user_id`, `voucher_id`, `action`, `ts`, `source_file_hash` |
| Autenticação | Rota de preview e exportação exigem sessão válida (mesmo middleware `requireAuth` global já existente) |
| Playwright auth (produção) | **Premissa: app roda atrás de proxy reverso/Coolify.** Plano A: passar `req.headers.cookie` para o `context.addCookies` do Playwright apontando para `PUBLIC_BASE_URL` interno. Plano B aprovado (implementar se Plano A falhar no ambiente real): token assinado HMAC de curta duração (60s, `previewToken` na querystring) validado por middleware dedicado na rota `/voucher-preview/:id`. Decidir Plano A vs B no smoke test da Task 12. |

---

## Estrutura de arquivos

**Criar:**
- `backend/routes/vouchers.js` — rotas CRUD + parse + export
- `backend/services/voucherExtractor.js` — wrapper Gemini multimodal (PDF/imagem → schema canônico)
- `backend/services/voucherNormalizer.js` — normaliza `carrier`/`layoutVersion`, força ISO em datetime, valida enums
- `backend/services/voucherSchema.js` — definição do schema canônico + função `validate(v) → { ok, errors[] }`
- `backend/services/voucherRenderer.js` — orquestra Playwright apontando para a rota interna `/voucher-preview/:id`; aplica marca d'água e disclaimer
- `backend/services/voucherRetention.js` — job que deleta arquivos originais com mais de 30 dias
- `backend/helpers/voucherWorkspace.js` — paths de upload/output (espelha `promoWorkspace`)
- `backend/templates/voucher-watermark.css` — CSS injetável para marca d'água/disclaimer no export
- `backend/__tests__/voucherSchema.test.js`
- `backend/__tests__/voucherNormalizer.test.js`
- `backend/__tests__/voucherExtractor.test.js` (stub do Gemini, igual `geminiExtractor.test.js`)
- `backend/__tests__/routes-vouchers.test.js`
- `backend/__tests__/voucherRetention.test.js`
- `frontend/src/components/VouchersTab.jsx`
- `frontend/src/components/voucher-templates/AzulConfirmacaoV1.jsx`
- `frontend/src/components/VoucherPreviewPage.jsx` — página standalone consumida pelo Playwright (rota `/voucher-preview/:id`)
- `frontend/src/api/voucherClient.js`

**Modificar:**
- `backend/database.js` — adicionar `CREATE TABLE` para `vouchers` e `voucher_audit_log` no bloco de migrations
- `backend/server.js` — montar `app.use('/api/vouchers', vouchersRouter)` e iniciar `voucherRetention.startJob()`
- `backend/services/scheduler.js` — registrar job de retenção (ou usar cron próprio do módulo, ver Task 11)
- `frontend/src/App.jsx` — adicionar aba "Vouchers" + rota de preview standalone
- `frontend/src/components/Tabs.jsx` — adicionar entrada "Vouchers"

---

## Schema canônico v1 (referência usada por várias tasks)

```js
// backend/services/voucherSchema.js — forma esperada
{
  carrier: 'azul',                          // enum: ['azul','gol','latam']
  layoutVersion: 'azul.confirmacao.v1',     // enum controlado
  reservation: {
    locator: 'ABC123',
    status: 'Confirmada',
    summaryText: null
  },
  route: { origin: 'GRU', destination: 'REC' },
  passengers: [
    { order: 1, name: 'JOAO SILVA', type: 'adulto', documento: null, loyaltyNumber: null }
  ],
  trips: [
    {
      direction: 'ida',                     // enum: ['ida','volta','multi']
      dateLabel: '12 SET 2026',
      departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
      arrival:   { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' },
      flightNumber: 'AD 4001',
      durationText: '3h15',
      airlineDisplayName: 'Azul Linhas Aéreas',
      status: null
    }
  ],
  baggage: [
    { direction: 'ida', label: 'Bagagem despachada', weightText: '23kg', quantity: 1 }
  ],
  branding: { airlineName: 'Azul', logoUrl: null, primaryColor: '#003DA5' },
  meta: {
    sourceFileHash: 'sha256:...',
    parsedAt: '2026-05-28T14:00:00Z',
    parserVersion: 'gemini-2.0-flash@2026-05',
    confidence: 0.92
  }
}
```

---

## Task 1: Migração do banco

**Files:**
- Modify: `backend/database.js` — adicionar dentro do bloco `runMigrations()` (ou logo após a criação de `flights`)
- Test: `backend/__tests__/voucherSchema.test.js` (a tabela é coberta indiretamente pelo teste de rotas — não há teste unitário de schema SQL no projeto)

- [ ] **Step 1: Adicionar criação das tabelas**

Em `backend/database.js`, após o bloco que cria `flights`, adicionar:

```js
db.run(`CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    carrier TEXT NOT NULL,
    layout_version TEXT NOT NULL,
    source_file_path TEXT,
    source_file_hash TEXT,
    unified_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS voucher_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('create','update','export','delete','retention_cleanup')),
    source_file_hash TEXT,
    details TEXT,
    ts TEXT NOT NULL DEFAULT (datetime('now'))
)`);
```

- [ ] **Step 2: Rodar o servidor e verificar criação**

Run: `cd backend && node -e "require('./database.js')"`
Expected: log `Connected to SQLite database at ...`, sem erros.

- [ ] **Step 3: Commit**

```bash
git add backend/database.js
git commit -m "feat(vouchers): cria tabelas vouchers e voucher_audit_log"
```

---

## Task 2: Schema canônico + validador

**Files:**
- Create: `backend/services/voucherSchema.js`
- Test: `backend/__tests__/voucherSchema.test.js`

- [ ] **Step 1: Escrever testes falhando**

```js
const { validate, LAYOUT_VERSIONS, CARRIERS } = require('../services/voucherSchema');

describe('voucherSchema.validate', () => {
  const valid = {
    carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
    reservation: { locator: 'ABC123', status: 'Confirmada' },
    route: { origin: 'GRU', destination: 'REC' },
    passengers: [{ order: 1, name: 'JOAO', type: 'adulto' }],
    trips: [{
      direction: 'ida', dateLabel: '12 SET 2026',
      departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
      arrival:   { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' },
      flightNumber: 'AD 4001', durationText: '3h15'
    }],
    baggage: [], branding: { airlineName: 'Azul' },
    meta: { parsedAt: '2026-05-28T14:00:00Z', parserVersion: 'x', confidence: 0.9 }
  };

  test('aceita payload válido mínimo', () => {
    expect(validate(valid)).toEqual({ ok: true, errors: [] });
  });

  test('rejeita carrier fora do enum', () => {
    const r = validate({ ...valid, carrier: 'tam' });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('carrier'))).toBe(true);
  });

  test('rejeita layoutVersion fora do enum', () => {
    const r = validate({ ...valid, layoutVersion: 'azul.qualquercoisa' });
    expect(r.ok).toBe(false);
  });

  test('rejeita datetime sem ISO', () => {
    const t = JSON.parse(JSON.stringify(valid));
    t.trips[0].departure.datetime = '12/09/2026 08:30';
    expect(validate(t).ok).toBe(false);
  });

  test('exige pelo menos 1 passenger e 1 trip', () => {
    expect(validate({ ...valid, passengers: [] }).ok).toBe(false);
    expect(validate({ ...valid, trips: [] }).ok).toBe(false);
  });

  test('expõe enums', () => {
    expect(CARRIERS).toContain('azul');
    expect(LAYOUT_VERSIONS).toContain('azul.confirmacao.v1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest voucherSchema -v`
Expected: `Cannot find module '../services/voucherSchema'`

- [ ] **Step 3: Implementar `voucherSchema.js`**

```js
const CARRIERS = ['azul', 'gol', 'latam'];
const LAYOUT_VERSIONS = ['azul.confirmacao.v1'];
const PASSENGER_TYPES = ['adulto', 'crianca', 'bebe'];
const DIRECTIONS = ['ida', 'volta', 'multi'];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;

function validate(v) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  req(v && typeof v === 'object', 'payload deve ser objeto');
  if (!v) return { ok: false, errors };

  req(CARRIERS.includes(v.carrier), `carrier inválido: ${v.carrier}`);
  req(LAYOUT_VERSIONS.includes(v.layoutVersion), `layoutVersion inválido: ${v.layoutVersion}`);
  req(v.reservation && typeof v.reservation.locator === 'string' && v.reservation.locator.length, 'reservation.locator obrigatório');
  req(v.route && typeof v.route.origin === 'string' && typeof v.route.destination === 'string', 'route.origin/destination obrigatórios');

  req(Array.isArray(v.passengers) && v.passengers.length >= 1, 'passengers deve ter ao menos 1');
  (v.passengers || []).forEach((p, i) => {
    req(typeof p.name === 'string' && p.name.length, `passengers[${i}].name obrigatório`);
    req(PASSENGER_TYPES.includes(p.type), `passengers[${i}].type inválido`);
  });

  req(Array.isArray(v.trips) && v.trips.length >= 1, 'trips deve ter ao menos 1');
  (v.trips || []).forEach((t, i) => {
    req(DIRECTIONS.includes(t.direction), `trips[${i}].direction inválido`);
    req(t.departure && ISO_RE.test(t.departure.datetime || ''), `trips[${i}].departure.datetime deve ser ISO`);
    req(t.arrival   && ISO_RE.test(t.arrival.datetime   || ''), `trips[${i}].arrival.datetime deve ser ISO`);
    req(typeof t.flightNumber === 'string' && t.flightNumber.length, `trips[${i}].flightNumber obrigatório`);
  });

  req(v.meta && typeof v.meta.parsedAt === 'string', 'meta.parsedAt obrigatório');
  return { ok: errors.length === 0, errors };
}

module.exports = { validate, CARRIERS, LAYOUT_VERSIONS, PASSENGER_TYPES, DIRECTIONS };
```

- [ ] **Step 4: Rodar testes — devem passar**

Run: `cd backend && npx jest voucherSchema -v`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/services/voucherSchema.js backend/__tests__/voucherSchema.test.js
git commit -m "feat(vouchers): schema canônico v1 + validador"
```

---

## Task 3: Normalizer (saneia resposta do Gemini)

**Files:**
- Create: `backend/services/voucherNormalizer.js`
- Test: `backend/__tests__/voucherNormalizer.test.js`

- [ ] **Step 1: Testes falhando**

```js
const { normalize } = require('../services/voucherNormalizer');

describe('voucherNormalizer.normalize', () => {
  test('força layoutVersion conhecido (string solta vira azul.confirmacao.v1)', () => {
    const out = normalize({ carrier: 'azul', layoutVersion: 'v1', trips: [], passengers: [] });
    expect(out.layoutVersion).toBe('azul.confirmacao.v1');
  });

  test('converte datetime BR para ISO (assume -03:00)', () => {
    const raw = {
      carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
      reservation: { locator: 'X' }, route: { origin: 'GRU', destination: 'REC' },
      passengers: [{ order: 1, name: 'a', type: 'adulto' }],
      trips: [{
        direction: 'ida', dateLabel: '12 SET 2026',
        departure: { airport: 'GRU', datetime: '12/09/2026 08:30' },
        arrival:   { airport: 'REC', datetime: '12/09/2026 11:45' },
        flightNumber: 'AD 4001', durationText: '3h15'
      }],
      baggage: [], branding: { airlineName: 'Azul' }, meta: {}
    };
    const out = normalize(raw);
    expect(out.trips[0].departure.datetime).toBe('2026-09-12T08:30:00-03:00');
    expect(out.trips[0].arrival.datetime).toBe('2026-09-12T11:45:00-03:00');
  });

  test('preenche meta.parsedAt e parserVersion default', () => {
    const out = normalize({ carrier: 'azul', layoutVersion: 'azul.confirmacao.v1', trips: [], passengers: [] });
    expect(out.meta.parsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out.meta.parserVersion).toBeTruthy();
  });

  test('descarta carrier desconhecido (defaulta azul) e loga', () => {
    const out = normalize({ carrier: 'TAM', layoutVersion: 'azul.confirmacao.v1' });
    expect(out.carrier).toBe('azul');
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `cd backend && npx jest voucherNormalizer -v`

- [ ] **Step 3: Implementar**

```js
const { CARRIERS, LAYOUT_VERSIONS } = require('./voucherSchema');

const LAYOUT_ALIASES = {
  'v1': 'azul.confirmacao.v1',
  'azul-confirmacao-v1': 'azul.confirmacao.v1',
  'azul.v1': 'azul.confirmacao.v1'
};

function toISO(dt) {
  if (!dt) return dt;
  if (/^\d{4}-\d{2}-\d{2}T/.test(dt)) return dt;
  // formato BR "DD/MM/YYYY HH:MM"
  const m = dt.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`;
  return dt; // deixa validador rejeitar
}

function normalize(raw = {}) {
  const v = JSON.parse(JSON.stringify(raw || {}));
  v.carrier = CARRIERS.includes(v.carrier) ? v.carrier : 'azul';
  v.layoutVersion = LAYOUT_VERSIONS.includes(v.layoutVersion)
    ? v.layoutVersion
    : (LAYOUT_ALIASES[v.layoutVersion] || 'azul.confirmacao.v1');

  v.passengers = Array.isArray(v.passengers) ? v.passengers : [];
  v.trips = Array.isArray(v.trips) ? v.trips : [];
  v.baggage = Array.isArray(v.baggage) ? v.baggage : [];
  v.branding = v.branding || { airlineName: 'Azul' };
  v.reservation = v.reservation || { locator: '', status: '' };
  v.route = v.route || { origin: '', destination: '' };

  v.trips.forEach(t => {
    if (t.departure) t.departure.datetime = toISO(t.departure.datetime);
    if (t.arrival)   t.arrival.datetime   = toISO(t.arrival.datetime);
  });

  v.meta = {
    parsedAt: new Date().toISOString(),
    parserVersion: 'gemini-2.0-flash@2026-05',
    confidence: 0.85,
    ...(v.meta || {})
  };
  return v;
}

module.exports = { normalize, toISO };
```

- [ ] **Step 4: Testes passam**

Run: `cd backend && npx jest voucherNormalizer -v`

- [ ] **Step 5: Commit**

```bash
git add backend/services/voucherNormalizer.js backend/__tests__/voucherNormalizer.test.js
git commit -m "feat(vouchers): normalizer (enums + ISO datetime + meta defaults)"
```

---

## Task 4: Voucher extractor (Gemini multimodal)

**Files:**
- Create: `backend/services/voucherExtractor.js`
- Test: `backend/__tests__/voucherExtractor.test.js`

Padrão: espelhar `backend/services/geminiExtractor.js` — incluindo STUB para quando `GEMINI_API_KEY` não estiver setada (modo dev/teste).

- [ ] **Step 1: Testes falhando**

```js
const { extractVoucher } = require('../services/voucherExtractor');
const fs = require('fs');
const path = require('path');

describe('voucherExtractor', () => {
  const prev = process.env.GEMINI_API_KEY;
  beforeAll(() => { delete process.env.GEMINI_API_KEY; });
  afterAll(() => { if (prev) process.env.GEMINI_API_KEY = prev; });

  test('sem GEMINI_API_KEY usa STUB e retorna payload válido', async () => {
    const buf = Buffer.from('fake');
    const out = await extractVoucher(buf, 'application/pdf');
    expect(out.carrier).toBe('azul');
    expect(out.layoutVersion).toBe('azul.confirmacao.v1');
    expect(out.passengers.length).toBeGreaterThan(0);
    expect(out.trips.length).toBeGreaterThan(0);
  });

  test('rejeita mimetype não suportado', async () => {
    await expect(extractVoucher(Buffer.from(''), 'text/csv')).rejects.toThrow(/mimetype/i);
  });
});
```

- [ ] **Step 2: Rodar — falha**

- [ ] **Step 3: Implementar**

```js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { normalize } = require('./voucherNormalizer');

const SUPPORTED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const PROMPT = `Você recebe um voucher/comprovante de reserva da AZUL Linhas Aéreas.
Extraia os dados e devolva UM ÚNICO objeto JSON, sem texto extra, com as chaves:

carrier ("azul"), layoutVersion ("azul.confirmacao.v1"),
reservation: { locator, status, summaryText },
route: { origin (IATA 3 letras), destination (IATA) },
passengers: [{ order (1-based), name (MAIÚSCULAS), type ("adulto"|"crianca"|"bebe"), documento, loyaltyNumber }],
trips: [{
  direction ("ida"|"volta"|"multi"), dateLabel (ex.: "12 SET 2026"),
  departure: { airport (IATA), datetime (ISO 8601 com timezone -03:00) },
  arrival:   { airport (IATA), datetime (ISO 8601 com timezone -03:00) },
  flightNumber (ex.: "AD 4001"), durationText (ex.: "3h15"),
  airlineDisplayName, status
}],
baggage: [{ direction ("ida"|"volta"), label, weightText, quantity (número) }],
branding: { airlineName: "Azul", logoUrl: null, primaryColor: "#003DA5" }.

REGRAS:
- Datetimes SEMPRE em ISO 8601 com offset -03:00. Se só houver hora, use a data do trecho.
- IATA sempre 3 letras maiúsculas.
- Se um campo não estiver visível, use null. NÃO invente.
- Não inclua nenhum texto fora do JSON.`;

const STUB = {
  carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
  reservation: { locator: 'STUB01', status: 'Confirmada', summaryText: null },
  route: { origin: 'GRU', destination: 'REC' },
  passengers: [
    { order: 1, name: 'JOAO DA SILVA', type: 'adulto', documento: null, loyaltyNumber: null },
    { order: 2, name: 'MARIA SILVA',   type: 'adulto', documento: null, loyaltyNumber: null }
  ],
  trips: [
    { direction: 'ida', dateLabel: '12 SET 2026',
      departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
      arrival:   { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' },
      flightNumber: 'AD 4001', durationText: '3h15',
      airlineDisplayName: 'Azul Linhas Aéreas', status: 'Confirmado' },
    { direction: 'volta', dateLabel: '19 SET 2026',
      departure: { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' },
      arrival:   { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' },
      flightNumber: 'AD 4002', durationText: '3h30',
      airlineDisplayName: 'Azul Linhas Aéreas', status: 'Confirmado' }
  ],
  baggage: [
    { direction: 'ida',   label: 'Bagagem despachada', weightText: '23kg', quantity: 1 },
    { direction: 'volta', label: 'Bagagem despachada', weightText: '23kg', quantity: 1 }
  ],
  branding: { airlineName: 'Azul', logoUrl: null, primaryColor: '#003DA5' }
};

async function extractVoucher(buffer, mimetype) {
  if (!SUPPORTED.includes(mimetype)) {
    throw new Error(`mimetype não suportado: ${mimetype}`);
  }
  if (!process.env.GEMINI_API_KEY) {
    return normalize(STUB);
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const part = { inlineData: { data: buffer.toString('base64'), mimeType: mimetype } };
  const result = await model.generateContent([PROMPT, part]);
  const text = result.response.text().trim().replace(/^```json\s*|\s*```$/g, '');
  const parsed = JSON.parse(text);
  return normalize(parsed);
}

module.exports = { extractVoucher, STUB };
```

- [ ] **Step 4: Testes passam**

- [ ] **Step 5: Commit**

```bash
git add backend/services/voucherExtractor.js backend/__tests__/voucherExtractor.test.js
git commit -m "feat(vouchers): extrator Gemini multimodal com STUB de dev"
```

---

## Task 5: Workspace helper

**Files:**
- Create: `backend/helpers/voucherWorkspace.js`

Espelha `backend/helpers/promoWorkspace.js`. Resolve paths para `DB_PATH/voucher-uploads/` e `DB_PATH/voucher-exports/`.

- [ ] **Step 1: Implementar (sem teste — é só path helpers, coberto indiretamente em routes)**

```js
const path = require('path');
const fs = require('fs');

function root() {
  return process.env.DB_PATH || path.resolve(__dirname, '..');
}
function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }

const uploadsDir = () => ensure(path.join(root(), 'voucher-uploads'));
const exportsDir = () => ensure(path.join(root(), 'voucher-exports'));

module.exports = { uploadsDir, exportsDir };
```

- [ ] **Step 2: Commit**

```bash
git add backend/helpers/voucherWorkspace.js
git commit -m "feat(vouchers): workspace helper (uploads/exports dirs)"
```

---

## Task 6: Rotas — POST /api/vouchers (upload+parse), GET, PUT, DELETE

**Files:**
- Create: `backend/routes/vouchers.js`
- Test: `backend/__tests__/routes-vouchers.test.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Testes falhando**

Usar o helper existente `backend/__tests__/testApp.js`. **API real do helper** (verificada): exporta `{ makeApp, makeAuthApp, makePromoApp, getCsrfFromResponse, waitForDb }`. Não há `loginAs` — login é manual via `POST /api/auth/login` com `supertest.agent`. Há CSRF em todas as rotas `/api`.

**Pré-requisito:** estender `testApp.js` adicionando `makeVoucherApp()` (espelhar `makePromoApp` linha 54). Isso é um sub-step antes dos testes:

```js
// adicionar em backend/__tests__/testApp.js
function makeVoucherApp() {
  // copiar estrutura de makePromoApp(), trocando o router montado por:
  //   const vouchersRouter = require('../routes/vouchers');
  //   app.use('/api/vouchers', vouchersRouter);
  // manter session + csrf + auth iguais ao makePromoApp
}
module.exports = { makeApp, makeAuthApp, makePromoApp, makeVoucherApp, getCsrfFromResponse, waitForDb };
```

```js
process.env.EXTRACTION_MODE = 'stub';        // se vier a ser usado
delete process.env.GEMINI_API_KEY;            // garante STUB do extractor
const request = require('supertest');
const { makeVoucherApp, waitForDb, getCsrfFromResponse } = require('./testApp');

let app;
beforeAll(async () => { app = makeVoucherApp(); await waitForDb(); });

async function authed() {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf').then(getCsrfFromResponse);
  await agent.post('/api/auth/login').set('x-csrf-token', csrf).send({ email: 'admin@test.com', password: 'AdminPass123!' });
  return { agent, csrf };
}

describe('routes /api/vouchers', () => {
  let agent, csrf;
  beforeEach(async () => { ({ agent, csrf } = await authed()); });

  test('POST /api/vouchers com arquivo cria voucher e registra audit log', async () => {
    const fakePdf = Buffer.from('%PDF-1.4\n%fake');
    const r = await agent
      .post('/api/vouchers')
      .set('x-csrf-token', csrf)
      .attach('file', fakePdf, { filename: 'azul.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeGreaterThan(0);
    expect(r.body.unified.carrier).toBe('azul');
    expect(r.body.unified.layoutVersion).toBe('azul.confirmacao.v1');
  });

  test('POST sem arquivo retorna 400', async () => {
    const r = await agent.post('/api/vouchers').set('x-csrf-token', csrf);
    expect(r.status).toBe(400);
  });

  test('GET /api/vouchers lista vouchers do usuário', async () => {
    const r = await agent.get('/api/vouchers');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  test('PUT /api/vouchers/:id atualiza unified e valida schema', async () => {
    const created = await agent.post('/api/vouchers').set('x-csrf-token', csrf)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });
    const id = created.body.id;
    const updated = { ...created.body.unified, reservation: { ...created.body.unified.reservation, locator: 'NOVO99' } };
    const r = await agent.put(`/api/vouchers/${id}`).set('x-csrf-token', csrf).send({ unified: updated });
    expect(r.status).toBe(200);
    expect(r.body.unified.reservation.locator).toBe('NOVO99');
  });

  test('PUT com unified inválido retorna 422', async () => {
    const created = await agent.post('/api/vouchers').set('x-csrf-token', csrf)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });
    const r = await agent.put(`/api/vouchers/${created.body.id}`).set('x-csrf-token', csrf).send({ unified: { carrier: 'tam' } });
    expect(r.status).toBe(422);
  });
});
```

- [ ] **Step 2: Rodar — falha**

- [ ] **Step 3: Implementar `backend/routes/vouchers.js`**

```js
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { extractVoucher } = require('../services/voucherExtractor');
const { validate } = require('../services/voucherSchema');
const { normalize } = require('../services/voucherNormalizer');
const { uploadsDir } = require('../helpers/voucherWorkspace');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function audit(voucherId, userId, action, details, sourceHash) {
  db.run(
    `INSERT INTO voucher_audit_log (voucher_id, user_id, action, source_file_hash, details) VALUES (?, ?, ?, ?, ?)`,
    [voucherId, userId, action, sourceHash || null, details ? JSON.stringify(details) : null]
  );
}

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo obrigatório (campo "file")' });
  try {
    const unified = await extractVoucher(req.file.buffer, req.file.mimetype);
    const v = validate(unified);
    if (!v.ok) return res.status(422).json({ error: 'schema inválido após extração', details: v.errors });

    const hash = 'sha256:' + crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    unified.meta.sourceFileHash = hash;
    const filename = `${Date.now()}-${hash.slice(7, 19)}${path.extname(req.file.originalname) || ''}`;
    const filePath = path.join(uploadsDir(), filename);
    fs.writeFileSync(filePath, req.file.buffer);

    db.run(
      `INSERT INTO vouchers (user_id, carrier, layout_version, source_file_path, source_file_hash, unified_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.user.id, unified.carrier, unified.layoutVersion, filePath, hash, JSON.stringify(unified)],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        audit(this.lastID, req.session.user.id, 'create', { filename: req.file.originalname }, hash);
        res.status(201).json({ id: this.lastID, unified });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', (req, res) => {
  db.all(
    `SELECT id, carrier, layout_version, created_at, updated_at FROM vouchers WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
    [req.session.user.id],
    (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

router.get('/:id', (req, res) => {
  db.get(
    `SELECT * FROM vouchers WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'não encontrado' });
      row.unified = JSON.parse(row.unified_json);
      delete row.unified_json;
      res.json(row);
    }
  );
});

router.put('/:id', (req, res) => {
  const unified = req.body && req.body.unified;
  if (!unified) return res.status(400).json({ error: 'campo "unified" obrigatório' });
  const norm = normalize(unified);
  const v = validate(norm);
  if (!v.ok) return res.status(422).json({ error: 'schema inválido', details: v.errors });
  db.run(
    `UPDATE vouchers SET unified_json = ?, layout_version = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
    [JSON.stringify(norm), norm.layoutVersion, req.params.id, req.session.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'não encontrado' });
      audit(req.params.id, req.session.user.id, 'update', null, null);
      res.json({ id: Number(req.params.id), unified: norm });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.get(`SELECT source_file_path FROM vouchers WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.user.id], (err, row) => {
      if (err || !row) return res.status(404).json({ error: 'não encontrado' });
      try { if (row.source_file_path && fs.existsSync(row.source_file_path)) fs.unlinkSync(row.source_file_path); } catch (_) {}
      db.run(`DELETE FROM vouchers WHERE id = ?`, [req.params.id], () => {
        audit(req.params.id, req.session.user.id, 'delete', null, null);
        res.status(204).end();
      });
    });
});

module.exports = router;
```

- [ ] **Step 4: Montar rota em `backend/server.js`**

Adicionar junto com os demais routers (após `promotionsRouter`):

```js
const vouchersRouter = require('./routes/vouchers');
// ...
app.use('/api/vouchers', vouchersRouter);
```

- [ ] **Step 5: Testes passam**

Run: `cd backend && npx jest routes-vouchers -v`

- [ ] **Step 6: Commit**

```bash
git add backend/routes/vouchers.js backend/server.js backend/__tests__/routes-vouchers.test.js
git commit -m "feat(vouchers): rotas CRUD com upload, parse e audit log"
```

---

## Task 7: Componente React `AzulConfirmacaoV1`

**Files:**
- Create: `frontend/src/components/voucher-templates/AzulConfirmacaoV1.jsx`

Componente puro, recebe `data: UnifiedVoucher`, renderiza em formato A4 (`794x1123` px @ 96dpi). Layout aproximado do voucher Azul: header azul-marinho com logo, bloco de reserva (localizador grande), grade de passageiros, blocos de trecho (ida/volta) com horários e aeroportos, bloco de bagagens.

- [ ] **Step 1: Esqueleto + estilos inline (Tailwind v4) — entregar fidelidade "visualmente equivalente", não pixel-perfect**

```jsx
import React from 'react';

const AZUL = '#003DA5';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function AzulConfirmacaoV1({ data }) {
  if (!data) return null;
  const trips = data.trips || [];
  const baggage = data.baggage || [];
  return (
    <div style={{ width: 794, minHeight: 1123, fontFamily: 'Arial, sans-serif', color: '#222', background: '#fff' }}>
      <header style={{ background: AZUL, color: 'white', padding: '24px 32px' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{data.branding?.airlineName || 'Azul'}</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>Confirmação de Reserva</div>
      </header>

      <section style={{ padding: '24px 32px', borderBottom: '1px solid #ddd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: '#666' }}>LOCALIZADOR</div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>{data.reservation?.locator}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#666' }}>STATUS</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: AZUL }}>{data.reservation?.status}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {data.route?.origin} → {data.route?.destination}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '20px 32px', borderBottom: '1px solid #ddd' }}>
        <h3 style={{ fontSize: 14, color: AZUL, margin: '0 0 12px' }}>Passageiros</h3>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {(data.passengers || []).map(p => (
              <tr key={p.order} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '6px 0', width: 30, color: '#888' }}>{p.order}</td>
                <td style={{ padding: '6px 0', fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: '6px 0', textTransform: 'capitalize', color: '#666' }}>{p.type}</td>
                <td style={{ padding: '6px 0', color: '#666' }}>{p.documento || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {trips.map((t, i) => (
        <section key={i} style={{ padding: '20px 32px', borderBottom: '1px solid #ddd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, color: AZUL, margin: 0, textTransform: 'capitalize' }}>{t.direction}</h3>
            <div style={{ fontSize: 12, color: '#666' }}>{t.dateLabel} · Voo {t.flightNumber}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtTime(t.departure?.datetime)}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{t.departure?.airport}</div>
            </div>
            <div style={{ flex: 1, padding: '0 24px', textAlign: 'center', color: '#888', fontSize: 12 }}>
              ── {t.durationText} ──
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtTime(t.arrival?.datetime)}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{t.arrival?.airport}</div>
            </div>
          </div>
        </section>
      ))}

      {baggage.length > 0 && (
        <section style={{ padding: '20px 32px' }}>
          <h3 style={{ fontSize: 14, color: AZUL, margin: '0 0 12px' }}>Bagagens</h3>
          <ul style={{ fontSize: 13, paddingLeft: 20, margin: 0 }}>
            {baggage.map((b, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <strong style={{ textTransform: 'capitalize' }}>{b.direction}:</strong> {b.quantity}× {b.label} {b.weightText ? `(${b.weightText})` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar visualmente — rodar dev server**

Run: `cd frontend && npm run dev`
Abrir manualmente uma rota com dados STUB (Task 9 cria a rota de preview; aqui só importar e renderizar com dados mockados na `App.jsx` temporariamente).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/voucher-templates/AzulConfirmacaoV1.jsx
git commit -m "feat(vouchers): template React AzulConfirmacaoV1"
```

---

## Task 8: Página de preview standalone + rota frontend

**Files:**
- Create: `frontend/src/components/VoucherPreviewPage.jsx`
- Create: `frontend/src/api/voucherClient.js`
- Modify: `frontend/src/App.jsx`

A rota `/voucher-preview/:id` é consumida tanto pelo iframe do editor (no app) quanto pelo Playwright. Detecta `?export=1` na query string para esconder bordas/padding da app e aplicar CSS de export.

- [ ] **Step 1: `voucherClient.js`**

Espelhar `promoClient.js`:

```js
import axios from 'axios';
const api = axios.create({ baseURL: '/api/vouchers', withCredentials: true });
export const list = () => api.get('/').then(r => r.data);
export const get = (id) => api.get(`/${id}`).then(r => r.data);
export const upload = (file) => {
  const fd = new FormData(); fd.append('file', file);
  return api.post('/', fd).then(r => r.data);
};
export const update = (id, unified) => api.put(`/${id}`, { unified }).then(r => r.data);
export const remove = (id) => api.delete(`/${id}`);
export const exportUrl = (id, format) => `/api/vouchers/${id}/export?format=${format}`;
```

- [ ] **Step 2: `VoucherPreviewPage.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import AzulConfirmacaoV1 from './voucher-templates/AzulConfirmacaoV1';
import * as api from '../api/voucherClient';

const TEMPLATES = { 'azul.confirmacao.v1': AzulConfirmacaoV1 };

export default function VoucherPreviewPage({ id, isExport }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(id).then(v => setData(v.unified)).catch(e => setErr(e.message)); }, [id]);
  if (err) return <div style={{ padding: 20, color: 'red' }}>{err}</div>;
  if (!data) return <div style={{ padding: 20 }}>Carregando…</div>;
  const Tpl = TEMPLATES[data.layoutVersion];
  if (!Tpl) return <div>Template {data.layoutVersion} não encontrado</div>;
  return (
    <div style={{ background: isExport ? '#fff' : '#eee', minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: isExport ? 0 : 20 }}>
      <Tpl data={data} />
    </div>
  );
}
```

- [ ] **Step 3: Rotear em `App.jsx`**

Adicionar antes do layout principal (parse simples de pathname, mantendo padrão de SPA sem react-router):

```jsx
// pseudo: dentro de App.jsx
const m = window.location.pathname.match(/^\/voucher-preview\/(\d+)/);
if (m) {
  const isExport = new URLSearchParams(window.location.search).get('export') === '1';
  return <VoucherPreviewPage id={m[1]} isExport={isExport} />;
}
```

- [ ] **Step 3b: Garantir SPA fallback para `/voucher-preview/*`**

Em **dev** (Vite serve o frontend): Vite já faz history fallback por padrão para `index.html` — verificar se `frontend/vite.config.js` não tem regra customizada que quebre isso. Se quebrar, adicionar `appType: 'spa'` (já é default no Vite 8, mas explicitar não machuca).

Em **produção** (Express serve `frontend/dist`): conferir no `backend/server.js` se existe rota catch-all do tipo `app.get('*', (req, res) => res.sendFile('index.html'))` ou equivalente. Se não existir, adicionar — caso contrário Playwright vai bater em 404 ao abrir `/voucher-preview/:id`. Esse fallback deve **excluir** rotas `/api/*` (manter ordem: API routers primeiro, catch-all por último).

**Não pular este step.** Se o fallback não existir, todo o pipeline de export quebra silenciosamente em produção.

- [ ] **Step 4: Verificar**

`npm run dev`, fazer upload via curl ou frontend (Task 10), navegar a `/voucher-preview/1`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/voucherClient.js frontend/src/components/VoucherPreviewPage.jsx frontend/src/App.jsx
git commit -m "feat(vouchers): página de preview standalone + client API"
```

---

## Task 9: Renderer Playwright + rota /export (com marca d'água e disclaimer)

**Files:**
- Create: `backend/services/voucherRenderer.js`
- Modify: `backend/routes/vouchers.js` (adicionar `GET /:id/export?format=pdf|png`)

Estratégia: Playwright abre `http://localhost:PORT/voucher-preview/:id?export=1`, autenticando via cookie de sessão do request (passar `req.headers.cookie` para `context.addCookies`). Injeta CSS extra com marca d'água diagonal + disclaimer fixo no rodapé, depois `page.pdf()` ou `page.screenshot()`.

- [ ] **Step 1: Implementar renderer**

```js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { exportsDir } = require('../helpers/voucherWorkspace');

const WATERMARK_CSS = `
  body::before {
    content: "REEMISSÃO — CÓPIA NÃO-OFICIAL";
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 64px; font-weight: 800; color: rgba(200, 0, 0, 0.12);
    pointer-events: none; z-index: 9999; white-space: nowrap;
  }
  body::after {
    content: "Documento gerado pela Clube do Voo Viagens. Não substitui o voucher oficial da companhia aérea.";
    position: fixed; bottom: 8px; left: 0; right: 0;
    text-align: center; font-size: 9px; color: #666; font-family: Arial, sans-serif;
  }
`;

async function renderVoucher({ voucherId, format, cookieHeader, baseUrl }) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1200 } });
    if (cookieHeader) {
      const url = new URL(baseUrl);
      const cookies = cookieHeader.split(';').map(c => {
        const [name, ...rest] = c.trim().split('=');
        return { name, value: rest.join('='), domain: url.hostname, path: '/' };
      }).filter(c => c.name);
      await context.addCookies(cookies);
    }
    const page = await context.newPage();
    await page.goto(`${baseUrl}/voucher-preview/${voucherId}?export=1`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: WATERMARK_CSS });

    const outName = `voucher-${voucherId}-${Date.now()}.${format}`;
    const outPath = path.join(exportsDir(), outName);
    if (format === 'pdf') {
      await page.pdf({ path: outPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    } else if (format === 'png') {
      await page.screenshot({ path: outPath, fullPage: true });
    } else {
      throw new Error('format deve ser pdf ou png');
    }
    return outPath;
  } finally {
    await browser.close();
  }
}

module.exports = { renderVoucher };
```

- [ ] **Step 2: Adicionar rota em `vouchers.js`**

```js
const { renderVoucher } = require('../services/voucherRenderer');

router.get('/:id/export', async (req, res) => {
  const format = (req.query.format || 'pdf').toLowerCase();
  if (!['pdf', 'png'].includes(format)) return res.status(400).json({ error: 'format inválido' });
  db.get(`SELECT id FROM vouchers WHERE id = ? AND user_id = ?`, [req.params.id, req.session.user.id], async (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'não encontrado' });
    try {
      const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const outPath = await renderVoucher({
        voucherId: req.params.id, format,
        cookieHeader: req.headers.cookie, baseUrl
      });
      audit(req.params.id, req.session.user.id, 'export', { format }, null);
      res.download(outPath);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});
```

**Atenção:** em produção (Coolify/Docker) o frontend é servido pelo mesmo container ou por proxy reverso. Se o frontend roda em outro processo (Vite dev), exportação local funciona apontando `PUBLIC_BASE_URL=http://localhost:5173` no `.env` durante desenvolvimento. Em produção, depois do `npm run build`, configurar Express pra servir `frontend/dist` (já é o padrão do projeto — verificar `server.js` final).

- [ ] **Step 3: Teste manual ponta-a-ponta**

Subir o app, fazer upload, exportar PDF, abrir e validar marca d'água + disclaimer visíveis.

- [ ] **Step 4: Commit**

```bash
git add backend/services/voucherRenderer.js backend/routes/vouchers.js
git commit -m "feat(vouchers): export PDF/PNG via Playwright com marca d'água e disclaimer"
```

---

## Task 10: Aba `VouchersTab` (tela única)

**Files:**
- Create: `frontend/src/components/VouchersTab.jsx`
- Modify: `frontend/src/components/Tabs.jsx`
- Modify: `frontend/src/App.jsx`

Layout: dois painéis lado a lado. Esquerdo = upload + lista de vouchers do usuário + formulário de edição (react-hook-form sobre o JSON canônico, com campos principais expostos: localizador, status, passageiros, trechos, bagagens). Direito = iframe apontando para `/voucher-preview/:id` (atualiza a cada save). Botões: Salvar, Exportar PDF, Exportar PNG, Excluir.

- [ ] **Step 1: Componente** (esqueleto funcional — a forma exata dos inputs pode evoluir; importante é cobrir todos os campos do schema canônico)

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import * as api from '../api/voucherClient';

export default function VouchersTab() {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [current, setCurrent] = useState(null);
  const iframeRef = useRef(null);
  const { register, control, handleSubmit, reset } = useForm();
  const passengers = useFieldArray({ control, name: 'passengers' });
  const trips = useFieldArray({ control, name: 'trips' });

  useEffect(() => { refresh(); }, []);
  async function refresh() { setList(await api.list()); }
  async function select(id) {
    const v = await api.get(id);
    setSelectedId(id); setCurrent(v.unified); reset(v.unified);
  }
  async function onUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const r = await api.upload(file);
    await refresh(); await select(r.id);
  }
  async function onSave(data) {
    const r = await api.update(selectedId, data);
    setCurrent(r.unified);
    if (iframeRef.current) iframeRef.current.src = `/voucher-preview/${selectedId}?ts=${Date.now()}`;
  }
  async function onDelete() {
    if (!selectedId || !confirm('Excluir voucher?')) return;
    await api.remove(selectedId); setSelectedId(null); setCurrent(null); refresh();
  }

  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-1/2 overflow-auto">
        <div className="mb-4">
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={onUpload} />
        </div>
        <div className="mb-4 flex gap-2 flex-wrap">
          {list.map(v => (
            <button key={v.id} onClick={() => select(v.id)}
              className={`px-3 py-1 rounded border ${selectedId === v.id ? 'bg-blue-600 text-white' : 'bg-white'}`}>
              #{v.id} · {v.carrier}
            </button>
          ))}
        </div>
        {current && (
          <form onSubmit={handleSubmit(onSave)} className="space-y-3 text-sm">
            <label className="block">Localizador
              <input {...register('reservation.locator')} className="border w-full px-2 py-1" />
            </label>
            <label className="block">Status
              <input {...register('reservation.status')} className="border w-full px-2 py-1" />
            </label>

            <fieldset className="border p-2">
              <legend className="px-1 font-semibold">Passageiros</legend>
              {passengers.fields.map((f, i) => (
                <div key={f.id} className="flex gap-2 mb-1">
                  <input {...register(`passengers.${i}.order`)} className="border px-2 w-16" type="number" />
                  <input {...register(`passengers.${i}.name`)} className="border px-2 flex-1" />
                  <select {...register(`passengers.${i}.type`)} className="border px-2">
                    <option value="adulto">adulto</option>
                    <option value="crianca">criança</option>
                    <option value="bebe">bebê</option>
                  </select>
                  <button type="button" onClick={() => passengers.remove(i)}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => passengers.append({ order: passengers.fields.length + 1, name: '', type: 'adulto' })}>+ passageiro</button>
            </fieldset>

            <fieldset className="border p-2">
              <legend className="px-1 font-semibold">Trechos</legend>
              {trips.fields.map((f, i) => (
                <div key={f.id} className="border-b py-2 space-y-1">
                  <div className="flex gap-2">
                    <select {...register(`trips.${i}.direction`)} className="border px-2">
                      <option value="ida">ida</option><option value="volta">volta</option><option value="multi">multi</option>
                    </select>
                    <input {...register(`trips.${i}.dateLabel`)} className="border px-2 flex-1" placeholder="12 SET 2026" />
                    <input {...register(`trips.${i}.flightNumber`)} className="border px-2 w-24" placeholder="AD 4001" />
                  </div>
                  <div className="flex gap-2">
                    <input {...register(`trips.${i}.departure.airport`)} className="border px-2 w-20" placeholder="GRU" />
                    <input {...register(`trips.${i}.departure.datetime`)} className="border px-2 flex-1" placeholder="ISO" />
                    <input {...register(`trips.${i}.arrival.airport`)} className="border px-2 w-20" placeholder="REC" />
                    <input {...register(`trips.${i}.arrival.datetime`)} className="border px-2 flex-1" placeholder="ISO" />
                  </div>
                </div>
              ))}
            </fieldset>

            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">Salvar</button>
              <a href={api.exportUrl(selectedId, 'pdf')} className="bg-green-600 text-white px-4 py-1 rounded">Exportar PDF</a>
              <a href={api.exportUrl(selectedId, 'png')} className="bg-green-700 text-white px-4 py-1 rounded">Exportar PNG</a>
              <button type="button" onClick={onDelete} className="bg-red-600 text-white px-4 py-1 rounded ml-auto">Excluir</button>
            </div>
          </form>
        )}
      </div>
      <div className="w-1/2 bg-gray-100">
        {selectedId
          ? <iframe ref={iframeRef} src={`/voucher-preview/${selectedId}`} className="w-full h-full border" />
          : <div className="p-8 text-gray-500">Faça upload de um voucher para começar.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar aba em `Tabs.jsx`** seguindo padrão das abas existentes (verificar conteúdo atual antes de editar).

- [ ] **Step 3: Importar e renderizar em `App.jsx`**, condicionando à aba ativa.

- [ ] **Step 4: Teste de fluxo end-to-end**

Run: `cd backend && npm run dev` em um terminal, `cd frontend && npm run dev` em outro.
Fluxo: login → aba Vouchers → upload PDF → editar localizador → Salvar → confirmar iframe atualizou → Exportar PDF → abrir PDF e validar marca d'água.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/VouchersTab.jsx frontend/src/components/Tabs.jsx frontend/src/App.jsx
git commit -m "feat(vouchers): aba VouchersTab com editor + preview ao vivo + export"
```

---

## Task 11: Job de retenção (LGPD)

**Files:**
- Create: `backend/services/voucherRetention.js`
- Test: `backend/__tests__/voucherRetention.test.js`
- Modify: `backend/server.js`

Job diário (node-cron, já instalado) que: (a) lista `vouchers` com `created_at` > 30 dias e `source_file_path` ainda preenchido; (b) deleta o arquivo físico; (c) limpa o campo no banco; (d) grava `voucher_audit_log` com `action='retention_cleanup'`.

- [ ] **Step 1: Teste**

```js
const fs = require('fs'); const path = require('path'); const os = require('os');
const db = require('../database');
const { runOnce } = require('../services/voucherRetention');

describe('voucherRetention.runOnce', () => {
  test('apaga arquivos de vouchers com mais de 30 dias', async () => {
    // FK ON em database.js — precisamos de um user real. Cria um inline se não existir.
    const userId = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM users LIMIT 1`, (err, row) => {
        if (err) return reject(err);
        if (row) return resolve(row.id);
        db.run(
          `INSERT INTO users (email, password_hash, role) VALUES ('retention@test.com', 'x', 'admin')`,
          function (e) { e ? reject(e) : resolve(this.lastID); }
        );
      });
    });
    const tmp = path.join(os.tmpdir(), `vr-${Date.now()}.pdf`);
    fs.writeFileSync(tmp, 'x');
    await new Promise(r => db.run(
      `INSERT INTO vouchers (user_id, carrier, layout_version, source_file_path, source_file_hash, unified_json, created_at)
       VALUES (?, 'azul','azul.confirmacao.v1', ?, 'h', '{}', datetime('now','-40 days'))`,
      [userId, tmp], r
    ));
    await runOnce();
    expect(fs.existsSync(tmp)).toBe(false);
  });
});
```

- [ ] **Step 2: Implementar**

```js
const fs = require('fs');
const cron = require('node-cron');
const db = require('../database');

const RETENTION_DAYS = Number(process.env.VOUCHER_RETENTION_DAYS || 30);

function runOnce() {
  return new Promise((resolve) => {
    db.all(
      `SELECT id, source_file_path, user_id FROM vouchers
       WHERE source_file_path IS NOT NULL
         AND created_at <= datetime('now', ?)`,
      [`-${RETENTION_DAYS} days`],
      (err, rows) => {
        if (err || !rows?.length) return resolve(0);
        let n = 0;
        rows.forEach(r => {
          try { if (fs.existsSync(r.source_file_path)) fs.unlinkSync(r.source_file_path); } catch (_) {}
          db.run(`UPDATE vouchers SET source_file_path = NULL WHERE id = ?`, [r.id]);
          db.run(
            `INSERT INTO voucher_audit_log (voucher_id, user_id, action, details) VALUES (?, ?, 'retention_cleanup', ?)`,
            [r.id, r.user_id, JSON.stringify({ retentionDays: RETENTION_DAYS })]
          );
          n++;
        });
        resolve(n);
      }
    );
  });
}

function startJob() {
  // todo dia às 03:30
  cron.schedule('30 3 * * *', () => runOnce().then(n => n && console.log(`[voucherRetention] limpou ${n} arquivos`)));
}

module.exports = { runOnce, startJob };
```

- [ ] **Step 3: Iniciar em `server.js`** — junto com os outros schedulers:

```js
const { startJob: startVoucherRetention } = require('./services/voucherRetention');
// ... após app.listen():
startVoucherRetention();
```

- [ ] **Step 4: Testes passam**

- [ ] **Step 5: Commit**

```bash
git add backend/services/voucherRetention.js backend/__tests__/voucherRetention.test.js backend/server.js
git commit -m "feat(vouchers): job de retenção LGPD (30 dias) para arquivos originais"
```

---

## Task 12: Polimento final e documentação operacional

- [ ] **Step 1: Adicionar variáveis ao `.env.example` (se existir) ou documentar no README**

```
GEMINI_API_KEY=
PUBLIC_BASE_URL=http://localhost:3000
VOUCHER_RETENTION_DAYS=30
```

- [ ] **Step 2: Verificar `Dockerfile` copia `backend/voucher-uploads` e `backend/voucher-exports`** ou que `DB_PATH` em produção (volume `/data`) cobre esses diretórios (provavelmente já cobre, pois usam `process.env.DB_PATH`).

- [ ] **Step 3: Rodar suíte completa**

Run: `cd backend && npx jest`
Expected: todos os testes passam, sem regressão em promoções/auth/etc.

- [ ] **Step 4: Smoke test manual ponta-a-ponta**

Checklist:
- [ ] Upload PDF Azul real → JSON populado coerente
- [ ] Editar localizador → preview atualiza
- [ ] Exportar PDF → marca d'água visível, disclaimer no rodapé
- [ ] **Abrir o PDF exportado e CONFIRMAR que o conteúdo do voucher aparece** (não só que o arquivo foi gerado). Se o PDF estiver em branco ou mostrar página de login → **Plano A do Playwright falhou; ativar Plano B (token HMAC) ANTES de prosseguir**. Ver "Decisão arquitetural" na tabela de decisões fechadas.
- [ ] Exportar PNG → idem (checar conteúdo, não só existência do arquivo)
- [ ] Excluir voucher → some da lista e do banco
- [ ] `voucher_audit_log` tem entries `create`, `update`, `export`, `delete`
- [ ] **Em produção (Coolify):** repetir os 4 itens acima no ambiente real. O cookie de sessão em produção tem `Secure` + `SameSite=strict`; se Playwright não conseguir reusar o cookie, ativar Plano B.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore(vouchers): documenta envs e fecha MVP Fase 1 (Azul ConfirmacaoV1)"
```

---

## Riscos conhecidos

1. **Qualidade do Gemini no voucher real Azul** — só dá pra medir com 5–10 vouchers reais. Se vier ruim, refinar o `PROMPT` antes de cogitar parser determinístico.
2. **Autenticação Playwright em produção (Coolify)** — assumido como cenário real. Plano A (cookie de sessão) tem ~70% de chance de funcionar direto; Plano B (token HMAC assinado de 60s na querystring) está pré-aprovado e deve ser implementado imediatamente se o smoke test da Task 12 falhar. Não considerar isso "extra" — é parte do escopo da Fase 1.
3. **Tamanho do PDF de upload** — limite 15MB no multer. PDFs Azul costumam ter <2MB; revisar se reclamarem.
4. **Layout "visualmente equivalente" ≠ pixel-perfect** — decisão consciente. Quando layout estabilizar, adicionar golden masters por screenshot diff (Fase 2 futura).
5. **Disclaimer e marca d'água são gates de produto** — não mexer sem revisar com o dono (você). Removê-los altera o perfil de risco LGPD/uso indevido.
