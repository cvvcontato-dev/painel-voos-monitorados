# Aba "Promoções" — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba "Promoções" ao painel que automatiza a criação de promoções de viagem — do upload do print do pacote à geração da mensagem WhatsApp e da arte PNG com logo.

**Architecture:** Frontend React enxuto (só UI) + backend Express orquestrando o pipeline (extração Gemini → normalização → validação → mensagem → render Playwright). Sem persistência de negócio no v1; storage temporário em disco por ciclo (`promo_id`). Mensagem e arte derivam sempre do mesmo payload revisado.

**Tech Stack:** Node.js/Express/SQLite, React/Vite/Tailwind, Playwright (render HTML→PNG), Google Gemini Vision (`@google/generative-ai`), Pexels API (fallback de fundo), multer (upload), jest + supertest (testes).

**Spec:** `docs/superpowers/specs/2026-05-21-aba-promocoes-design.md`

**Microajustes acordados (carregar durante execução):**
1. `/extract` → `workspace` devolve só identificadores e URLs públicas (`/api/promotions/<id>/file/...`), nunca caminho absoluto do servidor.
2. `promoRenderer` → renderização determinística em viewport fixa (1080×1620, deviceScaleFactor 1).
3. `promoClient` → shape único de erro `{ kind, message, fields? }` para a UI desde o início.

---

## Convenções do projeto (ler antes de começar)

- Backend é **CommonJS** (`require`/`module.exports`). Erros HTTP no formato `{ error: "msg" }`.
- Rotas registradas em `backend/server.js` **depois** de `app.use('/api', requireAuth)`.
- CSRF: toda requisição mutating (POST) precisa do header `X-CSRF-Token` — o axios singleton (`frontend/src/hooks/useApi.js`) já injeta automaticamente, inclusive em uploads multipart.
- Testes em `backend/__tests__/*.test.js` com jest + supertest; helpers em `backend/__tests__/testApp.js`.
- Serviços externos seguem padrão stub/real por env (ver `backend/services/aviationApi.js` + `AVIATION_API_MODE`). Replicar com `EXTRACTION_MODE` (`stub`|`real`) para rodar testes sem chave Gemini.
- Frontend usa o axios singleton `api` de `frontend/src/hooks/useApi.js` e ícones `lucide-react`.

---

## Fase 0 — Dependências e scaffolding

### Task 0.1: Adicionar dependências do backend

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Instalar pacotes**

Run (em `backend/`):
```bash
npm install @google/generative-ai multer
```
Expected: `package.json` ganha `@google/generative-ai` e `multer` em `dependencies`. Playwright já existe.

- [ ] **Step 2: Commit**
```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add gemini sdk and multer for promo automation"
```

### Task 0.2: Variáveis de ambiente

**Files:**
- Modify: `.env.example`, `backend/.env.example`

- [ ] **Step 1: Adicionar ao final de ambos os `.env.example`**
```
# === Promoções (nova aba) ===
EXTRACTION_MODE=stub          # stub = dados fakes (dev/test); real = chama Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
PEXELS_API_KEY=
PROMO_OUTPUT_DIR=             # opcional; default backend/output/promos
```

- [ ] **Step 2: Commit**
```bash
git add .env.example backend/.env.example
git commit -m "chore: document promo env vars"
```

### Task 0.3: Helper de workspace temporário

Responsável por criar/limpar a pasta de trabalho por `promo_id` e mapear paths internos → URLs públicas seguras.

**Files:**
- Create: `backend/helpers/promoWorkspace.js`
- Test: `backend/__tests__/promoWorkspace.test.js`

- [ ] **Step 1: Escrever o teste que falha**
```js
const fs = require('fs');
const path = require('path');
process.env.PROMO_OUTPUT_DIR = path.join(__dirname, '.tmp-promos');
const ws = require('../helpers/promoWorkspace');

afterAll(() => { try { fs.rmSync(process.env.PROMO_OUTPUT_DIR, { recursive: true, force: true }); } catch (e) {} });

test('create() returns a uuid promo_id and makes the dir', () => {
  const { promo_id, dir } = ws.create();
  expect(promo_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(fs.existsSync(dir)).toBe(true);
});

test('publicUrl maps a filename to a safe API url, never an absolute path', () => {
  const { promo_id } = ws.create();
  const url = ws.publicUrl(promo_id, 'print.png');
  expect(url).toBe(`/api/promotions/${promo_id}/file/print.png`);
  expect(url).not.toContain(process.env.PROMO_OUTPUT_DIR);
});

test('cleanupExpired removes dirs older than ttl', () => {
  const { promo_id, dir } = ws.create();
  const past = Date.now() - 25 * 3600 * 1000;
  fs.utimesSync(dir, new Date(past), new Date(past));
  ws.cleanupExpired(24 * 3600 * 1000);
  expect(fs.existsSync(dir)).toBe(false);
});

test('resolveFile rejects path traversal', () => {
  const { promo_id } = ws.create();
  expect(ws.resolveFile(promo_id, '../../etc/passwd')).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**
Run: `cd backend && npx jest promoWorkspace -i`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**
```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.env.PROMO_OUTPUT_DIR || path.join(__dirname, '..', 'output', 'promos');

function baseDir() { fs.mkdirSync(BASE, { recursive: true }); return BASE; }

function create() {
  const promo_id = crypto.randomUUID();
  const dir = path.join(baseDir(), promo_id);
  fs.mkdirSync(dir, { recursive: true });
  return { promo_id, dir };
}

function dirFor(promo_id) { return path.join(baseDir(), promo_id); }

