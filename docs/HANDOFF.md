# HANDOFF GERAL — Painel de Voos Monitorados (Clube do Voo Viagens)

> Escrito em 2026-10-14. Para passar a administração das pendências e das futuras modificações a outro chat **sem perder qualidade**. Leia as seções 0 a 3 antes de tocar em qualquer coisa. O handoff específico de vouchers (esquema canônico, templates, decisões antigas) continua em `docs/vouchers-handoff.md`; este documento é o mapa geral e **o que está pendente**.

---

## 0. Prompt de abertura (cole no novo chat)

```
Você vai assumir a administração do projeto "Painel de Voos Monitorados" (Clube do Voo Viagens).
Leia, nesta ordem: docs/HANDOFF.md (inteiro), docs/vouchers-handoff.md (seções 1, 5, 6 e as seções de Cartões de Embarque e Alterações de voo no fim) e a memória em
C:\Users\joabh\.claude\projects\E--AG-Painel-de-voos-monitorados-Painel-de-voos-monitorados\memory\MEMORY.md.
Regras inegociáveis: responder SEMPRE em português do Brasil; não fazer push sem a confirmação explícita da usuária NAQUELE momento (push em main dispara deploy em produção); reaproveitar a stack atual (Node/Express/SQLite + React/Vite/Tailwind), sem introduzir 2º backend/linguagem.
Comece verificando o estado do git (seção 2) e confirmando comigo qual pendência da seção 9 atacar primeiro.
```

---

## 1. Quem é a usuária e como ela trabalha

- Dona da **Clube do Voo Viagens** (agência de viagens, Brasil). Tecnicamente letrada; pensa como **arquiteto/PO**: descreve o problema com prints, decide entre opções que você propõe e espera **explicações curtas, em pt-BR, sem jargão desnecessário**.
- Costuma mandar **prints de erros reais de produção** e pedir correções incrementais. Em cada entrega ela quer: o que mudou, **o que foi testado e o que NÃO foi** (principalmente Gemini real e e-mail real), e o que fazer após o deploy.
- **Aprovação de push é por ocasião**: ela diz "pode dar o push direto na main" depois que você pergunta. Aprovação anterior não vale para o próximo push. Sempre pergunte ("Posso dar o push direto na main?") ao terminar um lote.
- Prefere decidir com opções recomendadas (a primeira opção marcada como recomendada). Pergunte só o que muda o rumo; o resto, escolha o padrão convencional e diga o que escolheu.
- Pediu explicitamente: **não anexar arquivos em sites de terceiros que possam ter anúncios** (o PDF do voucher é servido pelo próprio servidor).

---

## 2. ⚠️ Estado do git e do deploy — verificar primeiro

- Remotes: `origin` = `https://github.com/cvvcontato-dev/painel-voos-monitorados` (**dona do repositório; é daqui que o Coolify faz o deploy**, branch `main`); `fork` = `joabh11-cmyk/painel-voos-monitorados` (sem permissão de escrita em `origin`).
- **Estado em 2026-10-14:** `origin/main` = `7e3dc1c` (tudo desta rodada está em produção/enviado). Trabalho feito no worktree `E:\AG\Painel de voos monitorados\Painel de voos monitorados\.claude\worktrees\sad-maxwell-3799cf`, branch local `feat/banco-fundos-promo` (mesmo commit que `main`). Este `docs/HANDOFF.md` pode estar **commitado localmente e não enviado** — confira `git log origin/main..HEAD`.
- **Push:** `git push origin HEAD:main`. O Git Credential Manager (GCM) abre um pop-up do GitHub: a usuária escolhe a conta **`cvvcontato-dev`** (as contas `joabh11-cmyk` e `anapaula-rls` não têm escrita → 403). A configuração global foi consertada: o helper `credential.https://github.com.helper` antigo (`gh auth git-credential`) foi removido para o GCM aparecer. Se um dia der 403, rode `git credential reject` para `cvvcontato-dev` e tente de novo; confira com `git config --global --get-all credential.https://github.com.helper` (deve vir vazio) e `git config --get credential.helper` (= `manager`).
- **Coolify:** deploy automático por webhook no push em `main` (Dockerfile na raiz). A usuária já alterou a branch/fonte no Coolify uma vez e o deploy deixou de disparar — se "não houve deploy", confira primeiro **Source/branch = main** e o webhook. Logs de runtime/build ficam no Coolify.
- Worktrees: o `git stash` é **compartilhado entre worktrees** — nunca use `git stash`/`pop` simples. Prefira commit WIP. Para novas features, crie um worktree/branch a partir de `origin/main` atualizado (`git fetch origin`).
- Avisos do git de "LF will be replaced by CRLF" são normais no Windows.

