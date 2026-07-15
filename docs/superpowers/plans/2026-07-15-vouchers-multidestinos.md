# Vouchers Multidestinos — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir combinar 2 a N vouchers rotulados (1 ida + N internos + volta opcional) num único voucher consolidado, renderizado em seções IDA / DESTINOS INTERNOS / VOLTA com um QR de "gerenciar reserva" por grupo de reserva.

**Architecture:** Generaliza o merge de 2 vouchers (`mergeVouchers`) para uma combinação de N vouchers rotulados (`combineVouchers`). Um novo endpoint `POST /api/vouchers/combine` recebe N arquivos + N roles, extrai cada um via Gemini em paralelo, e consolida num `unified_json`. O schema ganha `direction:'interno'` e `reservation.reservations[]` (array de `{code,carrier,appliesTo}`), 100% backwards-compatible via fallback. Um helper `buildReservationGroups` (twin frontend em `_shared.jsx` + backend em `reservationGroups.js`) é a fonte única de agrupamento consumida por templates, página hospedada e e-mail.

**Tech Stack:** Backend Node/Express + SQLite + multer + Jest. Frontend React 19 + Vite + Tailwind v4 (JSX). `qrcode` para QRs. Sem novas dependências.

**Spec:** `docs/superpowers/specs/2026-07-15-vouchers-multidestinos-design.md`

**Comando de teste backend:** `cd backend && npx jest <arquivo> --runInBand` (a suíte usa `--runInBand`; sem `GEMINI_API_KEY` o extractor entra em STUB). Pré-existentes `auth.test.js`/`users.test.js` falham na baseline — não são regressão.

---

## File Structure

**Backend (novo/modificado):**
- `backend/services/voucherSchema.js` — MOD: `+direction:'interno'`, valida `reservations[]`.
- `backend/services/voucherCombiner.js` — NOVO: `combineVouchers(items)`. Substitui `voucherMerger.js`.
- `backend/services/voucherMerger.js` — REMOVIDO (após paridade migrada).
- `backend/helpers/reservationGroups.js` — NOVO: `buildReservationGroups(voucherData)` (CommonJS, fonte de verdade testada).
- `backend/routes/vouchers.js` — MOD: `+POST /combine`, `−POST /merge`, `/send-email` para de calcular URLs.
- `backend/helpers/itinerarioPage.js` — MOD: render por grupos.
- `backend/services/notifier.js` — MOD: `buildVoucherEmailHtml`/`sendVoucherEmail` derivam grupos do `voucherData`; dropam params `bookingUrl`/`secondaryBookingUrl`.

**Backend (testes):**
- `backend/__tests__/voucherCombiner.test.js` — NOVO.
- `backend/__tests__/reservationGroups.test.js` — NOVO.
- `backend/__tests__/routes-vouchers.test.js` — MOD: casos `/combine`, remove casos `/merge`.
- `backend/__tests__/voucherMerger.test.js` — REMOVIDO.

**Frontend:**
- `frontend/src/components/voucher-templates/_shared.jsx` — MOD: `+buildReservationGroups` (port do backend).
- `frontend/src/components/voucher-templates/VoucherCanonicalV1.jsx` — MOD: N seções, N QRs.
- `frontend/src/components/voucher-templates/VoucherCompactoV1.jsx` — MOD: N seções, N QRs.
- `frontend/src/components/VouchersTab.jsx` — MOD: UI multi-arquivo dinâmica, remove modo merge.
- `frontend/src/api/voucherClient.js` — MOD: `+uploadCombine`, `−uploadMerge`.

**Docs:**
- `docs/superpowers/plans/vouchers-smoke-test.md` — MOD: roteiro multidestinos.

**Decisão de DRY (grupos):** o server (CommonJS) não importa JSX, e o frontend (Vite/ESM, build separado no Docker) não importa de `backend/`. Logo há duas cópias de `buildReservationGroups`. A **cópia backend (`reservationGroups.js`) é a fonte de verdade testada**; a cópia frontend em `_shared.jsx` é um port linha-a-linha. A paridade é garantida pelos testes backend + smoke test manual. Manter as duas idênticas em lógica.

---

## Task 1: Schema aceita `interno` e `reservations[]`

**Files:**
- Modify: `backend/services/voucherSchema.js`
- Test: `backend/__tests__/voucherSchema.test.js`

- [ ] **Step 1: Escrever teste que falha**

Adicionar ao final do `describe` existente em `backend/__tests__/voucherSchema.test.js`:

```js
describe('multidestinos', () => {
  const okBase = {
    carrier: 'multi', layoutVersion: 'azul.confirmacao.v1',
    reservation: {
      locator: 'ABC123', status: 'Confirmada',
      reservations: [
        { code: 'ABC123', carrier: 'azul',  appliesTo: 'ida' },
        { code: 'INT999', carrier: 'gol',   appliesTo: 'interno' },
        { code: 'VLT777', carrier: 'latam', appliesTo: 'volta' }
      ]
    },
    route: { origin: 'GRU', destination: 'LIS' },
    passengers: [{ order: 1, name: 'JOAO', type: 'adulto' }],
    trips: [
      { direction: 'ida',    dateLabel: 'x', departure: { airport: 'GRU', datetime: '2026-09-12T08:00:00-03:00' }, arrival: { airport: 'LIS', datetime: '2026-09-12T20:00:00-03:00' }, flightNumber: 'AD1', durationText: '10h' },
      { direction: 'interno',dateLabel: 'x', departure: { airport: 'LIS', datetime: '2026-09-14T09:00:00-03:00' }, arrival: { airport: 'FCO', datetime: '2026-09-14T11:00:00-03:00' }, flightNumber: 'G32', durationText: '2h' },
      { direction: 'volta',  dateLabel: 'x', departure: { airport: 'FCO', datetime: '2026-09-20T12:00:00-03:00' }, arrival: { airport: 'GRU', datetime: '2026-09-21T04:00:00-03:00' }, flightNumber: 'LA3', durationText: '11h' }
    ],
    baggage: [{ direction: 'interno', label: 'Bagagem de mão', quantity: 1 }],
    branding: { airlineName: 'Multi' },
    meta: { parsedAt: '2026-05-01T00:00:00Z', parserVersion: 'x', confidence: 0.9 }
  };

  test('aceita direction interno e reservations[]', () => {
    const r = validate(okBase);
    expect(r.ok).toBe(true);
  });

  test('rejeita reservations[].appliesTo inválido', () => {
    const bad = JSON.parse(JSON.stringify(okBase));
    bad.reservation.reservations[0].appliesTo = 'lateral';
    const r = validate(bad);
    expect(r.ok).toBe(false);
  });

  test('rejeita reservations[].carrier fora do enum', () => {
    const bad = JSON.parse(JSON.stringify(okBase));
    bad.reservation.reservations[1].carrier = 'tap';
    const r = validate(bad);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `cd backend && npx jest voucherSchema --runInBand`
Expected: FAIL nos 1º e/ou 3º casos (`direction interno` rejeitado; `reservations` não validado).

- [ ] **Step 3: Implementar no schema**

Em `backend/services/voucherSchema.js`:
- Trocar `const DIRECTIONS = ['ida', 'volta', 'multi'];` por `const DIRECTIONS = ['ida', 'interno', 'volta', 'multi'];`
- Após a validação de `trips`, adicionar validação opcional de `reservations` (dentro da função `validate`, antes do `return`):

```js
  // reservations[] é opcional (multidestinos). Quando presente, valida cada entrada.
  const APPLIES = ['ida', 'interno', 'volta'];
  const reslist = v.reservation && v.reservation.reservations;
  if (reslist !== undefined) {
    req(Array.isArray(resList => false), ''); // placeholder — ver abaixo
  }