function publicUrl(promo_id, filename) {
  return `/api/promotions/${promo_id}/file/${filename}`;
}

// Safe resolve: filename must stay inside the promo dir (no traversal).
function resolveFile(promo_id, filename) {
  const dir = dirFor(promo_id);
  const target = path.resolve(dir, filename);
  if (target !== dir && !target.startsWith(dir + path.sep)) return null;
  return target;
}

function cleanupExpired(ttlMs = 24 * 3600 * 1000) {
  const root = baseDir();
  const now = Date.now();
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory() && now - st.mtimeMs > ttlMs) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    } catch (e) { /* ignore */ }
  }
}

module.exports = { create, dirFor, publicUrl, resolveFile, cleanupExpired, baseDir };
```

- [ ] **Step 4: Rodar e ver passar**
Run: `cd backend && npx jest promoWorkspace -i`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**
```bash
git add backend/helpers/promoWorkspace.js backend/__tests__/promoWorkspace.test.js
git commit -m "feat: add temporary promo workspace helper with safe paths and ttl cleanup"
```

---

## Fase 1 — Normalização (lógica pura, TDD)

### Task 1.1: `promoNormalizer`

Converte o JSON bruto do Gemini em campos consistentes. Sem efeitos colaterais.

**Files:**
- Create: `backend/services/promoNormalizer.js`
- Test: `backend/__tests__/promoNormalizer.test.js`

Responsabilidades: aeroporto→cidade (mapa + fallback), datas→`travel_month_label`+`availability_note`+`display_availability`, `total_price`→`installment_amount` (÷ `installments`, default 10), baggage→`["carry_on"|"checked"]`, normalizar `flight_type`.

- [ ] **Step 1: Escrever o teste que falha**
```js
const { normalize } = require('../services/promoNormalizer');

test('maps known airport codes to cities', () => {
  const out = normalize({ origin_code: 'SSA', destination_code: 'BPS' });
  expect(out.origin_city).toBe('Salvador');
  expect(out.destination_city).toBe('Porto Seguro');
});

test('builds month label and display_availability from date range', () => {
  const out = normalize({ start_date: '2026-09-12', end_date: '2026-09-19', availability_note: 'sob consulta' });
  expect(out.travel_month_label).toBe('Setembro');
  expect(out.display_availability).toBe('Setembro (sob consulta)');
});

test('derives installment_amount from total and installments (default 10)', () => {
  const out = normalize({ total_price: 2411.0 });
  expect(out.installments).toBe(10);
  expect(out.installment_amount).toBeCloseTo(241.10, 2);
});

test('normalizes baggage to closed values', () => {
  const out = normalize({ baggage_raw: ['bagagem de mão', 'bagagem despachada'] });
  expect(out.baggage).toEqual(['carry_on', 'checked']);
});

test('keeps display_availability without parens when no note', () => {
  const out = normalize({ start_date: '2026-08-01', end_date: '2026-08-07' });
  expect(out.display_availability).toBe('Agosto');
});
```

- [ ] **Step 2: Rodar e ver falhar**
Run: `cd backend && npx jest promoNormalizer -i` → FAIL.

- [ ] **Step 3: Implementar**
```js
const AIRPORTS = {
  SSA: 'Salvador', BPS: 'Porto Seguro', FLN: 'Florianópolis', CNF: 'Belo Horizonte',
  GRU: 'São Paulo', GIG: 'Rio de Janeiro', REC: 'Recife', MCZ: 'Maceió', FOR: 'Fortaleza',
  BSB: 'Brasília', CWB: 'Curitiba', POA: 'Porto Alegre', NAT: 'Natal', VIX: 'Vitória'
};
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function cityFromCode(code, fallback) {
  if (!code) return fallback || null;
  return AIRPORTS[String(code).toUpperCase()] || fallback || code;
}

function monthLabel(isoDate) {
  if (!isoDate) return null;
  const m = Number(String(isoDate).slice(5, 7));
  return MONTHS[m - 1] || null;
}

function normalizeBaggage(raw) {
  if (!Array.isArray(raw)) return [];
  const out = new Set();
  for (const item of raw) {
    const s = String(item).toLowerCase();
    if (s.includes('mão') || s.includes('mao') || s.includes('carry')) out.add('carry_on');
    if (s.includes('despach') || s.includes('checked')) out.add('checked');
  }
  return [...out];
}

function normalize(raw = {}) {
  const out = { ...raw };
  out.origin_city = raw.origin_city || cityFromCode(raw.origin_code, raw.origin_city);
  out.destination_city = raw.destination_city || cityFromCode(raw.destination_code, raw.destination_city);

  const month = raw.travel_month_label || monthLabel(raw.start_date);
  if (month) out.travel_month_label = month;
  out.availability_note = raw.availability_note || null;
  if (out.travel_month_label) {
    out.display_availability = out.availability_note
      ? `${out.travel_month_label} (${out.availability_note})`
      : out.travel_month_label;
  }

  out.installments = raw.installments || 10;
  if (raw.total_price != null) {
    out.total_price = Number(raw.total_price);
    out.installment_amount = raw.installment_amount != null
      ? Number(raw.installment_amount)
      : Math.round((out.total_price / out.installments) * 100) / 100;
  }

  if (raw.baggage_raw) out.baggage = normalizeBaggage(raw.baggage_raw);
  else if (Array.isArray(raw.baggage)) out.baggage = raw.baggage;

  if (raw.flight_type) {
    const ft = String(raw.flight_type).toLowerCase();
    out.flight_type = ft.includes('parad') || ft.includes('escala') ? raw.flight_type : 'Direto';
  }
  return out;
}

