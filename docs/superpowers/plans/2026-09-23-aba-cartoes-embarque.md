# Aba "Cartões de Embarque" Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba que recebe links de cartão de embarque (Azul/Gol/Latam), limpa-os, gera link curto próprio e entrega por e-mail profissional e WhatsApp (`wa.me`), com histórico, contagem de aberturas e retenção automática.

**Architecture:** Backend Express + SQLite no padrão dos Vouchers: helpers puros (limpeza de link, validação, mensagens, prefill de voucher) testados isoladamente; um store de persistência; rotas autenticadas `/api/boarding-passes`; rota pública `/c/:code` (redirect com allowlist); e-mail em módulo próprio reaproveitando o transporter SMTP do `notifier.js`; cron de retenção. Frontend React com a aba dividida em 4 componentes pequenos + um módulo de estado de formulário.

**Tech Stack:** Node/Express 5, sqlite3, nodemailer, node-cron, Jest + supertest (backend); React 19, Tailwind v4, lucide-react, axios (frontend).

**Spec:** `docs/superpowers/specs/2026-09-23-aba-cartoes-embarque-design.md`

**Branch:** `feat/cartoes-embarque` (já criada a partir de `main`).

**Convenções do projeto:**
- Testes backend: `cd backend && npx jest <padrão> --runInBand`
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Datas exibidas sempre em `America/Sao_Paulo`
- Não há runner de testes no frontend: verificação por `npm run build` + teste manual no navegador (Task 12)

**Decisão de implementação vs. spec:** o spec diz "bloqueia salvar só se o passageiro ficar sem link válido". O backend será **estrito** (qualquer link preenchido e inválido → 422), porque descartar silenciosamente um link digitado esconderia erro do agente. O frontend já mostra o erro inline antes.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `backend/helpers/boardingPassLink.js` | criar | Limpar/identificar link, decodificar JWT Google, allowlist |
| `backend/helpers/boardingPassPayload.js` | criar | Validar/normalizar corpo do envio (nomes, e-mails, telefones, links) |
| `backend/helpers/boardingPassMessage.js` | criar | Rótulos de trecho, agrupamento por destinatário, texto WhatsApp, `wa.me` |
| `backend/helpers/boardingPassVoucher.js` | criar | Converter voucher (unified) em prefill e rótulo de opção |
| `backend/services/boardingPassStore.js` | criar | Persistência SQLite (envios, links, códigos curtos, aberturas) |
| `backend/services/boardingPassEmail.js` | criar | HTML + envio do e-mail |
| `backend/services/boardingPassRetention.js` | criar | Cron de retenção |
| `backend/routes/boardingPasses.js` | criar | API autenticada |
| `backend/routes/shortLink.js` | criar | `GET /c/:code` público |
| `backend/database.js` | modificar | Tabelas novas |
| `backend/services/notifier.js` | modificar | Exportar `transporter`, constantes de logo e WhatsApp |
| `backend/server.js` | modificar | Montar rotas + iniciar cron |
| `backend/__tests__/testApp.js` | modificar | `makeBoardingPassApp()` |
| `backend/__tests__/fixtures/boardingPassLinks.js` | criar | Links reais de exemplo |
| `backend/__tests__/boardingPass*.test.js`, `routes-boardingPasses.test.js` | criar | Testes |
| `frontend/src/api/boardingPassClient.js` | criar | Cliente HTTP |
| `frontend/src/components/boarding-passes/formState.js` | criar | Estado do formulário, conversões, estilos, selo |
| `frontend/src/components/boarding-passes/PassengerCard.jsx` | criar | Bloco de passageiro + links |
| `frontend/src/components/boarding-passes/SendPanel.jsx` | criar | Prévia e ações |
| `frontend/src/components/boarding-passes/HistoryList.jsx` | criar | Histórico |
| `frontend/src/components/BoardingPassesTab.jsx` | criar | Orquestra a aba |
| `frontend/src/App.jsx` | modificar | Registrar aba |
| `docs/vouchers-handoff.md` | modificar | Seção sobre a nova aba |

---

### Task 1: Fixtures de links reais

**Files:**
- Create: `backend/__tests__/fixtures/boardingPassLinks.js`

- [ ] **Step 1: Criar o arquivo de fixtures**

```js
// Links reais (fornecidos pelo agente) usados nos testes de cartão de embarque.
// Fica em __tests__/fixtures/ e NÃO termina em .test.js, então o Jest não o executa.

const AZUL_JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJlbnRlcnByaXNlLXdhbGxldC1wcmRAZW50ZXJwcmlzZS13YWxsZXQtcHJkLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwiYXVkIjoiZ29vZ2xlIiwidHlwIjoic2F2ZXRvd2FsbGV0IiwicGF5bG9hZCI6eyJmbGlnaHRPYmplY3RzIjpbeyJpZCI6IjMzODgwMDAwMDAwMjI5MTcwNjAucHJkMjAyNjA5MjRBRDI3MzBTU0FSRUNSTldES1ROaUZCUkZRLSJ9XX19.fS23uqiUE6-W1HWXamxNJMhskmtfxQQmU8bZDLNRErtWun55bvNWg6WLzQIdHQe9qj9tnkbsF24ncmp9r_V5Mip7GVN1PCUrDXA-s70ab511tBYzDH_0WqtQge3xp4l41TdVKmORRGWKfuxMPuDmpTm7wsr85VZ-iILBYWt_H3wB9j3BC61_hI2I-LYGZJV1yZvZ9C_9BPtSiIO7DOZJAwXh7aH28fUc9I71d6GN6GX2THnq1rPsRA8uVfSNkR_PpOJelTR9l0tZZQkF-ZWgCGGM3wPDsU8hfZanpJ7NFkYixVXr8s__acETe-H9OlPMWtSKVeTHoNrVwmJ1QMFMRA';

const AZUL_CLEAN = `https://pay.google.com/gp/v/save/${AZUL_JWT}`;

const AZUL_RAW =
  `https://accounts.google.com/v3/signin/identifier?continue=${AZUL_CLEAN}` +
  `&followup=${AZUL_CLEAN}` +
  '&osid=1&passive=1209600&flowName=GlifWebSignIn&flowEntry=ServiceLogin&dsh=S1779555818:1790172118497245';

const AZUL_RAW_ENCODED =
  `https://accounts.google.com/v3/signin/identifier?continue=${encodeURIComponent(AZUL_CLEAN)}` +
  `&followup=${encodeURIComponent(AZUL_CLEAN)}&osid=1`;

const LATAM_RAW =
  'https://www.latamairlines.com/br/pt/boarding-pass?orderId=LA9573044YXJW&lastName=Carneiro&segmentIndex=0&itineraryId=2&origin=om' +
  '&utm_source=eim&utm_medium=wsp&utm_campaign=br_ltm_eim_wsp_dot_checkin_step1_conmaleta_nosbd_ok&messageId=am_checkin_step1_conmaleta_nosbd_ok';

const LATAM_CLEAN =
  'https://www.latamairlines.com/br/pt/boarding-pass?orderId=LA9573044YXJW&lastName=Carneiro&segmentIndex=0&itineraryId=2&origin=om';

module.exports = { AZUL_JWT, AZUL_CLEAN, AZUL_RAW, AZUL_RAW_ENCODED, LATAM_RAW, LATAM_CLEAN };
```

- [ ] **Step 2: Commit**

```bash
git add backend/__tests__/fixtures/boardingPassLinks.js
git commit -m "test(cartoes): fixtures com links reais Azul e Latam"
```

---

### Task 2: Limpeza e identificação de link (`boardingPassLink.js`)

**Files:**
- Create: `backend/helpers/boardingPassLink.js`
- Test: `backend/__tests__/boardingPassLink.test.js`

- [ ] **Step 1: Escrever os testes**

```js
const { parseBoardingPassLink, decodeGoogleWalletJwt, isAllowedHost } = require('../helpers/boardingPassLink');
const { AZUL_CLEAN, AZUL_RAW, AZUL_RAW_ENCODED, LATAM_RAW, LATAM_CLEAN } = require('./fixtures/boardingPassLinks');