---

## 3. Stack, infraestrutura e produção

- **Backend:** Node 20 + Express, **SQLite** (`sqlite3`, uma conexão; sessões em `sessions.sqlite` via `connect-sqlite3`), `bcryptjs`, CSRF por double-submit (cookie `csrf` + header `X-CSRF-Token`), `multer` (memória), `node-cron` com `timezone: 'America/Sao_Paulo'`, **Playwright/Chromium** (scraping do Google Voos e render de PDFs/artes), `nodemailer` (SMTP) e Telegram.
- **Frontend:** React 19 + Vite + Tailwind v4 (dark mode por classe), `lucide-react`, `recharts`, `react-hook-form`. O build vai para a imagem; o Express serve o SPA.
- **IA:** Gemini (`@google/generative-ai`) para extrair vouchers/prints/promoções e montar buscas de fotos; **Pexels** para fotos de fundo; AeroDataBox (RapidAPI) para status de voos.
- **Docker/Coolify:** `Dockerfile` (multi-stage; imagem final `node:20-bookworm-slim` com Chromium do sistema via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). **Volume persistente em `/data`** (`DB_PATH=/data`): banco, sessões, `backups/`, `promo-backgrounds/`, `voucher-pdfs/`, uploads de vouchers. **O que está dentro da imagem (ex.: `backend/static`) some a cada deploy.**
- **Produção em Hostinger VPS** via Coolify. Atenção: o Coolify **mutila caracteres especiais** em variáveis de ambiente (senhas com `$`, `#`, `!`…): foi a causa do bug de login em produção (`bcrypt_match=false`); a solução foi trocar a senha para uma sem caracteres problemáticos.

### 3.1 Variáveis de ambiente (nomes; valores só no Coolify)