module.exports = { normalize, cityFromCode, monthLabel, normalizeBaggage, AIRPORTS };
```

- [ ] **Step 4: Rodar e ver passar** → `cd backend && npx jest promoNormalizer -i` → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/services/promoNormalizer.js backend/__tests__/promoNormalizer.test.js
git commit -m "feat: add promo normalizer (airports, dates, installments, baggage)"
```

---

## Fase 2 — Validação (lógica pura, TDD)

### Task 2.1: `promoValidator`

**Files:**
- Create: `backend/services/promoValidator.js`
- Test: `backend/__tests__/promoValidator.test.js`

Regras (da spec): obrigatórios (origem, destino, hotel, voo/airlines, total_price); `installment_amount*installments ≈ total_price` ±R$0,10; noites 1..30; limites de comprimento `hotel_name`(45), `meal_plan`(30), `airlines`(3 itens) com truncamento; **bloqueio de campos internos** (`agency_commission_detected` e qualquer chave começando com `_`). Exporta `validate(promotion)` → `{ valid, errors, warnings, normalized_promotion }` e `stripInternal(promotion)` usada também por message/render.

Cenários de teste obrigatórios (spec): "Seu ganho" bloqueado; sem nota de hotel; bagagem ambígua; parcela divergente; hotel grande demais.

- [ ] **Step 1: Escrever o teste que falha**
```js
const { validate, stripInternal } = require('../services/promoValidator');

const base = {
  origin_city: 'Salvador', destination_city: 'Porto Seguro', hotel_name: 'Rede Andrade Terra Brasil',
  airlines: ['GOL'], nights: 7, total_price: 2411, installments: 10, installment_amount: 241.10,
  _meta: { agency_commission_detected: 227 }
};

test('valid promotion passes', () => {
  expect(validate(base).valid).toBe(true);
});

test('stripInternal removes commission and underscore-prefixed keys', () => {
  const clean = stripInternal(base);
  expect(clean._meta).toBeUndefined();
  expect(JSON.stringify(clean)).not.toContain('227');
});

test('missing destination is an error', () => {
  const r = validate({ ...base, destination_city: '' });
  expect(r.valid).toBe(false);
  expect(r.errors.join(' ')).toMatch(/destino/i);
});

test('installment mismatch beyond 10 cents is an error', () => {
  const r = validate({ ...base, installment_amount: 200 });
  expect(r.valid).toBe(false);
  expect(r.errors.join(' ')).toMatch(/parcela/i);
});

test('hotel rating missing produces a warning, not an error', () => {
  const r = validate({ ...base, hotel_rating_value: null });
  expect(r.warnings.join(' ')).toMatch(/nota/i);
  expect(r.valid).toBe(true);
});

test('nights out of range warns', () => {
  expect(validate({ ...base, nights: 60 }).warnings.join(' ')).toMatch(/noites/i);
});

test('overlong hotel_name is truncated in normalized_promotion with warning', () => {
  const long = 'X'.repeat(60);
  const r = validate({ ...base, hotel_name: long });
  expect(r.normalized_promotion.hotel_name.length).toBeLessThanOrEqual(45);
  expect(r.warnings.join(' ')).toMatch(/hotel/i);
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**
```js
const LIMITS = { hotel_name: 45, meal_plan: 30, airlines: 3 };
const CENTS_TOLERANCE = 0.10;

function stripInternal(promotion) {
  const clean = {};
  for (const [k, v] of Object.entries(promotion || {})) {
    if (k.startsWith('_')) continue;
    clean[k] = v;
  }
  delete clean.agency_commission_detected;
  return clean;
}