describe('parseBoardingPassLink', () => {
  test('Azul: extrai exatamente o trecho entre continue= e &followup=', () => {
    const r = parseBoardingPassLink(AZUL_RAW);
    expect(r.ok).toBe(true);
    expect(r.cleanUrl).toBe(AZUL_CLEAN);
    expect(r.recognized).toBe(true);
    expect(r.carrier).toBe('azul');
  });

  test('Azul: lê voo, data, trecho e localizador do JWT', () => {
    const r = parseBoardingPassLink(AZUL_RAW);
    expect(r.data).toEqual({
      carrierCode: 'AD', flightNumber: 'AD2730', date: '2026-09-24',
      origin: 'SSA', destination: 'REC', locator: 'RNWDKT'
    });
  });

  test('Azul percent-encoded também é limpo', () => {
    expect(parseBoardingPassLink(AZUL_RAW_ENCODED).cleanUrl).toBe(AZUL_CLEAN);
  });

  test('link pay.google.com colado direto já é considerado limpo', () => {
    const r = parseBoardingPassLink(`  ${AZUL_CLEAN}  `);
    expect(r.cleanUrl).toBe(AZUL_CLEAN);
    expect(r.recognized).toBe(true);
  });

  test('Latam: remove utm_* e messageId, preserva o resto na ordem', () => {
    const r = parseBoardingPassLink(LATAM_RAW);
    expect(r.ok).toBe(true);
    expect(r.cleanUrl).toBe(LATAM_CLEAN);
    expect(r.carrier).toBe('latam');
    expect(r.data).toEqual({ orderId: 'LA9573044YXJW', lastName: 'Carneiro', segmentIndex: 0 });
  });

  test('URL desconhecida: aceita como está, não reconhecida', () => {
    const r = parseBoardingPassLink('https://exemplo.com/cartao?x=1');
    expect(r).toEqual({ ok: true, cleanUrl: 'https://exemplo.com/cartao?x=1', carrier: null, recognized: false, data: null });
  });

  test('texto que não é URL → erro', () => {
    expect(parseBoardingPassLink('isso não é link').ok).toBe(false);
    expect(parseBoardingPassLink('').ok).toBe(false);
  });

  test('accounts.google.com sem continue= → erro', () => {
    const r = parseBoardingPassLink('https://accounts.google.com/v3/signin/identifier?osid=1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/continue/);
  });
});

describe('decodeGoogleWalletJwt', () => {
  test('JWT corrompido → null, sem lançar', () => {
    expect(decodeGoogleWalletJwt('https://pay.google.com/gp/v/save/abc.%%%.def')).toBeNull();
    expect(decodeGoogleWalletJwt('https://pay.google.com/gp/v/save/')).toBeNull();
  });
});

describe('isAllowedHost', () => {
  test.each([
    ['https://pay.google.com/gp/v/save/x', true],
    ['https://www.latamairlines.com/br/pt/boarding-pass', true],
    ['https://b2c.voegol.com.br/x', true],
    ['https://www.voeazul.com.br/x', true],
    ['https://evil.com/?pay.google.com', false],
    ['https://pay.google.com.evil.com/x', false],
    ['javascript:alert(1)', false]
  ])('%s → %s', (url, expected) => {
    expect(isAllowedHost(url)).toBe(expected);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest boardingPassLink --runInBand`
Expected: FAIL — `Cannot find module '../helpers/boardingPassLink'`

- [ ] **Step 3: Implementar**

```js
// Limpeza e identificação de links de cartão de embarque.
//   - Azul/Gol: o link vem embrulhado no login do Google
//     (accounts.google.com/...?continue=<LINK>&followup=...). Extraímos <LINK>.
//   - Latam: já vem como link final; só removemos parâmetros de rastreamento.
//   - Qualquer outra URL http(s): aceita como está, marcada como não reconhecida.
// Puro, sem I/O.

const ALLOWED_HOSTS = ['pay.google.com', 'latamairlines.com', 'voegol.com.br', 'voeazul.com.br'];

const CARRIER_BY_CODE = { AD: 'azul', G3: 'gol', LA: 'latam', JJ: 'latam' };

const LATAM_TRACKING_PARAM = /^(utm_.+|messageId)$/i;

// Id do flightObject do Google Wallet, após o primeiro ".":
//   prd 20260924 AD 2730 SSA REC RNWDKT <sufixo>
const FLIGHT_ID_RE = /^[a-z]*(\d{8})([A-Z0-9]{2})(\d{1,4})([A-Z]{3})([A-Z]{3})([A-Z0-9]{6})/;

function toUrl(s) {
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function isAllowedHost(url) {
  const u = toUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some(d => hostMatches(host, d));
}

function extractContinue(raw) {
  const i = raw.indexOf('continue=');
  if (i < 0) return null;
  const rest = raw.slice(i + 'continue='.length);
  let end = rest.indexOf('&followup=');
  if (end < 0) end = rest.indexOf('&');
  let value = end < 0 ? rest : rest.slice(0, end);
  if (/^https?%3A/i.test(value)) {
    try { value = decodeURIComponent(value); } catch { return null; }
  }
  return value;
}

// Lê (sem validar assinatura) o payload do JWT "save to wallet".
function decodeGoogleWalletJwt(cleanUrl) {
  try {
    const u = new URL(cleanUrl);
    const token = u.pathname.split('/save/')[1];
    if (!token) return null;
    const payloadSeg = token.split('.')[1];
    if (!payloadSeg) return null;
    const json = JSON.parse(Buffer.from(payloadSeg, 'base64url').toString('utf8'));
    const objects = (json && json.payload && json.payload.flightObjects) || [];
    for (const obj of objects) {
      const id = String((obj && obj.id) || '');
      const suffix = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id;
      const m = suffix.match(FLIGHT_ID_RE);
      if (!m) continue;
      const [, ymd, code, num, origin, destination, locator] = m;
      return {
        carrierCode: code,
        flightNumber: `${code}${num}`,
        date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
        origin,
        destination,
        locator
      };
    }
    return null;
  } catch {
    return null;
  }
}

function parseBoardingPassLink(raw) {
  const input = String(raw || '').trim();
  if (!input) return { ok: false, error: 'Link vazio' };

  let candidate = input;
  if (/^https?:\/\/accounts\.google\.com\//i.test(input)) {
    const extracted = extractContinue(input);
    if (!extracted) return { ok: false, error: 'Não encontrei o link do cartão (continue=) neste endereço' };
    candidate = extracted;
  }

  const u = toUrl(candidate);
  if (!u) return { ok: false, error: 'Link inválido' };
  const host = u.hostname.toLowerCase();

  if (hostMatches(host, 'pay.google.com')) {
    const data = decodeGoogleWalletJwt(candidate);
    const carrier = data ? (CARRIER_BY_CODE[data.carrierCode] || null) : null;
    return { ok: true, cleanUrl: candidate, carrier, recognized: true, data };
  }

  if (hostMatches(host, 'latamairlines.com')) {
    for (const key of [...u.searchParams.keys()]) {
      if (LATAM_TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    const seg = u.searchParams.get('segmentIndex');
    const data = {
      orderId: u.searchParams.get('orderId') || null,
      lastName: u.searchParams.get('lastName') || null,
      segmentIndex: seg !== null && /^\d+$/.test(seg) ? Number(seg) : null
    };
    return { ok: true, cleanUrl: u.toString(), carrier: 'latam', recognized: true, data };
  }

  return { ok: true, cleanUrl: candidate, carrier: null, recognized: false, data: null };
}

module.exports = { parseBoardingPassLink, decodeGoogleWalletJwt, isAllowedHost, ALLOWED_HOSTS };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx jest boardingPassLink --runInBand`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add backend/helpers/boardingPassLink.js backend/__tests__/boardingPassLink.test.js
git commit -m "feat(cartoes): limpeza e identificação de link de cartão de embarque"
```

---

### Task 3: Validação do envio (`boardingPassPayload.js`)

**Files:**
- Create: `backend/helpers/boardingPassPayload.js`
- Test: `backend/__tests__/boardingPassPayload.test.js`

- [ ] **Step 1: Escrever os testes**

```js
const { validateSendPayload, normalizePhone } = require('../helpers/boardingPassPayload');
const { AZUL_RAW, AZUL_CLEAN, LATAM_RAW } = require('./fixtures/boardingPassLinks');

function body(overrides = {}) {
  return {
    passengers: [{ name: 'Maria Silva', email: 'Maria@X.com', phone: '(75) 99202-0012', segments: [{ url: AZUL_RAW }] }],
    emailMode: 'individual', whatsappMode: 'individual',
    ...overrides
  };
}

describe('normalizePhone', () => {
  test.each([
    ['(75) 99202-0012', '5575992020012'],
    ['7532020012', '557532020012'],
    ['+55 75 99202-0012', '5575992020012'],
    ['', null],
    ['123', undefined]
  ])('%s → %s', (input, out) => expect(normalizePhone(input)).toBe(out));
});

describe('validateSendPayload', () => {
  test('válido: normaliza e-mail/telefone e gera links limpos', () => {
    const r = validateSendPayload(body());
    expect(r.ok).toBe(true);
    expect(r.payload.passengers[0]).toEqual({
      name: 'Maria Silva', email: 'maria@x.com', phone: '5575992020012',
      segments: [{ url: AZUL_RAW, label: null }]
    });
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toMatchObject({ passengerIndex: 0, segmentIndex: 0, originalUrl: AZUL_RAW, cleanUrl: AZUL_CLEAN, carrier: 'azul', recognized: true });
    expect(r.flightDate).toBe('2026-09-24');
    expect(r.voucherId).toBeNull();
  });

  test('nome com uma palavra só → erro', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria', segments: [{ url: AZUL_RAW }] }] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/nome e sobrenome/);
  });

  test('formato "SOBRENOME, NOME" conta como 2 palavras', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'SILVA, MARIA', segments: [{ url: AZUL_RAW }] }] }));
    expect(r.ok).toBe(true);
  });

  test('passageiro sem nenhum link → erro; campos vazios são ignorados', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria Silva', segments: [{ url: '  ' }] }] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/pelo menos um link/);
  });

  test('link preenchido e inválido → erro', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria Silva', segments: [{ url: AZUL_RAW }, { url: 'lixo' }] }] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/trecho 2/);
  });

  test('segmentIndex é contínuo mesmo com campo vazio no meio', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria Silva', segments: [{ url: AZUL_RAW }, { url: '' }, { url: LATAM_RAW }] }] }));
    expect(r.ok).toBe(true);
    expect(r.links.map(l => l.segmentIndex)).toEqual([0, 1]);
  });

  test('e-mail e telefone inválidos → erro', () => {
    const r = validateSendPayload(body({ passengers: [{ name: 'Maria Silva', email: 'x@', phone: '12', segments: [{ url: AZUL_RAW }] }] }));
    expect(r.errors.join()).toMatch(/e-mail inválido/);
    expect(r.errors.join()).toMatch(/WhatsApp inválido/);
  });

  test('modo single: exige e valida e-mail(s) e telefone únicos', () => {
    expect(validateSendPayload(body({ emailMode: 'single', singleEmail: '' })).ok).toBe(false);
    const r = validateSendPayload(body({ emailMode: 'single', singleEmail: 'A@x.com, b@y.com', whatsappMode: 'single', singlePhone: '75992020012' }));
    expect(r.ok).toBe(true);
    expect(r.payload.singleEmail).toBe('a@x.com, b@y.com');
    expect(r.payload.singlePhone).toBe('5575992020012');
  });

  test('0 ou mais de 9 passageiros → erro', () => {
    expect(validateSendPayload(body({ passengers: [] })).ok).toBe(false);
    const ten = Array.from({ length: 10 }, () => ({ name: 'Maria Silva', segments: [{ url: AZUL_RAW }] }));
    expect(validateSendPayload(body({ passengers: ten })).ok).toBe(false);
  });

  test('flightDate: usa data do JWT; senão a informada; voucherId numérico', () => {
    const r = validateSendPayload(body({
      passengers: [{ name: 'Maria Silva', segments: [{ url: LATAM_RAW }] }],
      flightDate: '2026-10-01', voucherId: '12'
    }));
    expect(r.flightDate).toBe('2026-10-01');
    expect(r.voucherId).toBe(12);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest boardingPassPayload --runInBand`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```js
// Valida e normaliza o corpo de um envio de cartões de embarque.
// Retorna { ok:false, errors:[...] } ou
//         { ok:true, payload, links, flightDate, voucherId }.

const { parseBoardingPassLink } = require('./boardingPassLink');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSENGERS = 9;

// null = vazio; undefined = inválido; string = dígitos com DDI 55.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return undefined;
}

// null = vazio; undefined = algum inválido; string = lista normalizada "a@x, b@y".
function normalizeEmailList(raw) {
  const list = String(raw || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return null;
  if (list.some(e => !EMAIL_RE.test(e))) return undefined;
  return [...new Set(list)].join(', ');
}

function wordCount(name) {
  return name.replace(/,/g, ' ').split(/\s+/).filter(Boolean).length;
}

function validateSendPayload(body) {
  const src = body || {};
  const errors = [];
  const passengersIn = Array.isArray(src.passengers) ? src.passengers : [];
  if (passengersIn.length < 1 || passengersIn.length > MAX_PASSENGERS) {
    errors.push(`Informe de 1 a ${MAX_PASSENGERS} passageiros`);
  }

  const passengers = [];
  const links = [];

  passengersIn.slice(0, MAX_PASSENGERS).forEach((p, i) => {
    const n = i + 1;
    const name = String((p && p.name) || '').trim().replace(/\s+/g, ' ');
    if (wordCount(name) < 2) errors.push(`Passageiro ${n}: informe nome e sobrenome`);

    const emailRaw = String((p && p.email) || '').trim().toLowerCase();
    if (emailRaw && !EMAIL_RE.test(emailRaw)) errors.push(`Passageiro ${n}: e-mail inválido`);

    const phone = normalizePhone(p && p.phone);
    if (phone === undefined) errors.push(`Passageiro ${n}: WhatsApp inválido`);

    const segments = [];
    const segsIn = Array.isArray(p && p.segments) ? p.segments : [];
    segsIn.forEach((s) => {
      const url = String((s && s.url) || '').trim();
      if (!url) return;
      const parsed = parseBoardingPassLink(url);
      if (!parsed.ok) {
        errors.push(`Passageiro ${n}, trecho ${segments.length + 1}: ${parsed.error}`);
        return;
      }
      const segmentIndex = segments.length;
      segments.push({ url, label: s && s.label ? String(s.label) : null });
      links.push({
        passengerIndex: i,
        segmentIndex,
        originalUrl: url,
        cleanUrl: parsed.cleanUrl,
        carrier: parsed.carrier,
        recognized: parsed.recognized,
        data: parsed.data
      });
    });
    if (!segments.length) errors.push(`Passageiro ${n}: adicione pelo menos um link de cartão`);

    passengers.push({ name, email: emailRaw || null, phone: phone || null, segments });
  });

  const emailMode = src.emailMode === 'single' ? 'single' : 'individual';
  const whatsappMode = src.whatsappMode === 'single' ? 'single' : 'individual';

  let singleEmail = null;
  if (emailMode === 'single') {
    singleEmail = normalizeEmailList(src.singleEmail);
    if (singleEmail === null) errors.push('Informe o e-mail que vai receber todos os cartões');
    if (singleEmail === undefined) errors.push('E-mail único inválido');
  }

  let singlePhone = null;
  if (whatsappMode === 'single') {
    singlePhone = normalizePhone(src.singlePhone);
    if (singlePhone === undefined) errors.push('WhatsApp único inválido');
  }

  if (errors.length) return { ok: false, errors };

  const jwtDates = links.map(l => l.data && l.data.date).filter(Boolean).sort();
  const flightDate = jwtDates[0]
    || (/^\d{4}-\d{2}-\d{2}$/.test(String(src.flightDate || '')) ? src.flightDate : null);
  const vid = Number(src.voucherId);
  const voucherId = Number.isInteger(vid) && vid > 0 ? vid : null;

  return {
    ok: true,
    payload: { passengers, emailMode, singleEmail, whatsappMode, singlePhone },
    links,
    flightDate,
    voucherId
  };
}

module.exports = { validateSendPayload, normalizePhone };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx jest boardingPassPayload --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/helpers/boardingPassPayload.js backend/__tests__/boardingPassPayload.test.js
git commit -m "feat(cartoes): validação e normalização do envio"
```

---

### Task 4: Mensagens (`boardingPassMessage.js`)

**Files:**
- Create: `backend/helpers/boardingPassMessage.js`
- Test: `backend/__tests__/boardingPassMessage.test.js`

Formato do objeto `link` consumido aqui (vem do store, Task 6): `{ passengerIndex, segmentIndex, cleanUrl, shortCode, carrier, recognized, data }`.

- [ ] **Step 1: Escrever os testes**

```js
const {
  segmentLabel, buildRecipientGroups, buildWhatsappText, buildWhatsappMessages
} = require('../helpers/boardingPassMessage');

const OPTS = { baseUrl: 'https://painel.test', useOriginal: false };

const azulLink = (pi, si, extra = {}) => ({
  passengerIndex: pi, segmentIndex: si, cleanUrl: `https://pay.google.com/gp/v/save/x${pi}${si}`,
  shortCode: `Code${pi}${si}AB`, carrier: 'azul', recognized: true,
  data: { carrierCode: 'AD', flightNumber: 'AD2730', date: '2026-09-24', origin: 'SSA', destination: 'REC', locator: 'RNWDKT' },
  ...extra
});
const latamLink = (pi, si) => ({
  passengerIndex: pi, segmentIndex: si, cleanUrl: 'https://www.latamairlines.com/br/pt/boarding-pass?orderId=X',
  shortCode: `Lat${pi}${si}ABCD`.slice(0, 8), carrier: 'latam', recognized: true,
  data: { orderId: 'X', lastName: 'Silva', segmentIndex: si }
});

function payload(passengers, extra = {}) {
  return { passengers, emailMode: 'individual', whatsappMode: 'individual', singleEmail: null, singlePhone: null, ...extra };
}

describe('segmentLabel', () => {
  test('usa dados do JWT com nome da cidade', () => {
    expect(segmentLabel(azulLink(0, 0), null, 0)).toBe('AD2730 · Salvador → Recife · 24/09');
  });
  test('sem dados: usa rótulo do voucher, senão "Trecho N"', () => {
    expect(segmentLabel(latamLink(0, 1), 'LA3456 · São Paulo → Recife · 01/10', 1)).toBe('LA3456 · São Paulo → Recife · 01/10');
    expect(segmentLabel(latamLink(0, 1), null, 1)).toBe('Trecho 2');
  });
});

describe('buildWhatsappText', () => {
  test('1 passageiro Azul: saudação pelo primeiro nome, link curto e passos Google', () => {
    const p = payload([{ name: 'SILVA, MARIA', phone: '5575992020012', segments: [{ url: 'u', label: null }] }]);
    const [g] = buildRecipientGroups(p, [azulLink(0, 0)], 'whatsapp', OPTS);
    const text = buildWhatsappText(g);
    expect(text).toMatch(/^Olá, Maria! ✈️\nSeu check-in está feito\. Este é o seu cartão de embarque:/);
    expect(text).toContain('*AD2730 · Salvador → Recife · 24/09*\n👉 https://painel.test/c/Code00AB');
    expect(text).toContain('2. Toque em *Adicionar à carteira* (Google Wallet no Android, Apple Wallet no iPhone)');
    expect(text).toContain('Se a opção de carteira não aparecer, tire um print do QR code.');
    expect(text).toContain('*No aeroporto:*');
    expect(text.endsWith('*Clube do Voo Viagens*')).toBe(true);
  });

  test('Latam: passos Entendi / Adicionar à minha carteira', () => {
    const p = payload([{ name: 'Maria Silva', segments: [{ url: 'u', label: null }] }]);
    const [g] = buildRecipientGroups(p, [latamLink(0, 0)], 'whatsapp', OPTS);
    const text = buildWhatsappText(g);
    expect(text).toContain('2. Toque em *Entendi*');
    expect(text).toContain('3. Toque em *Adicionar à minha carteira*');
    expect(text).toContain('4. Pronto!');
  });

  test('modo single com 2 passageiros e 2 trechos: agrupa por passageiro, instruções uma vez', () => {
    const p = payload([
      { name: 'Maria Silva', segments: [{ url: 'a' }, { url: 'b' }] },
      { name: 'João Souza', segments: [{ url: 'c' }, { url: 'd' }] }
    ], { whatsappMode: 'single', singlePhone: '5575992020012' });
    const links = [azulLink(0, 0), azulLink(0, 1), azulLink(1, 0), azulLink(1, 1)];
    const groups = buildRecipientGroups(p, links, 'whatsapp', OPTS);
    expect(groups).toHaveLength(1);
    expect(groups[0].contact).toBe('5575992020012');
    const text = buildWhatsappText(groups[0]);
    expect(text.startsWith('Olá! ✈️\nO check-in de vocês está feito.')).toBe(true);
    expect(text).toContain('*Maria Silva*');
    expect(text).toContain('*João Souza*');
    expect(text.match(/Como salvar no celular/g)).toHaveLength(1);
  });

  test('cias misturadas: um bloco de instruções por cia, rotulado', () => {
    const p = payload([{ name: 'Maria Silva', segments: [{ url: 'a' }, { url: 'b' }] }]);
    const [g] = buildRecipientGroups(p, [azulLink(0, 0), latamLink(0, 1)], 'whatsapp', OPTS);
    const text = buildWhatsappText(g);
    expect(text).toContain('*Como salvar no celular (Azul / Gol):*');
    expect(text).toContain('*Como salvar no celular (Latam):*');
  });

  test('useOriginal ou link sem código curto → usa cleanUrl', () => {
    const p = payload([{ name: 'Maria Silva', segments: [{ url: 'a' }] }]);
    const [g1] = buildRecipientGroups(p, [azulLink(0, 0)], 'whatsapp', { ...OPTS, useOriginal: true });
    expect(buildWhatsappText(g1)).toContain('👉 https://pay.google.com/gp/v/save/x00');
    const [g2] = buildRecipientGroups(p, [azulLink(0, 0, { shortCode: null, recognized: false, carrier: null, data: null })], 'whatsapp', OPTS);
    expect(buildWhatsappText(g2)).toContain('👉 https://pay.google.com/gp/v/save/x00');
  });
});

describe('buildRecipientGroups (email)', () => {
  test('individual: um grupo por passageiro com o e-mail dele', () => {
    const p = payload([
      { name: 'Maria Silva', email: 'm@x.com', segments: [{ url: 'a' }] },
      { name: 'João Souza', email: null, segments: [{ url: 'b' }] }
    ]);
    const groups = buildRecipientGroups(p, [azulLink(0, 0), azulLink(1, 0)], 'email', OPTS);
    expect(groups.map(g => g.contact)).toEqual(['m@x.com', null]);
    expect(groups[0].passengers[0].segments[0].data.flightNumber).toBe('AD2730');
  });
});

describe('buildWhatsappMessages', () => {
  test('gera wa.me com número, ou sem número quando ausente', () => {
    const p = payload([
      { name: 'Maria Silva', phone: '5575992020012', segments: [{ url: 'a' }] },
      { name: 'João Souza', phone: null, segments: [{ url: 'b' }] }
    ]);
    const msgs = buildWhatsappMessages(p, [azulLink(0, 0), azulLink(1, 0)], OPTS);
    expect(msgs[0].waUrl.startsWith('https://wa.me/5575992020012?text=')).toBe(true);
    expect(msgs[1].waUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(msgs[0].waUrl.split('text=')[1])).toBe(msgs[0].text);
    expect(msgs[0].label).toBe('Maria Silva');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest boardingPassMessage --runInBand`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```js
// Monta o conteúdo das mensagens de cartão de embarque (fonte única para
// WhatsApp e e-mail). Puro, sem I/O.

const { airportCity, firstNameOf } = require('./voucherCarrier');

const WALLET_FALLBACK = 'Se a opção de carteira não aparecer, tire um print do QR code.';

// Passos por tipo de link. *texto* = negrito no WhatsApp (convertido no e-mail).
const INSTRUCTIONS = {
  google: [
    'Toque no link acima',
    'Toque em *Adicionar à carteira* (Google Wallet no Android, Apple Wallet no iPhone)',
    'Pronto! O cartão fica salvo e funciona mesmo sem internet'
  ],
  latam: [
    'Toque no link acima',
    'Toque em *Entendi*',
    'Toque em *Adicionar à minha carteira*',
    'Pronto! O cartão fica salvo e funciona mesmo sem internet'
  ],
  other: [
    'Toque no link acima',
    'Siga as instruções da página para salvar o cartão na carteira do celular'
  ]
};

const INSTRUCTION_LABEL = { google: 'Azul / Gol', latam: 'Latam', other: 'outras companhias' };

const AIRPORT_TIPS = [
  'Apresente o QR code do cartão e um documento oficial com foto na inspeção de segurança e no portão de embarque',
  'Deixe o brilho da tela no máximo',
  'Sem bagagem para despachar? Vá direto para a inspeção de segurança'
];

function instructionKey(link) {
  if (link.carrier === 'latam') return 'latam';
  if (link.recognized) return 'google';
  return 'other';
}

function cityOr(iata) {
  return airportCity(iata) || iata;
}

function dayMonth(ymd) {
  const [, m, d] = String(ymd).split('-');
  return `${d}/${m}`;
}

function segmentLabel(link, fallbackLabel, segmentIndex) {
  const d = link.data;
  if (d && d.flightNumber && d.origin && d.destination && d.date) {
    return `${d.flightNumber} · ${cityOr(d.origin)} → ${cityOr(d.destination)} · ${dayMonth(d.date)}`;
  }
  if (fallbackLabel) return fallbackLabel;
  return `Trecho ${segmentIndex + 1}`;
}

function linkUrl(link, { baseUrl, useOriginal }) {
  return !useOriginal && link.shortCode ? `${baseUrl}/c/${link.shortCode}` : link.cleanUrl;
}

function passengerCard(payload, links, i, opts) {
  const p = payload.passengers[i];
  const segments = links
    .filter(l => l.passengerIndex === i)
    .sort((a, b) => a.segmentIndex - b.segmentIndex)
    .map(l => ({
      label: segmentLabel(l, ((p.segments || [])[l.segmentIndex] || {}).label, l.segmentIndex),
      url: linkUrl(l, opts),
      instructionKey: instructionKey(l),
      data: l.data || null
    }));
  return { name: p.name, segments };
}

// channel: 'email' | 'whatsapp'. Retorna [{ passengers:[{name, segments}], contact }].
function buildRecipientGroups(payload, links, channel, opts) {
  const isEmail = channel === 'email';
  const mode = isEmail ? payload.emailMode : payload.whatsappMode;
  const cards = payload.passengers.map((_, i) => passengerCard(payload, links, i, opts));
  if (mode === 'single') {
    return [{ passengers: cards, contact: (isEmail ? payload.singleEmail : payload.singlePhone) || null }];
  }
  return cards.map((card, i) => ({
    passengers: [card],
    contact: (isEmail ? payload.passengers[i].email : payload.passengers[i].phone) || null
  }));
}

function instructionKeysOf(group) {
  return [...new Set(group.passengers.flatMap(p => p.segments.map(s => s.instructionKey)))];
}

function buildWhatsappText(group) {
  const pax = group.passengers;
  const segCount = pax.reduce((n, p) => n + p.segments.length, 0);
  const lines = [];

  if (pax.length === 1) {
    const first = firstNameOf(pax[0].name);
    lines.push(first ? `Olá, ${first}! ✈️` : 'Olá! ✈️');
    lines.push(segCount === 1
      ? 'Seu check-in está feito. Este é o seu cartão de embarque:'
      : 'Seu check-in está feito. Estes são os seus cartões de embarque:');
    lines.push('');
    pax[0].segments.forEach(s => lines.push(`*${s.label}*`, `👉 ${s.url}`, ''));
  } else {
    lines.push('Olá! ✈️', 'O check-in de vocês está feito. Estes são os cartões de embarque:', '');
    pax.forEach(p => {
      lines.push(`*${p.name}*`);
      p.segments.forEach(s => lines.push(s.label, `👉 ${s.url}`));
      lines.push('');
    });
  }

  const keys = instructionKeysOf(group);
  keys.forEach(k => {
    lines.push(keys.length > 1 ? `*Como salvar no celular (${INSTRUCTION_LABEL[k]}):*` : '*Como salvar no celular:*');
    INSTRUCTIONS[k].forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    if (keys.length > 1) lines.push('');
  });
  lines.push(WALLET_FALLBACK, '');

  lines.push('*No aeroporto:*');
  AIRPORT_TIPS.forEach(t => lines.push(`• ${t}`));
  lines.push('', 'Boa viagem! 🧳', '*Clube do Voo Viagens*');
  return lines.join('\n');
}

function waUrl(phone, text) {
  const t = encodeURIComponent(text);
  return phone ? `https://wa.me/${phone}?text=${t}` : `https://wa.me/?text=${t}`;
}

function buildWhatsappMessages(payload, links, opts) {
  return buildRecipientGroups(payload, links, 'whatsapp', opts).map(g => {
    const text = buildWhatsappText(g);
    return {
      label: g.passengers.map(p => p.name).join(', '),
      phone: g.contact,
      text,
      waUrl: waUrl(g.contact, text)
    };
  });
}

module.exports = {
  INSTRUCTIONS,
  INSTRUCTION_LABEL,
  AIRPORT_TIPS,
  WALLET_FALLBACK,
  segmentLabel,
  instructionKeysOf,
  buildRecipientGroups,
  buildWhatsappText,
  buildWhatsappMessages
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx jest boardingPassMessage --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/helpers/boardingPassMessage.js backend/__tests__/boardingPassMessage.test.js
git commit -m "feat(cartoes): texto do WhatsApp e agrupamento por destinatário"
```

---

### Task 5: Prefill a partir do voucher (`boardingPassVoucher.js`)

**Files:**
- Create: `backend/helpers/boardingPassVoucher.js`
- Test: `backend/__tests__/boardingPassVoucher.test.js`

- [ ] **Step 1: Escrever os testes**

```js
const { voucherToPrefill, voucherOptionLabel, tripLabel } = require('../helpers/boardingPassVoucher');

const unified = {
  passengers: [{ order: 1, name: 'SILVA, MARIA' }, { order: 2, name: 'João Souza' }],
  trips: [
    { flightNumber: 'AD 2730', departure: { airport: 'SSA', datetime: '2026-09-24T22:30:00-03:00' }, arrival: { airport: 'REC', datetime: '2026-09-25T00:05:00-03:00' } },
    { flightNumber: 'AZU4050', departure: { airport: 'REC', datetime: '2026-09-30T08:00:00-03:00' }, arrival: { airport: 'SSA', datetime: '2026-09-30T09:20:00-03:00' } }
  ]
};

test('tripLabel: voo sem espaço, cidades e data em horário de Brasília', () => {
  expect(tripLabel(unified.trips[0])).toBe('AD2730 · Salvador → Recife · 24/09');
  expect(tripLabel(unified.trips[1])).toBe('AD4050 · Recife → Salvador · 30/09');
});

test('tripLabel: 22:30 -03:00 NÃO vira o dia seguinte (fuso fixo)', () => {
  expect(tripLabel({ flightNumber: 'G3 1000', departure: { airport: 'GRU', datetime: '2026-09-24T23:50:00-03:00' }, arrival: { airport: 'SSA' } }))
    .toBe('G31000 · São Paulo → Salvador · 24/09');
});

test('voucherToPrefill: um campo de link por trecho para cada passageiro', () => {
  const r = voucherToPrefill(unified);
  expect(r.flightDate).toBe('2026-09-24');
  expect(r.passengers).toHaveLength(2);
  expect(r.passengers[0]).toEqual({
    name: 'SILVA, MARIA',
    segments: [{ label: 'AD2730 · Salvador → Recife · 24/09' }, { label: 'AD4050 · Recife → Salvador · 30/09' }]
  });
});

test('voucherToPrefill: tolera voucher sem trips/datas', () => {
  const r = voucherToPrefill({ passengers: [{ name: 'Maria Silva' }], trips: [] });
  expect(r).toEqual({ passengers: [{ name: 'Maria Silva', segments: [{ label: null }] }], flightDate: null });
});

test('voucherOptionLabel', () => {
  expect(voucherOptionLabel(unified)).toBe('SILVA, MARIA +1 · AD2730 · Salvador → Recife · 24/09');
  expect(voucherOptionLabel({ passengers: [], trips: [] }, 7)).toBe('Voucher #7');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest boardingPassVoucher --runInBand`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```js
// Converte um voucher (schema unified) em dados de pré-preenchimento da aba
// Cartões de Embarque. Datas sempre em America/Sao_Paulo.

const { airportCity, normalizeFlightNumber } = require('./voucherCarrier');

const TZ = 'America/Sao_Paulo';
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

function spDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return ymdFmt.format(d); // YYYY-MM-DD
}

function cityOr(iata) {
  return airportCity(iata) || iata;
}

function tripLabel(trip) {
  const t = trip || {};
  const fn = normalizeFlightNumber(t.flightNumber || '').replace(/\s+/g, '');
  const o = t.departure && t.departure.airport;
  const d = t.arrival && t.arrival.airport;
  const ymd = spDate(t.departure && t.departure.datetime);
  const parts = [
    fn || null,
    o && d ? `${cityOr(o)} → ${cityOr(d)}` : null,
    ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function voucherToPrefill(unified) {
  const u = unified || {};
  const trips = Array.isArray(u.trips) ? u.trips : [];
  const labels = trips.length ? trips.map(tripLabel) : [null];
  const passengers = (Array.isArray(u.passengers) ? u.passengers : []).map(p => ({
    name: String((p && p.name) || ''),
    segments: labels.map(label => ({ label }))
  }));
  const dates = trips.map(t => spDate(t && t.departure && t.departure.datetime)).filter(Boolean).sort();
  return { passengers, flightDate: dates[0] || null };
}

function voucherOptionLabel(unified, id) {
  const u = unified || {};
  const pax = Array.isArray(u.passengers) ? u.passengers : [];
  const trips = Array.isArray(u.trips) ? u.trips : [];
  const who = pax.length ? `${pax[0].name}${pax.length > 1 ? ` +${pax.length - 1}` : ''}` : null;
  const first = trips.length ? tripLabel(trips[0]) : null;
  const parts = [who, first].filter(Boolean);
  return parts.length ? parts.join(' · ') : `Voucher #${id}`;
}

module.exports = { voucherToPrefill, voucherOptionLabel, tripLabel };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx jest boardingPassVoucher --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/helpers/boardingPassVoucher.js backend/__tests__/boardingPassVoucher.test.js
git commit -m "feat(cartoes): pré-preenchimento a partir do voucher"
```

---

### Task 6: Tabelas + store de persistência

**Files:**
- Modify: `backend/database.js` (antes do `}` que fecha a função, logo após o bloco `package_audit_log`, ~linha 390)
- Create: `backend/services/boardingPassStore.js`

O store é coberto pelos testes de rota (Task 8), que exercitam todas as funções.

- [ ] **Step 1: Adicionar as tabelas em `database.js`**

Inserir logo após o `db.run(... package_audit_log ...)` (depois da linha `    });` que fecha esse bloco, antes do `}` final da função):

```js
    // --- Cartões de embarque ---
    db.run(`CREATE TABLE IF NOT EXISTS boarding_pass_sends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        voucher_id INTEGER,
        payload_json TEXT NOT NULL,
        flight_date TEXT,
        email_status TEXT NOT NULL DEFAULT 'not_sent',
        email_sent_at TEXT,
        email_log_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
        if (err) console.error('Error creating boarding_pass_sends table:', err.message);
        else {
            db.run(`CREATE INDEX IF NOT EXISTS idx_bps_user ON boarding_pass_sends(user_id, id DESC)`, (e) => {
                if (e) console.error('Error creating idx_bps_user:', e.message);
            });
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS boarding_pass_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        send_id INTEGER NOT NULL REFERENCES boarding_pass_sends(id) ON DELETE CASCADE,
        passenger_index INTEGER NOT NULL,
        segment_index INTEGER NOT NULL,
        original_url TEXT NOT NULL,
        clean_url TEXT NOT NULL,
        carrier TEXT,
        recognized INTEGER NOT NULL DEFAULT 0,
        parsed_json TEXT,
        short_code TEXT UNIQUE,
        open_count INTEGER NOT NULL DEFAULT 0,
        first_opened_at TEXT,
        last_opened_at TEXT
    )`, (err) => {
        if (err) console.error('Error creating boarding_pass_links table:', err.message);
        else {
            db.run(`CREATE INDEX IF NOT EXISTS idx_bpl_send ON boarding_pass_links(send_id)`, (e) => {
                if (e) console.error('Error creating idx_bpl_send:', e.message);
            });
        }
    });
```

- [ ] **Step 2: Criar `backend/services/boardingPassStore.js`**

```js
// Persistência da aba Cartões de Embarque (SQLite).
// Todas as funções de envio são escopadas por user_id, como os vouchers.

const crypto = require('crypto');
const db = require('../database');
const { segmentLabel } = require('../helpers/boardingPassMessage');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null)));
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}

function generateShortCode() {
  let out = '';
  for (const b of crypto.randomBytes(8)) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function parseJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function rowToLink(r) {
  return {
    id: r.id,
    passengerIndex: r.passenger_index,
    segmentIndex: r.segment_index,
    originalUrl: r.original_url,
    cleanUrl: r.clean_url,
    carrier: r.carrier,
    recognized: !!r.recognized,
    data: parseJson(r.parsed_json, null),
    shortCode: r.short_code,
    openCount: r.open_count,
    firstOpenedAt: r.first_opened_at,
    lastOpenedAt: r.last_opened_at
  };
}

function rowToSend(r, links) {
  return {
    id: r.id,
    voucherId: r.voucher_id,
    payload: parseJson(r.payload_json, { passengers: [] }),
    flightDate: r.flight_date,
    emailStatus: r.email_status,
    emailSentAt: r.email_sent_at,
    emailLog: parseJson(r.email_log_json, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    links
  };
}

async function insertLink(sendId, l, prev) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = prev ? prev.short_code : (l.recognized ? generateShortCode() : null);
    try {
      await dbRun(
        `INSERT INTO boarding_pass_links
           (send_id, passenger_index, segment_index, original_url, clean_url, carrier, recognized,
            parsed_json, short_code, open_count, first_opened_at, last_opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sendId, l.passengerIndex, l.segmentIndex, l.originalUrl, l.cleanUrl, l.carrier,
          l.recognized ? 1 : 0, l.data ? JSON.stringify(l.data) : null, code,
          prev ? prev.open_count : 0, prev ? prev.first_opened_at : null, prev ? prev.last_opened_at : null]
      );
      return;
    } catch (err) {
      if (!prev && code && /UNIQUE/i.test(err.message)) continue; // colisão de código: tenta outro
      throw err;
    }
  }
  throw new Error('não foi possível gerar código curto único');
}

// Recria os links do envio, preservando código curto e contadores quando
// (passageiro, trecho, link limpo) não mudou.
async function saveLinks(sendId, links) {
  const existing = await dbAll(`SELECT * FROM boarding_pass_links WHERE send_id = ?`, [sendId]);
  const byKey = new Map(existing.map(r => [`${r.passenger_index}:${r.segment_index}:${r.clean_url}`, r]));
  await dbRun(`DELETE FROM boarding_pass_links WHERE send_id = ?`, [sendId]);
  for (const l of links) {
    await insertLink(sendId, l, byKey.get(`${l.passengerIndex}:${l.segmentIndex}:${l.cleanUrl}`));
  }
}

async function createSend(userId, v) {
  const r = await dbRun(
    `INSERT INTO boarding_pass_sends (user_id, voucher_id, payload_json, flight_date) VALUES (?, ?, ?, ?)`,
    [userId, v.voucherId, JSON.stringify(v.payload), v.flightDate]
  );
  await saveLinks(r.lastID, v.links);
  return getSend(userId, r.lastID);
}

async function updateSend(userId, id, v) {
  const r = await dbRun(
    `UPDATE boarding_pass_sends SET voucher_id = ?, payload_json = ?, flight_date = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [v.voucherId, JSON.stringify(v.payload), v.flightDate, id, userId]
  );
  if (r.changes === 0) return null;
  await saveLinks(Number(id), v.links);
  return getSend(userId, id);
}

async function getSend(userId, id) {
  const row = await dbGet(`SELECT * FROM boarding_pass_sends WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!row) return null;
  const links = await dbAll(
    `SELECT * FROM boarding_pass_links WHERE send_id = ? ORDER BY passenger_index, segment_index`, [row.id]
  );
  return rowToSend(row, links.map(rowToLink));
}

async function listSends(userId) {
  const rows = await dbAll(
    `SELECT * FROM boarding_pass_sends WHERE user_id = ? ORDER BY id DESC LIMIT 100`, [userId]
  );
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const linkRows = await dbAll(
    `SELECT * FROM boarding_pass_links WHERE send_id IN (${ids.map(() => '?').join(',')})
     ORDER BY passenger_index, segment_index`, ids
  );
  return rows.map(r => {
    const links = linkRows.filter(l => l.send_id === r.id).map(rowToLink);
    const send = rowToSend(r, links);
    const passengers = send.payload.passengers || [];
    const first = links[0];
    const firstFallback = first ? ((passengers[first.passengerIndex] || {}).segments || [])[first.segmentIndex] : null;
    return {
      id: send.id,
      voucherId: send.voucherId,
      createdAt: send.createdAt,
      flightDate: send.flightDate,
      emailStatus: send.emailStatus,
      emailSentAt: send.emailSentAt,
      title: first ? segmentLabel(first, firstFallback && firstFallback.label, first.segmentIndex) : 'Cartões de embarque',
      passengers: passengers.map((p, i) => ({
        name: p.name,
        opened: links.some(l => l.passengerIndex === i && l.openCount > 0)
      }))
    };
  });
}

async function deleteSend(userId, id) {
  const row = await dbGet(`SELECT id FROM boarding_pass_sends WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!row) return false;
  await dbRun(`DELETE FROM boarding_pass_links WHERE send_id = ?`, [row.id]);
  await dbRun(`DELETE FROM boarding_pass_sends WHERE id = ?`, [row.id]);
  return true;
}

async function recordEmailResult(id, status, log) {
  await dbRun(
    `UPDATE boarding_pass_sends SET email_status = ?, email_log_json = ?, email_sent_at = datetime('now') WHERE id = ?`,
    [status, JSON.stringify(log), id]
  );
}

async function findLinkByCode(code) {
  const r = await dbGet(`SELECT * FROM boarding_pass_links WHERE short_code = ?`, [code]);
  return r ? rowToLink(r) : null;
}

async function registerOpen(linkId) {
  await dbRun(
    `UPDATE boarding_pass_links
       SET open_count = open_count + 1,
           first_opened_at = COALESCE(first_opened_at, datetime('now')),
           last_opened_at = datetime('now')
     WHERE id = ?`, [linkId]
  );
}

// --- Leitura de vouchers (para o prefill) ---
async function listVoucherRows(userId) {
  return dbAll(`SELECT id, unified_json FROM vouchers WHERE user_id = ? ORDER BY id DESC LIMIT 30`, [userId]);
}

async function getVoucherUnified(userId, voucherId) {
  const r = await dbGet(`SELECT unified_json FROM vouchers WHERE id = ? AND user_id = ?`, [voucherId, userId]);
  return r ? parseJson(r.unified_json, null) : null;
}

async function lastVoucherEmails(voucherId) {
  const r = await dbGet(
    `SELECT details FROM voucher_audit_log WHERE voucher_id = ? AND action = 'email_sent' ORDER BY id DESC LIMIT 1`,
    [voucherId]
  );
  const details = r ? parseJson(r.details, {}) : {};
  return Array.isArray(details.to) ? details.to : [];
}

module.exports = {
  createSend, updateSend, getSend, listSends, deleteSend, recordEmailResult,
  findLinkByCode, registerOpen,
  listVoucherRows, getVoucherUnified, lastVoucherEmails,
  generateShortCode
};
```

- [ ] **Step 3: Checar que os testes existentes continuam passando (migração não quebra nada)**

Run: `cd backend && npx jest voucherRetention routes-vouchers --runInBand`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/database.js backend/services/boardingPassStore.js
git commit -m "feat(cartoes): tabelas e store de envios/links"
```

---

### Task 7: E-mail (`boardingPassEmail.js`)

**Files:**
- Modify: `backend/services/notifier.js:1067` (exports)
- Create: `backend/services/boardingPassEmail.js`
- Test: `backend/__tests__/boardingPassEmail.test.js`

- [ ] **Step 1: Exportar transporter e constantes do `notifier.js`**

Trocar a linha final:

```js
module.exports = { sendTelegram, sendEmail, sendVoucherEmail, buildVoucherEmailHtml, buildPackageEmailHtml, sendPackageEmail };
```

por:

```js
module.exports = {
    sendTelegram, sendEmail, sendVoucherEmail, buildVoucherEmailHtml, buildPackageEmailHtml, sendPackageEmail,
    // Reaproveitados pelo e-mail de cartão de embarque (services/boardingPassEmail.js)
    transporter, AGENCY_LOGO_PATH, AGENCY_LOGO_CID, SOCIAL_WHATSAPP_URL
};
```

- [ ] **Step 2: Escrever os testes**

```js
const { buildBoardingPassEmailHtml, buildSubject } = require('../services/boardingPassEmail');

const seg = (extra = {}) => ({
  label: 'AD2730 · Salvador → Recife · 24/09', url: 'https://painel.test/c/Abc12345',
  instructionKey: 'google',
  data: { flightNumber: 'AD2730', date: '2026-09-24', origin: 'SSA', destination: 'REC' },
  ...extra
});

test('assunto com voo e data; plural quando há mais de um cartão', () => {
  expect(buildSubject({ passengers: [{ name: 'Maria Silva', segments: [seg()] }] }))
    .toBe('Seu cartão de embarque está pronto ✈️ AD2730 · 24/09');
  expect(buildSubject({ passengers: [{ name: 'Maria Silva', segments: [seg(), seg()] }] }))
    .toBe('Seus cartões de embarque estão prontos ✈️ AD2730 · 24/09');
  expect(buildSubject({ passengers: [{ name: 'Maria Silva', segments: [seg({ data: null })] }] }))
    .toBe('Seu cartão de embarque está pronto ✈️');
});

test('HTML: logo CID, botão por trecho, instruções da cia e dicas', () => {
  const html = buildBoardingPassEmailHtml({
    passengers: [
      { name: 'SILVA, MARIA', segments: [seg()] },
      { name: 'João <b>Souza</b>', segments: [seg({ instructionKey: 'latam', url: 'https://painel.test/c/Lat12345' })] }
    ]
  });
  expect(html).toContain('cid:clube-do-voo-logo');
  expect(html).toContain('Check-in realizado!');
  expect(html).toContain('href="https://painel.test/c/Abc12345"');
  expect(html).toContain('href="https://painel.test/c/Lat12345"');
  expect(html.match(/Adicionar à carteira<\/a>/g)).toHaveLength(2);
  expect(html).toContain('<strong>Entendi</strong>');
  expect(html).toContain('tire um print do QR code');
  expect(html).toContain('No aeroporto');
  expect(html).toContain('João &lt;b&gt;Souza&lt;/b&gt;'); // escapado
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd backend && npx jest boardingPassEmail --runInBand`
Expected: FAIL — módulo não encontrado

- [ ] **Step 4: Implementar `backend/services/boardingPassEmail.js`**

```js
// E-mail de cartão de embarque. Visual alinhado ao e-mail de pacote/voucher:
// logo via CID, cabeçalho azul, rodapé escuro. Recebe um "group" de
// buildRecipientGroups (helpers/boardingPassMessage.js).

const fs = require('fs');
const { transporter, AGENCY_LOGO_PATH, AGENCY_LOGO_CID } = require('./notifier');
const {
  INSTRUCTIONS, INSTRUCTION_LABEL, AIRPORT_TIPS, WALLET_FALLBACK, instructionKeysOf
} = require('../helpers/boardingPassMessage');
const { firstNameOf } = require('../helpers/voucherCarrier');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// *negrito* do WhatsApp → <strong> (depois de escapar)
function richText(s) {
  return escapeHtml(s).replace(/\*(.+?)\*/g, '<strong>$1</strong>');
}

function allSegments(group) {
  return group.passengers.flatMap(p => p.segments);
}

function buildSubject(group) {
  const segs = allSegments(group);
  const head = segs.length > 1
    ? 'Seus cartões de embarque estão prontos ✈️'
    : 'Seu cartão de embarque está pronto ✈️';
  const withData = segs.find(s => s.data && s.data.flightNumber && s.data.date);
  if (!withData) return head;
  const { flightNumber, date } = withData.data;
  return `${head} ${flightNumber} · ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function buttonHtml(url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="#00539C" style="background:#00539C;border-radius:8px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Adicionar à carteira</a>
    </td></tr></table>`;
}

function passengerBlock(p) {
  const rows = p.segments.map(s => `
    <tr><td style="padding:12px 0;border-top:1px solid #E5E7EB;">
      <div style="font-size:14px;font-weight:600;color:#2D3748;margin-bottom:10px;">✈️ ${escapeHtml(s.label)}</div>
      ${buttonHtml(s.url)}
    </td></tr>`).join('');
  return `<div style="border:1px solid #E2E8F0;border-radius:10px;padding:16px 18px;margin:0 0 16px;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#718096;font-weight:700;margin-bottom:4px;">Passageiro</div>
    <div style="font-size:17px;font-weight:700;color:#1A202C;margin-bottom:6px;">${escapeHtml(p.name)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
  </div>`;
}

function instructionsHtml(group) {
  const keys = instructionKeysOf(group);
  const blocks = keys.map(k => {
    const title = keys.length > 1 ? `Como salvar no celular (${INSTRUCTION_LABEL[k]})` : 'Como salvar no celular';
    const steps = INSTRUCTIONS[k]
      .map((step, i) => `<tr><td valign="top" style="padding:4px 10px 4px 0;"><span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;background:#00539C;color:#fff;font-size:12px;font-weight:700;text-align:center;">${i + 1}</span></td><td style="padding:4px 0;font-size:14px;color:#2D3748;line-height:1.5;">${richText(step)}</td></tr>`)
      .join('');
    return `<div style="font-size:15px;font-weight:700;color:#00539C;margin:0 0 8px;">${escapeHtml(title)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">${steps}</table>`;
  }).join('');
  return `<div style="background:#F0F6FC;border-radius:10px;padding:16px 18px;margin:8px 0 16px;">
    ${blocks}
    <div style="font-size:13px;color:#4A5568;">${escapeHtml(WALLET_FALLBACK)}</div>
  </div>`;
}

function airportHtml() {
  const items = AIRPORT_TIPS.map(t => `<li style="margin:0 0 6px;">${escapeHtml(t)}</li>`).join('');
  return `<div style="font-size:15px;font-weight:700;color:#00539C;margin:0 0 8px;">No aeroporto</div>
    <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;color:#2D3748;line-height:1.5;">${items}</ul>`;
}

function buildBoardingPassEmailHtml(group) {
  const pax = group.passengers;
  const first = pax.length === 1 ? firstNameOf(pax[0].name) : '';
  const greeting = first ? `Olá, ${first}` : 'Olá';
  const intro = allSegments(group).length > 1
    ? 'Seus cartões de embarque estão prontos. Toque no botão de cada trecho para salvá-los na carteira do celular.'
    : 'Seu cartão de embarque está pronto. Toque no botão abaixo para salvá-lo na carteira do celular.';
  const logoUrl = `cid:${AGENCY_LOGO_CID}`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartão de embarque</title></head>
<body style="margin:0;padding:0;background:#E2E8F0;font-family:Inter,Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#E2E8F0" style="background:#E2E8F0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#ffffff" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;">
        <tr><td bgcolor="#00539C" style="background:#00539C;padding:22px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" width="56" style="padding-right:14px;"><img src="${escapeHtml(logoUrl)}" alt="Clube do Voo" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:9999px;border:0;"></td>
            <td valign="middle" style="color:#fff;"><div style="font-size:19px;font-weight:700;">Clube do Voo Viagens</div><div style="font-size:13px;opacity:0.9;margin-top:3px;">Cartão de embarque</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 24px;">
          <div style="color:#00539C;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(greeting)}</div>
          <h2 style="font-size:24px;font-weight:700;color:#2D3748;margin:6px 0 8px;">Check-in realizado!</h2>
          <p style="font-size:14px;color:#4A5568;line-height:1.55;margin:0 0 20px;">${escapeHtml(intro)}</p>
          ${pax.map(passengerBlock).join('')}
          ${instructionsHtml(group)}
          ${airportHtml()}
          <div style="border-top:1px solid #E5E7EB;padding-top:18px;margin-top:20px;">
            <p style="color:#718096;font-size:13px;margin:0;">Boa viagem!</p>
            <p style="color:#718096;font-size:13px;margin:2px 0 0;">— Clube do Voo Viagens</p>
          </div>
        </td></tr>
        <tr><td align="center" bgcolor="#1A202C" style="background:#1A202C;padding:20px;color:#fff;">
          <a href="https://www.clubedovooviagens.com.br" style="color:#fff;text-decoration:none;font-size:13px;font-weight:600;">www.clubedovooviagens.com.br</a>
          <div style="font-size:11px;color:#9ca3af;font-style:italic;margin-top:6px;">E-mail automático — não responda diretamente.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendBoardingPassEmail({ to, bcc, group }) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return { sucesso: false, erro: 'Credenciais de e-mail não configuradas' };
    }
    const subject = buildSubject(group);
    const attachments = [];
    if (fs.existsSync(AGENCY_LOGO_PATH)) {
      attachments.push({ filename: 'logo.png', path: AGENCY_LOGO_PATH, cid: AGENCY_LOGO_CID, contentDisposition: 'inline' });
    }
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: to.join(', '),
      bcc: bcc || undefined,
      subject,
      html: buildBoardingPassEmailHtml(group),
      attachments
    });
    console.log(`[BOARDING-PASS] ✓ e-mail enviado para ${to.join(', ')} | MessageId: ${info.messageId}`);
    return { sucesso: true, messageId: info.messageId, subject };
  } catch (error) {
    console.error('[BOARDING-PASS] erro ao enviar e-mail:', error.message);
    return { sucesso: false, erro: error.message };
  }
}

module.exports = { buildBoardingPassEmailHtml, buildSubject, sendBoardingPassEmail };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && npx jest boardingPassEmail --runInBand`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/services/notifier.js backend/services/boardingPassEmail.js backend/__tests__/boardingPassEmail.test.js
git commit -m "feat(cartoes): e-mail profissional do cartão de embarque"
```

---

### Task 8: Rotas da API + link curto público

**Files:**
- Create: `backend/routes/boardingPasses.js`
- Create: `backend/routes/shortLink.js`
- Modify: `backend/__tests__/testApp.js` (novo `makeBoardingPassApp`)
- Test: `backend/__tests__/routes-boardingPasses.test.js`

- [ ] **Step 1: Adicionar `makeBoardingPassApp` em `testApp.js`**

Adicionar aos requires no topo (após `const packagesRouter = ...`):

```js
const boardingPassesRouter = require('../routes/boardingPasses');
const shortLinkRouter = require('../routes/shortLink');
```

Adicionar a função (antes de `getCsrfFromResponse`):

```js
function makeBoardingPassApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(session({
    store: new SqliteStore({
      db: 'sessions-test.sqlite',
      dir: process.env.DB_PATH,
      cleanupInterval: 3600
    }),
    name: 'cvv.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: false }
  }));
  app.use('/c', shortLinkRouter);
  app.use('/api', csrfMiddleware);
  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth);
  app.use('/api/vouchers', vouchersRouter);
  app.use('/api/boarding-passes', boardingPassesRouter);
  return app;
}
```

E incluir no `module.exports`: `makeBoardingPassApp`.

- [ ] **Step 2: Escrever os testes de rota**

```js
process.env.EXTRACTION_MODE = 'stub';
delete process.env.GEMINI_API_KEY;
process.env.PUBLIC_BASE_URL = 'https://painel.test';

jest.mock('../services/boardingPassEmail', () => ({
  sendBoardingPassEmail: jest.fn(async () => ({ sucesso: true, messageId: 'm1', subject: 's' }))
}));

const request = require('supertest');
const db = require('../database');
const { makeBoardingPassApp, waitForDb, getCsrfFromResponse } = require('./testApp');
const { sendBoardingPassEmail } = require('../services/boardingPassEmail');
const { AZUL_RAW, AZUL_CLEAN, LATAM_RAW, LATAM_CLEAN } = require('./fixtures/boardingPassLinks');

let app;
beforeAll(async () => {
  app = makeBoardingPassApp();
  await waitForDb();
  await new Promise(r => setTimeout(r, 600));
});
beforeEach(() => sendBoardingPassEmail.mockClear());

async function authed() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123!' });
  const meRes = await agent.get('/api/auth/me');
  return { agent, csrf: getCsrfFromResponse(meRes) };
}

function validBody(extra = {}) {
  return {
    passengers: [
      { name: 'Maria Silva', email: 'maria@x.com', phone: '75992020012', segments: [{ url: AZUL_RAW }] },
      { name: 'João Souza', segments: [{ url: LATAM_RAW }] }
    ],
    emailMode: 'individual', whatsappMode: 'individual',
    ...extra
  };
}

async function createSend(agent, csrf, body = validBody()) {
  const res = await agent.post('/api/boarding-passes').set('X-CSRF-Token', csrf).send(body);
  expect(res.status).toBe(201);
  return res.body;
}

test('sem login → 401', async () => {
  const res = await request(app).get('/api/boarding-passes');
  expect(res.status).toBe(401);
});

test('POST /parse-link devolve o link limpo', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/boarding-passes/parse-link').set('X-CSRF-Token', csrf).send({ url: AZUL_RAW });
  expect(res.status).toBe(200);
  expect(res.body.cleanUrl).toBe(AZUL_CLEAN);
  expect(res.body.data.flightNumber).toBe('AD2730');
});

test('POST inválido → 422 com lista de erros', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/boarding-passes').set('X-CSRF-Token', csrf)
    .send({ passengers: [{ name: 'Maria', segments: [{ url: AZUL_RAW }] }] });
  expect(res.status).toBe(422);
  expect(res.body.errors.join()).toMatch(/nome e sobrenome/);
});

test('POST válido cria envio com códigos curtos e data do voo', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  expect(send.id).toEqual(expect.any(Number));
  expect(send.flightDate).toBe('2026-09-24');
  expect(send.links).toHaveLength(2);
  expect(send.links[0].cleanUrl).toBe(AZUL_CLEAN);
  expect(send.links[1].cleanUrl).toBe(LATAM_CLEAN);
  send.links.forEach(l => expect(l.shortCode).toMatch(/^[A-Za-z0-9]{8}$/));
});

test('link não reconhecido não ganha código curto', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf, validBody({
    passengers: [{ name: 'Maria Silva', segments: [{ url: 'https://exemplo.com/cartao' }] }]
  }));
  expect(send.links[0].shortCode).toBeNull();
});

test('GET /:id/messages usa link curto; useOriginal=1 usa link limpo', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const short = await agent.get(`/api/boarding-passes/${send.id}/messages`);
  expect(short.status).toBe(200);
  expect(short.body).toHaveLength(2);
  expect(short.body[0].text).toContain(`https://painel.test/c/${send.links[0].shortCode}`);
  expect(short.body[0].waUrl.startsWith('https://wa.me/5575992020012?text=')).toBe(true);
  const orig = await agent.get(`/api/boarding-passes/${send.id}/messages?useOriginal=1`);
  expect(orig.body[0].text).toContain(AZUL_CLEAN);
});

test('PUT preserva código curto do link inalterado e troca o do link alterado', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const body = validBody();
  body.passengers[1].segments = [{ url: 'https://www.latamairlines.com/br/pt/boarding-pass?orderId=OUTRO&lastName=Souza&segmentIndex=0' }];
  const res = await agent.put(`/api/boarding-passes/${send.id}`).set('X-CSRF-Token', csrf).send(body);
  expect(res.status).toBe(200);
  expect(res.body.links[0].shortCode).toBe(send.links[0].shortCode);
  expect(res.body.links[1].shortCode).not.toBe(send.links[1].shortCode);
});

