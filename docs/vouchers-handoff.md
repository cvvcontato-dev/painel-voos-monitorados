# Handoff — Aba "Vouchers" (Clube do Voo Viagens)

> Documento de transferência para continuar o trabalho em outra sessão sem perda de contexto.
> Última atualização: 2026-06-01.

---

## 0. TL;DR

Foi construída, do zero, uma **aba "Vouchers"** no painel existente (`painel-voos-monitorados`). Ela:
1. Recebe voucher de voo (PDF/imagem) → extrai dados via **Gemini** → normaliza pra schema canônico.
2. Renderiza um voucher personalizado da agência em **2 modelos** (Institucional / Compacto) → exporta **PDF/PNG** via Playwright.
3. Envia por **e-mail** ao cliente (PDF anexo + corpo HTML rico) com CCO pra agência.
4. Publica uma **página web hospedada** (`/itinerario/:token`) com design premium, linkada no e-mail.
5. Suporta **merge de 2 vouchers** (ida + volta comprados separados) num único voucher.

Stack: **Express + SQLite + Playwright + Gemini** (backend) · **React 19 + Vite + Tailwind v4** (frontend). Tudo JS puro (não TS no backend; JSX no frontend).

---

## 1. ⚠️ ESTADO GIT & DEPLOY — LER PRIMEIRO

**Verificado via `git ls-remote origin` (fonte da verdade, sem cache):**

| Branch remota | Commit | Contém a feature de vouchers? |
|---|---|---|
| `feat/vouchers-aba-mvp` | `0033655` | ✅ **SIM — tudo, é a branch confiável** |
| `main` | `c00dadd` | ❓ **Aparece SEM a feature** (é o commit pré-projeto) |

**Discrepância:** Durante a sessão fiz vários `merge feat → main` + `git push origin main` que reportaram sucesso (`ef46cc7..1e639a8`, `..a9bc158`, `..90957dc`, `..651eb45`). Mas o `ls-remote` final mostra `main = c00dadd`. O sandbox teve comportamento instável de git (pushes em background com saída vazia, fetch em cache). **Não confie na minha narrativa de que main está atualizado — verifique.**

**AÇÃO OBRIGATÓRIA antes de deployar:**
1. Abra `https://github.com/cvvcontato-dev/painel-voos-monitorados/branches` e confira o HEAD real de `main` e `feat/vouchers-aba-mvp`.
2. A branch `feat/vouchers-aba-mvp @ 0033655` tem TUDO. Se `main` não tiver, faça o merge de `feat` → `main` (via PR na interface do GitHub é o mais seguro) **ou** aponte o Coolify pra `feat/vouchers-aba-mvp`.
3. O Coolify (deploy) está configurado, segundo o usuário, na branch **`main`**. Repo: `cvvcontato-dev/painel-voos-monitorados`. Deploy = "Redeploy" no painel Coolify.

**Worktree local:** `E:\AG\Painel de voos monitorados\vouchers-aba-mvp-worktree` (branch `feat/vouchers-aba-mvp`). O checkout principal fica em `E:\AG\Painel de voos monitorados\Painel de voos monitorados` (branch `main`). Todos os commits da feature foram feitos no worktree.

---

## 2. O QUE A FEATURE FAZ (visão do usuário)

Fluxo operacional (agência = dono da Clube do Voo):
1. Aba **Vouchers** → escolhe modo: **"Voucher único"** ou **"Ida + volta separados"** (merge).
2. Faz upload do(s) voucher(s) original(is) da cia (Azul/Gol/Latam).
3. Gemini extrai; operador revisa/edita os campos num editor lado a lado com preview ao vivo (iframe).
4. Escolhe o **modelo** (Institucional ou Compacto) via dropdown.
5. **Exporta PDF/PNG** ou **Envia por e-mail** (modal: destinatários por vírgula + mensagem personalizada opcional).
6. Cliente recebe e-mail com PDF anexo + botão/QR "Gerenciar reserva" (deep-link pra página de check-in da cia) + link "Ver itinerário completo" (página hospedada).

**Compliance (LGPD / uso indevido):** o destinatário é cliente final. Por isso: disclaimer no rodapé (foi removido do PDF a pedido, mas há no e-mail), auto-delete do arquivo original após 30 dias (`voucherRetention`), audit log de tudo (`voucher_audit_log`).

---

## 3. ARQUITETURA — MAPA DE ARQUIVOS