```

> NOTA ao implementador: use este bloco correto (o placeholder acima é ilustrativo — não copie):

```js
  const APPLIES = ['ida', 'interno', 'volta'];
  if (v.reservation && v.reservation.reservations !== undefined) {
    const list = v.reservation.reservations;
    req(Array.isArray(list), 'reservation.reservations deve ser array');
    if (Array.isArray(list)) {
      list.forEach((r, i) => {
        req(r && typeof r.code === 'string' && r.code.length > 0, `reservations[${i}].code obrigatório`);
        req(CARRIERS.includes(r.carrier), `reservations[${i}].carrier inválido: ${r && r.carrier}`);
        req(APPLIES.includes(r.appliesTo), `reservations[${i}].appliesTo inválido: ${r && r.appliesTo}`);
      });
    }
  }
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `cd backend && npx jest voucherSchema --runInBand`
Expected: PASS (todos, incluindo os pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add backend/services/voucherSchema.js backend/__tests__/voucherSchema.test.js
git commit -m "feat(vouchers): schema aceita direction 'interno' e reservation.reservations[]"
```

---

## Task 2: `reservationGroups.js` (backend, fonte de verdade)

**Files:**
- Create: `backend/helpers/reservationGroups.js`
- Test: `backend/__tests__/reservationGroups.test.js`

Contrato: `buildReservationGroups(voucherData)` → array de grupos, na ordem de exibição:
```
{ role:'ida'|'interno'|'volta', label, trips:[...], carrierKey, locator }
```
Regras:
- Agrupa `trips` por `direction` preservando ordem: ida → internos → volta.
- Internos com PNRs distintos (par `carrier`+`locator`) subdividem em grupos.
- `carrierKey`/`locator` de cada grupo vêm de `reservations[]` casando por `appliesTo`; fallback: trip.locator / `reservation.locator` / `reservation.secondaryLocator`.
- `label`: `'IDA'`; `'DESTINOS INTERNOS'` (1 grupo interno) ou `'INTERNO — <IATA destino>'` (>1); `'VOLTA'`.
- Nunca lança; `trips` vazio → `[]`.
- **NÃO** monta `bookingUrl` (isso é responsabilidade do consumidor, que injeta `lastName`).

- [ ] **Step 1: Escrever teste que falha**

Criar `backend/__tests__/reservationGroups.test.js`:

```js
const { buildReservationGroups } = require('../helpers/reservationGroups');

const trip = (direction, dep, arr, loc) => ({
  direction, dateLabel: 'x',
  departure: { airport: dep, datetime: '2026-09-12T08:00:00-03:00' },
  arrival: { airport: arr, datetime: '2026-09-12T11:00:00-03:00' },
  flightNumber: 'AD1', durationText: '3h', locator: loc
});

describe('buildReservationGroups', () => {
  test('ida + interno + volta → 3 grupos rotulados na ordem', () => {
    const data = {
      carrier: 'multi',
      reservation: {
        locator: 'IDA111',
        reservations: [
          { code: 'IDA111', carrier: 'azul',  appliesTo: 'ida' },
          { code: 'INT222', carrier: 'gol',   appliesTo: 'interno' },
          { code: 'VLT333', carrier: 'latam', appliesTo: 'volta' }
        ]
      },
      trips: [ trip('ida','GRU','LIS','IDA111'), trip('interno','LIS','FCO','INT222'), trip('volta','FCO','GRU','VLT333') ]
    };
    const g = buildReservationGroups(data);
    expect(g.map(x => x.role)).toEqual(['ida', 'interno', 'volta']);
    expect(g[0].label).toBe('IDA');
    expect(g[1].label).toBe('DESTINOS INTERNOS');
    expect(g[2].label).toBe('VOLTA');
    expect(g[0].carrierKey).toBe('azul');
    expect(g[1].carrierKey).toBe('gol');
    expect(g[2].locator).toBe('VLT333');
  });

  test('sem volta → 2 grupos', () => {
    const data = {
      carrier: 'multi',
      reservation: { locator: 'IDA111', reservations: [
        { code: 'IDA111', carrier: 'azul', appliesTo: 'ida' },
        { code: 'INT222', carrier: 'gol',  appliesTo: 'interno' }
      ] },
      trips: [ trip('ida','GRU','LIS','IDA111'), trip('interno','LIS','FCO','INT222') ]
    };
    const g = buildReservationGroups(data);
    expect(g.map(x => x.role)).toEqual(['ida', 'interno']);
  });

  test('2 internos com PNRs distintos → subdivide em 2 grupos interno', () => {
    const data = {
      carrier: 'multi',
      reservation: { locator: 'IDA111', reservations: [
        { code: 'IDA111', carrier: 'azul', appliesTo: 'ida' },
        { code: 'INTA',   carrier: 'gol',  appliesTo: 'interno' },
        { code: 'INTB',   carrier: 'gol',  appliesTo: 'interno' }
      ] },
      trips: [ trip('ida','GRU','LIS','IDA111'), trip('interno','LIS','FCO','INTA'), trip('interno','FCO','ATH','INTB') ]
    };
    const g = buildReservationGroups(data);
    const internos = g.filter(x => x.role === 'interno');
    expect(internos).toHaveLength(2);
    expect(internos[0].label).toContain('INTERNO');
    expect(internos[0].locator).toBe('INTA');
    expect(internos[1].locator).toBe('INTB');
  });

  test('fallback esquema antigo (sem reservations[]): ida+volta via secondaryLocator', () => {
    const data = {
      carrier: 'multi',
      reservation: { locator: 'IDA111', secondaryLocator: 'VLT333', primaryCarrier: 'azul', secondaryCarrier: 'gol' },
      trips: [ trip('ida','GRU','REC','IDA111'), trip('volta','REC','GRU','VLT333') ]
    };
    const g = buildReservationGroups(data);
    expect(g.map(x => x.role)).toEqual(['ida', 'volta']);
    expect(g[0].carrierKey).toBe('azul');
    expect(g[1].carrierKey).toBe('gol');
    expect(g[1].locator).toBe('VLT333');
  });

  test('trips vazio → []', () => {
    expect(buildReservationGroups({ trips: [] })).toEqual([]);
    expect(buildReservationGroups({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `cd backend && npx jest reservationGroups --runInBand`
Expected: FAIL ("Cannot find module '../helpers/reservationGroups'").

- [ ] **Step 3: Implementar**

Criar `backend/helpers/reservationGroups.js`:

```js
// Agrupa os trechos de um voucher em blocos de reserva para render (seções + QRs).
// Fonte de verdade testada. O gêmeo em frontend/_shared.jsx#buildReservationGroups
// deve espelhar esta lógica linha-a-linha.

function normCarrier(c) { return (c || '').toLowerCase(); }

// Resolve carrier+locator de um role a partir de reservations[] (preferencial)
// ou do esquema legado (locator / secondaryLocator / primary/secondaryCarrier).
function resolveReservationFor(role, data, tripLocator) {
  const list = data.reservation && data.reservation.reservations;
  if (Array.isArray(list) && list.length) {
    const match = list.find(r => r.appliesTo === role && (!tripLocator || r.code === tripLocator))
              || list.find(r => r.appliesTo === role);
    if (match) return { carrierKey: normCarrier(match.carrier), locator: match.code };
  }
  // Fallback legado
  const r = data.reservation || {};
  if (role === 'ida') {
    return { carrierKey: normCarrier(r.primaryCarrier) || normCarrier(data.carrier) || 'azul', locator: r.locator || tripLocator || '' };
  }
  if (role === 'volta') {
    return { carrierKey: normCarrier(r.secondaryCarrier) || normCarrier(r.primaryCarrier) || normCarrier(data.carrier) || 'azul', locator: r.secondaryLocator || tripLocator || r.locator || '' };
  }
  // interno legado (raro): usa locator do trip
  return { carrierKey: normCarrier(data.carrier) || 'azul', locator: tripLocator || r.locator || '' };
}

function labelForInternoGroups(count) {
  return count > 1;
}

function buildReservationGroups(data) {
  const trips = Array.isArray(data && data.trips) ? data.trips : [];
  if (!trips.length) return [];

  const order = ['ida', 'interno', 'volta'];
  const byRole = { ida: [], interno: [], volta: [] };
  trips.forEach(t => {
    const d = (t.direction || '').toLowerCase();
    if (byRole[d]) byRole[d].push(t);
    else byRole.ida.push(t); // 'multi' ou desconhecido cai em ida
  });

  const groups = [];
  order.forEach(role => {
    const roleTrips = byRole[role];
    if (!roleTrips.length) return;

    if (role === 'interno') {
      // Subdivide por (carrierKey, locator)
      const buckets = [];
      roleTrips.forEach(t => {
        const { carrierKey, locator } = resolveReservationFor('interno', data, t.locator);
        const key = `${carrierKey}|${locator}`;
        let b = buckets.find(x => x.key === key);
        if (!b) { b = { key, carrierKey, locator, trips: [] }; buckets.push(b); }
        b.trips.push(t);
      });
      const multi = labelForInternoGroups(buckets.length);
      buckets.forEach(b => {
        const dest = b.trips[b.trips.length - 1].arrival && b.trips[b.trips.length - 1].arrival.airport;
        groups.push({
          role: 'interno',
          label: multi ? `INTERNO — ${(dest || '').toUpperCase()}` : 'DESTINOS INTERNOS',
          trips: b.trips, carrierKey: b.carrierKey, locator: b.locator
        });
      });
    } else {
      const { carrierKey, locator } = resolveReservationFor(role, data, roleTrips[0].locator);
      groups.push({
        role,
        label: role === 'ida' ? 'IDA' : 'VOLTA',
        trips: roleTrips, carrierKey, locator
      });
    }
  });

  return groups;
}

module.exports = { buildReservationGroups };
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `cd backend && npx jest reservationGroups --runInBand`
Expected: PASS (todos os 5 casos).

- [ ] **Step 5: Commit**

```bash
git add backend/helpers/reservationGroups.js backend/__tests__/reservationGroups.test.js
git commit -m "feat(vouchers): helper buildReservationGroups (backend, fonte de verdade)"
```

---

## Task 3: `voucherCombiner.js` (substitui `voucherMerger.js`)

**Files:**
- Create: `backend/services/voucherCombiner.js`
- Test: `backend/__tests__/voucherCombiner.test.js`
- (Remoção de `voucherMerger.js` fica na Task 4, após a rota migrar.)

Contrato: `combineVouchers(items)`, `items = [{ voucher, role }]`. Ver regras na spec §3.3.

- [ ] **Step 1: Escrever teste que falha**

Criar `backend/__tests__/voucherCombiner.test.js`. Reaproveita a `base` do antigo `voucherMerger.test.js` (copiar de lá) e adiciona:

```js
const { combineVouchers } = require('../services/voucherCombiner');
const { mergeVouchers } = require('../services/voucherMerger'); // ainda existe nesta task

const base = {
  carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
  reservation: { locator: 'ABC123', status: 'Confirmada' },
  route: { origin: 'GRU', destination: 'REC' },
  passengers: [{ order: 1, name: 'JOAO', type: 'adulto' }],
  trips: [{
    direction: 'ida', dateLabel: '12 SET 2026',
    departure: { airport: 'GRU', datetime: '2026-09-12T08:30:00-03:00' },
    arrival:   { airport: 'REC', datetime: '2026-09-12T11:45:00-03:00' },
    flightNumber: 'AD 4001', durationText: '3h15', airlineDisplayName: 'Azul Linhas Aéreas'
  }],
  baggage: [{ direction: 'ida', label: 'Bagagem de mão', weightText: '10kg', quantity: 1 }],
  branding: { airlineName: 'Azul' },
  meta: { parsedAt: '2026-05-01T00:00:00Z', parserVersion: 'x', confidence: 0.9 }
};
const clone = o => JSON.parse(JSON.stringify(o));

function makeReturn() {
  const r = clone(base);
  r.reservation.locator = 'RET456';
  r.trips[0].departure = { airport: 'REC', datetime: '2026-09-19T13:00:00-03:00' };
  r.trips[0].arrival   = { airport: 'GRU', datetime: '2026-09-19T16:30:00-03:00' };
  r.trips[0].flightNumber = 'AD 4002';
  return r;
}
function makeInterno(dep, arr, loc, carrier = 'gol') {
  const i = clone(base);
  i.carrier = carrier;
  i.reservation.locator = loc;
  i.trips[0].departure = { airport: dep, datetime: '2026-09-14T09:00:00-03:00' };
  i.trips[0].arrival   = { airport: arr, datetime: '2026-09-14T11:00:00-03:00' };
  i.trips[0].flightNumber = 'G3 100';
  return i;
}

describe('combineVouchers', () => {
  test('paridade com mergeVouchers no caso ida+volta', () => {
    const outbound = clone(base);
    const ret = makeReturn();
    const merged = mergeVouchers(clone(outbound), clone(ret));
    const combined = combineVouchers([{ voucher: clone(outbound), role: 'ida' }, { voucher: clone(ret), role: 'volta' }]);

    // Estrutura equivalente nos campos que os templates leem:
    expect(combined.trips.map(t => t.direction)).toEqual(merged.trips.map(t => t.direction));
    expect(combined.trips.map(t => t.flightNumber)).toEqual(merged.trips.map(t => t.flightNumber));
    expect(combined.baggage.map(b => b.direction)).toEqual(merged.baggage.map(b => b.direction));
    expect(combined.reservation.locator).toBe(merged.reservation.locator);
    expect(combined.reservation.secondaryLocator).toBe(merged.reservation.secondaryLocator);
    expect(combined.carrier).toBe(merged.carrier);
    expect(combined.route.origin).toBe(merged.route.origin);
  });

  test('ida + interno + volta → 3 blocos, direction correto', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeInterno('REC', 'FLN', 'INT777'), role: 'interno' },
      { voucher: makeReturn(), role: 'volta' }
    ]);
    expect(c.trips.map(t => t.direction)).toEqual(['ida', 'interno', 'volta']);
    expect(c.baggage.map(b => b.direction)).toEqual(['ida', 'interno', 'volta']);
    expect(c.reservation.reservations.map(r => r.appliesTo)).toEqual(['ida', 'interno', 'volta']);
    expect(c.carrier).toBe('multi'); // azul + gol + azul → cias distintas
  });

  test('ida + 2 internos + volta → 4 trips', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeInterno('REC', 'FLN', 'INTA'), role: 'interno' },
      { voucher: makeInterno('FLN', 'POA', 'INTB'), role: 'interno' },
      { voucher: makeReturn(), role: 'volta' }
    ]);
    expect(c.trips).toHaveLength(4);
    expect(c.trips.map(t => t.direction)).toEqual(['ida', 'interno', 'interno', 'volta']);
  });

  test('ida + interno sem volta → route.destination = arrival do interno', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeInterno('REC', 'FLN', 'INT777'), role: 'interno' }
    ]);
    expect(c.trips.map(t => t.direction)).toEqual(['ida', 'interno']);
    expect(c.route.origin).toBe('GRU');
    expect(c.route.destination).toBe('FLN');
  });

  test('3 carriers distintos → carrier multi + reservations com 3 entradas', () => {
    const c = combineVouchers([
      { voucher: clone(base), role: 'ida' }, // azul
      { voucher: makeInterno('REC', 'FLN', 'INT777', 'gol'), role: 'interno' },
      { voucher: (() => { const v = makeReturn(); v.carrier = 'latam'; return v; })(), role: 'volta' }
    ]);
    expect(c.carrier).toBe('multi');
    expect(c.reservation.reservations).toHaveLength(3);
  });

  test('mesma cia + mesmo PNR em 2 itens → reservations dedupe', () => {
    const dupA = clone(base); // azul ABC123
    const dupB = makeInterno('REC', 'FLN', 'ABC123', 'azul'); // mesmo code+carrier
    const c = combineVouchers([
      { voucher: dupA, role: 'ida' },
      { voucher: dupB, role: 'interno' }
    ]);
    expect(c.reservation.reservations).toHaveLength(1);
    expect(c.carrier).toBe('azul');
  });

  test('validações: 0 idas, 2 idas, 2 voltas, N=1, N=9 lançam', () => {
    expect(() => combineVouchers([{ voucher: clone(base), role: 'interno' }, { voucher: clone(base), role: 'volta' }])).toThrow(/ida/i);
    expect(() => combineVouchers([{ voucher: clone(base), role: 'ida' }, { voucher: clone(base), role: 'ida' }])).toThrow(/ida/i);
    expect(() => combineVouchers([{ voucher: clone(base), role: 'ida' }, { voucher: clone(base), role: 'volta' }, { voucher: clone(base), role: 'volta' }])).toThrow(/volta/i);
    expect(() => combineVouchers([{ voucher: clone(base), role: 'ida' }])).toThrow(/2/);
    const nine = [{ voucher: clone(base), role: 'ida' }, ...Array.from({ length: 8 }, () => ({ voucher: clone(base), role: 'interno' }))];
    expect(() => combineVouchers(nine)).toThrow(/8/);
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `cd backend && npx jest voucherCombiner --runInBand`
Expected: FAIL ("Cannot find module '../services/voucherCombiner'").

- [ ] **Step 3: Implementar**

Criar `backend/services/voucherCombiner.js`:

```js
const { tripCarrier } = require('../helpers/voucherCarrier');

// Combina N vouchers rotulados num único unified voucher.
// items = [{ voucher, role: 'ida'|'interno'|'volta' }]
function combineVouchers(items) {
  if (!Array.isArray(items) || items.length < 2) {
    throw new Error('É necessário combinar entre 2 e 8 vouchers');
  }
  if (items.length > 8) throw new Error('É necessário combinar entre 2 e 8 vouchers');

  const idas = items.filter(i => i.role === 'ida');
  const voltas = items.filter(i => i.role === 'volta');
  if (idas.length !== 1) throw new Error('Envie exatamente 1 voucher de ida');
  if (voltas.length > 1) throw new Error('No máximo 1 voucher de volta');

  // Ordena: ida → internos (ordem de entrada) → volta
  const idaItem = idas[0];
  const internoItems = items.filter(i => i.role === 'interno');
  const voltaItem = voltas[0] || null;
  const ordered = [idaItem, ...internoItems, ...(voltaItem ? [voltaItem] : [])];

  // Base = ida (passageiros, branding, locator principal)
  const out = JSON.parse(JSON.stringify(idaItem.voucher));

  const carrierOf = (v) => (v.carrier && v.carrier !== 'multi'
    ? v.carrier.toLowerCase()
    : (tripCarrier((v.trips || [])[0] || {}, 'azul') || 'azul').toLowerCase());

  // Monta trips, baggage, reservations
  const allTrips = [];
  const allBags = [];
  const reservations = [];
  const seen = new Set();

  ordered.forEach(({ voucher, role }) => {
    const loc = voucher.reservation && voucher.reservation.locator || '';
    const ck = carrierOf(voucher);
    (voucher.trips || []).forEach(t => allTrips.push({ ...t, direction: role, locator: t.locator || loc || null }));
    (voucher.baggage || []).forEach(b => allBags.push({ ...b, direction: role }));
    const dedupeKey = `${ck}|${loc}`;
    if (loc && !seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      reservations.push({ code: loc, carrier: ck, appliesTo: role });
    }
  });

  out.trips = allTrips;
  out.baggage = allBags;
  out.reservation = out.reservation || {};
  out.reservation.reservations = reservations;

  // Locator principal = da ida (já vem da base)
  const idaCk = carrierOf(idaItem.voucher);
  const idaLoc = idaItem.voucher.reservation && idaItem.voucher.reservation.locator || '';

  // Campos legados (fallback templates): secondaryLocator/Carrier no caso da volta
  if (voltaItem) {
    const vLoc = voltaItem.voucher.reservation && voltaItem.voucher.reservation.locator || '';
    const vCk = carrierOf(voltaItem.voucher);
    if (vLoc && vLoc !== idaLoc) out.reservation.secondaryLocator = vLoc;
    if (vCk !== idaCk) { out.reservation.secondaryCarrier = vCk; out.reservation.primaryCarrier = idaCk; }
  }

  // carrier top-level: multi se cias distintas > 1
  const distinctCarriers = new Set(ordered.map(i => carrierOf(i.voucher)));
  if (distinctCarriers.size > 1) {
    out.carrier = 'multi';
    out.reservation.primaryCarrier = out.reservation.primaryCarrier || idaCk;
  } else {
    out.carrier = idaCk;
  }

  // route: origin = 1ª partida da ida; destination = arrival do último trecho não-volta
  const nonVolta = allTrips.filter(t => t.direction !== 'volta');
  out.route = out.route || {};
  if (allTrips.length) out.route.origin = allTrips[0].departure && allTrips[0].departure.airport || out.route.origin;
  const lastNonVolta = nonVolta[nonVolta.length - 1] || allTrips[allTrips.length - 1];
  if (lastNonVolta) out.route.destination = lastNonVolta.arrival && lastNonVolta.arrival.airport || out.route.destination;

  // meta
  out.meta = out.meta || {};
  out.meta.combined = true;
  out.meta.merged = true; // espelho legado
  out.meta.combinedAt = new Date().toISOString();
  out.meta.sources = ordered.map(({ voucher, role }) => ({
    hash: (voucher.meta && voucher.meta.sourceFileHash) || null, role
  }));

  return out;
}

module.exports = { combineVouchers };
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `cd backend && npx jest voucherCombiner --runInBand`
Expected: PASS (todos os 7 casos).

- [ ] **Step 5: Commit**

```bash
git add backend/services/voucherCombiner.js backend/__tests__/voucherCombiner.test.js
git commit -m "feat(vouchers): combineVouchers (N vouchers rotulados) com teste de paridade"
```

---

## Task 4: Rota `POST /combine` + remoção de `/merge`

**Files:**
- Modify: `backend/routes/vouchers.js`
- Delete: `backend/services/voucherMerger.js`, `backend/__tests__/voucherMerger.test.js`
- Test: `backend/__tests__/routes-vouchers.test.js`

- [ ] **Step 1: Escrever teste que falha**

Em `backend/__tests__/routes-vouchers.test.js`, localizar os testes de `/merge` e substituí-los por `/combine`. Padrão de envio multipart com N campos `files` + N `roles` (usar `supertest` com `.attach('files', buf, name)` repetido e `.field('roles', role)` repetido — a ordem de `.attach`/`.field` preserva o pareamento por índice). Exemplo de caso de sucesso e de validação:

**IMPORTANTE — CSRF:** o arquivo NÃO tem `loginAgent`. Ele tem `async function authed()` que retorna `{ agent, csrf }`, e **toda** request mutante seta `.set('X-CSRF-Token', csrf)` (ver os testes existentes de `POST /api/vouchers` e `/send-email`). Sem isso, o POST leva 403. Confirmar o nome exato do helper relendo o topo do arquivo antes de escrever.

```js
const pdf = Buffer.from('%PDF-1.4 fake'); // extractor em STUB sem GEMINI_API_KEY (gera 2 trips por arquivo)

test('POST /combine com 3 arquivos (ida+interno+volta) cria voucher', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers/combine')
    .set('X-CSRF-Token', csrf)
    .attach('files', pdf, 'ida.pdf').field('roles', 'ida')
    .attach('files', pdf, 'interno.pdf').field('roles', 'interno')
    .attach('files', pdf, 'volta.pdf').field('roles', 'volta');
  expect(res.status).toBe(201);
  expect(res.body.unified.trips.length).toBeGreaterThanOrEqual(3);
});

test('POST /combine sem ida → 400', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers/combine')
    .set('X-CSRF-Token', csrf)
    .attach('files', pdf, 'a.pdf').field('roles', 'interno')
    .attach('files', pdf, 'b.pdf').field('roles', 'volta');
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/ida/i);
});