test('GET / lista com título e passageiros', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const res = await agent.get('/api/boarding-passes');
  expect(res.status).toBe(200);
  const item = res.body.find(i => i.id === send.id);
  expect(item.title).toBe('AD2730 · Salvador → Recife · 24/09');
  expect(item.passengers).toEqual([{ name: 'Maria Silva', opened: false }, { name: 'João Souza', opened: false }]);
});

test('send-email individual: envia só para quem tem e-mail e reporta os pulados', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const res = await agent.post(`/api/boarding-passes/${send.id}/send-email`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: 'sent', sent: 1, failed: 0, skipped: ['João Souza'] });
  expect(sendBoardingPassEmail).toHaveBeenCalledTimes(1);
  const arg = sendBoardingPassEmail.mock.calls[0][0];
  expect(arg.to).toEqual(['maria@x.com']);
  expect(arg.group.passengers[0].segments[0].url).toBe(`https://painel.test/c/${send.links[0].shortCode}`);
  const after = await agent.get(`/api/boarding-passes/${send.id}`);
  expect(after.body.emailStatus).toBe('sent');
});

test('send-email modo single: um e-mail com todos os passageiros', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf, validBody({ emailMode: 'single', singleEmail: 'a@x.com, b@y.com' }));
  const res = await agent.post(`/api/boarding-passes/${send.id}/send-email`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(200);
  const arg = sendBoardingPassEmail.mock.calls[0][0];
  expect(arg.to).toEqual(['a@x.com', 'b@y.com']);
  expect(arg.group.passengers).toHaveLength(2);
});