function truncate(s, max) {
  if (typeof s !== 'string' || s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function validate(promotion = {}) {
  const errors = [];
  const warnings = [];
  const n = { ...promotion };

  if (!n.origin_city) errors.push('Origem é obrigatória');
  if (!n.destination_city) errors.push('Destino é obrigatório');
  if (!n.hotel_name) errors.push('Hotel é obrigatório');
  if (!Array.isArray(n.airlines) || n.airlines.length === 0) errors.push('Voo/companhia é obrigatório');
  if (n.total_price == null) errors.push('Preço total é obrigatório');

  if (n.total_price != null && n.installment_amount != null && n.installments) {
    const expected = n.installment_amount * n.installments;
    if (Math.abs(expected - n.total_price) > CENTS_TOLERANCE)
      errors.push(`Parcela inconsistente: ${n.installments}× ${n.installment_amount} ≠ total ${n.total_price}`);
  }

  if (n.nights != null && (n.nights < 1 || n.nights > 30))
    warnings.push(`Número de noites fora do comum (${n.nights}) — revise`);
  if (n.hotel_rating_value == null) warnings.push('Nota do hotel ausente — confirme manualmente');

  for (const [field, max] of Object.entries(LIMITS)) {
    if (field === 'airlines') {
      if (Array.isArray(n.airlines) && n.airlines.length > max) {
        warnings.push(`Muitas companhias (${n.airlines.length}); exibindo as ${max} primeiras`);
        n.airlines = n.airlines.slice(0, max);
      }
    } else if (typeof n[field] === 'string' && n[field].length > max) {
      warnings.push(`Campo ${field} longo demais para o card — truncado`);
      n[field] = truncate(n[field], max);
    }
  }

  return { valid: errors.length === 0, errors, warnings, normalized_promotion: n };
}

module.exports = { validate, stripInternal, LIMITS, CENTS_TOLERANCE };
```

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/services/promoValidator.js backend/__tests__/promoValidator.test.js
git commit -m "feat: add promo validator with internal-field stripping and length limits"
```

---

## Fase 3 — Mensagem WhatsApp (lógica pura, TDD)

### Task 3.1: `whatsappMessage`

**Files:**
- Create: `backend/services/whatsappMessage.js`
- Test: `backend/__tests__/whatsappMessage.test.js`

Gera a legenda a partir do payload **já passado por `stripInternal`**. Template controlado.

- [ ] **Step 1: Escrever o teste que falha**
```js
const { buildMessage } = require('../services/whatsappMessage');
const promo = {
  origin_city: 'Salvador', destination_city: 'Maceió', nights: 6, passengers: 2,
  display_availability: 'Agosto (sob consulta)', flight_type: 'Direto', airlines: ['GOL'],
  baggage: ['carry_on'], hotel_name: 'Hotel Praia Bonita', hotel_stars: 3,
  hotel_rating_value: 8.3, hotel_rating_text: 'Muito bom', meal_plan: 'Café da Manhã',
  installments: 10, installment_amount: 374.70, total_price: 3747.0, cta_text: 'Reserve agora',
  _meta: { agency_commission_detected: 227 }
};

test('message includes destination and price but never the commission', () => {
  const msg = buildMessage(promo);
  expect(msg).toContain('Maceió');
  expect(msg).toContain('374,70');
  expect(msg).not.toContain('227');
});

test('formats currency in pt-BR', () => {
  expect(buildMessage(promo)).toMatch(/R\$\s?3\.747,00/);
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**
```js
const { stripInternal } = require('./promoValidator');

function brl(v) {
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function baggageLabel(b = []) {
  const parts = [];
  if (b.includes('carry_on')) parts.push('bagagem de mão');
  if (b.includes('checked')) parts.push('bagagem despachada');
  return parts.join(' + ');
}

function buildMessage(rawPromo) {
  const p = stripInternal(rawPromo);
  const lines = [];
  lines.push(`✈️ *${p.destination_city.toUpperCase()}* saindo de ${p.origin_city}`);
  lines.push(`📅 ${p.nights} noites | ${p.display_availability || ''} | ${p.passengers || 2} pessoas`);
  const bag = baggageLabel(p.baggage);
  lines.push(`🛫 Voo ${p.flight_type}${p.airlines?.length ? ' - ' + p.airlines.join('/') : ''}${bag ? ' - ' + bag : ''}`);
  lines.push(`🏨 ${p.hotel_name}${p.hotel_stars ? ` (${p.hotel_stars}⭐` : ''}${p.hotel_rating_value ? `, ${p.hotel_rating_text || ''} ${p.hotel_rating_value})` : p.hotel_stars ? ')' : ''}`);
  if (p.meal_plan) lines.push(`🍽️ ${p.meal_plan}`);
  lines.push('');
  lines.push(`💳 ${p.installments}x sem juros de *${brl(p.installment_amount)}*`);
  lines.push(`💰 Total ${brl(p.total_price)} para ${p.passengers || 2} pessoas`);
  if (p.taxes_included !== false) lines.push('_Taxas e impostos incluídos_');
  lines.push('');
  lines.push(`👉 ${p.cta_text || 'Garanta já sua viagem!'}`);
  return lines.join('\n');
}

module.exports = { buildMessage, brl };
```

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/services/whatsappMessage.js backend/__tests__/whatsappMessage.test.js
git commit -m "feat: add whatsapp message builder (commission-safe)"
```

---

## Fase 4 — Extração Gemini (stub/real)

### Task 4.1: `geminiExtractor`

**Files:**
- Create: `backend/services/geminiExtractor.js`
- Test: `backend/__tests__/geminiExtractor.test.js`

`EXTRACTION_MODE=stub` → retorna fixture determinística (sem chamar API). `real` → chama Gemini Vision com prompt controlado pedindo JSON do schema. Erros: API down → lança `{ code: 'unavailable' }`; JSON malformado → tenta parse tolerante, marca faltantes em `low_confidence_fields`; nada útil → lança `{ code: 'unprocessable' }`.

- [ ] **Step 1: Escrever o teste que falha (modo stub)**
```js
process.env.EXTRACTION_MODE = 'stub';
const { extract } = require('../services/geminiExtractor');

test('stub mode returns a structured promotion without calling the API', async () => {
  const { promotion, _meta } = await extract(Buffer.from('fake'), 'image/jpeg');
  expect(promotion.destination_city || promotion.destination_code).toBeTruthy();
  expect(Array.isArray(_meta.low_confidence_fields)).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**
```js
const PROMPT = `Você recebe o print de um pacote de viagem (sistema interno estilo CVC).
Extraia SOMENTE os dados visíveis e devolva um JSON único, sem texto extra, com as chaves:
origin_code, destination_code, start_date (YYYY-MM-DD), end_date, passengers, hotel_name,
hotel_stars, hotel_rating_value, hotel_rating_text, flight_type ("Direto" ou "1 parada"),
airlines (array), baggage_raw (array de strings como "bagagem de mão"), meal_plan,
total_price (número, "Final 2 pessoas"), agency_commission ("Seu ganho", número ou null),
availability_note (ex.: "sob consulta" ou null).
Se um campo não estiver visível, use null. NÃO invente valores.`;

const STUB = {
  origin_code: 'SSA', destination_code: 'BPS', start_date: '2026-09-12', end_date: '2026-09-19',
  passengers: 2, hotel_name: 'Rede Andrade Terra Brasil', hotel_stars: 3, hotel_rating_value: 8.1,
  hotel_rating_text: 'Muito bom', flight_type: 'Direto', airlines: ['GOL'],
  baggage_raw: ['bagagem de mão', 'bagagem despachada'], meal_plan: 'Café da Manhã',
  total_price: 2411.0, agency_commission: 227.0, availability_note: 'sob consulta'
};

const FIELDS = Object.keys(STUB);

function toPromotion(parsed) {
  const promotion = { ...parsed };
  const low = FIELDS.filter(f => parsed[f] == null && f !== 'agency_commission' && f !== 'availability_note');
  const _meta = {
    low_confidence_fields: low,
    validation_warnings: [],
    agency_commission_detected: parsed.agency_commission ?? null
  };
  delete promotion.agency_commission;
  return { promotion, _meta };
}

async function extract(imageBuffer, mimeType) {
  if ((process.env.EXTRACTION_MODE || 'stub') === 'stub') {
    return toPromotion({ ...STUB });
  }
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (!process.env.GEMINI_API_KEY) { const e = new Error('GEMINI_API_KEY missing'); e.code = 'unavailable'; throw e; }
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const result = await model.generateContent([
      PROMPT,
      { inlineData: { data: imageBuffer.toString('base64'), mimeType } }
    ]);
    const text = result.response.text();
    const jsonStr = (text.match(/\{[\s\S]*\}/) || [null])[0];
    if (!jsonStr) { const e = new Error('no json'); e.code = 'unprocessable'; throw e; }
    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch (_) { const e = new Error('malformed json'); e.code = 'unprocessable'; throw e; }
    return toPromotion(parsed);
  } catch (err) {
    if (err.code === 'unprocessable') throw err;
    const e = new Error(`Gemini indisponível: ${err.message}`); e.code = 'unavailable'; throw e;
  }
}

module.exports = { extract, PROMPT };
```

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/services/geminiExtractor.js backend/__tests__/geminiExtractor.test.js
git commit -m "feat: add gemini extractor with stub mode and error codes"
```

---

## Fase 5 — Resolução de fundo (local-first → Pexels)

### Task 5.1: `backgroundResolver`

**Files:**
- Create: `backend/services/backgroundResolver.js`
- Create: `backend/static/promo-backgrounds/.gitkeep`
- Test: `backend/__tests__/backgroundResolver.test.js`

Prioridade explícita: **biblioteca local primeiro** (`backend/static/promo-backgrounds/<slug>.jpg`), **Pexels só como fallback**. Retorna opções com `source`.

- [ ] **Step 1: Escrever o teste que falha**
```js
const fs = require('fs'); const path = require('path');
const dir = path.join(__dirname, '..', 'static', 'promo-backgrounds');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'maceio.jpg'), 'x');
const { listBackgrounds, slugify } = require('../services/backgroundResolver');

afterAll(() => { try { fs.unlinkSync(path.join(dir, 'maceio.jpg')); } catch (e) {} });

test('slugify normalizes accents and spaces', () => {
  expect(slugify('Maceió')).toBe('maceio');
  expect(slugify('Porto Seguro')).toBe('porto-seguro');
});

test('local images are returned first with source local', async () => {
  const { options } = await listBackgrounds('Maceió');
  expect(options[0].source).toBe('local');
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** (Pexels via global `fetch`, Node 18+; pula se sem chave)
```js
const fs = require('fs'); const path = require('path');
const DIR = path.join(__dirname, '..', 'static', 'promo-backgrounds');

function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function localFor(destination) {
  const slug = slugify(destination);
  const opts = [];
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const f = path.join(DIR, `${slug}.${ext}`);
    if (fs.existsSync(f)) opts.push({ source: 'local', url: `/static/promo-backgrounds/${slug}.${ext}`, thumb: `/static/promo-backgrounds/${slug}.${ext}` });
  }
  return opts;
}

async function pexelsFor(destination) {
  if (!process.env.PEXELS_API_KEY) return [];
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(destination + ' praia turismo')}&per_page=4&orientation=portrait`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.photos || []).map(p => ({ source: 'pexels', url: p.src.large2x || p.src.large, thumb: p.src.medium }));
  } catch (e) { return []; }
}

async function listBackgrounds(destination) {
  const local = localFor(destination);
  const pexels = local.length ? [] : await pexelsFor(destination); // local-first; only fall back when none local
  return { options: [...local, ...pexels] };
}

module.exports = { listBackgrounds, slugify, DIR };
```

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/services/backgroundResolver.js backend/static/promo-backgrounds/.gitkeep backend/__tests__/backgroundResolver.test.js
git commit -m "feat: add background resolver (local-first, pexels fallback)"
```

---

## Fase 6 — Template HTML + render Playwright

### Task 6.1: Template `promo-art.html`

**Files:**
- Create: `backend/templates/promo-art.html`

Template fiel ao padrão Maceió: fundo (data URL ou URL da foto), card branco, faixa "SAINDO DE {ORIGEM}", destino grande, linha meta, linhas Voo/Hotel/Regime com ícones SVG inline, bloco de preço, CTA, **logo no topo central** (`Logo.png` como data URL injetada). Placeholders `{{TOKEN}}` substituídos pelo renderer. **Tratar textos longos:** `hotel_name`/`meal_plan` com `overflow-wrap` + `line-clamp:2`; fonte do destino reduz via `clamp()`.

- [ ] **Step 1: Criar o arquivo** com tokens: `{{BG_URL}}`, `{{LOGO_URL}}`, `{{ORIGIN_CITY}}`, `{{DESTINATION}}`, `{{META_LINE}}`, `{{FLIGHT_LINE}}`, `{{HOTEL_LINE}}`, `{{MEAL_PLAN}}`, `{{PRICE_LABEL}}`, `{{PRICE}}`, `{{PRICE_SUB}}`, `{{CTA}}`. Reaproveitar o CSS do `mockup-logo-placement.html` (opção A — logo topo central), em escala 1080×1620. Card e cores: faixa `#15355f`, preço `#1a7fb8`, CTA `#f6741e`.

- [ ] **Step 2: Commit**
```bash
git add backend/templates/promo-art.html
git commit -m "feat: add promo art html template (maceio standard, logo top-center)"
```

### Task 6.2: `promoRenderer` (Playwright, determinístico)

**Files:**
- Create: `backend/services/promoRenderer.js`
- Test: `backend/__tests__/promoRenderer.test.js`

Critério de pronto: **viewport fixa 1080×1620, deviceScaleFactor 1** → PNG determinístico entre ambientes. Recebe payload (passa por `stripInternal`), resolve tokens, escreve PNG na pasta de trabalho.

- [ ] **Step 1: Escrever o teste que falha** (gera PNG real; marcar lento)
```js
const fs = require('fs'); const path = require('path');
process.env.PROMO_OUTPUT_DIR = path.join(__dirname, '.tmp-promos-render');
const ws = require('../helpers/promoWorkspace');
const { renderImage } = require('../services/promoRenderer');

afterAll(() => { try { fs.rmSync(process.env.PROMO_OUTPUT_DIR, { recursive: true, force: true }); } catch (e) {} });

test('renders a PNG with fixed dimensions', async () => {
  const { promo_id } = ws.create();
  const out = await renderImage(promo_id, {
    origin_city: 'Salvador', destination_city: 'Maceió', nights: 6, passengers: 2,
    display_availability: 'Agosto (sob consulta)', flight_type: 'Direto', airlines: ['GOL'],
    baggage: ['carry_on'], hotel_name: 'Hotel Praia Bonita', hotel_stars: 3,
    hotel_rating_value: 8.3, hotel_rating_text: 'Muito bom', meal_plan: 'Café da Manhã',
    installments: 10, installment_amount: 374.70, total_price: 3747, cta_text: 'Reserve agora'
  }, { backgroundUrl: null });
  expect(out.image_width).toBe(1080);
  expect(out.image_height).toBe(1620);
  expect(fs.existsSync(ws.resolveFile(promo_id, 'promocao_final.png'))).toBe(true);
}, 60000);
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**
```js
const fs = require('fs'); const path = require('path');
const ws = require('../helpers/promoWorkspace');
const { stripInternal } = require('./promoValidator');
const { brl } = require('./whatsappMessage');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'promo-art.html');
const LOGO = path.join(__dirname, '..', '..', 'Logo.png');
const W = 1080, H = 1620;