### Backend (`backend/`)
| Arquivo | Responsabilidade |
|---|---|
| `database.js` | Migrations: tabelas `vouchers`, `voucher_audit_log`, `voucher_settings` + índices. Migração idempotente do CHECK de `action` (inclui `email_sent`/`email_failed`). |
| `routes/vouchers.js` | CRUD `/api/vouchers`, `POST /merge` (2 arquivos), `GET /:id/export?format=pdf\|png`, `POST /:id/send-email`, `GET/PUT /settings`. Protegido por `requireAuth` global. |
| `routes/itinerario.js` | **Público** `GET /itinerario/:token` (sem login, token HMAC). Montado ANTES do `requireAuth`. |
| `services/voucherExtractor.js` | Gemini multimodal (PDF/imagem → JSON). Detecta cia (AD=Azul, G3=Gol, LA=Latam). Retry backoff em 503/429. STUB quando sem `GEMINI_API_KEY`. Modelo via `GEMINI_MODEL` (default `gemini-3.5-flash`). |
| `services/voucherNormalizer.js` | Normaliza enums, datetime ISO, `meta` defaults. |
| `services/voucherSchema.js` | `validate()` + enums. CARRIERS inclui `'multi'`. Campos opcionais: `secondaryLocator`, `secondaryCarrier`, `primaryCarrier`, `trips[].locator`. |
| `services/voucherMerger.js` | `mergeVouchers(outbound, ret)` → 1 voucher. Ida='ida', volta='volta', preserva locators/cias por trecho. carrier='multi' se cias diferem. |
| `services/voucherRenderer.js` | Playwright → PDF/PNG. Usa Chromium do sistema (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) + `--no-sandbox`. `colorScheme:'light'`, força fundo branco. Autentica via cookie de sessão. |
| `services/voucherRetention.js` | Cron 03:30 diário: deleta arquivo original >30 dias, mantém JSON. `VOUCHER_RETENTION_DAYS`. |
| `services/notifier.js` | **Compartilhado com alertas de voo.** `sendVoucherEmail` + `buildVoucherEmailHtml` (async, gera QR). Logo via **CID** (anexo inline, não URL externa). Assunto fixo "Eba! Sua viagem está confirmada". |
| `helpers/voucherCarrier.js` | IATA→cidade, `manageBookingUrl(cia, loc, sobrenome, origem)` (deep-links Azul/Gol/Latam), `normalizeFlightNumber` (GLO→G3), `carrierShortName`, **`parseFullName`/`firstNameOf`/`lastNameOf`** (trata "SOBRENOME, NOME"). |
| `helpers/itinerarioPage.js` | Renderer HTML da página hospedada (design "card-soft", CSS moderno, QR SVG, responsivo). |
| `helpers/voucherToken.js` | HMAC sign/verify de token (90 dias). Secret: `VOUCHER_TOKEN_SECRET` (fallback `SESSION_SECRET`). |
| `helpers/voucherWorkspace.js` | Paths `voucher-uploads/` e `voucher-exports/` sob `DB_PATH`. |
| `static/agency-logo.png` | Logo da agência (usada no PDF, e-mail via CID, página). |
| `static/carrier-logos/{azul,gol,latam}.png` | Logos das cias no header do voucher. |

### Frontend (`frontend/src/`)
| Arquivo | Responsabilidade |
|---|---|
| `components/VouchersTab.jsx` | Aba principal: upload (único/merge), lista, editor (react-hook-form), preview iframe, botões export/e-mail/excluir, modal de e-mail, seção "Configurações da agência". |
| `components/VoucherPreviewPage.jsx` | Página standalone `/voucher-preview/:id` (consumida pelo Playwright e pelo iframe). Dispatch por `templateStyle`. |
| `components/voucher-templates/_shared.jsx` | THEMES por cia, `detectCarrierKey`, `CarrierLogo` (com modo dual multi-cia), ícones SVG, `fmtTime`/`dateLabelWithDow` (**timezone fixo America/Sao_Paulo**), `BAGGAGE_RULES`, `buildBaggageBlocks`, `manageBookingUrl`, `firstPassengerLastName` (trata vírgula), `normalizeFlightNumber`. |
| `components/voucher-templates/VoucherCanonicalV1.jsx` | Modelo **Institucional** (header escuro por cia, grid passageiros, itinerário, bagagens, QR "Gerenciar reserva"). |
| `components/voucher-templates/VoucherCompactoV1.jsx` | Modelo **Compacto** (estilo GOL, cores fixas da agência, logo grande, cards). |
| `components/voucher-templates/_airports.js` | IATA→cidade (frontend). |
| `api/voucherClient.js` | `list/get/upload/uploadMerge/update/remove/exportUrl/sendEmail/getSettings/updateSettings`. |

