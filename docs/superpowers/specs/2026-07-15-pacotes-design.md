# Design — Modo "Pacote" (Clube do Voo Viagens)

> Spec de design para a feature de geração de **pacote de viagem** (voos + hospedagem + adicionais).
> Data: 2026-07-15. Branch: `feat/pacotes` (criada a partir de `feat/vouchers-multidestinos`).
> Depende de: motor multidestinos (`combineVouchers`, `buildReservationGroups`) — ver `docs/superpowers/specs/2026-07-15-vouchers-multidestinos-design.md`.

---

## 1. Problema & objetivo

Hoje o painel gera **voucher de voo** (extrai PDF da cia → renderiza voucher da agência → PDF/e-mail/página). Falta o caso **pacote**: o cliente comprou uma viagem completa — **passagens + hospedagem (obrigatórios)** + **adicionais opcionais** (passeios, aluguel de carro, transfer). O operador sobe o voucher de cada serviço e o sistema devolve um **e-mail consolidado** (+ página hospedada + PDFs anexados) para enviar ao cliente.

**Objetivo:** dado N vouchers tipados de serviços distintos, extrair cada um pro seu schema canônico, montar um **pacote** com timeline cronológica da viagem, e produzir e-mail + página hospedada + anexos.

### Decisões travadas no brainstorming
1. **Entregável:** e-mail consolidado **+** página hospedada (`/pacote/:token`) **+** PDFs originais anexados **+** PDF do voucher de voo gerado.
2. **Composição:** voos **1..N** (reusa o `combineVouchers` do multidestinos), hotéis **1..N**, adicionais **0..N** de cada tipo. Voo e hotel são **obrigatórios** (≥1 de cada).
3. **Tipos de adicional no MVP:** passeio, aluguel de carro, transfer. **Seguro viagem fica fora** (schema extensível pra adicionar depois).
4. **Voos no pacote:** resumo dos voos na página/e-mail (reusa `buildReservationGroups`) **+** PDF do voucher de voo (Institucional/Compacto) gerado e anexado.
5. **Arquitetura:** agregado novo `packages` com schemas por tipo (Abordagem A), reusando extractor/combiner de voo. **Não** sobrecarrega o sistema de voucher de voo.

### Escopo
Feature maior que o multidestinos (extração heterogênea de 4 tipos, novo agregado, novo pipeline de render), mas coesa — todos os tipos compartilham o esqueleto extrair → normalizar → montar → renderizar. Cabe numa spec, com fases no plano de implementação (ex.: hotel primeiro, depois car/tour/transfer).

---

## 2. Modelo de dados

Pacote persistido em `package_json` (1 linha na tabela `packages`):

```
{
  title,                         // "Pacote Gramado — Silva" (derivado, editável)
  holder,                        // titular principal
  flights,                       // unified voucher de voo (output do combineVouchers) | null
  hotels:   [ hotelItem, ... ],  // 1..N
  addons:   [ addonItem, ... ],  // 0..N (kind: 'car'|'tour'|'transfer')
  meta: { combined: true, createdAt, sources: [{ hash, kind, filename }] }
}
```

### 2.1 Schemas por tipo (normalizados)

Campos derivados dos 7 vouchers de exemplo analisados (3 hotéis de providers distintos, 1 carro, 2 passeios, 1 transfer).

- **hotelItem** — `{ kind:'hotel', locator, provider, name, stars?, address, phone?, email?, checkIn:{date,time}, checkOut:{date,time}, nights, rooms:[{type, beds?, regime?}], guests:[{name, doc?, birth?}], guestCount, totalText?, amenities?[], cancellation?, notes? }`
- **carItem** — `{ kind:'car', locator, provider, holder, driver, rentalDays, pickup:{datetime, location}, dropoff:{datetime, location}, category?, transmission?, features?[], insurance?, cancellation? }`
- **tourItem** — `{ kind:'tour', locator, provider, activity, datetime, travelers, meetingPoint?, pickupName?, hotelPickup?, includes?[], excludes?[], description?, cancellation? }`
- **transferItem** — `{ kind:'transfer', locator, provider, type?, travelers, legs:[{ from, to, datetime, pickupWindow? }], meetingPoint?, cancellation? }`

### 2.2 Campos canônicos comuns

Todo item carrega: `kind`, `locator`, `provider`, `cancellation?`, e uma **`sortDate`** (datetime âncora derivada na normalização — check-in do hotel, retirada do carro, data do passeio, 1º trecho do transfer, 1ª partida do voo) usada pra ordenar a timeline cronologicamente.

### 2.3 Voo

`flights` guarda **exatamente** o unified voucher que `combineVouchers` produz — zero schema novo pra voo, reuso total do motor multidestinos.

### 2.4 Persistência

- Tabela `packages` — `id, user_id, title, package_json TEXT, source_file_paths TEXT, created_at`.
- Tabela `package_audit_log` — espelha `voucher_audit_log` (voucher_id→package_id, actions `create`/`update`/`email_sent`/`email_failed`/`delete`).
- PDFs originais sob `DB_PATH/package-uploads/` (N caminhos separados por `|`), cobertos pela retenção 30 dias.
- Migração idempotente no `database.js` (mesmo padrão das tabelas de voucher).

