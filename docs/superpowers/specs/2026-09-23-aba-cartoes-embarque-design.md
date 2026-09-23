# Aba "Cartões de Embarque" — Design

**Data:** 2026-09-23
**Status:** aprovado em brainstorming, aguardando revisão final do usuário
**Branch:** `feat/cartoes-embarque`

## 1. Problema

Após fazer o check-in do cliente, o agente hoje, manualmente:
1. copia o link do cartão de embarque virtual (Google Wallet / Apple Wallet) de cada passageiro e trecho;
2. limpa o link (remove prefixo/sufixo de redirecionamento do Google);
3. envia por e-mail e por WhatsApp, escrevendo instruções à mão.

Objetivo: uma aba que recebe os links, limpa automaticamente, e gera/entrega e-mail profissional + mensagem de WhatsApp com instruções claras por companhia.

## 2. Escopo

**Dentro:**
- Aba nova "Cartões de Embarque" (separada da aba Vouchers).
- Preenchimento a partir de um voucher existente **ou** manual (quantidade de passageiros).
- 1+ links por passageiro (um por trecho).
- Limpeza e identificação automática do link (Azul, Gol, Latam; fallback "não reconhecido").
- Leitura dos dados do voo embutidos no link Google Wallet (voo, data, trecho, localizador).
- Link curto próprio (`/c/:code`) com redirect e contagem de aberturas.
- E-mail profissional (por passageiro ou para um e-mail único) com CCO da agência.
- WhatsApp via `wa.me` com texto pronto (por passageiro ou para um número único).
- Botão "Copiar mensagem" (com opção de usar links originais).
- Histórico com reabrir/reenviar e retenção automática.

**Fora (evolução futura):**
- Envio automático de WhatsApp via API (Meta Cloud API / Z-API / Evolution).
- Validação de assinatura do JWT do Google.

## 3. Formatos de link suportados

### 3.1 Azul (confirmado) e Gol (assumido igual à Azul)
Entrada típica:
```
https://accounts.google.com/v3/signin/identifier?continue=https://pay.google.com/gp/v/save/<JWT>&followup=https://pay.google.com/gp/v/save/<JWT>&osid=1&passive=...&flowName=...
```
Regra: extrair exatamente o conteúdo entre `continue=` e o próximo `&followup=` (ou, se ausente, o próximo `&` de parâmetro do `accounts.google.com`). Se o valor vier percent-encoded (`https%3A%2F%2F...`), aplicar `decodeURIComponent` uma vez. Resultado: `https://pay.google.com/gp/v/save/<JWT>`.

Se o usuário colar diretamente um `https://pay.google.com/gp/v/save/...`, ele já é considerado limpo.

**Leitura de dados do JWT** (sem verificar assinatura): decodificar o segmento do meio (base64url) → `payload.flightObjects[].id`. Exemplo real:
```
3388000000022917060.prd20260924AD2730SSARECRNWDKTNiFBRFQ-
```
Após o `.`, padrão observado: `prd` + `YYYYMMDD` + `CC` (cia, 2 chars) + `NNNN` (voo, 1–4 dígitos) + `OOO` + `DDD` (IATA) + `LLLLLL` (localizador, 6) + sufixo. Parse por regex best-effort: `^[a-z]*(\d{8})([A-Z0-9]{2})(\d{1,4})([A-Z]{3})([A-Z]{3})([A-Z0-9]{6})`. Falha no parse → sem dados, sem erro (o link continua válido). Carrier deduzido do código (`AD`→azul, `G3`→gol, `LA`/`JJ`→latam).

### 3.2 Latam
Entrada típica (já é o link final):
```
https://www.latamairlines.com/br/pt/boarding-pass?orderId=LA9573044YXJW&lastName=Carneiro&segmentIndex=0&itineraryId=2&origin=om&utm_source=...&utm_medium=...&utm_campaign=...&messageId=...
```
Regra: remover parâmetros `utm_*` e `messageId`; manter todos os demais na ordem original. Dados lidos: `orderId`, `lastName`, `segmentIndex`.

### 3.3 Não reconhecido
Qualquer outra URL `http(s)` válida: mantida como está, marcada `recognized: false`, **não recebe link curto** (vai o original nas mensagens). Texto que não é URL → erro de validação no campo.