function logoDataUrl() {
  try { return 'data:image/png;base64,' + fs.readFileSync(LOGO).toString('base64'); }
  catch (e) { return ''; }
}
function baggageLabel(b = []) {
  const parts = [];
  if (b.includes('carry_on')) parts.push('bagagem de mão');
  if (b.includes('checked')) parts.push('bagagem despachada');
  return parts.length ? ' - Incluso ' + parts.join(' + ') : '';
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function fillTemplate(p, backgroundUrl) {
  let html = fs.readFileSync(TEMPLATE, 'utf8');
  const flightLine = `Voo (${p.flight_type || 'Direto'}${p.airlines?.length ? ' - ' + p.airlines.join('/') : ''}${baggageLabel(p.baggage)})`;
  const hotelLine = `${p.hotel_name}${p.hotel_stars ? ` (${p.hotel_stars} estrelas` : ''}${p.hotel_rating_value ? `, ${p.hotel_rating_text || ''} ${p.hotel_rating_value})` : p.hotel_stars ? ')' : ''}`;
  const tokens = {
    BG_URL: backgroundUrl || '',
    LOGO_URL: logoDataUrl(),
    ORIGIN_CITY: esc((p.origin_city || '').toUpperCase()),
    DESTINATION: esc((p.destination_city || '').toUpperCase()),
    META_LINE: esc(`${p.nights} NOITES | ${(p.display_availability||'').toUpperCase()} | ${p.passengers||2} PESSOAS`),
    FLIGHT_LINE: esc(flightLine),
    HOTEL_LINE: esc(hotelLine),
    MEAL_PLAN: esc(p.meal_plan || ''),
    PRICE_LABEL: `POR APENAS ${p.installments||10}X S/ JUROS DE`,
    PRICE: brl(p.installment_amount),
    PRICE_SUB: `VALOR TOTAL PARA ${p.passengers||2} PESSOAS`,
    CTA: esc(p.cta_text || 'Reserve agora')
  };
  for (const [k, v] of Object.entries(tokens)) html = html.replaceAll(`{{${k}}}`, v);
  return html;
}

async function renderImage(promo_id, rawPromo, { backgroundUrl } = {}) {
  const p = stripInternal(rawPromo);
  const html = fillTemplate(p, backgroundUrl);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    const outPath = ws.resolveFile(promo_id, 'promocao_final.png');
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: W, height: H } });
    return { image_url: ws.publicUrl(promo_id, 'promocao_final.png'), image_width: W, image_height: H,
             expires_at: new Date(Date.now() + 24*3600*1000).toISOString() };
  } finally { await browser.close(); }
}