test('POST /combine com 1 arquivo → 400', async () => {
  const { agent, csrf } = await authed();
  const res = await agent.post('/api/vouchers/combine')
    .set('X-CSRF-Token', csrf)
    .attach('files', pdf, 'a.pdf').field('roles', 'ida');
  expect(res.status).toBe(400);
});
```

> NOTA STUB: o extractor em STUB emite **2 trips por arquivo**, e o combiner re-taga por role. Logo 3 arquivos → 6 trips, e `trips.length >= 3` vale.

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `cd backend && npx jest routes-vouchers --runInBand`
Expected: FAIL (rota `/combine` não existe → 404).

- [ ] **Step 3: Implementar a rota**

Em `backend/routes/vouchers.js`:

1. Trocar o import:
```js
// remover: const { mergeVouchers } = require('../services/voucherMerger');
const { combineVouchers } = require('../services/voucherCombiner');
```

2. Remover o bloco `uploadDual` + `router.post('/merge', ...)` inteiro (linhas ~74-142).

3. Adicionar no lugar:
```js
// Combine: 2 a 8 arquivos no campo 'files', 2 a 8 roles no campo 'roles' (pareados por índice)
const uploadMulti = upload.array('files', 8);

router.post('/combine', uploadMulti, async (req, res) => {
  const files = req.files || [];
  let roles = req.body?.roles;
  if (typeof roles === 'string') roles = [roles];
  roles = Array.isArray(roles) ? roles : [];

  if (files.length !== roles.length) return res.status(400).json({ error: 'files e roles precisam ter o mesmo tamanho' });
  if (files.length < 2 || files.length > 8) return res.status(400).json({ error: 'Envie entre 2 e 8 vouchers' });
  const VALID = ['ida', 'interno', 'volta'];
  if (roles.some(r => !VALID.includes(r))) return res.status(400).json({ error: 'tipo de voucher inválido' });
  if (roles.filter(r => r === 'ida').length !== 1) return res.status(400).json({ error: 'Envie exatamente 1 voucher de ida' });
  if (roles.filter(r => r === 'volta').length > 1) return res.status(400).json({ error: 'No máximo 1 voucher de volta' });

  try {
    // Extrai todos em paralelo. Se qualquer um falhar, nada é persistido.
    const unifiedList = await Promise.all(files.map(async (f, i) => {
      try {
        return await extractVoucher(f.buffer, f.mimetype);
      } catch (e) {
        e._voucherIndex = i; e._voucherRole = roles[i];
        throw e;
      }
    }));

    const items = unifiedList.map((voucher, i) => ({ voucher, role: roles[i] }));
    const unified = combineVouchers(items);

    const v = validate(unified);
    if (!v.ok) {
      console.error('[VOUCHERS] combine falhou na validação', v.errors);
      return res.status(422).json({ error: 'schema inválido após combinar', details: v.errors });
    }

    // Salva todos os arquivos originais + hash composto
    const ts = Date.now();
    const hashes = files.map(f => 'sha256:' + crypto.createHash('sha256').update(f.buffer).digest('hex'));
    const composedHash = `combine:${hashes.map(h => h.slice(7, 15)).join('+')}`.slice(0, 120);
    unified.meta.sourceFileHash = composedHash;

    const paths = files.map((f, i) => path.join(uploadsDir(), `${ts}-${roles[i]}-${hashes[i].slice(7, 15)}${path.extname(f.originalname) || ''}`));
    paths.forEach((p, i) => fs.writeFileSync(p, files[i].buffer));
    const filePath = paths.join('|');

    db.run(
      `INSERT INTO vouchers (user_id, carrier, layout_version, source_file_path, source_file_hash, unified_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.userId, unified.carrier, unified.layoutVersion, filePath, composedHash, JSON.stringify(unified)],
      function (err) {
        if (err) {
          paths.forEach(p => fs.unlink(p, () => {}));
          console.error('[VOUCHERS] erro ao salvar voucher combinado', err.message);
          return res.status(500).json({ error: 'falha ao salvar voucher' });
        }
        audit(this.lastID, req.session.userId, 'create', {
          combined: true, roles, files: files.map(f => f.originalname)
        }, composedHash);
        res.status(201).json({ id: this.lastID, unified });
      }
    );
  } catch (err) {
    const idxInfo = err._voucherRole ? ` #${(err._voucherIndex ?? 0) + 1} (${err._voucherRole})` : '';
    console.error('[VOUCHERS] erro ao processar combine', err.message);
    if (err.code === 'gemini_unavailable' || /503|service unavailable|high demand/i.test(err.message)) {
      return res.status(503).json({ error: `Serviço de extração (Gemini) com alta demanda ao ler o voucher${idxInfo}. Tente em instantes.`, retryable: true });
    }
    if (/quota|exceeded/i.test(err.message)) {
      return res.status(429).json({ error: `Cota da API Gemini esgotada ao ler o voucher${idxInfo}.`, retryable: true });
    }
    // Erros de validação do combiner (ex: "Envie exatamente 1 voucher de ida") → 400
    if (/ida|volta|2 e 8|combinar/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(502).json({ error: `Não consegui ler o voucher${idxInfo}. ${err.message}` });
  }
});
```

- [ ] **Step 4: Remover o merger e seu teste**

```bash
git rm backend/services/voucherMerger.js backend/__tests__/voucherMerger.test.js
```

Ajustar `backend/__tests__/voucherCombiner.test.js`: remover o `require('../services/voucherMerger')` e o teste de paridade que o usa **OU** inline a lógica esperada. Preferência: manter a paridade convertendo-a em asserções absolutas (o teste já checa direction/flightNumber/locator/carrier/route explicitamente — basta trocar as comparações contra `merged` por valores literais esperados). Reescrever o 1º caso assim:

```js
  test('caso ida+volta (ex-paridade): direction e locators corretos', () => {
    const combined = combineVouchers([
      { voucher: clone(base), role: 'ida' },
      { voucher: makeReturn(), role: 'volta' }
    ]);
    expect(combined.trips.map(t => t.direction)).toEqual(['ida', 'volta']);
    expect(combined.trips.map(t => t.flightNumber)).toEqual(['AD 4001', 'AD 4002']);
    expect(combined.baggage.map(b => b.direction)).toEqual(['ida', 'volta']);
    expect(combined.reservation.locator).toBe('ABC123');
    expect(combined.reservation.secondaryLocator).toBe('RET456');
    expect(combined.carrier).toBe('azul');
    expect(combined.route.origin).toBe('GRU');
  });
```

- [ ] **Step 5: Rodar testes — devem passar**

Run: `cd backend && npx jest voucherCombiner routes-vouchers --runInBand`
Expected: PASS. (Confirmar que nenhum outro teste importa `voucherMerger`.)

- [ ] **Step 6: Commit**

```bash
git add backend/routes/vouchers.js backend/__tests__/routes-vouchers.test.js backend/__tests__/voucherCombiner.test.js
git commit -m "feat(vouchers): endpoint POST /combine (N arquivos), remove /merge e voucherMerger"
```

---

## Task 5: E-mail e página hospedada por grupos

**Files:**
- Modify: `backend/services/notifier.js` (`buildVoucherEmailHtml`, `sendVoucherEmail`)
- Modify: `backend/helpers/itinerarioPage.js` (`renderItinerarioPage`)
- Modify: `backend/routes/vouchers.js` (`/send-email` para de calcular URLs; `renderVoucher`/página passam voucherData)

**Contexto:** hoje `notifier.js` e `itinerarioPage.js` recebem `bookingUrl`/`secondaryBookingUrl` prontos. Passam a derivar grupos via `reservationGroups.js` + `manageBookingUrl` internamente, gerando N QRs.

- [ ] **Step 1: Ajustar `notifier.js#buildVoucherEmailHtml`**

- Importar no topo: `const { buildReservationGroups } = require('../helpers/reservationGroups');` e `const { manageBookingUrl, lastNameOf } = require('../helpers/voucherCarrier');` (verificar nomes exportados em `voucherCarrier.js`).
- Trocar a assinatura para não depender de `bookingUrl`/`secondaryBookingUrl`:
  ```js
  async function buildVoucherEmailHtml({ voucherData, settings, customMessage, itinerarioUrl }) {
  ```
- Dentro, computar os grupos e suas URLs:
  ```js
  const lastName = lastNameOf((voucherData.passengers || [])[0]?.name);
  const groups = buildReservationGroups(voucherData).map(g => ({
    ...g,
    bookingUrl: manageBookingUrl(g.carrierKey, g.locator, lastName, g.trips[0]?.departure?.airport)
  }));
  ```
- Substituir o bloco que renderiza os CTAs/QRs fixos (ida + volta) por um `.map` sobre `groups`, gerando um QR-PNG por grupo (mantendo: PNG data-URL via `QRCode.toDataURL`, envolto em `<a href=bookingUrl>`). Título de cada QR = `g.label`. Se `groups.length <= 1`, rótulo "Gerenciar reserva".

- [ ] **Step 2: Ajustar `sendVoucherEmail` e o call em routes**

- Em `notifier.js`, `sendVoucherEmail({ ..., bookingUrl, secondaryBookingUrl, ... })` → remover esses 2 params e a passagem deles ao `buildVoucherEmailHtml`.
- Em `backend/routes/vouchers.js` `/send-email` (linhas ~284-320): remover o cálculo de `firstPassengerLastName`, `primaryCarrier`, `bookingUrl`, `secondaryBookingUrl` e removê-los do objeto passado a `sendVoucherEmail`. Manter `voucherData: unified`, `settings`, `attachmentPath`, `customMessage`, `itinerarioUrl`, `to`, `bcc`.
- O import `const { manageBookingUrl } = require('../helpers/voucherCarrier');` no topo de `vouchers.js` pode ser removido se não houver outro uso (verificar com grep).

- [ ] **Step 3: Ajustar `itinerarioPage.js`**

- Importar `buildReservationGroups` + `manageBookingUrl`/`lastNameOf`.
- `renderItinerarioPage({ voucherData, settings })` — dropar `bookingUrl`/`secondaryBookingUrl` params.
- Computar `groups` (igual ao e-mail) e renderizar: seções por grupo (usar `g.label`) + um QR/CTA por grupo. `directionLabel` ganha caso `'interno'` → `'Voo Interno'`.
- Ajustar o call em `vouchers.js` (rota `GET /itinerario/:token` está em `routes/itinerario.js` — verificar lá quem chama `renderItinerarioPage` e remover os args de URL).

- [ ] **Step 4: Verificação manual (sem suíte automatizada para render)**

Gerar o HTML do e-mail e da página com um voucher multidestinos stub e inspecionar. Roteiro:
```bash
cd backend && node -e "
const { buildVoucherEmailHtml } = require('./services/notifier');
const data = require('./__tests__/fixtures/multidestinos.json'); // criar fixture a partir de um combined
buildVoucherEmailHtml({ voucherData: data, settings: {}, customMessage: '', itinerarioUrl: 'https://x/itinerario/abc' })
  .then(html => require('fs').writeFileSync('/tmp/email.html', html));
"
```
Abrir `/tmp/email.html` e conferir: 3 seções, 3 QRs clicáveis, sem referência a `undefined`.

> Criar a fixture `backend/__tests__/fixtures/multidestinos.json` rodando `combineVouchers` com 3 stubs e salvando o resultado (pode ser gerado num `node -e` pontual).

- [ ] **Step 5: Rodar testes backend completos (regressão)**

Run: `cd backend && npx jest --runInBand 2>&1 | tail -30`
Expected: verde exceto os pré-existentes `auth.test.js`/`users.test.js` (baseline). Nenhum teste de voucher quebrado.

- [ ] **Step 6: Commit**

```bash
git add backend/services/notifier.js backend/helpers/itinerarioPage.js backend/routes/vouchers.js backend/routes/itinerario.js backend/__tests__/fixtures/multidestinos.json
git commit -m "feat(vouchers): e-mail e pagina hospedada renderizam N grupos de reserva (multidestinos)"
```

---

## Task 6: `buildReservationGroups` no frontend (`_shared.jsx`)

**Files:**
- Modify: `frontend/src/components/voucher-templates/_shared.jsx`

Port ESM do helper backend. Sem teste automatizado (frontend não tem Jest) — a lógica DEVE espelhar `backend/helpers/reservationGroups.js`.

- [ ] **Step 1: Adicionar a função exportada**

Ao final de `_shared.jsx`, adicionar `export function buildReservationGroups(data) { ... }` — copiar o corpo de `backend/helpers/reservationGroups.js`, convertendo `module.exports` → `export`, e mantendo `normCarrier`/`resolveReservationFor` como funções internas (não exportadas). Não inclui `bookingUrl` (o template injeta via `manageBookingUrl` já importado).

- [ ] **Step 2: Build sanity**

Run: `cd frontend && npx vite build`
Expected: build OK, sem erro de import.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/voucher-templates/_shared.jsx
git commit -m "feat(vouchers): buildReservationGroups no frontend (_shared) espelhando o backend"
```

---

## Task 7: `VoucherCanonicalV1` — N seções, N QRs

**Files:**
- Modify: `frontend/src/components/voucher-templates/VoucherCanonicalV1.jsx`

- [ ] **Step 1: Trocar geração de QRs por lista**

- Importar `buildReservationGroups` de `./_shared`.
- Substituir os states `qrUrl`/`qrUrlSecondary` por `const [qrUrls, setQrUrls] = useState([])` — array pareado com os grupos.
- No `useEffect([data])`: computar `const groups = buildReservationGroups(data)`; para cada grupo, montar `url = manageBookingUrl(g.carrierKey, g.locator, firstPassengerLastName(data), g.trips[0]?.departure?.airport)` e gerar data-URL via `Promise.all(groups.map(g => QRCode.toDataURL(url, {...})))`; guardar `[{ label, bookingUrl, qr }]` em `qrUrls`.

- [ ] **Step 2: Itinerário por seções**

- `tripSubtitle` ganha `'interno' → 'VOO INTERNO'`.
- Trocar o `trips.map` flat por um loop sobre `groups`: cada grupo vira uma subseção com título (`g.label`) e os trechos do grupo. Reaproveitar o markup de linha de trecho existente.

- [ ] **Step 3: Header e rodapé**

- Header: `hasDualLocator` → `groups.length > 1`; renderizar lista compacta dos localizadores por grupo ("Ida: X · Interno: Y · Volta: Z").
- Rodapé: substituir o par fixo de `<a><img/></a>` por `qrUrls.map(...)`. Aplicar a regra de tamanho: `qrUrls.length <= 4` → 88px; `5–6` → 64px; `> 6` → 6 primeiros a 64px + faixa textual "Demais reservas" (PNR + link). Rótulo de cada QR = `item.label` quando `qrUrls.length > 1`, senão "Gerenciar reserva".

- [ ] **Step 4: Preview manual**

Rodar o preview standalone (`/voucher-preview/:id`) com um voucher multidestinos e conferir visualmente as 3 seções + 3 QRs. (Ver §7 do handoff para como gerar preview.)

Run: `cd frontend && npx vite build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/voucher-templates/VoucherCanonicalV1.jsx
git commit -m "feat(vouchers): Institucional renderiza N secoes e N QRs (multidestinos)"
```

---

## Task 8: `VoucherCompactoV1` — N seções, N QRs

**Files:**
- Modify: `frontend/src/components/voucher-templates/VoucherCompactoV1.jsx`

- [ ] **Step 1: Mesma troca para grupos**

Aplicar a mesma refatoração da Task 7 (grupos, N QRs, seções rotuladas), mantendo as cores fixas da agência (`#3871c1`/`#00569e`) — só a logo muda por cia. Isto também eleva o Compacto a ter CTA/QR por grupo (fecha item do handoff §10).

- [ ] **Step 2: Build + preview**

Run: `cd frontend && npx vite build`
Expected: build OK. Conferir preview do modelo Compacto com voucher multidestinos.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/voucher-templates/VoucherCompactoV1.jsx
git commit -m "feat(vouchers): Compacto renderiza N secoes e N QRs (multidestinos)"
```

---

## Task 9: `voucherClient.uploadCombine` + UI multi-arquivo

**Files:**
- Modify: `frontend/src/api/voucherClient.js`
- Modify: `frontend/src/components/VouchersTab.jsx`

- [ ] **Step 1: API client**

Em `voucherClient.js`: remover `uploadMerge`; adicionar. **Usar o singleton `api`** (importado de `../hooks/useApi`), que injeta `X-CSRF-Token` — o arquivo NÃO importa `axios` cru, e o `uploadMerge` que estamos substituindo já usa `api.post`:
```js
export async function uploadCombine(items) {
  const fd = new FormData();
  items.forEach(({ file, role }) => { fd.append('files', file); fd.append('roles', role); });
  const r = await api.post('/api/vouchers/combine', fd);
  return r.data;
}
```
Resposta: `{ id, unified }` (mesmo shape das rotas `/` e ex-`/merge`; o frontend lê `.id`/`.unified`). Nota: a spec §3.1 descreve como `{ voucher }`, mas o shape `{ id, unified }` é o correto por consistência com as rotas existentes — divergência intencional.

- [ ] **Step 2: Estado da UI**

Em `VouchersTab.jsx`:
- Remover states `merging`, `outboundFile`, `returnFile`, refs `outboundInputRef`/`returnInputRef` e o handler `onMergeUpload`.
- Trocar `uploadMode` para `'single' | 'multi'`.
- Adicionar `const [multiItems, setMultiItems] = useState([{ id: crypto.randomUUID(), file: null, role: 'ida' }])` e `const [combining, setCombining] = useState(false)`.
- Handlers: `addItem()` (push role `'interno'`), `removeItem(id)`, `moveItem(id, dir)`, `setItemFile(id, file)`, `setItemRole(id, role)`.
- `onCombineUpload()`: valida (todas com file, ≥2), `setCombining(true)`, chama `api.uploadCombine(multiItems)`, em erro exibe `err.response?.data?.error` via `showToast`, marca linha culpada se `error` contém `#N`.

- [ ] **Step 3: Markup do modo multi**

Substituir o bloco `uploadMode === 'merge'` pelo modo `'multi'`:
- Radios do topo: "Voucher único" / "Multi-arquivo (ida + internos + volta)".
- Lista `multiItems.map((item, idx) => ...)`: file input + `<select>` role (linha 0 travada em 'ida', sem remover; demais com opções Interno/Volta, desabilitando 'Volta' se já houver outra 'volta') + botões ↑ ↓ 🗑.
- Botão "+ Adicionar voucher".
- Resumo textual + botão "Combinar e gerar voucher" (disabled até válido; `combining` → "Processando…").
- Sub-texto: "2 a 8 vouchers. Marque qual é ida, interno ou volta. Processa em 10–30s."

- [ ] **Step 4: Build**

Run: `cd frontend && npx vite build`
Expected: build OK, sem referências pendentes a `uploadMerge`/`merging`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/voucherClient.js frontend/src/components/VouchersTab.jsx
git commit -m "feat(vouchers): UI multi-arquivo dinamica + uploadCombine, remove modo merge"
```

---

## Task 10: Smoke test doc + verificação end-to-end

**Files:**
- Modify: `docs/superpowers/plans/vouchers-smoke-test.md`

- [ ] **Step 1: Documentar roteiro multidestinos**

Adicionar seção "Multidestinos" ao smoke test: subir 3 vouchers reais (ida + 1 interno + volta) marcando os tipos, verificar preview (3 seções + 3 QRs), exportar PDF (conferir timezone e QRs), enviar e-mail de teste (conferir 3 QRs clicáveis), abrir página hospedada. Incluir também o caso open-jaw (ida + interno, sem volta).

- [ ] **Step 2: Rodar o app e exercitar o fluxo real**

Usar a skill `verify` (ou `run`) para subir backend + frontend e exercitar: modo multi com 3 arquivos → voucher criado → preview → export PDF → e-mail de teste. Observar comportamento real, não só testes.

- [ ] **Step 3: Suíte backend completa (regressão final)**

Run: `cd backend && npx jest --runInBand 2>&1 | tail -30`
Expected: verde exceto baseline `auth`/`users`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/vouchers-smoke-test.md
git commit -m "docs(vouchers): roteiro de smoke test multidestinos"
```

---

## Verificação final (antes de PR)

- [ ] `cd backend && npx jest --runInBand` — verde exceto baseline conhecido.
- [ ] `cd frontend && npx vite build` — sem erros.
- [ ] Grep de sanidade: nenhuma referência remanescente a `voucherMerger`, `uploadMerge`, `mergeVouchers` no código de produção.
  ```bash
  git grep -n "voucherMerger\|uploadMerge\|mergeVouchers" -- ':!docs' || echo "limpo"
  ```
- [ ] Fluxo real exercitado (Task 10 Step 2): 3 vouchers → combinar → preview → PDF → e-mail.
- [ ] Usar superpowers:requesting-code-review antes de abrir PR para `main`.

---

## Notas de implementação

- **Skills a usar:** superpowers:test-driven-development (cada task backend), superpowers:verification-before-completion (antes de qualquer "pronto"), verify/run (Task 10), superpowers:requesting-code-review (antes do PR).
- **Sem novas dependências** — tudo com o que já existe (`multer`, `qrcode`, React, axios).
- **Retrocompat:** vouchers salvos antes desta feature (com `secondaryLocator`) renderizam via fallback de `buildReservationGroups`. Não há migração de dados.
- **Deploy:** após merge em `main`, o usuário faz "Redeploy" no Coolify (não automático). Ver `docs/vouchers-handoff.md` §1/§5.