test('send-email sem nenhum e-mail → 400', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf, validBody({
    passengers: [{ name: 'Maria Silva', segments: [{ url: AZUL_RAW }] }]
  }));
  const res = await agent.post(`/api/boarding-passes/${send.id}/send-email`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(400);
});

test('send-email com falha SMTP → 500 e status failed', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  sendBoardingPassEmail.mockResolvedValueOnce({ sucesso: false, erro: 'SMTP down' });
  const res = await agent.post(`/api/boarding-passes/${send.id}/send-email`).set('X-CSRF-Token', csrf);
  expect(res.status).toBe(500);
  expect(res.body.status).toBe('failed');
});

test('/c/:code redireciona e conta abertura; bot de preview não conta', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const code = send.links[0].shortCode;

  const bot = await request(app).get(`/c/${code}`).set('User-Agent', 'WhatsApp/2.23.20.0 A');
  expect(bot.status).toBe(302);

  const human = await request(app).get(`/c/${code}`).set('User-Agent', 'Mozilla/5.0 (iPhone)');
  expect(human.status).toBe(302);
  expect(human.headers.location).toBe(AZUL_CLEAN);

  const after = await agent.get(`/api/boarding-passes/${send.id}`);
  expect(after.body.links[0].openCount).toBe(1);
  const list = await agent.get('/api/boarding-passes');
  expect(list.body.find(i => i.id === send.id).passengers[0].opened).toBe(true);
});