### Rotas Express montadas em `server.js` (ordem importa)
```
/itinerario            → público (antes do auth)
/api  csrf + requireAuth
/api/vouchers          → CRUD protegido
app.get('/{*splat}')   → SPA catch-all (por ÚLTIMO); serve frontend/dist de backend/public
```

---

## 4. SCHEMA CANÔNICO (unified voucher)

```
{
  carrier: 'azul'|'gol'|'latam'|'multi',
  layoutVersion: 'azul.confirmacao.v1',   // id interno fixo
  templateStyle: 'institucional'|'compacto',  // qual modelo renderizar
  reservation: {
    locator, status, summaryText?,
    secondaryLocator?, secondaryCarrier?, primaryCarrier?  // só em merge multi-cia
  },
  route: { origin, destination },          // IATA
  passengers: [{ order, name, type, documento?, loyaltyNumber? }],
  trips: [{
    direction: 'ida'|'volta'|'multi', dateLabel,
    departure: { airport, airportName?, datetime },   // datetime ISO -03:00
    arrival:   { airport, airportName?, datetime },
    flightNumber, durationText, cabinClass?, airlineDisplayName?, status?,
    locator?                               // por-trecho (merge)
  }],
  baggage: [{ direction, label, weightText?, quantity }],
  branding: { airlineName, logoUrl?, primaryColor? },
  meta: { sourceFileHash, parsedAt, parserVersion, confidence, merged? }
}
```

Persistência: 1 linha em `vouchers` com `unified_json` (TEXT). `source_file_path` guarda 1 caminho (ou 2 separados por `|` em merge).

---

## 5. VARIÁVEIS DE AMBIENTE (Coolify)

Reaproveita as do painel + novas:
| Var | Uso |
|---|---|
| `GEMINI_API_KEY` | Extração. **Usuário ativou billing no Google AI Studio** pra resolver 503 de alta demanda. |
| `GEMINI_MODEL` | Opcional. Default `gemini-3.5-flash`. Alternativas estáveis: `gemini-2.5-flash`, `gemini-2.0-flash`. |
| `PUBLIC_BASE_URL` | URL pública HTTPS (ex: `https://monitoramento.clubedovooviagens.com.br`) — sem barra final. Usada pelo Playwright e pelos links do e-mail/itinerário. |
| `VOUCHER_TOKEN_SECRET` | HMAC da página hospedada (fallback `SESSION_SECRET`). |
| `VOUCHER_RETENTION_DAYS` | Default 30. |
| `EMAIL_HOST/PORT/USER/PASS/FROM` | SMTP. **Usa Hostinger:** host `smtp.hostinger.com`, port `465`, user = e-mail completo `@clubedovooviagens.com.br`, pass = senha da caixa (não do hPanel). |
| `DB_PATH` | `/data` em prod (Docker). Uploads/exports/logos ficam sob ele. |

Docker: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` + `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` já no Dockerfile.

---

## 6. DECISÕES & GOTCHAS (lições que custaram caro)

1. **Timezone**: preview roda no browser (BR), export PDF roda em Playwright headless **UTC** → horários +3h e dia da semana errado. **SEMPRE** formatar com `timeZone: 'America/Sao_Paulo'`. Já corrigido em `_shared.jsx` e `VoucherCompactoV1.jsx`. Se adicionar novo formatador de data/hora, use o fuso fixo.
2. **Nome invertido**: alguns vouchers (Latam) vêm "SOBRENOME, NOME". `parseFullName` detecta vírgula. Usado no backend (`voucherCarrier.js`) E frontend (`_shared.jsx#firstPassengerLastName`). Sobrenome = última palavra antes da vírgula.
3. **Logo no e-mail**: URL externa (`PUBLIC_BASE_URL/...`) é bloqueada por clientes. Solução: **CID** (anexo inline). Não voltar pra URL.
4. **QR no e-mail**: deve ser **PNG data-URL** (não SVG inline — clientes bloqueiam) e **envolto em `<a>`** pra ser clicável. Aponta pro `bookingUrl` (check-in), NÃO pro itinerário.
5. **E-mail HTML rico não cabe**: Gmail corta >102KB e ignora CSS moderno. Por isso a **página hospedada** (`/itinerario/:token`) existe: e-mail curto + link. Não tentar embutir o design 5MB do Canva/Design-Canvas no e-mail.
6. **Prefixo de voo**: Gemini às vezes retorna ICAO (GLO/AZU/TAM). `normalizeFlightNumber` converte pra IATA (G3/AD/LA).
7. **Playwright em Docker**: precisa Chromium do sistema + `--no-sandbox`. Sem isso, export dá 500 "Executable doesn't exist".
8. **Gemini 503**: modelo novo tem alta demanda. Retry backoff (0s/2s/5s) + billing ativo resolvem. Erro propaga como 503 amigável pro frontend.
9. **Playwright auth (Plano A vs B)**: exportação autentica passando o cookie de sessão do request. Funcionou atrás do Coolify (Plano A). Plano B (token HMAC) documentado no plano original, não foi necessário.
10. **Compacto usa cores fixas da agência** (`#3871c1`/`#00569e`), só a logo muda por cia — decisão do usuário. Institucional usa cores da cia.