## 4. UX (frontend)

**Arquivo:** `frontend/src/components/BoardingPassesTab.jsx` + `frontend/src/api/boardingPassClient.js`. Nova entrada em `Tabs.jsx`.

**Topo:** duas formas de começar:
- "Puxar de um voucher": select com vouchers recentes. Preenche passageiros (nomes) e cria um campo de link por trecho (`trips`) para cada passageiro. Pré-preenche o "e-mail único" com os destinatários do último `email_sent` desse voucher em `voucher_audit_log` (`details.to`).
- "Preencher manualmente": escolher quantidade de passageiros (1–9); cada passageiro começa com 1 campo de link.

**Bloco por passageiro:**
- Nome e sobrenome (obrigatório; validação: pelo menos 2 palavras).
- Links: um campo por trecho, botão "+ trecho", botão remover. Ao colar/sair do campo → `POST /api/boarding-passes/parse-link` → mostra selo:
  - ✅ `Azul · AD2730 · SSA→REC · 24/09`
  - ✅ `Latam · pedido LA9573044YXJW`
  - ⚠️ `Link não reconhecido — será enviado como está`
- E-mail (opcional), WhatsApp (opcional, com máscara BR; normalizado para dígitos com DDI 55).

**Destino (opções globais):**
- E-mail: `individual` (cada passageiro com e-mail recebe só os seus cartões) | `single` (um e-mail com todos os cartões para o endereço informado).
- WhatsApp: `individual` | `single` (um número recebe todos os cartões).
- CCO para a agência (`EMAIL_USER`), como no voucher.

**Prévia + ações (painel lateral):**
- Prévia do texto do WhatsApp por destinatário.
- **Enviar e-mail(s)**: salva o envio (se ainda não salvo) e dispara.
- **Abrir WhatsApp**: um botão por destinatário → `https://wa.me/<digits>?text=<encoded>`. Sem número: `https://wa.me/?text=...` (usuário escolhe o contato).
- **Copiar mensagem**: um por destinatário; toggle "usar links originais" (plano B se o painel estiver fora).
- Salvar é implícito: qualquer ação (e-mail, WhatsApp, copiar) persiste o envio primeiro, para que links curtos existam.

**Histórico (abaixo):** data, passageiros, voo/companhia, status do e-mail, aberturas por passageiro ("Maria abriu ✓ · João ainda não"). Ações: reabrir (carrega no formulário), reenviar e-mail, apagar.

## 5. Conteúdo das mensagens

Gerado em `backend/helpers/boardingPassMessage.js` (fonte única; o frontend só exibe).

### 5.1 WhatsApp (1 passageiro, Azul)
```
Olá, Maria! ✈️
Seu check-in está feito. Este é o seu cartão de embarque:

*AD2730 · Salvador → Recife · 24/09*
👉 https://<PUBLIC_BASE_URL>/c/K7xP2m

*Como salvar no celular:*
1. Toque no link acima
2. Toque em *Adicionar à carteira* (Google Wallet no Android, Apple Wallet no iPhone)
3. Pronto! O cartão fica salvo e funciona mesmo sem internet
Se a opção de carteira não aparecer, tire um print do QR code.

*No aeroporto:*
• Apresente o QR code do cartão e um documento oficial com foto na inspeção de segurança e no portão de embarque
• Deixe o brilho da tela no máximo
• Sem bagagem para despachar? Vá direto para a inspeção de segurança

Boa viagem! 🧳
*Clube do Voo Viagens*
```
- **Latam:** passos 2–3 viram "2. Toque em *Entendi*" / "3. Toque em *Adicionar à minha carteira*", e o "Pronto!" vira passo 4.
- **Vários passageiros/trechos** (modo `single`): saudação genérica ("Olá! ✈️ O check-in de vocês está feito…"), cartões agrupados por passageiro (`*Maria Silva*` + uma linha por trecho `SSA→GRU 👉 link`), instruções uma única vez. Se houver cias diferentes, instruções de cada cia rotuladas.
- Rótulo do trecho: dados do JWT, senão do voucher vinculado (por índice do trecho), senão `Trecho N`.
- Cidades: reaproveitar mapa IATA→cidade existente (`_airports.js` no frontend; criar equivalente/compartilhado no backend se não existir).
- Nome na saudação: primeiro nome (reaproveitar `parseFullName`/`firstNameOf` de `backend/helpers/voucherCarrier.js`, que tratam "SOBRENOME, NOME").