---

## 3. Extração (despacho por tipo)

**`services/packageExtractor.js`** — `extractPackageItem(buffer, mimetype, kind) → itemNormalizado`. Despacha por `kind`:
- `flight` → **reusa `extractVoucher`** (zero mudança no código de voo).
- `hotel`/`car`/`tour`/`transfer` → prompt Gemini específico.

**`services/packagePrompts.js`** — um prompt por tipo. Cada um instrui o Gemini a devolver JSON no schema canônico daquele item (§2.1): datetimes ISO com o fuso do documento preservado (`-03:00`, `+01:00`, etc.), `null` pra campo ausente (não inventar). Reaproveita o cliente Gemini, retry/backoff 503/429, e **STUB** por tipo quando sem `GEMINI_API_KEY`.

**`services/packageNormalizer.js`** — pós-processa cada item: normaliza `kind`, datetimes ISO, deriva `sortDate`, aplica defaults. Espelha o `voucherNormalizer`.

**`services/packageSchema.js`** — `validatePackage(pkg)` + `validateItem(item)` por tipo. Regras: `kind` válido, campos-âncora de data presentes; não-bloqueante em opcionais.

**Timezone:** o Gemini preserva o offset do documento no ISO. Na **renderização** (§4), cada horário é exibido no **fuso local do próprio serviço** (offset embutido no ISO) — check-in de hotel em Madrid mostra a hora local de Madrid, NÃO convertida pra BR. Isto **difere** da regra de voo (que fixa `America/Sao_Paulo` porque são voos domésticos BR e o Playwright roda em UTC). Ponto de atenção explícito na implementação.

---

## 4. Backend (rotas, montagem, anexos)

**`routes/packages.js`** (sob `/api/packages`, `requireAuth`):

```
POST   /api/packages                  multipart: files[] + kinds[] (pareados) → 201 { id, package }
GET    /api/packages                  lista (id, title, holder, created_at, resumo)
GET    /api/packages/:id              pacote completo
PUT    /api/packages/:id              salva edições do package_json
DELETE /api/packages/:id              remove + apaga arquivos
POST   /api/packages/:id/send-email   { emails, message }
```

**`routes/pacote.js`** (público, montado ANTES do `requireAuth`): `GET /pacote/:token` → página hospedada. Token HMAC via `voucherToken.js` (mesmo secret).

**Validações do POST** (400 legível, com índice do arquivo culpado):
- `files.length === kinds.length`; `2 ≤ N ≤ 12`; `kinds ⊆ {flight,hotel,car,tour,transfer}`.
- **≥1 `flight` e ≥1 `hotel`** (obrigatórios).

**Montagem** (handler): extrai todos em paralelo (`Promise.all`) → separa por kind → `flights = combineVouchers(voos)` se >1 (senão o único voo) → `hotels[]`, `addons[]` na ordem enviada. Deriva `title` e `holder`. Persiste 1 linha, grava N PDFs (cleanup em falha parcial de escrita), hash composto, audit. **Atômico**: nada persiste se qualquer extração falhar.

**Geração de anexos** (`/send-email`):
1. PDFs originais (N arquivos de `package-uploads/`).
2. **PDF do voucher de voo** — via `renderVoucherFromData(unified)` (refactor de `voucherRenderer.js`, ver §7): o renderer passa a aceitar dados diretos, não só um id da tabela `vouchers`; gera o PDF do voo do pacote sem criar linha em `vouchers`. Se falhar (Playwright), o e-mail segue **sem** esse anexo (com originais + página) e loga.
3. `sendPackageEmail` monta o e-mail (§4 render) + attachments.

**Reuso deliberado:** `voucherToken.js`, `voucherRetention.js` (estende p/ `package-uploads/`), `voucherWorkspace.js` (novo `packageUploadsDir()`), `notifier.js` (SMTP + logo CID). Único toque em código de voo: `renderVoucherFromData` (melhora sem quebrar — path por-id delega pro por-dados).

---

## 5. Renderização (e-mail + página)

Ambos reaproveitam a linguagem **"card-soft"** já estabelecida (fundo cinza, cards, header azul, logo CID) — o pacote estende, não reinventa.

**`helpers/packageBlocks.js`** (JS puro, compartilhado por e-mail e página) — transforma o `package_json` numa **timeline cronológica única** ordenada por `sortDate`: todos os itens (voos, hotéis, adicionais) na ordem real da viagem (ex.: Voo ida → Transfer aeroporto→hotel → Hotel → Passeio → Voo volta). É o principal valor do pacote. Nunca lança: item sem `sortDate` vai pro fim; campos ausentes somem.

**Blocos por item** — ícone + cor por tipo (✈ voo, 🏨 hotel, 🚗 carro, 🎟 passeio, 🚐 transfer), card com os campos-chave do tipo (§2.1) + política de cancelamento colapsada. Seção de voos usa `buildReservationGroups` (resumo de trechos + QR por reserva). Header: título, titular, período total, contagem de serviços.

