# HANDOFF GERAL — Painel de Voos Monitorados (Clube do Voo Viagens)

> Atualizado em 2026-10-29 (escrito originalmente em 2026-10-14; desde então: fila de atualização de preços, otimização mobile em 4 etapas, instalação como app, mensagens de erro da IA). Para passar a administração das pendências e das futuras modificações a outro chat **sem perder qualidade**. Leia as seções 0 a 3 antes de tocar em qualquer coisa. O handoff específico de vouchers (esquema canônico, templates, decisões antigas) continua em `docs/vouchers-handoff.md`; este documento é o mapa geral e **o que está pendente**.

---

## 0. Prompt de abertura (cole no novo chat)

```
Você vai assumir a administração do projeto "Painel de Voos Monitorados" (Clube do Voo Viagens).
Leia, nesta ordem: docs/HANDOFF.md (inteiro), docs/vouchers-handoff.md (seções 1, 5, 6 e as seções de Cartões de Embarque e Alterações de voo no fim) e a memória em
C:\Users\joabh\.claude\projects\E--AG-Painel-de-voos-monitorados-Painel-de-voos-monitorados\memory\MEMORY.md.
Regras inegociáveis: responder SEMPRE em português do Brasil; não fazer push sem a confirmação explícita da usuária NAQUELE momento (push em main dispara deploy em produção); reaproveitar a stack atual (Node/Express/SQLite + React/Vite/Tailwind), sem introduzir 2º backend/linguagem.
Comece verificando o estado do git (seção 2) e confirmando comigo qual pendência da seção 9 atacar primeiro. Para qualquer tela nova, siga as regras mobile da seção 5.1 (celular < 768 px sem alterar o computador; use useBackClose em modais).
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
- **Estado em 2026-10-29:** `origin/main` = `25f99cf` ("painel instalável como app") — tudo até a Etapa 4 mobile está enviado/em produção. Trabalho feito no worktree `E:\AG\Painel de voos monitorados\Painel de voos monitorados\.claude\worktrees\sad-maxwell-3799cf`, branch local `feat/banco-fundos-promo`, que é mantida **igual a `origin/main`** enviando com `git push origin HEAD:main` (o upstream configurado dessa branch é o remote `fork`, por isso `git status` mostra "ahead 73" — ignore). Este `docs/HANDOFF.md` atualizado pode estar **commitado localmente e não enviado**: confira `git log origin/main..HEAD`.
- **Fim de linha (CRLF/LF):** o repositório guarda LF; o Windows (autocrlf) materializa CRLF. Se um script Python/sed reescrever arquivos e o `git diff --stat` mostrar o arquivo inteiro alterado, normalize com `sed -i 's/\r$//' arquivo` antes do `git add`, e confira `git diff --cached --numstat` (deve mostrar só as linhas realmente mudadas).
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

## 5.1 Otimização mobile (concluída em 2026-10-26, 4 etapas, todas em produção)

Specs/planos: `docs/superpowers/specs/2026-10-26-otimizacao-mobile-design.md` e `docs/superpowers/plans/2026-10-26-otimizacao-mobile-etapa-{1,2,3}.md`. A usuária usa o celular para **tudo** (consultar preços/status, montar e enviar mensagens, subir vouchers e prints).

**Regras do design (valem para qualquer tela nova):**
- Celular = **< 768 px** (`md` do Tailwind). **O computador (≥ 768 px) não pode mudar**: toda classe de celular precisa de contrapartida `md:` que reponha o valor anterior (ex.: `min-h-[44px] md:min-h-0`, `h-[100dvh] md:h-auto`, `hidden md:block`). Para o que o CSS não resolve (tabela → cartões), use `useIsMobile()` (`hooks/useMediaQuery.js`, `matchMedia`).
- Alvos de toque ≥ 44 px (chips ≥ 40; mínimo absoluto 36), texto ≥ 11 px, campos com 16 px (regra global em `index.css`, evita zoom do iOS), sem rolagem horizontal, `viewport-fit=cover` e margens de área segura (`env(safe-area-inset-*)`). Checkbox/rádio: aumente a área do `<label>` (a auditoria mede pelo rótulo).
- Navegação: barra inferior fixa (`components/mobile/MobileNav.jsx`: Preços, Status, Alterações, Vouchers + "Mais" → Promoções, Cartões de Embarque, Pacotes; o botão "Mais" mostra a aba atual quando ela está no menu e tem `aria-label="Mais opções (aba atual: …)"`); some enquanto um campo de texto está focado. Menu do usuário: `MobileMenu.jsx` (privacidade, tema, Configurações, Trocar senha, Sair). No computador continua o cabeçalho com abas (`Tabs`, `hidden md:block`).
- Componentes reutilizáveis: `mobile/BottomSheet.jsx` (+ `SheetItem`, linhas de 52 px), `precos/FlightCard.jsx` e `status/StatusFlightCard.jsx` (um cartão por voo; a folha de ações fica **fora** do `<article>` para não herdar `opacity`), modais em tela cheia (cabeçalho/rodapé `sticky` no celular, `md:static`), `flight-changes/UploadZone.jsx` (botões **Tirar foto** — `<input capture="environment">` — e **Escolher arquivo**, só no celular; também em Promoções e Vouchers).
- **Botão Voltar do celular:** `hooks/useBackClose.js` (`useBackClose(open, onClose)`) empilha uma entrada de histórico por camada aberta (só < 768 px); o Voltar fecha só a camada do topo; fechar por X/Esc/fundo desfaz a entrada; tolera o remount duplo do StrictMode. Já usado em `BottomSheet`, modais de Status/Configurações/Trocar senha/Usuário/E-mail/Banco de fundos, edição de voo (Preços), e-mail de Vouchers/Pacotes e no caso aberto de **Alterações** (lista → caso em tela cheia com "← Voltar"). **Todo modal novo em tela cheia deve chamar `useBackClose`.**
- **Instalar como app (Etapa 4):** `frontend/public/manifest.webmanifest` (nome "Clube do Voo", `standalone`, `#00569e`), ícones em `frontend/public/icons/` gerados de `Logo.png` (192, 512, maskable 512, apple-touch 180) e meta tags no `index.html`. **Sem service worker e sem cache offline** (nenhum dado de cliente no aparelho). Só adicionar um service worker mínimo (sem cache) se o Android do Chrome não oferecer "Instalar app" — isso só se vê no aparelho.
- **Auditoria:** `frontend/scripts/mobile-audit.js` (cole no console/`javascript_tool` com a aba aberta; devolve rolagem horizontal, alvos < 36/44 px, texto < 11 px, campos < 16 px). Resultado final medido em 390 px: Preços, Status, Alterações (lista/caso/nova/e-mail), Vouchers, Promoções, Cartões, Pacotes, Usuários e Configurações com 0 rolagem lateral, 0 alvos < 36 px, 0 texto < 11 px, 0 campos < 16 px (Preços: 4 chips entre 40 e 44 px, intencional).
- **Não testado em aparelho real:** câmera ("Tirar foto"), teclado/viewport, área segura do iPhone, instalação (Android/iOS), botão Voltar físico, e o modo "Resultado" de Promoções. Pergunte à usuária como ficou no celular dela.
- **Armadilhas do painel do navegador embutido:** `focus()` e eventos de media query não disparam sem um quadro renderizado (use `dispatchEvent`/force um screenshot); medir com `offsetWidth` (animações congeladas distorcem `getBoundingClientRect`); campos com `transition-all` mostram altura de celular em 1280 px porque a transição não termina com o painel oculto — desligue as transições antes de medir o desktop.