### 5.2 E-mail
Função `sendBoardingPassEmail` + `buildBoardingPassEmailHtml` em `services/notifier.js`, reaproveitando transporte SMTP, logo via CID e rodapé/redes sociais do e-mail de voucher.
- **Assunto:** `Seu cartão de embarque está pronto ✈️ AD2730 · 24/09` (sem dados de voo: `Seu cartão de embarque está pronto ✈️`).
- Cabeçalho "Check-in realizado!" + resumo do voo (cia, voo, trecho, data).
- Um bloco por passageiro, um botão grande **"Adicionar à carteira"** por trecho (href = link curto ou original).
- Seção "Como salvar" (3–4 passos por cia) e "No aeroporto" (mesmo checklist).
- CCO agência. Timezone fixo `America/Sao_Paulo` em qualquer data formatada.

## 6. Backend

### 6.1 Tabelas (em `database.js`, idempotente)
```sql
CREATE TABLE IF NOT EXISTS boarding_pass_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NULL,               -- sem FK rígida: voucher pode ser apagado
  payload_json TEXT NOT NULL,            -- passageiros, contatos, modos de envio
  flight_date TEXT NULL,                 -- YYYY-MM-DD, para retenção
  email_status TEXT NOT NULL DEFAULT 'not_sent', -- not_sent|sent|partial|failed
  email_sent_at TEXT NULL,
  email_log_json TEXT NULL,              -- [{to, ok, error?, at}]
  created_by INTEGER NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS boarding_pass_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  send_id INTEGER NOT NULL REFERENCES boarding_pass_sends(id) ON DELETE CASCADE,
  passenger_index INTEGER NOT NULL,
  segment_index INTEGER NOT NULL,
  original_url TEXT NOT NULL,
  clean_url TEXT NOT NULL,
  carrier TEXT NULL,                     -- azul|gol|latam|NULL
  recognized INTEGER NOT NULL DEFAULT 0,
  parsed_json TEXT NULL,                 -- {flightNumber, date, origin, destination, locator, orderId, lastName}
  short_code TEXT UNIQUE NULL,           -- NULL quando não reconhecido
  open_count INTEGER NOT NULL DEFAULT 0,
  first_opened_at TEXT NULL,
  last_opened_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_bpl_send ON boarding_pass_links(send_id);
```
`payload_json`:
```js
{
  passengers: [{ name, email?, phone?, segments: [{ url }] }],
  emailMode: 'individual'|'single', singleEmail?,
  whatsappMode: 'individual'|'single', singlePhone?
}
```
Ao salvar/editar um envio, os links são recriados preservando `short_code` e contadores quando `(passenger_index, segment_index, clean_url)` não mudou.

### 6.2 Módulos
| Arquivo | Responsabilidade |
|---|---|
| `helpers/boardingPassLink.js` | `parseBoardingPassLink(raw)` → `{ ok, error?, cleanUrl, carrier, recognized, data }`. Puro, sem I/O. Inclui decode do JWT e allowlist de hosts. |
| `helpers/boardingPassMessage.js` | `buildWhatsappMessages(send, links, baseUrl, {useOriginal})` → `[{ label, phone?, text, waUrl }]`; `instructionsFor(carrier)`. Puro. |
| `helpers/shortCode.js` (ou inline) | `crypto.randomBytes` → 8 chars base62; retry em colisão. |
| `services/notifier.js` | `sendBoardingPassEmail`, `buildBoardingPassEmailHtml`. |
| `services/boardingPassRetention.js` | Cron diário (mesmo padrão de `voucherRetention`): apaga envios com `COALESCE(flight_date, date(created_at)) + BOARDING_PASS_RETENTION_DAYS (default 7) < hoje`. |
| `routes/boardingPasses.js` | API autenticada. |
| `routes/shortLink.js` | Rota pública `/c/:code`. |

