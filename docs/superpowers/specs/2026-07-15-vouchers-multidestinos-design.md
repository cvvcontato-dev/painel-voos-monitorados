# Design — Modo Multidestinos na Aba Vouchers

> Spec de design para a feature "multidestinos" do gerador de vouchers da Clube do Voo Viagens.
> Data: 2026-07-15. Branch: `feat/vouchers-multidestinos`.
> Contexto herdado: `docs/vouchers-handoff.md` (feature de vouchers já em produção via PR #5).

---

## 1. Problema & objetivo

Hoje o gerador de voucher suporta dois fluxos de importação:

- **Voucher único** — 1 arquivo (ida-e-volta ou só-ida) extraído de um único PDF/imagem.
- **Ida + volta separados** (`merge`) — combina exatamente 2 vouchers (1 ida + 1 volta) num só itinerário.

Falta o caso **multidestinos**: uma viagem comprada em vários bilhetes separados — um voo de ida, um ou mais voos internos (entre destinos), e (opcionalmente) um voo de volta. O operador precisa poder subir **2 a N vouchers** e marcar, para cada um, se é **ida**, **interno** ou **volta**, gerando um único voucher consolidado.

**Objetivo:** generalizar o merge de 2 vouchers para uma **combinação de N vouchers rotulados**, cobrindo o caso ida+volta como particular (N=2), e renderizar o resultado em seções claras (IDA / DESTINOS INTERNOS / VOLTA) com um QR de "gerenciar reserva" por grupo de reserva.

### Decisões travadas no brainstorming

1. **Composição:** 1 IDA (obrigatória) + N INTERNOS (0..N) + VOLTA (0 ou 1). Open-jaw permitido (volta opcional).
2. **UX de upload:** lista dinâmica — botão "+ adicionar voucher", cada linha com file input + dropdown de tipo. Linha 1 travada em "ida".
3. **Renderização:** 3 seções rotuladas — "IDA", "DESTINOS INTERNOS", "VOLTA" (seção some se vazia).
4. **QRs/localizadores:** um QR por grupo de reserva; grupos com mesmo (cia, PNR) colapsam num só.
5. **Modos:** unificar os modos existentes em **"Voucher único"** + **"Multi-arquivo"** (ida+volta vira caso N=2 do multi-arquivo). O modo `merge` antigo é removido.

---

## 2. Modelo de dados (unified voucher)

Extensões mínimas ao schema canônico. **Backwards-compatible**: vouchers já persistidos continuam válidos e renderizam via caminhos de fallback.

### 2.1 Mudanças

- **`trips[].direction`** e **`baggage[].direction`**: enum passa a aceitar `'interno'` além de `'ida'` / `'volta'` / `'multi'`.
- **`reservation.reservations[]`** (novo, opcional): array que substitui o par `secondaryLocator`/`secondaryCarrier` (que só cabia 1 secundário):
  ```
  reservations: [
    { code: 'ABC123', carrier: 'azul',  appliesTo: 'ida' },
    { code: 'DEF456', carrier: 'gol',   appliesTo: 'interno' },
    { code: 'GHI789', carrier: 'latam', appliesTo: 'volta' }
  ]
  ```
  - `appliesTo` ∈ `'ida'|'interno'|'volta'`.
  - Dedupe por `(code, carrier)`: se dois vouchers têm o mesmo par, entram como uma entrada só.
- **`reservation.locator`**: continua sendo o **principal** (o da IDA) — mantido para retrocompat com templates ainda não migrados e para o resumo do e-mail.
- **`carrier`** (top-level): `'multi'` quando o conjunto de cias distintas > 1; senão a única cia. (Comportamento igual ao de hoje, generalizado para N.)
- **`meta.combined`** (bool, novo) + **`meta.sources[]`**:
  ```
  meta.sources: [ { hash, role, uploadedFilename? }, ... ]
  ```
  Para retrocompat, `meta.merged` continua sendo escrito como espelho de `meta.combined` enquanto templates antigos ainda o consultarem.

### 2.2 Campos legados mantidos (fallback)

Durante a transição, `combineVouchers` **também** preenche os campos antigos quando aplicável:
- `reservation.secondaryLocator` / `secondaryCarrier` / `primaryCarrier` — preenchidos no caso N=2 multi-cia, para o path de fallback dos templates.

O helper `buildReservationGroups` (§4) lê **preferencialmente** de `reservations[]`; se ausente, reconstrói grupos a partir de `locator` + `secondaryLocator` + `trips[].direction`. Assim, um voucher salvo antes desta feature renderiza idêntico ao de hoje.

### 2.3 `route`

- `route.origin` = aeroporto de partida do **primeiro** trecho da IDA.
- `route.destination` = aeroporto de chegada do **último** trecho do último bloco **não-volta** (ou seja, o destino "mais distante" da viagem). Se só houver ida, é a chegada da ida. Isso alimenta a caixa "Sua viagem X → Y".

### 2.4 Persistência

Sem migração de tabela. Continua 1 linha em `vouchers` com `unified_json` (TEXT). `source_file_path` passa a guardar **N** caminhos separados por `|` (hoje já suporta 2 — generaliza a leitura/escrita para N).

---

## 3. Backend

### 3.1 Endpoint novo

```
POST /api/vouchers/combine          (multipart/form-data, requireAuth)
  files[] : N arquivos (application/pdf, image/png, image/jpeg, image/webp)
  roles[] : N strings ('ida'|'interno'|'volta'), pareadas por índice com files[]
  → 201 { voucher: unifiedVoucher }
```

**Validações no handler** (retornam `400 { detail }` em pt-BR):
- `files.length === roles.length`.
- `2 ≤ N ≤ 8`.
- Exatamente **1** `'ida'`.
- No máximo **1** `'volta'`.
- `'interno'` pode aparecer 0..N.
- Todo `role` ∈ enum; todo `file` com mime aceito.

**Fluxo:** cada arquivo → `voucherExtractor` (Gemini) + `voucherNormalizer`, em paralelo via `Promise.all`. Depois `combineVouchers(items)`. Persiste 1 linha, grava N `source_file_path`, registra `voucher_audit_log`.

**Atomicidade:** se **qualquer** arquivo falhar na extração, nada é persistido (sem estado meia-boca). Erro propaga com índice + role.

### 3.2 Endpoint removido

`POST /api/vouchers/merge` é **removido**. `services/voucherMerger.js` e seu teste saem junto. (Sem consumidores externos — rota é auth-gated e só usada pelo próprio frontend.)

### 3.3 `services/voucherCombiner.js` (novo)

Substitui `voucherMerger.js`. Assinatura: `combineVouchers(items)`, onde `items = [{ voucher, role }, ...]` (já normalizados).

Regras:
1. Item `role='ida'` vira a **base** (clone defensivo). Passageiros, branding e `reservation.locator` principal vêm dela.
2. **trips:** para cada item, taga `direction = role` em todos os seus trips; `locator` per-trip = `item.voucher.reservation.locator` (fallback). Concatenação final na ordem: `[ida.trips, ...internos.trips (na ordem enviada), volta.trips]`.
3. **baggage:** mesma tag por role.
4. **reservations[]:** monta a lista com `{ code, carrier, appliesTo }` por item, deduplicando por `(code, carrier)`.
5. **carrier top-level:** `'multi'` se o conjunto de carriers distintos > 1; senão o único.
6. **route:** conforme §2.3.
7. **passengers:** mantém os da IDA (paridade com merge atual). Sem validação cruzada.
8. **branding:** cia primária = carrier da IDA (mantém cores/logos coerentes no Institucional).
9. **campos legados:** preenche `secondaryLocator`/`secondaryCarrier`/`primaryCarrier` no caso N=2 multi-cia (fallback dos templates).
10. **meta:** `combined=true`, `merged=true` (espelho), `sources[]`, `combinedAt`.

### 3.4 `services/voucherSchema.js`

- `direction` aceita `'interno'`.
- `reservations[]` opcional validado (`code`, `carrier` ∈ CARRIERS, `appliesTo` ∈ roles).
- `CARRIERS` inalterado (já inclui `'multi'`).

### 3.5 `helpers/reservationGroups.js` (novo, JS puro — server-side)

Irmão server-side de `buildReservationGroups` (o server não importa JSX). Mesma lógica descrita em §4.1, usado por `itinerarioPage.js` e `notifier.js`.

---

## 4. Frontend — renderização

### 4.1 `buildReservationGroups(data)` — helper central em `_shared.jsx`

Fonte única de verdade para seções e QRs, consumida pelos 2 templates.

```
Retorna: [ { role, label, trips[], carrierKey, locator, bookingUrl }, ... ]
```
- Agrupa `trips` por `direction` (ida | interno | volta), preservando ordem.
- Para `'interno'` com múltiplos PNRs distintos, subdivide em grupos por `(carrierKey, locator)`.
- `label`: `'IDA'` / `'DESTINOS INTERNOS'` (ou `'INTERNO — <cidade>'` se houver >1 grupo interno) / `'VOLTA'`.
- `bookingUrl` via `manageBookingUrl(carrierKey, locator, lastName, primeiraOrigemDoGrupo)`.
- Lê de `reservations[]` (novo) com fallback para `locator` + `secondaryLocator` (§2.2).
- **Nunca lança**: `trips` vazio → `[]`.

### 4.2 `VoucherCanonicalV1.jsx` (Institucional)

- `tripSubtitle('interno')` → `'VOO INTERNO'`. Itinerário passa a agrupar por `buildReservationGroups`, com subtítulo de seção por grupo (IDA / DESTINOS INTERNOS / VOLTA) em vez de `trips.map` flat.
- **QR:** substitui o par fixo `qrUrl`/`qrUrlSecondary` (e a flag `isMultiCarrier`) por `qrUrls: []` — um QR por grupo. `useEffect` gera N data-URLs via `Promise.all`. Rótulo do QR = "Gerenciar reserva" (grupo único) ou o `label` do grupo (N>1).
- **Layout do rodapé:** flex-wrap de QRs. Regra concreta de overflow: `≤4` grupos → todos a 88px; `5–6` grupos → todos a 64px (cabem na largura 794); `>6` grupos → os 6 primeiros como QR a 64px e o restante numa faixa textual "Demais reservas" (PNR + link, sem QR). Caso real típico = 3-4 grupos.
- Header: `hasDualLocator` vira `groups.length > 1` → lista compacta "Ida: XXX · Interno: YYY · Volta: ZZZ".

### 4.3 `VoucherCompactoV1.jsx` (Compacto)

- Mesma troca para `buildReservationGroups`.
- **Melhoria:** eleva o Compacto para renderizar N QRs por seção (fecha o item em aberto do handoff §10 — hoje só mostra localizador dual, sem CTA). Mantém as cores fixas da agência (`#3871c1`/`#00569e`); só a logo muda por cia.

### 4.4 `VouchersTab.jsx` — UI multi-arquivo

Estado:
```js
const [uploadMode, setUploadMode] = useState('single'); // 'single' | 'multi'
const [multiItems, setMultiItems] = useState([{ id: uid(), file: null, role: 'ida' }]);
const [combining, setCombining] = useState(false);
```
Removidos: `merging`, `outboundFile`, `returnFile`, `outboundInputRef`, `returnInputRef`.

UI do modo multi:
- Linha 1 fixa: role travada em `'ida'`, sem botão remover (enforça "exatamente 1 ida" no client; backend re-valida).
- Botão `+ Adicionar voucher`: adiciona linha com role default `'interno'`.
- Dropdown por linha: `Interno` / `Volta`. Se já existe uma linha `Volta`, a opção `Volta` fica desabilitada nas demais (enforça "≤ 1 volta").
- Reordenar via setas ↑↓ (sem drag-drop no MVP — sem dep nova). Ordem visual = ordem enviada em `roles[]`.
- Resumo textual: "N arquivos · X internos · volta: sim/não".
- Botão "Combinar e gerar voucher" desabilitado até: todas as linhas com arquivo **e** ≥ 2 linhas.
- `combining=true` durante o request; toast de erro com `err.response.data.detail`; a linha do arquivo que falhou ganha borda vermelha quando o `detail` traz índice.

Cópia pt-BR:
- Título do modo: "Multi-arquivo (ida + internos + volta)".
- Sub: "2 a 8 vouchers. Marque qual é ida, interno ou volta. Processa em 10–30s."

### 4.5 `api/voucherClient.js`

- `uploadMerge` removido.
- `uploadCombine(items)` novo: monta `FormData` com `files` e `roles` pareados, `POST /api/vouchers/combine`, `withCredentials: true`.

### 4.6 Página hospedada e e-mail

- `helpers/itinerarioPage.js` e `notifier.js#buildVoucherEmailHtml`: usam o `reservationGroups.js` server-side para render em seções + N QRs.
- E-mail: bloco "Suas reservas" com N QR-PNGs. Mantém regras do handoff §6.4: QR como **PNG data-URL** (não SVG), **envolto em `<a>`**, apontando pro check-in (não pro itinerário). Logo via CID (inalterado).
- **`routes/vouchers.js#POST /:id/send-email`:** hoje o handler calcula duas URLs (`bookingUrl` + `secondaryBookingUrl` a partir de `primaryCarrier`/`secondaryCarrier`) e as passa para `sendVoucherEmail`. Essa lógica de duas URLs é **removida**: `buildVoucherEmailHtml`/`sendVoucherEmail` passam a derivar os grupos (e suas URLs de check-in) do próprio `voucherData` via `reservationGroups.js`. O handler não computa mais URLs. Ajustar a assinatura de `sendVoucherEmail` para dropar os params de URL redundantes.

---

## 5. Error handling

- **Backend `/combine`:** validações → `400 { detail }` legível ("Envie exatamente 1 voucher de ida", "No máximo 1 voucher de volta", "Envie entre 2 e 8 vouchers"). Falha de extração num arquivo → `502 { detail: "Não consegui ler o voucher #N (interno). <motivo>" }`. Atomicidade: nada persiste se qualquer arquivo falhar.
- **Frontend:** botão desabilitado enquanto inválido; toast com `detail`; borda vermelha na linha culpada quando o `detail` traz índice.
- **Templates:** `buildReservationGroups` nunca lança; fallback para esquema antigo; seção some se vazia (padrão defensivo atual mantido).

---

## 6. Testes

- **`backend/__tests__/voucherCombiner.test.js`** (novo, ~10 casos):
  - N=2 ida+volta — **teste de paridade**: output equivalente ao antigo `mergeVouchers(ida, volta)` (garante zero regressão).
  - N=3 ida+interno+volta.
  - N=4 ida+2 internos+volta.
  - N=2 ida+interno (sem volta) — `route.destination` = arrival do interno.
  - Multi-cia com 3 carriers distintos → `carrier='multi'`, `reservations` com 3 entradas.
  - 2 vouchers mesma cia+PNR → `reservations` dedupe para 1.
  - Validações: 0 idas → erro; 2 idas → erro; 2 voltas → erro; N=1 → erro; N=9 → erro.
- **`backend/__tests__/reservationGroups.test.js`** (novo): agrupamento por role, subdivisão de internos por PNR, dedupe, fallback esquema antigo.
- **`backend/__tests__/routes-vouchers.test.js`** (estende): casos `/combine` (sucesso N=3 + os 4xx de validação). Casos de `/merge` removidos junto com a rota.
- **Frontend:** sem suíte de componente no projeto (só backend Jest). Validação da UI multi via smoke manual — atualizar `docs/superpowers/plans/vouchers-smoke-test.md` com roteiro multidestinos.

---

## 7. Fora de escopo (YAGNI)

- Migração de tabela SQLite (só o conteúdo de `unified_json` evolui).
- Export PDF/PNG (Playwright), envio SMTP/CID, página `/itinerario/:token`, tokens HMAC, retenção 30 dias — todos operam sobre `unified_json` e herdam multidestinos sem alteração.
- Editor visual de "mover trecho entre seções" — `direction` já sai correto do combine; ajuste fino manual é edge case.
- Merge de passageiros distintos entre trechos — mantém decisão atual (usa pax da ida).

---

## 8. Arquivos tocados (resumo)

**Backend:**
- `routes/vouchers.js` — `+POST /combine`, `−POST /merge`.
- `services/voucherCombiner.js` — **novo** (substitui `voucherMerger.js`, que é removido).
- `services/voucherSchema.js` — `+direction:'interno'`, `+reservations[]`.
- `helpers/reservationGroups.js` — **novo** (JS puro server-side).
- `helpers/itinerarioPage.js` — render por grupos.
- `services/notifier.js` — e-mail por grupos.
- Testes: `+voucherCombiner.test.js`, `+reservationGroups.test.js`, estende `routes-vouchers.test.js`, remove `voucherMerger.test.js`.

**Frontend:**
- `components/VouchersTab.jsx` — UI multi-arquivo dinâmica, `−`modo merge.
- `api/voucherClient.js` — `+uploadCombine`, `−uploadMerge`.
- `components/voucher-templates/_shared.jsx` — `+buildReservationGroups`.
- `components/voucher-templates/VoucherCanonicalV1.jsx` — N seções, N QRs.
- `components/voucher-templates/VoucherCompactoV1.jsx` — N seções, N QRs.

**Docs:**
- `docs/superpowers/plans/vouchers-smoke-test.md` — roteiro multidestinos.