---

## 7. COMO RODAR / TESTAR LOCALMENTE

```bash
# no worktree
cd "E:\AG\Painel de voos monitorados\vouchers-aba-mvp-worktree"

# testes backend (26 testes voucher)
cd backend && npx jest voucherSchema voucherNormalizer voucherExtractor routes-vouchers voucherRetention voucherMerger --silent

# build frontend
cd frontend && npx vite build

# preview de um template (gera HTML pra abrir no browser)
cd backend && EMAIL_USER=x EMAIL_PASS=x PUBLIC_BASE_URL=https://example.com node -e "..."  # ver exemplos no histórico
```
Sem `GEMINI_API_KEY`, o extractor usa STUB (dados fake) — útil pra dev/testes. Pré-existentes de `auth.test.js`/`users.test.js` falham na baseline (não são regressão).

---

## 8. WORKFLOW USADO (pra manter qualidade)

- **Worktree isolado** + branch `feat/vouchers-aba-mvp`.
- Trabalho pesado feito via **subagents** (`general-purpose`) com instruções precisas; edições pontuais feitas direto.
- Padrão de commit: mensagens `feat(vouchers):` / `fix(vouchers):` com **Co-Authored-By: Claude Code**.
- Deploy: push → **usuário faz "Redeploy" no Coolify** (não automático).
- Plano original completo em `docs/superpowers/plans/2026-05-28-vouchers-aba-mvp.md`.

**Memória do projeto** (`~/.claude/.../memory/MEMORY.md`): usuário é dono da Clube do Voo, pensa como arquiteto/PO, pt-BR; regra de **stack consistency** (não introduzir 2º backend/linguagem — reaproveitar Express/SQLite/Playwright/Gemini). Data de referência do projeto foi 2026-05.

---

## 9. HISTÓRICO DE COMMITS (branch feat, mais recentes → antigos)

```
0033655 fix: label do QR sem overflow (2 linhas centralizadas)
0557ec3 fix: logo rodapé maior, label QR alinhado, remove disclaimer do rodapé
6ca5324 fix: logo via CID no e-mail (zero URL externa)
d024a5f feat: logos das 2 cias lado a lado (multi-cia)
99d4fb5 fix: timezone America/Sao_Paulo (PDF não mais +3h)
acf6535 feat: merge de 2 vouchers (ida+volta separados)
da2fdce fix: QR e-mail clicável + aponta pro check-in; nome com vírgula
44499cd fix: nome "SOBRENOME, NOME" (parseFullName)
...  (envio e-mail, página hospedada, redesigns, regras de bagagem, etc.)
```
São ~30 commits no total. `git log --oneline` na branch pra lista completa.

---

## 10. ITENS EM ABERTO / PRÓXIMOS PASSOS

- [ ] **CRÍTICO:** reconciliar `main` vs `feat/vouchers-aba-mvp` (ver §1) e confirmar o que está deployado.
- [ ] Considerar mover URLs de redes sociais (hoje hardcoded em `notifier.js`: IG `instagram.com/clubedovooviagens`, email `contato@`, WhatsApp `wa.me/5575992020012`) pra `voucher_settings` editável na UI.
- [ ] Logo da **Azul** tem fundo azul sólido (não transparente) — fica quadrado escuro. Ideal subir PNG transparente em `backend/static/carrier-logos/azul.png`.
- [ ] Merge no **Compacto** só mostra localizador dual, sem CTA dupla (limitação assumida — só tem botão decorativo).
- [ ] Passageiros no merge: assume os mesmos da ida (decisão do usuário).
- [ ] Disclaimer ainda aparece no **e-mail** (foi removido só do PDF). Confirmar se quer remover do e-mail também.
- [ ] Deep-links das cias são best-effort e podem quebrar quando as cias mudarem os sites — revisar `manageBookingUrl` se pararem de funcionar. Latam usa `orderId` que pode diferir do PNR de 6 letras.
- [ ] Limpar branch/worktree após reconciliar main.