## 5.2 Atualização de preços em fila (alterações da usuária em 14/10)

`docs/atualizacao-precos-em-fila.md`: botão **Atualizar todos** (aba Preços) → `POST /api/flights/check-all` (202; 409 se já houver execução) e `GET /api/flights/check-all/status` (total, concluídos, sucessos, falhas, ignorados). Fila em memória (`services/priceQueue.js`, concorrência 1) atende cron, atualização individual e em lote; reinício/deploy interrompe e não retoma. O scraper roda sem `--single-process` no Chromium. Alertas por e-mail/Telegram mantidos.

## 5.3 Erros da IA (Gemini) — lições de 2026-10-27

- Os créditos pré-pagos do Google AI Studio **acabaram** e a geração de promoções falhou ("Serviço de extração indisponível"). Correções já em produção: `services/geminiExtractor.js` repete 3× (0 s, 2 s, 5 s) em erros transitórios (503/429/timeout), registra a causa real no log (`[GEMINI-PROMO]`), devolve `publicMessage` (créditos esgotados/402, chave sem acesso, modelo inexistente, limite, alta demanda) e a rota `POST /api/promotions/extract` anexa "(Detalhe técnico: …)" (chave mascarada). `routes/vouchers.js` (2 handlers) e `routes/packages.js` devolvem **402** com "Créditos da IA esgotados. Recarregue o saldo no Google AI Studio…".
- Se algo parecido voltar: ler a mensagem/detalhe técnico antes de supor (um palpite meu de "modelo inválido" estava errado). Recarga/billing é no Google AI Studio (só a usuária). Configure **recarga automática ou alerta de saldo**.
- Custo: página oficial de preços do Gemini (ai.google.dev/gemini-api/docs/pricing). O modelo padrão `gemini-3.5-flash` **não aparecia** na tabela consultada em 26/10 (havia 3.5 Flash-Lite, 3.6/3.8 Flash, 2.5 Flash/Flash-Lite): confirme no AI Studio se ele continua recomendado. Trocar de modelo = só a variável `GEMINI_MODEL` no Coolify, **depois de comparar com prints reais** (nome de hotel, datas, voos de conexão). Trocar de provedor (ex.: Claude Haiku) exigiria novo código/SDK/chave — não vale pela economia (centavos por leitura).

---

## 6. Testes e verificação