### 6.3 API (`/api/boarding-passes`, atrás de `requireAuth`)
- `POST /parse-link` `{ url }` → resultado de `parseBoardingPassLink`.
- `GET /` → lista (resumo + aberturas por passageiro).
- `GET /:id` → envio completo + links.
- `POST /` / `PUT /:id` → valida (nome ≥ 2 palavras, ≥ 1 link válido por passageiro, e-mails válidos, telefones 10–13 dígitos), salva, gera códigos curtos. Retorna envio + links.
- `DELETE /:id`.
- `GET /:id/messages?useOriginal=0|1` → mensagens de WhatsApp prontas (texto + `waUrl`).
- `POST /:id/send-email` → envia conforme `emailMode`; atualiza `email_status`/`email_log_json`. Passageiros sem e-mail no modo `individual` são ignorados (reportados na resposta).
- `GET /voucher-prefill/:voucherId` → `{ passengers:[{name}], trips:[{label}], lastEmails:[...], flightDate }`.

### 6.4 Rota pública `/c/:code`
Montada em `server.js` antes do `requireAuth` (mesmo padrão de `/itinerario`).
- Código existe → incrementa `open_count`, atualiza `first/last_opened_at`, **302** para `clean_url`.
- Redireciona **somente** se o host de `clean_url` estiver na allowlist: `pay.google.com`, `*.latamairlines.com`, `*.voegol.com.br`, `*.voeazul.com.br`. Caso contrário → 404 (defesa contra open redirect).
- Código inexistente/expirado → página HTML amigável: "Este link expirou. Fale com a Clube do Voo Viagens" + botão WhatsApp da agência.
- Não contar aberturas de bots de preview (User-Agent contendo `WhatsApp`, `facebookexternalhit`, `bot`, `crawler`, `preview`); esses recebem o 302 normalmente, só não incrementam contador.

### 6.5 Env
- `PUBLIC_BASE_URL` (já existe) — base do link curto.
- `BOARDING_PASS_RETENTION_DAYS` (novo, default 7).

## 7. Tratamento de erros
- Link inválido: erro inline no campo; bloqueia salvar só se o passageiro ficar sem nenhum link válido.
- Falha de SMTP: `email_status = failed|partial`, log por destinatário, toast com o motivo; botão "Reenviar".
- Painel fora do ar: toggle "usar links originais" no copiar/WhatsApp.
- Parse de JWT falho: sem selo de voo, link segue válido.

## 8. Privacidade / LGPD
- Dados mínimos (nome, contato, link) e apagados automaticamente após o voo.
- Códigos curtos aleatórios de 8 chars base62 (não sequenciais).
- Allowlist de redirect.
- Modo privacidade existente (`usePrivacy()` em `frontend/src/hooks/usePrivacy.js`): aplicar pseudônimo/borrão a nomes no histórico, como nas outras abas.

## 9. Testes (Jest, `backend/__tests__/`)
- `boardingPassLink.test.js`: exemplo real da Azul → URL limpa exata; variante percent-encoded; link `pay.google.com` direto; Latam com remoção de `utm_*`/`messageId` preservando o resto; URL desconhecida; texto não-URL; parse do JWT (`AD2730`, `SSA`, `REC`, `2026-09-24`, `RNWDKT`); JWT corrompido.
- `boardingPassMessage.test.js`: 1 passageiro Azul; 1 passageiro Latam (passos Entendi); múltiplos passageiros/trechos modo single; cias mistas; `useOriginal`; nome "SOBRENOME, NOME".
- `routes-boardingPasses.test.js`: CRUD, validação, preservação de short_code no update, send-email com transporte mockado, voucher-prefill.
- `shortLink.test.js`: 302 + contador; bot UA não conta; host fora da allowlist → 404; código inexistente → página expirada.
- `boardingPassRetention.test.js`: com e sem `flight_date`.

## 10. Critérios de sucesso
- Colar o link longo da Azul produz exatamente a URL limpa esperada.
- Um envio de 2 passageiros × 2 trechos sai por e-mail e WhatsApp em menos de 2 minutos, sem edição manual de texto.
- Histórico mostra quem abriu o cartão.