Obrigatórias: `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (o servidor dá `process.exit(1)` sem elas em banco novo), `DB_PATH=/data`, `NODE_ENV=production`, `CORS_ORIGIN`.
Funcionalidades:
- Status de voos: `AVIATION_API_MODE` (`stub`|`real`), `RAPIDAPI_KEY`, `DELAY_THRESHOLD_MIN` (15), `STATUS_MONITOR_BATCH_SIZE` (10).
- IA: `EXTRACTION_MODE` (`stub`|`real`), `GEMINI_API_KEY`, `GEMINI_MODEL` (padrão `gemini-3.5-flash`), `PEXELS_API_KEY`, `PROMO_OUTPUT_DIR`.
- **`PUBLIC_BASE_URL`** (ex.: `https://painel.suaempresa.com`) — **sem ela o link do voucher novo some das mensagens** e os links dos e-mails ficam `localhost`. Confira que está definida em produção.
- E-mail: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` (senha de app do Gmail, 16 caracteres), `EMAIL_FROM`. Telegram: `TELEGRAM_BOT_TOKEN`.
- Vouchers/links: `VOUCHER_TOKEN_SECRET` (cai para `SESSION_SECRET`), `VOUCHER_RETENTION_DAYS` (30), `VOUCHER_PDF_RETENTION_DAYS` (90), `BOARDING_PASS_RETENTION_DAYS` (7).
- Scraper: `MAX_CONCURRENT_SCRAPERS`, `ALERT_RESET_THRESHOLD`. Backup: `BACKUP_ENABLED` (liga por padrão), `BACKUP_KEEP` (14).
- Referência completa e comentada: `backend/.env.example`.

### 3.2 Agendadores (horário de Brasília)

| Quando | O quê |
|---|---|
| 08:00 e 20:00 | Verificação de preços (scraper do Google Voos) |
| a cada 5 min | Monitor de status de voos (processa só os vencidos) |
| 03:00 | Backup do banco (`VACUUM INTO`) + cópia das fotos de fundo (`backups/fundos-*`); +30 s após boot se a última cópia tiver >12 h |
| 03:30 | Retenção de vouchers (apaga arquivos de origem >30 dias) e faxina de PDFs guardados |
| 03:45 | Retenção de cartões de embarque |

---

## 4. Mapa do produto (abas)

`frontend/src/App.jsx` → `TABS`: Preços · Status · Promoções · Vouchers · Cartões de Embarque · **Alterações** · Pacotes. (+ Configurações/Usuários/Backups no menu do usuário.)

| Aba | O que faz (resumo) | Arquivos-chave |
|---|---|---|
| **Preços** | Monitora preço por voo; etiqueta "Aguardar" quando acima da meta; cores de prioridade; comprado/desistência (ficam sempre embaixo, desistência por último) com contadores; ordenação dinâmica por proximidade da meta + filtro por prioridade; **preço-alvo sugerido** e métrica de economia; gráfico de histórico (60 dias) por voo, expansível | `routes/flights.js`, `routes/monitoredFlights.js`, `services/flightScraper.js`, `scheduler.js`, `notifier.js`, `PrecosTab.jsx`, `PriceHistoryChart.jsx` |
| **Status** | Monitora status de voo (atraso/cancelamento/reagendamento) via AeroDataBox; link de administração da viagem do cliente; status **Concluído** (auto-pausa, ocultável); horário manual; **agrupar por cliente** | `services/statusMonitor.js`, `statusNotifier.js`, `aviationApi.js`, `StatusTab.jsx`, `StatusModal.jsx` |
| **Promoções** | Extrai promoção de um print (Gemini), gera mensagem de WhatsApp (formato fixo definido pela usuária) e **arte** (Playwright) com título auto-ajustável e **banco de fundos por destino** | `routes/promotions.js`, `services/promo*.js`, `backgroundLibrary/Resolver/Queries.js`, `routes/promoBackgrounds.js`, `PromocoesTab.jsx`, `BackgroundPicker.jsx`, `BackgroundBank.jsx` |
| **Vouchers** | Sobe PDF/imagem de voucher de cia (Azul/Gol/Latam), extrai (Gemini), edita, exporta PDF/PNG, envia e-mail, página pública do **itinerário** (`/itinerario/<token>`) | `routes/vouchers.js`, `services/voucherExtractor.js`, `voucherRenderer.js`, `helpers/itinerarioPage.js`, `VouchersTab.jsx`, `voucher-templates/` |
| **Cartões de Embarque** | Cola link de cartão (Google Wallet), limpa, cria link curto `/c/:code`, mensagens de WhatsApp e e-mail por passageiro | `routes/boardingPasses.js`, `helpers/boardingPass*.js`, `services/boardingPass*.js` |
| **Pacotes** | Monta pacote (voo+hotel etc.) a partir de itens extraídos | `routes/packages.js`, `services/package*.js`, `/pacote/:token` |
| **Alterações** | Avisa o cliente quando a cia altera o voo e confirma o voo novo (seção 5) | `routes/flightChanges.js`, `helpers/flightChange*.js`, `FlightChangesTab.jsx` |
| **Backups** | Lista/baixa/dispara backups do banco | `routes/backups.js`, `services/backup.js`, `BackupsPanel.jsx` |

Outros recursos transversais: login com sessão (`requireAuth`), usuários/admin, **modo privacidade** (classe `pii` esconde dados do cliente), tema claro/escuro.

---

## 5. Aba **Alterações** em detalhe (feature mais recente)

Specs/planos: `docs/superpowers/specs/2026-10-13-alteracao-de-voo-design.md`, `docs/superpowers/plans/2026-10-13-alteracao-de-voo.md`.

**Fluxo (um registro em `flight_changes`; status `aviso_pendente → aviso_enviado → confirmado`):**
1. *Aviso* — só com o voucher **antigo** (escolhido da aba Vouchers ou enviado; extração completa). Gera texto de WhatsApp (sem horários novos) e e-mail opcional, com botão `wa.me` para o suporte (`voucher_settings.contact_phone`). O envio de WhatsApp é **manual** (a usuária cola/abre o `wa.me`); "marcar aviso como enviado" é um clique dela.
2. *Confirmação* — sobe o voucher **novo** (PDF ou **print só dos voos**): `extractFlights` + `mergeNewFlights` (`helpers/flightChangeMerge.js`) montam o voucher completo **a partir do antigo** (passageiros/bagagem do antigo; locator só se aparecer no print e for válido; substitui só as direções presentes; cia por prefixo do voo; whitelist de campos; datas validadas; `warnings` âmbar na tela). Comparação automática (`helpers/flightChangeDiff.js`: nomes como conjunto de tokens, bagagem normalizada, pareamento de trechos por voo+data e depois ordem). "Corrigir dados lidos" permite edição manual. Gera mensagem "antes → depois" com **link do novo voucher**, e-mail opcional com PDF anexo, e "Confirmar alteração".
3. **Fonte de verdade = `flight_changes.new_json`**. O voucher antigo da aba Vouchers **nunca** é alterado/apagado. `old_json` é snapshot (a retenção apaga o arquivo do voucher em 30 dias).

**Voucher novo "no padrão da aba Vouchers":** o PDF é o mesmo `renderVoucher`; a tela mostra prévia (iframe `/voucher-preview/:id`), Baixar PDF/PNG, copiar/abrir link. **PDF guardado** em `<DB_PATH>/voucher-pdfs/voucher-<id>-<hash>.pdf` (`services/voucherPdfStore.js`; fila global de 1 render; gerado em segundo plano após upload/correção; purgado ao apagar; faxina aos 90 dias). A página pública `/itinerario/<token>` mostra **"BAIXAR VOUCHER (PDF)"** só se existe PDF do hash atual; rota `GET /itinerario/:token/voucher.pdf` (token verificado, `no-store`, `noindex`).

**Itinerário (`helpers/itinerarioPage.js`):** o QR do bloco "Assistência" leva ao **WhatsApp da agência** com mensagem pré-preenchida (fallback: site) e é clicável; os QRs por reserva levam ao check-in/gerenciar reserva da cia. Helper único `qrSvg()`.

**Modelo de e-mail:** botão "Ver modelo do e-mail" (rota `GET /api/flight-changes/:id/email-preview?kind=aviso|confirmacao` → `{subject, html}`, mesmo construtor do envio). Aviso: visual de Cartões de Embarque. Confirmação: **mesmo template da aba Vouchers** (`buildVoucherEmailHtml`) com caixa "O que mudou".

**Contrato da API** (todas atrás de `requireAuth`+CSRF, escopo por `user_id`): `GET/POST /api/flight-changes`, `GET/DELETE /:id`, `POST /:id/notice-sent`, `POST /:id/new-voucher` (multipart `file`), `PUT /:id/new`, `POST /:id/confirm`, `POST /:id/send-email` (`kind`), `GET /:id/email-preview`, `PUT /:id/affected`.

**Trechos afetados / reservas separadas (2026-10-21; spec `docs/superpowers/specs/2026-10-21-alteracao-trechos-afetados-design.md`):** quando o voucher antigo é combinado (≥2 localizadores entre os trechos), a usuária marca **qual(is) trecho(s) mudou(aram)** antes do aviso e do voucher novo. `flight_changes.affected_json` guarda os índices em `old_json.trips` (NULL = todos; casos legados seguem assim) e `extracted_json` guarda a saída do `extractFlights` para **refazer o merge sem nova chamada à IA** quando a marcação muda (`PUT /:id/affected`). Merge, diff, aviso, confirmação e e-mail respeitam a marcação (`helpers/flightChangeReservations.js`, `flightChangeMerge/Diff/Message`): só os trechos marcados são trocados; o novo localizador/cia vale só para a reserva afetada; o aviso cita só o trecho/reserva afetados; o cliente recebe sempre o voucher **completo**. Enquanto `needs_affected`, `new-voucher`, `notice-sent` e o aviso por e-mail devolvem 409 `escolha_trechos`. O detalhe do caso traz `affected`, `needs_affected` e `reservation_groups` (a UI do CaseView é outra etapa). Colunas criadas por migração idempotente (`helpers/dbColumns.js`).

---

## 6. Testes e verificação

- **Backend:** `cd backend && npx jest --runInBand` (usar `--runInBand`). **Resultado esperado hoje: 588 passando e 19 falhando — todos em `auth.test.js` e `users.test.js` (pré-existentes: 403 de CSRF no `makeAuthApp`)**. Qualquer outra falha é nova e deve ser investigada. Um arquivo: `npx jest __tests__/<arquivo> --runInBand`.
- **Frontend:** `cd frontend && npm run build` (não há runner de teste nem lint). O aviso de chunk >500 kB já existe.
- **Método usado nesta fase (recomendado):** TDD + **sabotagem** (quebrar de propósito a proteção e ver o teste falhar) + revisão de conformidade e de qualidade por subagentes + **verificação no navegador** com o backend real em modo stub.
- **Verificação E2E local (padrão que funcionou):** NÃO use a porta 3000 (outro projeto da usuária, Proagenda, usa Vite lá). Suba o backend em `PORT=3100` com `DB_PATH` temporário, `EXTRACTION_MODE=stub` (sem `GEMINI_API_KEY` o extrator devolve voucher fixo STUB01), `ADMIN_EMAIL=admin@test.com`/senha de teste só local e `BACKUP_ENABLED=0`; suba o Vite numa porta própria (5180) com um arquivo de config temporário (fora do repo) apontando o proxy `/api` para 3100. `/itinerario` e `/voucher-preview` **não** passam pelo proxy do Vite (só em produção o Express serve tudo) — para a página do itinerário abra direto `localhost:3100`. Encerre **só** os seus processos depois.
- **Não testado localmente (sem chave):** Gemini real (prompts `PROMPT` e `FLIGHTS_PROMPT`), envio real de e-mail (SMTP) e Telegram, scraper real, AeroDataBox real. Diga isso à usuária em toda entrega que dependa deles.

---

## 7. Armadilhas e lições (leia — custaram caro)

1. **Barras invertidas somem** em heredocs/scripts de shell e em alguns patches: um `/<\?xml…/` virou `/<?xml…/` e corrompeu o QR em produção-candidata; `\.pdf` em template literal vira `.`. **Use as ferramentas de escrita/edição de arquivo para código com regex e RELEIA cada `\d`, `\?`, `\.`**. Teste o resultado, não só a presença de tags.
2. **Comandos muito longos no Windows** (`ENAMETOOLONG`, >~32 KB): grave arquivos grandes com a ferramenta Write, não com heredoc.
3. **Processos Jest/node órfãos** seguram `backend/__tests__/.tmp/database.sqlite` e causam falhas falsas (ex.: 409 em `routes-monitoredFlights`). Antes de rodar a suíte, confira `Get-CimInstance Win32_Process` por `jest`; encerre só os seus.
4. **`node-sqlite3` roda queries em paralelo**: migrações que dependem de ordem precisam de `db.serialize`/encadeamento no callback. `PRAGMA foreign_keys = ON` está ativo (testes que inserem `user_id` falso falham).
5. **Windows:** `EBUSY` ao apagar o banco de teste aberto → `try/catch` no `afterAll`. Screenshots do painel do navegador às vezes dão timeout — repita ou use `resize_window`; leia o DOM por JS/`find` quando preciso.
6. **Hard link/volume:** backup de fotos usa hard link com fallback para cópia (mesmo volume `/data`).
7. **Express `res.sendFile`** ignora caminhos com diretório iniciado por ponto (`.claude/worktrees/...`): em dev, defina `PROMO_OUTPUT_DIR` fora dele. Produção não é afetada.
8. **Coolify mutila caracteres especiais** nas variáveis (senhas).
9. **Mensagens ao cliente vão para pessoas reais:** nunca confie em texto livre do modelo de IA — o merge usa whitelist/validação; mantenha esse padrão. WhatsApp usa `*negrito*`; o e-mail converte.
10. **Reanálise de passageiros:** vouchers de cias diferentes trazem nomes em formatos diferentes ("SOBRENOME, NOME" × "NOME SOBRENOME"); a comparação usa tokens.

---

## 8. Convenções de trabalho (como manter a qualidade)

1. **Sempre pt-BR** (respostas, UI, comentários, mensagens de commit).
2. Fluxo: entender o pedido → (se for feature) `superpowers:brainstorming` → spec em `docs/superpowers/specs/` → plano em `docs/superpowers/plans/` → `superpowers:subagent-driven-development` (implementador + revisão de conformidade + revisão de qualidade, com re-revisão após correções) → verificação real → relatar → **pedir permissão para o push**.
3. Reaproveitar a stack e os padrões vizinhos (ler a aba/arquivo vizinho antes de escrever). Não introduzir 2º backend/linguagem (memória: *Stack consistency*).
4. Commits pequenos, em pt-BR, `feat(...)`/`fix(...)`/`docs(...)`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (ajuste ao modelo em uso).
5. Em toda entrega: **o que mudou / o que foi testado / o que NÃO foi testado / o que conferir depois do deploy**.
6. Segurança: escopo por `user_id` em toda query de caso/voucher; SQL parametrizado; HTML escapado em e-mails; links públicos assinados (`voucherToken`); sem site de terceiros para hospedar arquivos de cliente; PDFs com nome de passageiro têm retenção.
7. A usuária pode mudar de modelo no meio da conversa (`/model`); o handoff vale para qualquer um.

---

## 9. ⭐ PENDÊNCIAS (lista priorizada)

### 9.1 Validações pós-deploy que só a produção permite (fazer com a usuária)
- [ ] **Leitura real do Gemini do print só de voos** (caso 5 da usuária — Gol): esperado ida G3 1922 (17/11 14:45→16:05) e volta G3 1925 (22/11 07:10→08:30), passageiros inalterados, **sem** "passageiros adicionados/removidos". Requer `EXTRACTION_MODE=real` + `GEMINI_API_KEY`. Se a leitura errar, pedir o print e ajustar `FLIGHTS_PROMPT` em `services/voucherExtractor.js`.
- [ ] **Chromium do servidor gerando o PDF** guardado (botão "BAIXAR VOUCHER (PDF)" no link do cliente; arquivos em `/data/voucher-pdfs`; log `[FLIGHT-CHANGES] pdf:` mostra falhas).
- [ ] **Envio real de e-mail** (aviso e confirmação) para o endereço da própria usuária, antes de usar com clientes. Conferir `PUBLIC_BASE_URL` e o telefone de contato em Vouchers → Configurações (sem ele, o aviso sai sem o botão de WhatsApp e o QR cai no site).
- [ ] **Backup:** rodar "fazer backup agora" e ver "N foto(s) de fundo" na cópia; lembrar que a restauração das fotos é manual (copiar `backups/fundos-*` de volta para `<DB_PATH>/promo-backgrounds/`).

### 9.2 Decisões em aberto (perguntar à usuária)
- [ ] **Texto do e-mail de confirmação e da página do cliente:** hoje diz "RESERVA CONFIRMADA — Sua viagem está pronta" (template de reserva nova). Proposta já feita: "VOO REAJUSTADO — Seu voo foi reajustado; veja abaixo o voucher atualizado". Exige um parâmetro/variante em `buildVoucherEmailHtml` (`services/notifier.js`) e em `helpers/itinerarioPage.js`, com testes.
- [ ] **Apagar a branch antiga `feat/banco-fundos-promo` do remote `fork`** (memória `project-fork-branch-cleanup`): `git push fork --delete feat/banco-fundos-promo` — **só com confirmação**.

### 9.3 Dívida técnica conhecida
- [ ] `auth.test.js` e `users.test.js`: 19 falhas pré-existentes (403 de CSRF no `makeAuthApp` do `testApp.js`). Consertar o helper e religar os testes.
- [ ] `POST /api/vouchers` deveria usar `helpers/voucherStore.js` (hoje duplica extração/gravação; TODO no arquivo).
- [ ] Vouchers antigos da aba Vouchers **não têm PDF guardado** → página deles sem botão de download. Opção: gerar o PDF no envio de e-mail da aba Vouchers (`ensure`) ou sob demanda.
- [ ] Comparação: passageiros **homônimos** contam como um; subconjunto de nome (nome do meio omitido) pode juntar pessoas diferentes (pai/filho sem sufixo) — documentado em `helpers/flightChangeDiff.js`.
- [ ] `listBackups()` devolvendo `[]` por erro de leitura faria a rotação apagar as pastas `fundos-*` (improvável; proteger se mexer em `services/backup.js`).
- [ ] Possível corrida teórica de `confirm`/`send-email` com um `PUT /new` simultâneo (janela de ms; uso interno).
- [ ] `new-voucher` sempre recomeça do voucher **antigo** (decisão); se a usuária quiser acumular prints parciais, mudar para partir do `new_json` e ajustar a UI.
- [ ] TTL do link público = 90 dias (mesmo padrão da aba Vouchers). Voo marcado para além disso teria link expirado.
- [ ] Wallet/"Cartões de Embarque": WhatsApp automático via API está **fora de escopo** (hoje `wa.me` com texto pronto).

### 9.4 Contexto de fases anteriores (verificar antes de mexer)
- **Status de voos:** a usuária avaliou trocar AeroDataBox por AirLabs (plano grátis de 1000 consultas/mês) e investigou a API de Alertas da AeroDataBox; ela usa **cadência de 1 verificação/dia**. Confirme o estado atual antes de propor mudanças (custo financeiro = pergunta que ela sempre faz).
- **Notificações:** e-mail/Telegram foram consertados (mensagem do toast de teste, conteúdo do e-mail). O Telegram já devolveu "chat not found" em teste — checar `chat_id` nas Configurações se voltar a falhar.
- **Scraper do Google Voos:** corrigido o tempo de espera do preço (3–5 s para aparecer); relatado por voo sem preço — reabrir com print/log se reaparecer.

---

## 10. Onde está cada coisa (atalhos)

- Specs/planos de cada feature: `docs/superpowers/specs/` e `docs/superpowers/plans/`.
- Handoff de vouchers/cartões/alterações: `docs/vouchers-handoff.md`. README (Status de Voos): `README.md`.
- Variáveis: `backend/.env.example`. Banco/migrações: `backend/database.js`. Rotas montadas: `backend/server.js`.
- Testes: `backend/__tests__/` (helper de app/sessão/CSRF em `testApp.js`). Pastas geradas ignoradas pelo git: `backend/__tests__/.tmp/`, `backend/promo-backgrounds/`, `backend/voucher-pdfs/`.
- Memória do assistente: `C:\Users\joabh\.claude\projects\E--AG-Painel-de-voos-monitorados-Painel-de-voos-monitorados\memory\` (`MEMORY.md` + `user_role`, `feedback_stack_consistency`, `project_fork_branch_cleanup`).
- Histórico recente (mais novos → antigos): `7e3dc1c` merge de voos robusto · `73c107a/cf898c1` voucher novo só com print de voos · `b5c779c/d6cc72c/09014fe` itinerário (QR de suporte clicável + PDF no link) · `163e935…19273b0` nomes/bagagem/link/preview do e-mail · `d3d9ced…1d25cc5` aba Alterações (frontend e backend) · `78be791/3a9c034` fotos no backup · `e75fa38` banco de fundos de promoções.