- **Backend:** `cd backend && npx jest --runInBand` (usar `--runInBand`). **Resultado esperado hoje (2026-10-29): 742 passando em 61 suítes (100% passando — suíte completa verde)**. Qualquer falha é regressão e deve ser investigada. Um arquivo: `npx jest __tests__/<arquivo> --runInBand`.
- **Frontend:** `cd frontend && npm run build` (não há runner de teste nem lint). O aviso de chunk >500 kB já existe. Para telas: auditoria `frontend/scripts/mobile-audit.js` + navegador (seção 5.1).
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

### 9.1b Validações novas que só a usuária pode fazer (após o deploy da Etapa 4)
- [ ] No celular real: instalar na tela inicial (Android Chrome "Instalar app"; iPhone Safari "Adicionar à Tela de Início") e conferir ícone/tela cheia; "Tirar foto" (voucher, print de promoção, import de voucher); teclado nos formulários; botão Voltar físico; rodapé "Salvar" das Configurações. Se o Android não oferecer instalar → service worker mínimo sem cache.
- [ ] **Recarregar créditos do Gemini** (AI Studio) e testar de novo: gerar promoção, ler voucher. Ver seção 5.3.

### 9.2 Decisões em aberto (perguntar à usuária)
- [x] **Texto do e-mail de confirmação e da página do cliente:** ajustado de "RESERVA CONFIRMADA — Sua viagem está pronta" para "VOO REAJUSTADO — Seu voo foi reajustado; veja abaixo o voucher atualizado" para alterações de voo (variante implementada em `buildVoucherEmailHtml`, `itinerarioPage` e rota `/itinerario/:token`, 100% coberta por testes).
- [x] **Apagar a branch antiga `feat/banco-fundos-promo` do remote `fork`** (memória `project-fork-branch-cleanup`): executado `git push fork --delete feat/banco-fundos-promo` com confirmação da usuária em 2026-10-29.

### 9.2b Tarefas que a usuária pediu para **deixar para depois** (não fazer sem ela pedir)
- [x] Argumentos do Chromium em `backend/services/voucherRenderer.js` alinhados ao scraper e promoRenderer (`--disable-dev-shm-usage`, `--disable-gpu`, `headless: true`). Suíte 100% verde (747/747).
- [x] Texto "RESERVA CONFIRMADA — Sua viagem está pronta" → "VOO REAJUSTADO…" (concluído em 9.2).
- [x] Apagar a branch `feat/banco-fundos-promo` no remote `fork` (concluído em 9.2).
- [ ] Reduzir o `pagefile.sys` (27 GB) / decidir sobre a VM do app Claude (7,9 GB) no disco C: — assunto da máquina dela, ver memória `project_pagefile_reduzir`.
- [ ] Melhorias de UX mobile não feitas: modo "Resultado" de Promoções não foi auditado no celular; Banco de fundos/BackgroundPicker só passaram em build; auditar a página pública `/itinerario/:token` ao vivo (já tem CSS responsivo, breakpoint 560 px).

### 9.3 Dívida técnica conhecida
- [x] `auth.test.js` e `users.test.js`: 19 falhas pré-existentes resolvidas (alinhado `makeAuthApp` com `app.use('/api', csrfMiddleware)` e caminhos de exceção em `csrf.js`). Suíte 100% verde (736/736).
- [x] `POST /api/vouchers` migrado para `helpers/voucherStore.js` (duplicação de extração/gravação eliminada; tratamento 402/503/429 alinhado).
- [x] Vouchers da aba Vouchers geram e persistem PDF guardado via `voucherPdfStore.ensure` no envio de e-mail (`POST /:id/send-email`), exportação (`GET /:id/export?format=pdf`) e background em criação/edição. Suíte 100% verde (744/744).
- [ ] Comparação: passageiros **homônimos** contam como um; subconjunto de nome (nome do meio omitido) pode juntar pessoas diferentes (pai/filho sem sufixo) — documentado em `helpers/flightChangeDiff.js`.
- [x] Proteção na rotação de backups (`services/backup.js`): se a listagem de bancos falhar ou vier vazia, as pastas de fundos (`fundos-*`) são preservadas; tratamento com try/catch individual de `statSync` por arquivo. Suíte 100% verde (746/746).
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
- Histórico recente (mais novos → antigos): `25f99cf` app instalável · `a2505af/58a9131/a7a73a5` erros e retentativas do Gemini nas promoções · `28c2c95` botão Voltar (useBackClose) · `a4508c0…f978774` mobile etapa 3 (abas restantes) · `782c8d9…664594c` mobile etapa 2 (Status/Alterações) · `ce78a41…4ab17a9` mobile etapa 1 (navegação e Preços) · `13570db` lista de vouchers 500 + busca · `7e3dc1c` merge de voos robusto · `73c107a/cf898c1` voucher novo só com print de voos · `b5c779c/d6cc72c/09014fe` itinerário (QR de suporte clicável + PDF no link) · `163e935…19273b0` nomes/bagagem/link/preview do e-mail · `d3d9ced…1d25cc5` aba Alterações (frontend e backend) · `78be791/3a9c034` fotos no backup · `e75fa38` banco de fundos de promoções.