**E-mail** (`notifier.buildPackageEmailHtml`, email-safe, tables inline, <102KB): header + saudação → resumo da viagem (timeline compacta) → blocos enxutos → CTA "Ver pacote completo" (link página) → suporte + footer. QRs como PNG data-URL clicável (herdado). Anexos: originais + PDF do voo.

**Página** (`helpers/packagePage.js`, `/pacote/:token`, CSS livre): timeline rica, cada serviço num card completo, endereços em texto, políticas expansíveis.

**Timezone:** formatadores exibem o horário **local do serviço** (offset do ISO). Voo mantém a regra existente (`America/Sao_Paulo`).

---

## 6. Frontend (aba "Pacotes")

Nova aba **"Pacotes"** (separada de "Vouchers"), reusando estilo/componentes.

**`components/PackagesTab.jsx`** (espelha `VouchersTab`):
- **Upload multi-tipo dinâmico:** lista de linhas (file input + dropdown de tipo: Voo/Hotel/Carro/Passeio/Transfer). Começa com 2 linhas fixas: 1 Voo + 1 Hotel (obrigatórios, não removíveis). "+ Adicionar serviço" (default Passeio). Reordenar por setas, remover opcionais. Validação client (≥1 voo + ≥1 hotel, todas com arquivo); backend revalida. Erro-por-índice destaca a linha (padrão multidestinos).
- **Lista** (esquerda) + **editor** (direita, react-hook-form por tipo) + **preview ao vivo** (iframe `/pacote-preview/:id`). Cada tipo tem seu mini-formulário.
- **Ações:** Salvar, Enviar e-mail (modal destinatários+mensagem), Excluir, badge de resumo.

**`components/PackagePreviewPage.jsx`** (`/pacote-preview/:id`) — consumido pelo iframe e (futuramente) pelo Playwright.

**`components/package-items/*.jsx`** — um componente pequeno e focado por tipo (hotel/car/tour/transfer + flight-summary), renderiza/edita seu tipo. Mantém arquivos pequenos em vez de um `PackagesTab` gigante.

**`api/packageClient.js`** — `list/get/uploadPackage(items)/update/remove/sendEmail`, singleton `api` (CSRF).

---

## 7. Error handling

- **Extração:** falha num arquivo → `502 { detail: "Não consegui ler o serviço #N (hotel). <motivo>" }`, UI destaca a linha. Gemini 503/429 → mensagens amigáveis (herdadas). Atômico: nada persiste se algum falhar.
- **Validações POST:** `400` legível ("Envie ao menos 1 voo e 1 hotel", "Entre 2 e 12 serviços", tipo inválido).
- **Render defensivo:** `packageBlocks` nunca lança (item sem data → fim; campos ausentes somem).
- **PDF de voo no anexo:** falha do Playwright não bloqueia o envio (segue sem esse anexo).

---

## 8. Testes

- `packageSchema.test.js` — valida cada item type + regra voo+hotel obrigatórios.
- `packageNormalizer.test.js` — datetimes, `sortDate`, defaults por tipo.
- `packageBlocks.test.js` — ordenação cronológica (voo→transfer→hotel→passeio→voo), item sem data no fim.
- `packageExtractor.test.js` — despacho por tipo + STUB por tipo.
- `routes-packages.test.js` — POST sucesso (voo+hotel+addon via STUB), 400s (sem voo, sem hotel, N inválido), GET/PUT/DELETE, send-email (SMTP mockado). CSRF via `authed()`.
- `voucherRenderer` — teste de `renderVoucherFromData` garantindo paridade com o path por-id.
- Smoke manual (doc `docs/superpowers/plans/pacotes-smoke-test.md`): voo+hotel+carro+passeio+transfer reais → preview → e-mail → página → conferir timeline e anexos.

---

## 9. Fora de escopo (YAGNI)

- **Seguro viagem** — schema extensível: `kind:'insurance'` depois = 1 prompt + 1 card, sem mexer na arquitetura.
- Pagamento/precificação do pacote (só exibe totais que vierem nos vouchers, não calcula).
- Mover item entre pacotes; templates visuais alternativos (1 layout).
- Multi-idioma (pt-BR only, herdado).

---

## 10. Arquivos

**Backend novos:** `services/{packageExtractor,packagePrompts,packageNormalizer,packageSchema}.js`, `helpers/{packageBlocks,packagePage}.js`, `routes/{packages,pacote}.js`.
**Backend modificados:** `services/notifier.js` (+`buildPackageEmailHtml`,`sendPackageEmail`), `services/voucherRenderer.js` (+`renderVoucherFromData`), `helpers/{voucherRetention,voucherWorkspace}.js` (path de package), `database.js` (tabelas), `server.js` (montar rotas).
**Frontend novos:** `components/PackagesTab.jsx`, `components/PackagePreviewPage.jsx`, `components/package-items/*.jsx`, `api/packageClient.js`; registro da aba + rotas no app.
**Testes:** conforme §8.
**Docs:** `docs/superpowers/plans/pacotes-smoke-test.md`.