test('/c/:code inexistente → 404 com página amigável', async () => {
  const res = await request(app).get('/c/ZZZZZZZZ');
  expect(res.status).toBe(404);
  expect(res.text).toMatch(/expirou/);
});

test('/c/:code com host fora da allowlist → 404 (sem open redirect)', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  await new Promise((resolve, reject) => db.run(
    `UPDATE boarding_pass_links SET clean_url = 'https://evil.com/x' WHERE id = ?`, [send.links[0].id],
    (err) => err ? reject(err) : resolve()));
  const res = await request(app).get(`/c/${send.links[0].shortCode}`);
  expect(res.status).toBe(404);
});

test('DELETE remove envio e links', async () => {
  const { agent, csrf } = await authed();
  const send = await createSend(agent, csrf);
  const del = await agent.delete(`/api/boarding-passes/${send.id}`).set('X-CSRF-Token', csrf);
  expect(del.status).toBe(204);
  expect((await agent.get(`/api/boarding-passes/${send.id}`)).status).toBe(404);
  expect((await request(app).get(`/c/${send.links[0].shortCode}`)).status).toBe(404);
});

test('voucher-options e voucher-prefill', async () => {
  const { agent, csrf } = await authed();
  const created = await agent.post('/api/vouchers').set('X-CSRF-Token', csrf)
    .attach('file', Buffer.from('bp-prefill'), { filename: 'v.pdf', contentType: 'application/pdf' });
  expect(created.status).toBe(201);
  const vid = created.body.id;

  const opts = await agent.get('/api/boarding-passes/voucher-options');
  expect(opts.status).toBe(200);
  expect(opts.body.find(o => o.id === vid).label).toEqual(expect.any(String));

  const pre = await agent.get(`/api/boarding-passes/voucher-prefill/${vid}`);
  expect(pre.status).toBe(200);
  expect(pre.body.passengers.length).toBe(created.body.unified.passengers.length);
  const trips = created.body.unified.trips.length || 1;
  expect(pre.body.passengers[0].segments).toHaveLength(trips);
  expect(pre.body.lastEmails).toEqual([]);

  expect((await agent.get('/api/boarding-passes/voucher-prefill/999999')).status).toBe(404);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd backend && npx jest routes-boardingPasses --runInBand`
Expected: FAIL — `Cannot find module '../routes/boardingPasses'`

- [ ] **Step 4: Implementar `backend/routes/shortLink.js`**

```js
// Link curto público do cartão de embarque: GET /c/:code → 302 para o link da cia.
// Montado ANTES do requireAuth (o cliente final abre direto do WhatsApp/e-mail).

const express = require('express');
const store = require('../services/boardingPassStore');
const { isAllowedHost } = require('../helpers/boardingPassLink');
const { SOCIAL_WHATSAPP_URL } = require('../services/notifier');

const router = express.Router();

// Robôs de pré-visualização de link (WhatsApp, Facebook, Telegram etc.)
// recebem o redirect, mas não contam como abertura do cliente.
const BOT_UA = /whatsapp|facebookexternalhit|telegrambot|slackbot|bot\b|crawler|spider|preview/i;

const EXPIRED_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expirado</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:60px 20px;color:#5b6878">
<h1 style="color:#00539C;font-size:22px">Este link expirou</h1>
<p>Fale com a Clube do Voo Viagens para receber seu cartão de embarque novamente.</p>
<p><a href="${SOCIAL_WHATSAPP_URL}" style="display:inline-block;margin-top:12px;background:#25D366;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Falar no WhatsApp</a></p>
</body></html>`;

router.get('/:code', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex,nofollow');
  const code = String(req.params.code || '');
  let link = null;
  if (/^[A-Za-z0-9]{8}$/.test(code)) {
    try { link = await store.findLinkByCode(code); }
    catch (err) { console.error('[SHORT-LINK] erro ao buscar', err.message); }
  }
  if (!link || !isAllowedHost(link.cleanUrl)) {
    return res.status(404).type('html').send(EXPIRED_HTML);
  }
  if (!BOT_UA.test(req.get('user-agent') || '')) {
    try { await store.registerOpen(link.id); }
    catch (err) { console.error('[SHORT-LINK] erro ao registrar abertura', err.message); }
  }
  res.redirect(302, link.cleanUrl);
});

module.exports = router;
```

- [ ] **Step 5: Implementar `backend/routes/boardingPasses.js`**

```js
const express = require('express');
const store = require('../services/boardingPassStore');
const { parseBoardingPassLink } = require('../helpers/boardingPassLink');
const { validateSendPayload } = require('../helpers/boardingPassPayload');
const { buildWhatsappMessages, buildRecipientGroups } = require('../helpers/boardingPassMessage');
const { voucherToPrefill, voucherOptionLabel } = require('../helpers/boardingPassVoucher');
const { sendBoardingPassEmail } = require('../services/boardingPassEmail');

const router = express.Router();

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

function fail(res, message, err) {
  console.error(`[BOARDING-PASSES] ${message}`, err && err.message);
  res.status(500).json({ error: message });
}

router.post('/parse-link', (req, res) => {
  res.json(parseBoardingPassLink(req.body && req.body.url));
});

router.get('/voucher-options', async (req, res) => {
  try {
    const rows = await store.listVoucherRows(req.session.userId);
    res.json(rows.map(r => {
      let unified = null;
      try { unified = JSON.parse(r.unified_json); } catch { /* voucher corrompido: rótulo genérico */ }
      return { id: r.id, label: voucherOptionLabel(unified, r.id) };
    }));
  } catch (err) { fail(res, 'erro ao listar vouchers', err); }
});

router.get('/voucher-prefill/:voucherId', async (req, res) => {
  try {
    const unified = await store.getVoucherUnified(req.session.userId, req.params.voucherId);
    if (!unified) return res.status(404).json({ error: 'voucher não encontrado' });
    const lastEmails = await store.lastVoucherEmails(req.params.voucherId);
    res.json({ ...voucherToPrefill(unified), lastEmails });
  } catch (err) { fail(res, 'erro ao carregar voucher', err); }
});

router.get('/', async (req, res) => {
  try { res.json(await store.listSends(req.session.userId)); }
  catch (err) { fail(res, 'erro ao listar envios', err); }
});

router.post('/', async (req, res) => {
  const v = validateSendPayload(req.body);
  if (!v.ok) return res.status(422).json({ error: 'dados inválidos', errors: v.errors });
  try { res.status(201).json(await store.createSend(req.session.userId, v)); }
  catch (err) { fail(res, 'erro ao salvar envio', err); }
});

router.get('/:id', async (req, res) => {
  try {
    const send = await store.getSend(req.session.userId, req.params.id);
    if (!send) return res.status(404).json({ error: 'não encontrado' });
    res.json(send);
  } catch (err) { fail(res, 'erro ao buscar envio', err); }
});

router.put('/:id', async (req, res) => {
  const v = validateSendPayload(req.body);
  if (!v.ok) return res.status(422).json({ error: 'dados inválidos', errors: v.errors });
  try {
    const send = await store.updateSend(req.session.userId, req.params.id, v);
    if (!send) return res.status(404).json({ error: 'não encontrado' });
    res.json(send);
  } catch (err) { fail(res, 'erro ao atualizar envio', err); }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await store.deleteSend(req.session.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'não encontrado' });
    res.status(204).end();
  } catch (err) { fail(res, 'erro ao apagar envio', err); }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const send = await store.getSend(req.session.userId, req.params.id);
    if (!send) return res.status(404).json({ error: 'não encontrado' });
    const useOriginal = req.query.useOriginal === '1';
    res.json(buildWhatsappMessages(send.payload, send.links, { baseUrl: baseUrl(), useOriginal }));
  } catch (err) { fail(res, 'erro ao gerar mensagens', err); }
});

router.post('/:id/send-email', async (req, res) => {
  let send;
  try { send = await store.getSend(req.session.userId, req.params.id); }
  catch (err) { return fail(res, 'erro ao buscar envio', err); }
  if (!send) return res.status(404).json({ error: 'não encontrado' });

  const groups = buildRecipientGroups(send.payload, send.links, 'email', { baseUrl: baseUrl(), useOriginal: false })
    .filter(g => g.contact);
  if (!groups.length) return res.status(400).json({ error: 'nenhum e-mail informado' });

  const skipped = send.payload.emailMode === 'individual'
    ? send.payload.passengers.filter(p => !p.email).map(p => p.name)
    : [];

  const log = [];
  for (const g of groups) {
    const to = g.contact.split(',').map(s => s.trim()).filter(Boolean);
    const r = await sendBoardingPassEmail({ to, bcc: process.env.EMAIL_USER || null, group: g });
    log.push({ to, ok: !!r.sucesso, error: r.sucesso ? null : r.erro, at: new Date().toISOString() });
  }
  const sent = log.filter(l => l.ok).length;
  const failed = log.length - sent;
  const status = failed === 0 ? 'sent' : sent ? 'partial' : 'failed';

  try { await store.recordEmailResult(send.id, status, log); }
  catch (err) { console.error('[BOARDING-PASSES] erro ao registrar envio', err.message); }

  const body = { status, sent, failed, skipped, log };
  if (!sent) return res.status(500).json({ error: 'falha ao enviar e-mail', ...body });
  res.json(body);
});

module.exports = router;
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd backend && npx jest routes-boardingPasses --runInBand`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/routes/boardingPasses.js backend/routes/shortLink.js backend/__tests__/testApp.js backend/__tests__/routes-boardingPasses.test.js
git commit -m "feat(cartoes): API de envios e link curto público /c/:code"
```

---

### Task 9: Retenção automática

**Files:**
- Create: `backend/services/boardingPassRetention.js`
- Test: `backend/__tests__/boardingPassRetention.test.js`

- [ ] **Step 1: Escrever o teste**

```js
const db = require('../database');
const { runOnce } = require('../services/boardingPassRetention');

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { e ? reject(e) : resolve(this); }));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => e ? reject(e) : resolve(row)));
}