module.exports = { renderImage, fillTemplate };
```
> Nota: ajustar o `clip`/viewport se o template render passar de 1620px; o critério é dimensão fixa e estável.

- [ ] **Step 4: Rodar e ver passar** → PASS (pode levar ~10-30s).

- [ ] **Step 5: Commit**
```bash
git add backend/services/promoRenderer.js backend/__tests__/promoRenderer.test.js
git commit -m "feat: add deterministic playwright promo renderer"
```

---

## Fase 7 — Rotas HTTP

### Task 7.1: `routes/promotions.js` + registro

**Files:**
- Create: `backend/routes/promotions.js`
- Modify: `backend/server.js` (importar + `app.use('/api/promotions', promotionsRouter)` na seção 4; chamar `cleanupExpired()` no boot)
- Test: `backend/__tests__/routes-promotions.test.js`

Endpoints (todos sob `requireAuth` global): `POST /extract` (multer single 'print'), `POST /validate`, `POST /render-message`, `POST /render-image`, `GET /backgrounds`, `GET /:promo_id/file/:name` (serve PNG/print da pasta de trabalho via `resolveFile`, 404 se traversal/inexistente). `/extract` devolve `workspace: { promo_id, print_url }` — **só URLs públicas**. Erros do extractor → 503 (`unavailable`) / 422 (`unprocessable`).

- [ ] **Step 1: Escrever o teste que falha** (modo stub, app de teste com sessão)

Adicionar em `backend/__tests__/testApp.js` um `makePromoApp()` espelhando `makeAuthApp()` mas montando `promotionsRouter` em `/api/promotions` (com `requireAuth`). Teste:
```js
process.env.EXTRACTION_MODE = 'stub';
const request = require('supertest');
const { makePromoApp, getCsrfFromResponse } = require('./testApp');
// ... login flow como em users.test.js, então:
test('POST /extract returns promotion + safe workspace urls', async () => {
  const res = await agent.post('/api/promotions/extract').set('X-CSRF-Token', csrf)
    .attach('print', Buffer.from('fake'), 'p.jpg');
  expect(res.status).toBe(200);
  expect(res.body.promotion).toBeDefined();
  expect(res.body.workspace.print_url).toMatch(/^\/api\/promotions\/[0-9a-f-]+\/file\//);
  expect(JSON.stringify(res.body)).not.toContain('output/promos'); // no absolute/internal path
});
```
(Reusar o padrão de login de `backend/__tests__/users.test.js`.)

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar a rota**
```js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const ws = require('../helpers/promoWorkspace');
const { extract } = require('../services/geminiExtractor');
const { normalize } = require('../services/promoNormalizer');
const { validate, stripInternal } = require('../services/promoValidator');
const { buildMessage } = require('../services/whatsappMessage');
const { renderImage } = require('../services/promoRenderer');
const { listBackgrounds } = require('../services/backgroundResolver');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.post('/extract', upload.single('print'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo "print" é obrigatório' });
  try {
    const { promo_id, dir } = ws.create();
    const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
    fs.writeFileSync(require('path').join(dir, `print.${ext}`), req.file.buffer);
    const { promotion, _meta } = await extract(req.file.buffer, req.file.mimetype);
    const normalized = normalize(promotion);
    const { warnings, normalized_promotion } = validate(normalized);
    _meta.validation_warnings = warnings;
    return res.json({
      promo_id, promotion: { ...normalized_promotion, promo_id }, _meta,
      workspace: { promo_id, print_url: ws.publicUrl(promo_id, `print.${ext}`) }
    });
  } catch (err) {
    if (err.code === 'unavailable') return res.status(503).json({ error: 'Serviço de extração indisponível. Tente novamente.' });
    if (err.code === 'unprocessable') return res.status(422).json({ error: 'Não foi possível ler o print. Preencha manualmente.' });
    return res.status(500).json({ error: err.message });
  }
});

router.post('/validate', (req, res) => {
  const { promotion } = req.body || {};
  if (!promotion) return res.status(400).json({ error: 'promotion é obrigatório' });
  return res.json(validate(normalize(promotion)));
});

router.post('/render-message', (req, res) => {
  const { promotion } = req.body || {};
  if (!promotion) return res.status(400).json({ error: 'promotion é obrigatório' });
  return res.json({ message_text: buildMessage(stripInternal(promotion)) });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.post('/render-image', async (req, res) => {
  const { promotion, background_choice } = req.body || {};
  if (!promotion || !UUID_RE.test(promotion.promo_id || '')) return res.status(400).json({ error: 'promotion.promo_id inválido' });
  try {
    const out = await renderImage(promotion.promo_id, stripInternal(promotion), { backgroundUrl: background_choice || null });
    return res.json(out);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.get('/backgrounds', async (req, res) => {
  const { destination } = req.query;
  if (!destination) return res.status(400).json({ error: 'destination é obrigatório' });
  return res.json(await listBackgrounds(destination));
});

router.get('/:promo_id/file/:name', (req, res) => {
  const target = ws.resolveFile(req.params.promo_id, req.params.name);
  if (!target || !fs.existsSync(target)) return res.status(404).json({ error: 'Arquivo não encontrado' });
  return res.sendFile(target);
});

module.exports = router;
```

- [ ] **Step 4: Registrar em `server.js`**: importar `const promotionsRouter = require('./routes/promotions');`, adicionar `app.use('/api/promotions', promotionsRouter);` na seção 4, e no callback de `app.listen` chamar `require('./helpers/promoWorkspace').cleanupExpired();`. Garantir `app.use('/static', express.static(path.join(__dirname, 'static')))` para servir fundos locais.

- [ ] **Step 5: Rodar e ver passar** → `cd backend && npx jest routes-promotions -i` → PASS. Rodar a suíte completa: `npm test`.

- [ ] **Step 6: Commit**
```bash
git add backend/routes/promotions.js backend/server.js backend/__tests__/routes-promotions.test.js backend/__tests__/testApp.js
git commit -m "feat: add /api/promotions routes (extract, validate, render, backgrounds, file)"
```

---

## Fase 8 — Frontend

### Task 8.1: `promoClient.js` (shape único de erro)

**Files:**
- Create: `frontend/src/api/promoClient.js`

`toApiError(err)` normaliza qualquer erro axios em `{ kind, message, fields }` onde `kind ∈ {unavailable(503), unprocessable(422), validation(400), csrf(403), network, unknown}`.

- [ ] **Step 1: Implementar**
```js
import api from '../hooks/useApi';

export function toApiError(err) {
  const status = err?.response?.status;
  const data = err?.response?.data || {};
  const map = { 503: 'unavailable', 422: 'unprocessable', 400: 'validation', 403: 'csrf' };
  const kind = status ? (map[status] || 'unknown') : 'network';
  return { kind, message: data.error || err.message || 'Erro inesperado', fields: data.errors || [] };
}

export async function extractPrint(file) {
  const fd = new FormData(); fd.append('print', file);
  try { const res = await api.post('/api/promotions/extract', fd); return res.data; }
  catch (err) { throw toApiError(err); }
}
export async function validatePromotion(promotion) {
  try { const res = await api.post('/api/promotions/validate', { promotion }); return res.data; }
  catch (err) { throw toApiError(err); }
}
export async function renderMessage(promotion) {
  try { const res = await api.post('/api/promotions/render-message', { promotion }); return res.data; }
  catch (err) { throw toApiError(err); }
}
export async function renderImage(promotion, background_choice) {
  try { const res = await api.post('/api/promotions/render-image', { promotion, background_choice }); return res.data; }
  catch (err) { throw toApiError(err); }
}
export async function listBackgrounds(destination) {
  try { const res = await api.get('/api/promotions/backgrounds', { params: { destination } }); return res.data; }
  catch (err) { throw toApiError(err); }
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/api/promoClient.js
git commit -m "feat: add promo api client with unified error shape"
```

### Task 8.2: `PromocoesTab.jsx` (UI enxuta)

**Files:**
- Create: `frontend/src/components/PromocoesTab.jsx`

Estado local: `step` (`upload|review|result`), `promotion`, `meta`, `printUrl`, `message`, `imageUrl`, `loading`, `error`. Blocos: (1) dropzone/input file → `extractPrint`; (2) preview do print + formulário editável (inputs controlados por campo do schema; campos em `meta.low_confidence_fields` com borda âmbar; `meta.validation_warnings` listados; alerta se `meta.agency_commission_detected`); botão "Gerar" → `renderMessage` + `renderImage`; (3) preview da mensagem (textarea read-only + "Copiar mensagem" via `navigator.clipboard`) + preview da arte (`<img src={imageUrl}>`) + "Baixar imagem" (link `download`) + "Regenerar". Tratar `error.kind` com mensagens amigáveis. Seguir classes Tailwind/dark dos componentes existentes (ex.: `StatusTab.jsx`, `PrecosTab.jsx`). **Sem regra de negócio** — só chama o `promoClient`.

- [ ] **Step 1: Implementar** o componente conforme acima.
- [ ] **Step 2: Commit**
```bash
git add frontend/src/components/PromocoesTab.jsx
git commit -m "feat: add Promoções tab UI"
```

### Task 8.3: Registrar a aba em `App.jsx`

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1:** importar `Megaphone` de `lucide-react` e `PromocoesTab`; adicionar `{ value: 'promocoes', label: 'Promoções', icon: <Megaphone className="w-4 h-4" /> }` ao array `TABS` (linha 17-20); trocar o render ternário da linha 71 por um switch/condicional que inclua `activeTab === 'promocoes' && <PromocoesTab showToast={showToast} />`.

- [ ] **Step 2: Commit**
```bash
git add frontend/src/App.jsx
git commit -m "feat: wire Promoções tab into app shell"
```

---

## Fase 9 — Verificação end-to-end (manual)

- [ ] **Step 1:** `cd backend && npm test` → toda a suíte verde (incl. promos).
- [ ] **Step 2:** Subir backend (`npm run dev`) e frontend (`npm run dev`), logar, abrir aba **Promoções**.
- [ ] **Step 3:** Com `EXTRACTION_MODE=stub`, fazer upload de qualquer imagem → conferir formulário preenchido, campos de baixa confiança destacados, **alerta de comissão** visível mas comissão **ausente** da mensagem e da arte.
- [ ] **Step 4:** Gerar → conferir preview da mensagem e o PNG (fundo, card, **logo no topo central**, preço 10x, CTA). Baixar PNG e copiar mensagem.
- [ ] **Step 5:** (Opcional, com chaves reais) `EXTRACTION_MODE=real` + `GEMINI_API_KEY` → upload de um print real (`78d3898d-...jpg`) e validar a extração; `PEXELS_API_KEY` → destino sem foto local cai no fallback.
- [ ] **Step 6:** Após verificação, usar superpowers:finishing-a-development-branch para decidir merge/PR.

---

## Notas de manutenção
- `mockup-logo-placement.html` na raiz foi um artefato de brainstorming; pode ser removido ou movido para `docs/`.
- Imagens de exemplo (`modelo_promocao_*.png`, `*.jpg`, `arquitetura-final-automacao-promocoes.md`) estão untracked; decidir com o usuário se versiona ou ignora (`.gitignore`).
- Biblioteca de fundos: popular `backend/static/promo-backgrounds/<slug>.jpg` com fotos curadas dos destinos recorrentes (salvador, maceio, porto-seguro, florianopolis, belo-horizonte, rio-de-janeiro).
