# Design: Aba "Status de Voos"

**Data:** 2026-05-17
**Repositório:** [cvvcontato-dev/painel-voos-monitorados](https://github.com/cvvcontato-dev/painel-voos-monitorados)
**Deploy:** VPS Hostinger via Coolify

---

## 1. Contexto e objetivo

O painel atual monitora **preços** de voos antes da compra (scraping do Google Voos, alertas por preço-alvo). Esta especificação descreve uma nova aba que monitora o **status real** de voos já comprados, alertando o cliente em caso de:

- **Cancelamento**
- **Atraso significativo** (≥ 15min, configurável via env)
- **Mudança de horário** (reagendamento do voo, distinto de atraso pontual)

Mudanças de portão/terminal são registradas no histórico mas não geram notificação.

A feature é **paralela** à existente: mesma stack (Express + SQLite + React), mesma infra (Coolify), mesmas credenciais de notificação (email + Telegram), mas com tabelas, serviços e UI próprios. Sem dependência cruzada com a tabela `flights` atual.

---

## 2. Decisões-chave

| Tema | Decisão | Justificativa |
|---|---|---|
| Fonte de dados | **AeroDataBox** (via RapidAPI) | ~$10–24/mês no BASIC/PRO; free tier 500 req/mês para validar; cobertura global; endpoint direto por `numero/{data}` |
| Banco de dados | Manter **SQLite** | Volume `/data` já persiste no Coolify; PostgreSQL agregaria infra sem ganho para 40 voos |
| Relação com voos existentes | **Aba e dados separados** | Status só faz sentido após compra (precisa de número do voo + data); preço/cadastro inicial seguem desacoplados |
| Notificações | **Email + Telegram** (reaproveitar `notifier.js`) | Já implementados; templates novos visualmente distintos dos de preço |
| Polling | **Configurável por voo** | Presets de cadência (15min … 1×/dia); scheduler usa `proxima_verificacao` indexada para selecionar voos vencidos |
| UI | **Tabs no header** (sem react-router) | SPA simples; persiste aba ativa em `localStorage` |
| Fuso horário | **UTC no DB**, conversão no frontend | Evita ambiguidade entre servidor e cliente |
| Auto-arquivamento | `landed` + 2h → `monitoramento_ativo = 0` | Economiza requisições da API |
| Anti-spam | Comparar payload do último evento do mesmo tipo | Não reenviar alertas idênticos consecutivos |

---

## 3. Arquitetura

```
[Frontend SPA — tabs Preços | Status]
        │
        ▼
[Express API /api/flights (já existe)]
[Express API /api/monitored-flights (novo)]
        │
        ▼
[SQLite] ── tabelas:
              flights                       (existente)
              monitored_flights_status      (novo)
              flight_status_history         (novo)
        ▲
        │
[scheduler.js — cron novo */5 * * * *]
        │
        ▼
[statusMonitor.js (novo)] ── busca voos com proxima_verificacao <= now
        │                    LIMIT STATUS_MONITOR_BATCH_SIZE (espalha picos)
        ▼
[aviationApi.js (novo)] → AeroDataBox (RapidAPI)
        │ detecta mudança? anti-spam OK?
        ▼
[notifier.js (estendido)] → email + Telegram (templates de status)
```

### Princípios

- **Isolamento de fornecedor:** `aviationApi.js` é a única camada que conhece o formato da AeroDataBox. Troca de fornecedor = trocar esse arquivo + função `normalizeStatus()`.
- **Reuso sem acoplamento:** `notifier.js` ganha funções novas (`sendStatusEmail`, `sendStatusTelegram`); funções de preço inalteradas.
- **Espalhamento natural:** scheduler processa até `STATUS_MONITOR_BATCH_SIZE` voos por tick (default 10, cada 5min). Mesmo com 40 voos vencendo juntos, distribui em ~25min.

---

## 4. Modelo de dados

### 4.1 `monitored_flights_status`

Um registro por voo monitorado.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `cliente` | TEXT NOT NULL | Nome do passageiro |
| `numero_voo` | TEXT NOT NULL | Formato `[A-Z0-9]{2}\d{1,4}` (ex.: LA8084, G31234) |
| `data_voo` | TEXT NOT NULL | ISO `YYYY-MM-DD` (data local de partida) |
| `origem` | TEXT | IATA do aeroporto de origem (cache do primeiro fetch) |
| `destino` | TEXT | IATA do aeroporto de destino |
| `companhia` | TEXT | Nome da companhia (cache) |
| `email_cliente` | TEXT | Opcional |
| `telegram_chat_id` | TEXT | Opcional |
| `cadencia_minutos` | INTEGER NOT NULL DEFAULT 60 | Presets: 15, 30, 60, 120, 240, 360, 720, 1440 |
| `status_atual` | TEXT | Normalizado: `scheduled`, `active`, `landed`, `cancelled`, `diverted`, `delayed` |
| `partida_programada` | TEXT | ISO UTC |
| `partida_estimada` | TEXT | ISO UTC |
| `chegada_programada` | TEXT | ISO UTC |
| `chegada_estimada` | TEXT | ISO UTC |
| `portao` | TEXT | Última conhecida |
| `terminal` | TEXT | Última conhecida |
| `monitoramento_ativo` | INTEGER NOT NULL DEFAULT 1 | 0 = pausado (manual ou auto-arquivado) |
| `ultima_verificacao` | TEXT | ISO UTC |
| `proxima_verificacao` | TEXT | ISO UTC — calculado após cada check (`now + cadencia_minutos`) |
| `criado_em` | TEXT NOT NULL | ISO UTC |
| `atualizado_em` | TEXT NOT NULL | ISO UTC |

**Constraint:** `UNIQUE(numero_voo, data_voo, cliente)` para evitar duplicatas.

**Índice:**
```sql
CREATE INDEX idx_msf_proxima ON monitored_flights_status(proxima_verificacao)
WHERE monitoramento_ativo = 1;
```

### 4.2 `flight_status_history`

Log de eventos (auditoria + timeline na UI).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `monitored_flight_id` | INTEGER NOT NULL | FK → `monitored_flights_status(id)` ON DELETE CASCADE |
| `verificado_em` | TEXT NOT NULL | ISO UTC |
| `evento` | TEXT NOT NULL | `check_ok`, `cancelado`, `atrasado`, `reagendado`, `portao_alterado`, `terminal_alterado`, `arquivado_auto`, `erro_api` |
| `payload_json` | TEXT | JSON com `{ campo, antes, depois }` por mudança |
| `notificado` | INTEGER NOT NULL DEFAULT 0 | 1 se gerou notificação enviada |

**Índice:**
```sql
CREATE INDEX idx_fsh_flight_evento
ON flight_status_history(monitored_flight_id, evento, verificado_em DESC);
```

### 4.3 Migrations

Adicionadas em `backend/database.js` no padrão atual (`CREATE TABLE IF NOT EXISTS` + try/catch para `duplicate column` em colunas adicionadas posteriormente).

---

## 5. Backend

### 5.1 Estrutura de arquivos

```
backend/
├── services/
│   ├── aviationApi.js       (novo) cliente AeroDataBox
│   ├── statusMonitor.js     (novo) lógica de polling + detecção
│   ├── notifier.js          (estender) + sendStatusEmail/Telegram
│   ├── flightScraper.js     (inalterado)
│   └── scheduler.js         (estender) + cron de status */5 min
├── routes/
│   └── monitoredFlights.js  (novo) router Express
├── database.js              (estender) + migrations
└── server.js                (montar router)
```

> **Decisão de refatoração:** `server.js` tem 368 linhas com rotas inline. Em vez de continuar empilhando, o novo módulo entra como `routes/monitoredFlights.js`. Rotas antigas permanecem inline (fora de escopo deste design).

### 5.2 `services/aviationApi.js`

Camada fina e isolada.

**Função principal:**
```js
async function fetchFlightStatus(numeroVoo, dataVoo)
// Retorna: { ok: true, data: {...normalizado...} }
//       ou { ok: false, error: 'not_found' | 'rate_limited' | 'server_error' | string, retryAfter? }
```

**Objeto normalizado:**
```js
{
  numero_voo, companhia, origem, destino,
  status,                    // normalizado: scheduled|active|landed|cancelled|diverted|delayed
  partida_programada,        // ISO UTC
  partida_estimada,          // ISO UTC
  chegada_programada,        // ISO UTC
  chegada_estimada,          // ISO UTC
  portao, terminal,
  raw                        // resposta crua (para debug e payload_json)
}
```

- Endpoint: `GET https://{AERODATABOX_HOST}/flights/number/{numero}/{data}`
- Headers: `X-RapidAPI-Key`, `X-RapidAPI-Host`
- Erros tratados explicitamente:
  - `404` → `{ ok: false, error: 'not_found' }`
  - `429` → `{ ok: false, error: 'rate_limited', retryAfter }`
  - `5xx` → `{ ok: false, error: 'server_error' }`
- **Nunca lança exceção** — sempre retorna resultado estruturado.
- Mapeamento de status (`normalizeStatus`) é função pura isolada — único ponto a alterar ao trocar de fornecedor.

### 5.3 `services/statusMonitor.js`

Função principal `checkDueFlights()`, chamada pelo scheduler a cada 5min:

1. **Seleciona lote:**
   ```sql
   SELECT * FROM monitored_flights_status
   WHERE proxima_verificacao <= datetime('now') AND monitoramento_ativo = 1
   ORDER BY proxima_verificacao ASC
   LIMIT ?  -- STATUS_MONITOR_BATCH_SIZE (default 10)
   ```
2. **Para cada voo:**
   - Chama `aviationApi.fetchFlightStatus(numero_voo, data_voo)`.
   - Se erro → registra evento `erro_api` no histórico (sem notificar), reagenda normalmente.
   - Se OK → compara com snapshot atual; detecta eventos:
     - `cancelado`: `status_atual !== 'cancelled'` && novo === `'cancelled'`
     - `atrasado`: `partida_estimada - partida_programada >= DELAY_THRESHOLD_MIN` (default 15min)
     - `reagendado`: `partida_programada` mudou (≠ atraso pontual)
     - `portao_alterado` / `terminal_alterado`: campos mudaram (sem notificação)
   - **Anti-spam:** para cada evento notificável, busca último registro do mesmo `evento` na história desse voo; se `payload_json` idêntico → grava `check_ok` em vez de re-notificar.
   - Persiste eventos detectados em `flight_status_history` (com `payload_json` descrevendo mudanças).
   - Atualiza `monitored_flights_status` (todos os campos snapshot + `ultima_verificacao = now`).
   - **Auto-arquivamento:** se `status_atual = 'landed'` && `chegada_estimada < now - 2h` → seta `monitoramento_ativo = 0` e registra evento `arquivado_auto`.
   - Caso contrário, calcula `proxima_verificacao = now + cadencia_minutos`.
   - Se evento notificável e anti-spam permitiu → dispara `notifier.sendStatusEmail/Telegram` e seta `notificado = 1` no registro de histórico.

### 5.4 `services/scheduler.js` — extensão

Adiciona um cron independente do scheduler de preços existente:

```js
cron.schedule('*/5 * * * *', () => statusMonitor.checkDueFlights());
```

### 5.5 `services/notifier.js` — extensão

Novos exports:

```js
sendStatusEmail(to, monitoredFlight, evento, diff)
sendStatusTelegram(chatId, monitoredFlight, evento, diff)
```

**Templates visualmente distintos** dos de preço:

- **Email:**
  - Cabeçalho **vermelho** para `cancelado` / **âmbar** para `atrasado`/`reagendado` (≠ gradiente roxo dos alertas de preço).
  - Ícone ⚠️ em vez de ✈️.
  - Tabela "antes → depois" para cada campo alterado.
- **Telegram:**
  - Prefixo `🚨 <b>ALERTA DE STATUS</b>` em vez de `✈️ <b>ALERTA DE PREÇO</b>`.
  - Linhas "Partida: 14:30 → 16:45 (atraso 2h15)".
  - Link para FlightAware Web (rastreamento público, sem custo).

Reaproveita o rate limit do Telegram (30 msgs/segundo) já implementado.

### 5.6 Endpoints REST — `/api/monitored-flights`

| Método | Rota | Body / Retorno |
|---|---|---|
| `GET` | `/` | Lista todos com snapshot atual |
| `GET` | `/:id` | Detalhe + histórico (timeline `flight_status_history`) |
| `POST` | `/` | Cria; body: `cliente`, `numero_voo`, `data_voo`, `email_cliente?`, `telegram_chat_id?`, `cadencia_minutos?` |
| `PUT` | `/:id` | Edita: `cliente`, `cadencia_minutos`, contatos, `monitoramento_ativo` |
| `DELETE` | `/:id` | Remove (cascade no histórico) |
| `POST` | `/:id/check-now` | Checagem imediata; retorna resultado |
| `POST` | `/:id/toggle` | Pausa/reativa monitoramento |

**Validações no POST/PUT:**
- `numero_voo`: regex `^[A-Z0-9]{2}\d{1,4}$` (case-insensitive, persistido em maiúsculas).
- `data_voo`: ISO `YYYY-MM-DD`; não pode ser >30 dias no passado nem >365 no futuro.
- `cadencia_minutos`: ∈ {15, 30, 60, 120, 240, 360, 720, 1440}.
- Unique `(numero_voo, data_voo, cliente)` retorna 409.

---

## 6. Frontend

### 6.1 Estrutura

```
frontend/src/
├── App.jsx                       (refator mínimo: header + tabs + roteamento condicional)
├── components/
│   ├── PrecosTab.jsx             (novo: move lógica atual de App.jsx sem reescrever)
│   ├── StatusTab.jsx             (novo)
│   ├── StatusModal.jsx           (novo: cadastro/edição)
│   ├── StatusHistoryDrawer.jsx   (novo: timeline de eventos)
│   ├── SettingsModal.jsx         (inalterado)
│   └── Toast.jsx                 (inalterado)
```

State `activeTab` (`'precos' | 'status'`) persistido em `localStorage`.

### 6.2 `StatusTab.jsx` — layout

Reaproveita o **mesmo design system** da aba de preços (tema escuro, classes Tailwind, `Toast`).

**Stat cards (4):**
1. Total monitorados
2. Ativos / pausados
3. Alertas nas últimas 24h
4. Próxima verificação (countdown do menor `proxima_verificacao`)

**Tabela:**

| Cliente | Voo | Data | Origem→Destino | Status | Partida (prog→est) | Próx. check | Ações |
|---|---|---|---|---|---|---|---|
| João Silva | LA8084 | 22/05/2026 | GRU→MIA | 🟢 Scheduled | 22:30 | em 47min | [▶] [⏸] [✏] [🗑] |

**Indicadores visuais consistentes:**
- 🟢 verde: `scheduled` / `active` no horário
- 🟡 âmbar: `delayed` / `reagendado`
- 🔴 vermelho: `cancelled` / `diverted`
- ⚫ cinza: `landed` (arquivado) ou `monitoramento_ativo = 0`

**Modal de cadastro:** cliente, número do voo, data, email, telegram, cadência (select com presets em linguagem natural: "A cada 15min", "A cada 1h", "A cada 6h", "1×/dia").

**Drawer de histórico** ao clicar no voo: timeline vertical dos eventos com timestamps em fuso local do usuário (conversão a partir do UTC).

### 6.3 Polling do frontend

`StatusTab` faz `GET /api/monitored-flights` a cada **30s** via `setInterval`. Cleanup no `useEffect` return.

---

## 7. Variáveis de ambiente

```bash
# Existentes (já presentes)
EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
TELEGRAM_BOT_TOKEN

# Novas
RAPIDAPI_KEY=                                     # obrigatório
AERODATABOX_HOST=aerodatabox.p.rapidapi.com       # default
DELAY_THRESHOLD_MIN=15                            # default
STATUS_MONITOR_BATCH_SIZE=10                      # default; tunable em prod
```

Documentar no `README.md` raiz (seção nova "Aba Status") como obter a key da RapidAPI e ativar o plano BASIC.

---

## 8. Roadmap incremental (sugestão de execução)

1. **Fase 1 — Schema + API mock**
   - Migrations das duas tabelas.
   - `routes/monitoredFlights.js` com CRUD + validações.
   - `aviationApi.js` como stub (retorna dados fake) para testar end-to-end sem gastar API real.
   - Verificação: criar voo via `curl`, listar, deletar.

2. **Fase 2 — Integração AeroDataBox real**
   - Substitui stub pela chamada real à RapidAPI.
   - Mapeamento `normalizeStatus`.
   - Tratamento de erros (404, 429, 5xx).
   - Verificação: 1-2 voos reais validados manualmente.

3. **Fase 3 — Scheduler + detecção + anti-spam + auto-arquivamento**
   - Cron a cada 5min em `scheduler.js`.
   - `statusMonitor.checkDueFlights()` com seleção por `proxima_verificacao`.
   - Detecção dos 3 eventos notificáveis + 2 não-notificáveis.
   - Anti-spam por comparação de `payload_json`.
   - Auto-arquivamento `landed + 2h`.
   - Templates de notificação no `notifier.js`.
   - Verificação: forçar mudanças via stub (modo dev) e confirmar alertas.

4. **Fase 4 — Frontend**
   - Extrair `PrecosTab.jsx` de `App.jsx` (movimento, não reescrita).
   - Tabs em `App.jsx` + persistência em `localStorage`.
   - `StatusTab.jsx` + `StatusModal.jsx` + `StatusHistoryDrawer.jsx`.
   - Verificação manual em browser local + smoke test após deploy no Coolify.

---

## 9. Fora de escopo (YAGNI)

- ❌ WhatsApp (só email + Telegram)
- ❌ Notificação de mudança de portão/terminal (só os 3 eventos principais)
- ❌ Múltiplos destinatários por voo (1 email + 1 telegram, igual à aba de preços)
- ❌ Autenticação / multi-usuário (projeto atual também não tem)
- ❌ Internacionalização (PT-BR fixo)
- ❌ Migração para PostgreSQL (SQLite atende; revisitar se >500 voos)
- ❌ Refatoração das rotas existentes em `server.js` (extração só do código novo)

---

## 10. Critérios de aceitação

1. Posso cadastrar um voo (número + data + cliente) pela UI e ele aparece na lista.
2. Edito a cadência de um voo; a `proxima_verificacao` é recalculada.
3. Disparo "check now"; o snapshot atualiza e o histórico ganha um evento.
4. Quando a API retorna mudança de status para `cancelled`, recebo email + Telegram com template vermelho.
5. Quando a mesma condição persiste no próximo ciclo, **não** recebo alerta duplicado (anti-spam).
6. Voo com `landed` há +2h é automaticamente pausado.
7. Aba "Preços" continua funcionando exatamente como antes (zero regressão).
8. Tabs persistem ao recarregar a página.
9. Todos os timestamps no DB são UTC; UI exibe em horário local.