async function userId() {
  const row = await get(`SELECT id FROM users LIMIT 1`);
  if (row) return row.id;
  const r = await run(`INSERT INTO users (email, nome, password_hash, role, criado_em)
                       VALUES ('bp-retention@test.com', 'bp', 'x', 'admin', datetime('now'))`);
  return r.lastID;
}

async function insertSend(uid, flightDateSql, createdAtSql) {
  const r = await run(
    `INSERT INTO boarding_pass_sends (user_id, payload_json, flight_date, created_at)
     VALUES (?, '{"passengers":[]}', ${flightDateSql}, ${createdAtSql})`, [uid]);
  await run(`INSERT INTO boarding_pass_links (send_id, passenger_index, segment_index, original_url, clean_url)
             VALUES (?, 0, 0, 'u', 'u')`, [r.lastID]);
  return r.lastID;
}

test('apaga envios 7+ dias após o voo (ou após a criação, sem data) e seus links', async () => {
  const uid = await userId();
  const oldFlight = await insertSend(uid, "date('now','-10 days')", "datetime('now','-20 days')");
  const future = await insertSend(uid, "date('now','+3 days')", "datetime('now','-20 days')");
  const oldNoDate = await insertSend(uid, 'NULL', "datetime('now','-10 days')");
  const recentNoDate = await insertSend(uid, 'NULL', "datetime('now','-1 days')");

  const { deleted } = await runOnce();
  expect(deleted).toBeGreaterThanOrEqual(2);

  const exists = async id => !!(await get(`SELECT id FROM boarding_pass_sends WHERE id = ?`, [id]));
  expect(await exists(oldFlight)).toBe(false);
  expect(await exists(oldNoDate)).toBe(false);
  expect(await exists(future)).toBe(true);
  expect(await exists(recentNoDate)).toBe(true);

  const orphan = await get(`SELECT COUNT(*) AS n FROM boarding_pass_links WHERE send_id IN (?, ?)`, [oldFlight, oldNoDate]);
  expect(orphan.n).toBe(0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest boardingPassRetention --runInBand`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```js
// Retenção da aba Cartões de Embarque: apaga envios (e links) N dias após o voo.
// Sem data de voo, conta a partir da criação. BOARDING_PASS_RETENTION_DAYS (default 7).

const cron = require('node-cron');
const db = require('../database');

const RETENTION_DAYS = Number(process.env.BOARDING_PASS_RETENTION_DAYS || 7);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}

async function runOnce() {
  try {
    const r = await dbRun(
      `DELETE FROM boarding_pass_sends WHERE date(COALESCE(flight_date, created_at)) <= date('now', ?)`,
      [`-${RETENTION_DAYS} days`]
    );
    // Garantia extra caso foreign_keys esteja desligado nesta conexão.
    await dbRun(`DELETE FROM boarding_pass_links WHERE send_id NOT IN (SELECT id FROM boarding_pass_sends)`);
    return { deleted: r.changes };
  } catch (err) {
    console.error('[boardingPassRetention] erro', err.message);
    return { deleted: 0 };
  }
}

function startJob() {
  // NOTE: chamado APENAS por server.js dentro do app.listen — não invocar de testes.
  cron.schedule('45 3 * * *', () => {
    runOnce().then(({ deleted }) => {
      if (deleted) console.log(`[boardingPassRetention] apagou ${deleted} envio(s)`);
    });
  });
}

module.exports = { runOnce, startJob };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx jest boardingPassRetention --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/boardingPassRetention.js backend/__tests__/boardingPassRetention.test.js
git commit -m "feat(cartoes): retenção automática 7 dias após o voo"
```

---

### Task 10: Montar no servidor

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Adicionar requires** (após `const pacoteRouter = require('./routes/pacote');`)

```js
const boardingPassesRouter = require('./routes/boardingPasses');
const shortLinkRouter = require('./routes/shortLink');
const { startJob: startBoardingPassRetention } = require('./services/boardingPassRetention');
```

- [ ] **Step 2: Montar a rota pública** (logo após `app.use('/pacote', pacoteRouter);`)

```js
// Link curto do cartão de embarque (público; redireciona para o link da cia).
app.use('/c', shortLinkRouter);
```

- [ ] **Step 3: Montar a API** (após `app.use('/api/packages', packagesRouter);`)

```js
app.use('/api/boarding-passes', boardingPassesRouter);
```

- [ ] **Step 4: Iniciar o cron** (dentro do `app.listen`, após `startVoucherRetention();`)

```js
    startBoardingPassRetention();
```

- [ ] **Step 5: Rodar a suíte inteira do backend**

Run: `cd backend && npm test`
Expected: PASS (todas as suítes, incluindo as antigas)

- [ ] **Step 6: Commit**

```bash
git add backend/server.js
git commit -m "feat(cartoes): monta API, link curto e retenção no servidor"
```

---

### Task 11: Frontend — cliente, estado e componentes

**Files:**
- Create: `frontend/src/api/boardingPassClient.js`
- Create: `frontend/src/components/boarding-passes/formState.js`
- Create: `frontend/src/components/boarding-passes/PassengerCard.jsx`
- Create: `frontend/src/components/boarding-passes/SendPanel.jsx`
- Create: `frontend/src/components/boarding-passes/HistoryList.jsx`
- Create: `frontend/src/components/BoardingPassesTab.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: `frontend/src/api/boardingPassClient.js`**

```js
import api from '../hooks/useApi';

// Reaproveita o singleton axios de useApi.js (CSRF + tratamento de 401).

const BASE = '/api/boarding-passes';

export const parseLink = (url) => api.post(`${BASE}/parse-link`, { url }).then(r => r.data);
export const list = () => api.get(BASE).then(r => r.data);
export const get = (id) => api.get(`${BASE}/${id}`).then(r => r.data);
export const create = (payload) => api.post(BASE, payload).then(r => r.data);
export const update = (id, payload) => api.put(`${BASE}/${id}`, payload).then(r => r.data);
export const remove = (id) => api.delete(`${BASE}/${id}`);
export const messages = (id, useOriginal) =>
  api.get(`${BASE}/${id}/messages`, { params: { useOriginal: useOriginal ? 1 : 0 } }).then(r => r.data);
export const sendEmail = (id) => api.post(`${BASE}/${id}/send-email`).then(r => r.data);
export const voucherOptions = () => api.get(`${BASE}/voucher-options`).then(r => r.data);
export const voucherPrefill = (voucherId) => api.get(`${BASE}/voucher-prefill/${voucherId}`).then(r => r.data);
```

- [ ] **Step 2: `frontend/src/components/boarding-passes/formState.js`**

```js
// Estado do formulário da aba Cartões de Embarque + helpers puros.

export const inputCls =
  "w-full px-3 py-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border text-sm " +
  "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
  "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";

export const labelCls = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";

export const sectionCls =
  "border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 bg-white/70 dark:bg-slate-900/30";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 " +
  "dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer";

let seq = 0;
export function newKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${seq++}`;
}

export const emptySegment = (label = null) => ({ key: newKey(), url: '', label, parsed: null, error: null });

export const emptyPassenger = () => ({ key: newKey(), name: '', email: '', phone: '', segments: [emptySegment()] });

export const emptyForm = () => ({
  voucherId: null,
  flightDate: null,
  passengers: [emptyPassenger()],
  emailMode: 'individual',
  singleEmail: '',
  whatsappMode: 'individual',
  singlePhone: ''
});

export function formToPayload(form) {
  return {
    voucherId: form.voucherId,
    flightDate: form.flightDate,
    emailMode: form.emailMode,
    singleEmail: form.singleEmail,
    whatsappMode: form.whatsappMode,
    singlePhone: form.singlePhone,
    passengers: form.passengers.map(p => ({
      name: p.name,
      email: p.email,
      phone: p.phone,
      segments: p.segments.map(s => ({ url: s.url, label: s.label }))
    }))
  };
}

// Converte um envio salvo (GET /:id) de volta para o formulário.
export function sendToForm(send) {
  const { payload, links } = send;
  return {
    voucherId: send.voucherId,
    flightDate: send.flightDate,
    emailMode: payload.emailMode,
    singleEmail: payload.singleEmail || '',
    whatsappMode: payload.whatsappMode,
    singlePhone: payload.singlePhone || '',
    passengers: payload.passengers.map((p, pi) => ({
      key: newKey(),
      name: p.name,
      email: p.email || '',
      phone: p.phone || '',
      segments: p.segments.map((s, si) => {
        const link = links.find(l => l.passengerIndex === pi && l.segmentIndex === si);
        return {
          key: newKey(),
          url: s.url,
          label: s.label || null,
          error: null,
          parsed: link
            ? { ok: true, cleanUrl: link.cleanUrl, carrier: link.carrier, recognized: link.recognized, data: link.data }
            : null
        };
      })
    }))
  };
}

export function errorMessage(err, fallback) {
  const d = err?.response?.data;
  if (d?.errors?.length) return d.errors.join(' · ');
  return d?.error || fallback;
}

const CIA = { azul: 'Azul', gol: 'Gol', latam: 'Latam' };

// Selo exibido abaixo do campo do link.
export function badgeFor(parsed) {
  if (!parsed) return null;
  if (!parsed.recognized) return { tone: 'warn', text: 'Link não reconhecido — será enviado como está' };
  const d = parsed.data || {};
  const cia = CIA[parsed.carrier] || 'Google Wallet';
  if (d.flightNumber) {
    return { tone: 'ok', text: `${cia} · ${d.flightNumber} · ${d.origin}→${d.destination} · ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}` };
  }
  if (d.orderId) return { tone: 'ok', text: `${cia} · pedido ${d.orderId}` };
  return { tone: 'ok', text: `${cia} · link limpo` };
}
```

- [ ] **Step 3: `frontend/src/components/boarding-passes/PassengerCard.jsx`**

```jsx
import { Plus, Trash2, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import { inputCls, labelCls, sectionCls, btnGhost, badgeFor } from './formState';

export default function PassengerCard({
  index, passenger, onChange, onSegmentChange, onSegmentParse, onAddSegment, onRemoveSegment, onCopy
}) {
  return (
    <div className={sectionCls}>
      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
        Passageiro {index + 1}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>Nome e sobrenome *</label>
          <input className={`${inputCls} pii`} value={passenger.name} placeholder="Maria Silva"
            onChange={e => onChange({ name: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>E-mail (opcional)</label>
          <input className={`${inputCls} pii`} type="email" value={passenger.email} placeholder="cliente@email.com"
            onChange={e => onChange({ email: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>WhatsApp (opcional)</label>
          <input className={`${inputCls} pii`} value={passenger.phone} placeholder="(75) 99999-9999"
            onChange={e => onChange({ phone: e.target.value })} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {passenger.segments.map((s, si) => {
          const badge = badgeFor(s.parsed);
          return (
            <div key={s.key}>
              <label className={labelCls}>Cartão de embarque — {s.label || `Trecho ${si + 1}`}</label>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={s.url}
                  placeholder="Cole aqui o link do cartão de embarque"
                  onChange={e => onSegmentChange(si, { url: e.target.value, parsed: null, error: null })}
                  onBlur={e => onSegmentParse(si, e.target.value)}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text');
                    if (text) setTimeout(() => onSegmentParse(si, text), 0);
                  }}
                />
                {passenger.segments.length > 1 && (
                  <button type="button" className={btnGhost} title="Remover trecho" onClick={() => onRemoveSegment(si)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {s.error && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {s.error}
                </p>
              )}
              {badge && (
                <div className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${
                  badge.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                }`}>
                  {badge.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  <span>{badge.text}</span>
                  {s.parsed?.cleanUrl && (
                    <button type="button" className="underline cursor-pointer inline-flex items-center gap-1"
                      onClick={() => onCopy(s.parsed.cleanUrl, 'Link limpo copiado')}>
                      <Copy className="w-3 h-3" /> copiar link limpo
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className={btnGhost} onClick={onAddSegment}>
          <Plus className="w-3.5 h-3.5" /> trecho
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `frontend/src/components/boarding-passes/SendPanel.jsx`**

```jsx
import { Mail, MessageCircle, Copy, Sparkles } from 'lucide-react';
import { sectionCls, btnPrimary, btnGhost } from './formState';

const EMAIL_STATUS = {
  sent: { text: 'E-mail enviado', cls: 'text-emerald-700 dark:text-emerald-400' },
  partial: { text: 'E-mail enviado parcialmente', cls: 'text-amber-700 dark:text-amber-400' },
  failed: { text: 'Falha no envio do e-mail', cls: 'text-rose-600 dark:text-rose-400' }
};

export default function SendPanel({
  messages, dirty, saved, busy, emailStatus, useOriginal, onToggleOriginal, onPrepare, onEmail, onCopy
}) {
  const status = EMAIL_STATUS[emailStatus];
  const stale = dirty && saved;
  return (
    <div className={`${sectionCls} lg:sticky lg:top-4 space-y-4`}>
      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Envio</div>

      <div className="flex flex-col gap-2">
        <button type="button" className={btnPrimary} disabled={!!busy} onClick={onPrepare}>
          <Sparkles className="w-4 h-4" /> {busy === 'prepare' ? 'Preparando…' : 'Preparar mensagens'}
        </button>
        <button type="button" className={btnPrimary} disabled={!!busy} onClick={onEmail}>
          <Mail className="w-4 h-4" /> {busy === 'email' ? 'Enviando…' : 'Enviar e-mail(s)'}
        </button>
        {status && <p className={`text-xs ${status.cls}`}>{status.text}</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400">Uma cópia oculta de cada e-mail vai para a agência.</p>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
        <input type="checkbox" checked={useOriginal} onChange={e => onToggleOriginal(e.target.checked)} />
        Usar links originais (se o painel estiver fora do ar)
      </label>

      {stale && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Há alterações não salvas. Clique em <strong>Preparar mensagens</strong> para atualizar.
        </p>
      )}

      {messages.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Preencha os passageiros e clique em <strong>Preparar mensagens</strong> para ver o WhatsApp.
        </p>
      ) : (
        messages.map((m, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700/60 rounded-lg p-3">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              <span className="pii">{m.label}</span>
              <span className="text-slate-400"> · {m.phone ? `+${m.phone}` : 'sem número'}</span>
            </div>
            <pre className="pii mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-300 font-sans">
              {m.text}
            </pre>
            <div className="flex gap-2 mt-2">
              <a href={m.waUrl} target="_blank" rel="noreferrer"
                className={`${btnGhost} ${stale ? 'pointer-events-none opacity-50' : ''}`}>
                <MessageCircle className="w-3.5 h-3.5" /> Abrir WhatsApp
              </a>
              <button type="button" className={btnGhost} disabled={stale} onClick={() => onCopy(m.text, 'Mensagem copiada')}>
                <Copy className="w-3.5 h-3.5" /> Copiar mensagem
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 5: `frontend/src/components/boarding-passes/HistoryList.jsx`**

```jsx
import { FolderOpen, Trash2 } from 'lucide-react';
import { sectionCls, btnGhost } from './formState';

const STATUS = {
  not_sent: 'E-mail não enviado',
  sent: 'E-mail enviado',
  partial: 'E-mail parcial',
  failed: 'E-mail falhou'
};

// SQLite grava datetime('now') em UTC, sem fuso: "YYYY-MM-DD HH:MM:SS".
function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

export default function HistoryList({ items, activeId, onOpen, onDelete }) {
  if (!items.length) return null;
  return (
    <div className={sectionCls}>
      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Histórico</div>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700/60">
        {items.map(it => (
          <li key={it.id}
            className={`py-3 px-2 -mx-2 rounded-lg flex items-start justify-between gap-3 ${
              it.id === activeId ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''
            }`}>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{it.title}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {fmtDateTime(it.createdAt)} · {STATUS[it.emailStatus] || ''}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {it.passengers.map((p, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                    p.opened
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    <span className="pii">{p.name}</span> · {p.opened ? 'abriu ✓' : 'ainda não abriu'}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button type="button" className={btnGhost} onClick={() => onOpen(it.id)} title="Abrir">
                <FolderOpen className="w-3.5 h-3.5" /> Abrir
              </button>
              <button type="button" className={btnGhost} onClick={() => onDelete(it.id)} title="Apagar">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: `frontend/src/components/BoardingPassesTab.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import * as api from '../api/boardingPassClient';
import PassengerCard from './boarding-passes/PassengerCard';
import SendPanel from './boarding-passes/SendPanel';
import HistoryList from './boarding-passes/HistoryList';
import {
  inputCls, labelCls, sectionCls, btnGhost,
  emptyForm, emptyPassenger, emptySegment, formToPayload, sendToForm, errorMessage
} from './boarding-passes/formState';

export default function BoardingPassesTab({ showToast }) {
  const [form, setForm] = useState(emptyForm);
  const [sendId, setSendId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [messages, setMessages] = useState([]);
  const [useOriginal, setUseOriginal] = useState(false);
  const [busy, setBusy] = useState(null); // 'prepare' | 'email' | null
  const [emailStatus, setEmailStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [voucherOptions, setVoucherOptions] = useState([]);

  useEffect(() => {
    refreshHistory();
    api.voucherOptions().then(setVoucherOptions).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshHistory() {
    try { setHistory(await api.list()); }
    catch { showToast('Erro ao carregar histórico', 'error'); }
  }

  // --- edição do formulário ---
  function patchForm(patch) {
    setForm(f => ({ ...f, ...patch }));
    setDirty(true);
  }
  function patchPassenger(pi, patch) {
    setForm(f => ({ ...f, passengers: f.passengers.map((p, i) => (i === pi ? { ...p, ...patch } : p)) }));
    setDirty(true);
  }
  function patchSegment(pi, si, patch) {
    setForm(f => ({
      ...f,
      passengers: f.passengers.map((p, i) => (i !== pi ? p : {
        ...p, segments: p.segments.map((s, j) => (j === si ? { ...s, ...patch } : s))
      }))
    }));
    setDirty(true);
  }
  function addSegment(pi) {
    setForm(f => ({
      ...f,
      passengers: f.passengers.map((p, i) => (i === pi ? { ...p, segments: [...p.segments, emptySegment()] } : p))
    }));
    setDirty(true);
  }
  function removeSegment(pi, si) {
    setForm(f => ({
      ...f,
      passengers: f.passengers.map((p, i) => (i === pi ? { ...p, segments: p.segments.filter((_, j) => j !== si) } : p))
    }));
    setDirty(true);
  }
  function setPassengerCount(n) {
    setForm(f => {
      const passengers = f.passengers.slice(0, n);
      while (passengers.length < n) passengers.push(emptyPassenger());
      return { ...f, passengers };
    });
    setDirty(true);
  }

  async function parseSegment(pi, si, url) {
    const value = String(url || '').trim();
    if (!value) { patchSegment(pi, si, { parsed: null, error: null }); return; }
    try {
      const r = await api.parseLink(value);
      patchSegment(pi, si, r.ok ? { parsed: r, error: null } : { parsed: null, error: r.error });
    } catch {
      patchSegment(pi, si, { parsed: null, error: 'Não consegui verificar o link' });
    }
  }

  // --- voucher ---
  async function pickVoucher(voucherId) {
    if (!voucherId) { patchForm({ voucherId: null }); return; }
    try {
      const pre = await api.voucherPrefill(voucherId);
      setForm({
        ...emptyForm(),
        voucherId: Number(voucherId),
        flightDate: pre.flightDate,
        emailMode: pre.lastEmails.length ? 'single' : 'individual',
        singleEmail: pre.lastEmails.join(', '),
        passengers: pre.passengers.length
          ? pre.passengers.map(p => ({ ...emptyPassenger(), name: p.name, segments: p.segments.map(s => emptySegment(s.label)) }))
          : [emptyPassenger()]
      });
      setSendId(null); setDirty(true); setMessages([]); setEmailStatus(null);
    } catch {
      showToast('Erro ao carregar voucher', 'error');
    }
  }

  // --- salvar / mensagens / envio ---
  async function loadMessages(id, original = useOriginal) {
    setMessages(await api.messages(id, original));
  }

  async function ensureSaved() {
    if (sendId && !dirty) return sendId;
    const payload = formToPayload(form);
    const saved = sendId ? await api.update(sendId, payload) : await api.create(payload);
    setSendId(saved.id);
    setDirty(false);
    setEmailStatus(saved.emailStatus);
    refreshHistory();
    return saved.id;
  }

  async function handlePrepare() {
    setBusy('prepare');
    try {
      const id = await ensureSaved();
      await loadMessages(id);
    } catch (err) {
      showToast(errorMessage(err, 'Erro ao preparar mensagens'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function handleEmail() {
    setBusy('email');
    try {
      const id = await ensureSaved();
      await loadMessages(id);
      const r = await api.sendEmail(id);
      setEmailStatus(r.status);
      const extra = r.skipped?.length ? ` · sem e-mail: ${r.skipped.join(', ')}` : '';
      if (r.status === 'sent') showToast(`E-mail enviado (${r.sent})${extra}`, 'success');
      else showToast(`Envio parcial: ${r.sent} ok, ${r.failed} com falha${extra}`, 'error');
      refreshHistory();
    } catch (err) {
      if (err?.response?.data?.status) setEmailStatus(err.response.data.status);
      showToast(errorMessage(err, 'Falha ao enviar e-mail'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleOriginal(value) {
    setUseOriginal(value);
    if (sendId && !dirty) {
      try { await loadMessages(sendId, value); }
      catch { showToast('Erro ao atualizar mensagens', 'error'); }
    }
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg, 'success');
    } catch {
      showToast('Não consegui copiar — selecione o texto manualmente', 'error');
    }
  }

  // --- histórico ---
  function resetForm() {
    setForm(emptyForm());
    setSendId(null); setDirty(false); setMessages([]); setEmailStatus(null);
  }

  async function openFromHistory(id) {
    try {
      const send = await api.get(id);
      setForm(sendToForm(send));
      setSendId(send.id); setDirty(false); setEmailStatus(send.emailStatus);
      await loadMessages(send.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      showToast('Erro ao abrir envio', 'error');
    }
  }

  async function deleteFromHistory(id) {
    if (!window.confirm('Apagar este envio? Os links curtos deixam de funcionar.')) return;
    try {
      await api.remove(id);
      if (id === sendId) resetForm();
      refreshHistory();
    } catch {
      showToast('Erro ao apagar envio', 'error');
    }
  }

  const radio = (name, value, current, label, onPick) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
      <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} /> {label}
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className={sectionCls}>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[220px]">
                <label className={labelCls}>Puxar de um voucher</label>
                <select className={`${inputCls} pii`} value={form.voucherId || ''} onChange={e => pickVoucher(e.target.value)}>
                  <option value="">— Preencher manualmente —</option>
                  {voucherOptions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <div className="w-36">
                <label className={labelCls}>Passageiros</label>
                <select className={inputCls} value={form.passengers.length} onChange={e => setPassengerCount(Number(e.target.value))}>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button type="button" className={btnGhost} onClick={resetForm}>
                <RotateCcw className="w-3.5 h-3.5" /> Novo envio
              </button>
            </div>
          </div>

          {form.passengers.map((p, pi) => (
            <PassengerCard
              key={p.key}
              index={pi}
              passenger={p}
              onChange={patch => patchPassenger(pi, patch)}
              onSegmentChange={(si, patch) => patchSegment(pi, si, patch)}
              onSegmentParse={(si, url) => parseSegment(pi, si, url)}
              onAddSegment={() => addSegment(pi)}
              onRemoveSegment={si => removeSegment(pi, si)}
              onCopy={copyText}
            />
          ))}

          <div className={sectionCls}>
            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Destino</div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className={labelCls}>E-mail</div>
                {radio('emailMode', 'individual', form.emailMode, 'Cada passageiro recebe o seu', v => patchForm({ emailMode: v }))}
                {radio('emailMode', 'single', form.emailMode, 'Todos os cartões para um e-mail', v => patchForm({ emailMode: v }))}
                {form.emailMode === 'single' && (
                  <input className={`${inputCls} pii`} value={form.singleEmail} placeholder="cliente@email.com, outro@email.com"
                    onChange={e => patchForm({ singleEmail: e.target.value })} />
                )}
              </div>
              <div className="space-y-2">
                <div className={labelCls}>WhatsApp</div>
                {radio('whatsappMode', 'individual', form.whatsappMode, 'Cada um no seu número', v => patchForm({ whatsappMode: v }))}
                {radio('whatsappMode', 'single', form.whatsappMode, 'Todos os cartões para um número', v => patchForm({ whatsappMode: v }))}
                {form.whatsappMode === 'single' && (
                  <input className={`${inputCls} pii`} value={form.singlePhone} placeholder="(75) 99999-9999"
                    onChange={e => patchForm({ singlePhone: e.target.value })} />
                )}
              </div>
            </div>
          </div>
        </div>

        <SendPanel
          messages={messages}
          dirty={dirty}
          saved={!!sendId}
          busy={busy}
          emailStatus={emailStatus}
          useOriginal={useOriginal}
          onToggleOriginal={toggleOriginal}
          onPrepare={handlePrepare}
          onEmail={handleEmail}
          onCopy={copyText}
        />
      </div>

      <HistoryList items={history} activeId={sendId} onOpen={openFromHistory} onDelete={deleteFromHistory} />
    </div>
  );
}
```

- [ ] **Step 7: Registrar a aba em `frontend/src/App.jsx`**

Linha 2 — adicionar `QrCode` ao import do lucide:

```js
import { DollarSign, Settings, Activity, Megaphone, Ticket, Package, QrCode } from 'lucide-react';
```

Após `import PackagesTab from './components/PackagesTab';`:

```js
import BoardingPassesTab from './components/BoardingPassesTab';
```

No array `TABS`, após a entrada `vouchers`:

```js
  { value: 'cartoes', label: 'Cartões de Embarque', icon: <QrCode className="w-4 h-4" /> },
```

Após `{activeTab === 'vouchers' && <VouchersTab showToast={showToast} />}`:

```jsx
        {activeTab === 'cartoes' && <BoardingPassesTab showToast={showToast} />}
```

- [ ] **Step 8: Build do frontend**

Run: `cd frontend && npm run build`
Expected: build sem erros

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/boardingPassClient.js frontend/src/components/boarding-passes frontend/src/components/BoardingPassesTab.jsx frontend/src/App.jsx
git commit -m "feat(cartoes): aba Cartões de Embarque no frontend"
```

---

### Task 12: Verificação manual no navegador

**Files:** nenhum (só verificação; corrigir e commitar se algo falhar)

- [ ] **Step 1: Subir backend e frontend em dev** (usar `.claude/launch.json` / skill `run` do projeto, se houver; senão `cd backend && npm run dev` + `cd frontend && npm run dev`)

- [ ] **Step 2: Roteiro**

1. Login → aba **Cartões de Embarque** aparece.
2. Colar o link Azul do fixture (`AZUL_RAW`) → selo `Azul · AD2730 · SSA→REC · 24/09`; "copiar link limpo" copia exatamente `AZUL_CLEAN`.
3. Colar o link Latam → selo `Latam · pedido LA9573044YXJW`.
4. Colar `isso não é link` → erro vermelho inline.
5. 2 passageiros, um com e-mail/WhatsApp, outro sem → **Preparar mensagens** → 2 prévias; a do segundo diz "sem número".
6. **Abrir WhatsApp** abre `wa.me` com o texto; **Copiar mensagem** copia.
7. Marcar "usar links originais" → prévia troca o link curto pelo original.
8. Editar um nome → aviso "alterações não salvas" e botões de WhatsApp/copiar desabilitados até preparar de novo.
9. Abrir `http://localhost:3000/c/<código>` numa aba anônima → redireciona para o Google Wallet; o histórico mostra "abriu ✓".
10. **Puxar de um voucher** → nomes e rótulos de trecho preenchidos.
11. Ligar o modo privacidade → nomes borrados no formulário, na prévia e no histórico.
12. Dark mode e largura de celular (375px) sem quebra de layout.
13. (Se SMTP configurado no ambiente) **Enviar e-mail(s)** para um e-mail próprio → conferir visual, botões e o link.

- [ ] **Step 3: Commit de eventuais correções**

```bash
git add -A frontend backend
git commit -m "fix(cartoes): ajustes da verificação manual"
```

---

### Task 13: Documentação

**Files:**
- Modify: `docs/vouchers-handoff.md` (nova seção no fim)

- [ ] **Step 1: Acrescentar a seção**

```markdown
---

## Aba Cartões de Embarque (2026-09-23)

Spec: `docs/superpowers/specs/2026-09-23-aba-cartoes-embarque-design.md` · Plano: `docs/superpowers/plans/2026-09-23-aba-cartoes-embarque.md`

- **Limpeza de link** (`helpers/boardingPassLink.js`): Azul/Gol vêm como `accounts.google.com/...?continue=<LINK>&followup=...` → extrai `<LINK>` (pay.google.com). O JWT traz voo/data/trecho/localizador (id `prd20260924AD2730SSARECRNWDKT...`). Latam já vem final → só remove `utm_*`/`messageId`. Gol assumida igual à Azul (sem link real ainda).
- **Link curto** `/c/:code` (público, `routes/shortLink.js`): redirect 302 só para hosts da allowlist; conta aberturas (ignora bots de preview); expira com a retenção.
- **Mensagens** (`helpers/boardingPassMessage.js`): fonte única do texto WhatsApp e das instruções por cia (Latam: "Entendi" → "Adicionar à minha carteira").
- **E-mail** (`services/boardingPassEmail.js`): reaproveita `transporter` e logo CID exportados de `notifier.js`.
- **Retenção** (`services/boardingPassRetention.js`): cron 03:45, apaga envios `BOARDING_PASS_RETENTION_DAYS` (default 7) após o voo.
- **WhatsApp automático via API**: fora do escopo (evolução futura). Hoje é `wa.me` com texto pronto.
```

- [ ] **Step 2: Commit**

```bash
git add docs/vouchers-handoff.md
git commit -m "docs(cartoes): seção da aba Cartões de Embarque no handoff"
```
