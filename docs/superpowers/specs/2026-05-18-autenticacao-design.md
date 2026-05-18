# Design: Autenticação e Controle de Acesso

**Data:** 2026-05-18
**Repositório:** [cvvcontato-dev/painel-voos-monitorados](https://github.com/cvvcontato-dev/painel-voos-monitorados)

---

## 1. Contexto e objetivo

A app hoje é pública: qualquer pessoa com a URL acessa o painel completo. Este spec adiciona uma camada de autenticação em nível de aplicação para que **apenas usuários cadastrados** (você + colaboradora; expansível para mais) consigam acessar.

**Modelo escolhido:** login com formulário próprio na app (visual integrado, tema claro/escuro), sessão por cookie HTTP-only, senhas hashadas com bcrypt, usuários geridos via página "Usuários" dentro de Settings. Sem cadastro público. Admin (você) faz bootstrap inicial via env vars na primeira execução.

## 2. Decisões-chave

| Tema | Decisão | Justificativa |
|---|---|---|
| Local da auth | **App-level (Express + React)** | Visual integrado, logout, "lembrar de mim", futuro-proof. Cloudflare Access/Coolify Basic Auth descartados |
| Hash de senha | **bcrypt rounds=12** | Baseline atual; rounds=10 estava abaixo do recomendado |
| Sessão | **`express-session` + `connect-sqlite3`** no mesmo DB | Zero infra nova; persiste reinício do container |
| Cookie | `httpOnly`, `sameSite='strict'`, `secure` em prod, `name='cvv.sid'` | Endurecido; sem default `connect.sid` |
| Trust proxy | `app.set('trust proxy', 1)` quando `NODE_ENV=production` | Coolify roda atrás de Traefik |
| Sessão duradoura | **30 dias se "lembrar de mim"; sessão de browser caso contrário** | UX equilibrada |
| Gestão de usuários | **Tabela SQLite + UI admin em Settings** | Expansível sem redeploy |
| Bootstrap | Seed inicial via `ADMIN_EMAIL` + `ADMIN_PASSWORD` quando `users` está vazia | Idempotente; falha clara se vars ausentes |
| CSRF | **Double-submit cookie pattern** (token em cookie `csrf` + header `X-CSRF-Token`) | Defense-in-depth além de SameSite strict |
| Auditoria | Tabela `auth_audit_log` com `target_user_id` + `metadata_json` | Trilha forense completa |
| Invalidação de sessão | Destruir **todas** as sessões do user após troca de senha ou mudança de role | OWASP recomenda; força re-login com nova credencial |
| Mensagem de login | Sempre genérica ("Credenciais inválidas") | Não revela se email existe |
| Rate limit | `express-rate-limit` em `/api/auth/login` (5 tentativas / 15min / IP) | Mitigação de brute force básica |
| Reautenticação | Ações sensíveis pedem senha atual: trocar própria senha, criar/editar/remover usuário, mudar role | Reduz risco de session-hijack causar dano |
| Proteção do admin | Bloquear auto-delete e remoção do último admin restante | Anti-lockout |

## 3. Arquitetura

```
[Browser]
  │ 1. GET / → React app boota → GET /api/auth/me
  │ 2. 401 → renderiza <LoginPage>
  │ 3. POST /api/auth/login {email, password, remember} + cookie csrf? (não — login é público)
  ▼
[Express middleware chain]
  ├── app.set('trust proxy', 1) (prod)
  ├── cookieParser
  ├── express-session (cookie cvv.sid, sqlite store)
  ├── csrfMiddleware (gera/valida tokens)
  └── rate-limit em /api/auth/login (5/15min/IP)
  ▼
[Handler /api/auth/login]
  ├── bcrypt.compare(password, user.password_hash) ─── 12 rounds
  ├── req.session.regenerate() (anti session-fixation)
  ├── req.session.userId = user.id; req.session.role = user.role
  ├── req.session.cookie.maxAge = remember ? 30*24*3600*1000 : undefined
  ├── audit_log INSERT (login_success | login_fail)
  └── 200 { user: { id, nome, email, role } }
  ▼
[Subsequent requests carry cvv.sid cookie]
  ▼
[requireAuth middleware em /api/* (exceto /auth/login, /auth/logout)]
  └── if (!req.session.userId) → 401 { error: 'auth_required' }
  ▼
[requireAdmin middleware em /api/users/*]
  └── if (req.session.role !== 'admin') → 403
```

### Princípios

- **Sessão e auth são uma unidade isolada:** `routes/auth.js` + `middleware/requireAuth.js` + `middleware/requireAdmin.js` + `helpers/password.js` + `helpers/csrf.js` — qualquer mudança de política passa por esses arquivos.
- **Rotas existentes são minimamente afetadas:** ganham apenas o middleware `requireAuth` aplicado globalmente em `/api/*` (exceto auth endpoints). Nenhuma lógica de negócio muda.
- **Frontend é defensivo:** ao receber qualquer 401 (sessão expirou), interceptor global mostra `<SessionExpiredModal>` com botão único "Voltar ao login".

## 4. Modelo de dados

### 4.1 Tabela `users`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `email` | TEXT UNIQUE NOT NULL | login; lower-case |
| `nome` | TEXT NOT NULL | exibição |
| `password_hash` | TEXT NOT NULL | bcrypt 12 rounds |
| `role` | TEXT NOT NULL CHECK(role IN ('admin','user')) DEFAULT 'user' | |
| `criado_em` | TEXT NOT NULL | UTC ISO |
| `ultimo_login` | TEXT | UTC ISO |

**Seed inicial** (em `database.js` após migrations):
- Conta linhas em `users`.
- Se zero E `ADMIN_EMAIL`+`ADMIN_PASSWORD` estão definidos → cria admin com bcrypt-hash e loga `admin_seeded` no audit log.
- Se zero E vars ausentes → server **falha** com erro claro (`Cannot start: ADMIN_EMAIL and ADMIN_PASSWORD are required for the first run`).
- Se > 0 → ignora env vars (não sobrescreve).

### 4.2 Tabela `auth_audit_log`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK | |
| `timestamp` | TEXT NOT NULL | UTC ISO |
| `evento` | TEXT NOT NULL | `login_success`, `login_fail`, `logout`, `user_created`, `user_updated`, `user_deleted`, `password_changed`, `role_changed`, `admin_seeded`, `session_invalidated_after_password_change`, `session_invalidated_after_role_change` |
| `user_id` | INTEGER | ator (FK → users.id, ON DELETE SET NULL); null em login_fail quando email inexistente |
| `target_user_id` | INTEGER | alvo do evento administrativo (FK → users.id, ON DELETE SET NULL); igual a `user_id` quando o usuário age sobre si mesmo |
| `ip` | TEXT | extraído da request (respeitando `trust proxy`) |
| `user_agent` | TEXT | header `User-Agent` |
| `success` | INTEGER NOT NULL | 1 ou 0 |
| `metadata_json` | TEXT | JSON com contexto: `{email_tentado}` em login_fail; `{role_before, role_after}` em role_changed; `{deleted_user_email}` em user_deleted; etc. |

**Índice:** `CREATE INDEX idx_audit_user_time ON auth_audit_log(user_id, timestamp DESC)`.

### 4.3 Sessões — gerenciadas pelo `connect-sqlite3`

Tabela `sessions` criada automaticamente pelo middleware. Campos: `sid TEXT PK`, `sess TEXT`, `expired INTEGER`. Limpeza periódica via `cleanupInterval: 3600` (1×/hora).

Para **invalidar todas as sessões de um user** (após troca de senha ou role), executa `DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?`.

> **Nota de implementação:** o `connect-sqlite3` serializa o objeto da sessão em JSON na coluna `sess` (campo padrão é `session.userId`, já que setamos `req.session.userId` direto). Ao implementar a Fase 1, validar a serialização real com um teste — inspecionar uma row de `sessions` logo após o login e confirmar que `json_extract(sess, '$.userId')` retorna o id esperado. Se a versão instalada usar coluna ou campo diferente, ajustar a query nesse ponto.

## 5. Backend

### 5.1 Estrutura de arquivos

```
backend/
├── middleware/
│   ├── requireAuth.js          (novo)
│   ├── requireAdmin.js         (novo)
│   └── csrf.js                 (novo) double-submit cookie
├── routes/
│   ├── auth.js                 (novo) /api/auth/{login,logout,me,change-password}
│   └── users.js                (novo) /api/users CRUD (admin-only)
├── helpers/
│   ├── password.js             (novo) hash() e compare() via bcrypt
│   └── audit.js                (novo) log() — wrapper sobre INSERT em auth_audit_log
├── database.js                 (estender) + tabelas users/auth_audit_log + seed admin
├── server.js                   (estender) + session middleware, csrf, requireAuth em /api/*
└── package.json                + bcrypt, express-session, connect-sqlite3, express-rate-limit, cookie-parser
```

### 5.2 `middleware/csrf.js` — double-submit cookie

```js
// pseudocódigo
const crypto = require('crypto');

function csrfMiddleware(req, res, next) {
  // Garante que o cookie csrf existe (gera novo se não)
  let token = req.cookies.csrf;
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf', token, {
      httpOnly: false,           // FRONTEND precisa ler para enviar no header
      sameSite: 'strict',
      secure: NODE_ENV === 'production',
      maxAge: 30 * 24 * 3600 * 1000
    });
    req.cookies.csrf = token;    // disponibiliza pro handler
  }

  // Valida header em métodos mutáveis (exceto login que é a porta de entrada)
  if (['POST','PUT','DELETE'].includes(req.method) && req.path !== '/auth/login') {
    const headerToken = req.get('X-CSRF-Token');
    if (!headerToken || headerToken !== token) {
      return res.status(403).json({ error: 'csrf_invalid' });
    }
  }
  next();
}
```

Aplicado **em todas as rotas `/api/*`**. `/api/auth/login` é exempto (não há cookie csrf antes do primeiro request).

### 5.3 `routes/auth.js`

| Método | Rota | Auth | Body | Função |
|---|---|---|---|---|
| POST | `/api/auth/login` | público (rate-limited 5/15min/IP) | `{email, password, remember}` | 200 `{user}` + sessão; 401 mensagem genérica; 429 quando bloqueado por rate limit |
| POST | `/api/auth/logout` | **público (idempotente)** | — | destrói sessão atual se existir, limpa cookies, audit log apenas se havia sessão. Sempre responde 200 — facilita lidar com cookies stale no frontend sem race conditions |
| GET | `/api/auth/me` | autenticado | — | retorna `{id, email, nome, role}` |
| POST | `/api/auth/change-password` | autenticado | `{password_atual, password_nova}` | valida atual; hashea nova; **invalida todas sessões do user**; audit log; força re-login |

**Login flow detalhado:**
1. Trim+lowercase email; lookup `SELECT * FROM users WHERE email = ?`.
2. Se user não encontrado OU `!bcrypt.compare(password, hash)` → log `login_fail` + 401 mensagem genérica.
3. `req.session.regenerate(cb)` — **anti session-fixation**.
4. No callback: set `req.session.userId`, `req.session.role`, `req.session.cookie.maxAge` (30d se remember, undefined caso contrário).
5. `UPDATE users SET ultimo_login = nowUtc() WHERE id = ?`.
6. Log `login_success`.
7. Resposta `{user: {id, email, nome, role}}`.

**Logout flow:**
1. Capture `userId` antes de destruir.
2. `req.session.destroy()`.
3. `res.clearCookie('cvv.sid')`.
4. Log `logout`.
5. Resposta 200.

**Change-password flow:**
1. Valida `password_atual` via bcrypt.compare. Se falhar → log + 401 com mensagem **específica** `"senha atual incorreta"` (sem risco de enumeração — o usuário já está autenticado e só pode validar a senha dele mesmo).
2. Validar `password_nova` (mínimo 8 chars). Se inválida → 400 com mensagem específica.
3. Atualiza `password_hash` com bcrypt(12).
4. `DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?` — invalida todas.
5. Log `password_changed` + `session_invalidated_after_password_change`.
6. Resposta 200. Frontend redireciona para login.

### 5.4 `routes/users.js` (admin-only)

| Método | Rota | Body | Função |
|---|---|---|---|
| GET | `/api/users` | — | lista (sem `password_hash`) ordenado por nome |
| POST | `/api/users` | `{email, nome, password, role, confirm_password}` | cria; `confirm_password` = senha do **admin** que está criando (reautenticação) |
| PUT | `/api/users/:id` | `{nome?, role?, confirm_password?}` (ou no fluxo do próprio user: `{nome?, password_nova?, password_atual}`) | edita; mudança de `role` pede `confirm_password` do admin; mudança de senha do **próprio** usuário comum via change-password endpoint (acima); usuário comum **não** pode editar email/role de ninguém |
| DELETE | `/api/users/:id` | `{confirm_password}` | remove; bloqueia auto-delete (409 `cannot_delete_self`); bloqueia se for último admin (409 `cannot_delete_last_admin`); pede `confirm_password` do admin |

**Mudança de role** (admin promove/rebaixa outro):
1. Reautentica via `confirm_password`.
2. UPDATE.
3. **Invalida todas as sessões do target** — força re-login com novas permissões.
4. Log `role_changed` + `session_invalidated_after_role_change`.

### 5.5 `middleware/requireAuth.js` e `requireAdmin.js`

```js
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'auth_required' });
  next();
}

function requireAdmin(req, res, next) {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
  next();
}
```

### 5.6 Aplicação dos middlewares em `server.js`

Ordem (após dotenv/cors/express.json):
1. `cookieParser`
2. `express-session` configurado conforme §6
3. `csrfMiddleware`
4. Mount `/api/auth` (público — `requireAuth` aplicado seletivamente nas rotas que precisam)
5. **Global** `app.use('/api', requireAuth)` exceto `/api/auth/login` (que já está em /api/auth montado antes, mas o router de auth precisa estar configurado para permitir esses dois endpoints sem o middleware global)
6. Mount `/api/flights`, `/api/monitored-flights`, `/api/settings`, `/api/users` (todos atrás de requireAuth automaticamente)

> **Implementação:** `app.use('/api/auth', authRouter); app.use('/api', requireAuth); app.use('/api/flights', flightsRouter); ...` — o `requireAuth` global pega tudo MENOS o que foi montado antes dele.

### 5.7 Variáveis de ambiente novas

```bash
SESSION_SECRET=<random 64-char string>          # obrigatório; gerar com `openssl rand -hex 32`
ADMIN_EMAIL=joabh@example.com                   # só usado no primeiro boot
ADMIN_PASSWORD=<senha forte>                    # idem
```

## 6. `express-session` config exato

```js
session({
  store: new (require('connect-sqlite3')(session))({
    db: 'database.sqlite',
    dir: process.env.DB_PATH || __dirname,
    cleanupInterval: 3600
  }),
  name: 'cvv.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    // maxAge setado dinâmicamente no login conforme "remember"
  }
})
```

## 7. Frontend

### 7.1 Estrutura

```
frontend/src/
├── components/
│   ├── LoginPage.jsx              (novo) tela full-screen de login
│   ├── UsersTab.jsx               (novo) gerenciamento — só admin
│   ├── UserModal.jsx              (novo) cadastro/edição de usuário
│   ├── ChangePasswordModal.jsx    (novo) troca da própria senha
│   ├── SessionExpiredModal.jsx    (novo) modal de 401 global
│   └── UserMenu.jsx               (novo) dropdown no header (avatar + Trocar senha + Sair)
├── hooks/
│   ├── useAuth.js                 (novo) contexto global do usuário logado
│   └── useApi.js                  (novo) axios wrapper com interceptors (csrf header + 401 handler)
├── contexts/
│   └── AuthContext.jsx            (novo)
└── api/
    └── authClient.js              (novo) login(), logout(), me(), changePassword()
```

### 7.2 Boot flow

`App.jsx` envolve a árvore num `<AuthProvider>`. O provider:
1. Lê cookie `csrf` (já setado pelo backend no primeiro request) e expõe via context.
2. Chama `GET /api/auth/me` na montagem.
3. Se 200 → `currentUser` setado, app renderiza normalmente.
4. Se 401 → renderiza `<LoginPage>` em vez do app principal.

### 7.3 LoginPage

- Card central com logo, título, campos email + senha + checkbox "Lembrar de mim", botão "Entrar".
- Visual coeso com app (suporta tema claro/escuro via `<ThemeToggle>` no canto superior).
- **Mensagem de erro genérica:** "Credenciais inválidas" em toast vermelho — sem distinção entre email não existe e senha errada.
- Disable do botão durante request + spinner.
- 429 (rate limit): toast "Muitas tentativas. Tente novamente em alguns minutos."
- Após sucesso: reload da página (cookie `cvv.sid` já está setado; AuthProvider rebusca /me e renderiza app).

### 7.4 `useApi` hook (axios interceptor global)

```js
// pseudocode
const api = axios.create({ baseURL: '/' });

api.interceptors.request.use(cfg => {
  // Adiciona X-CSRF-Token em métodos mutáveis (exceto login)
  if (['post','put','delete'].includes(cfg.method) && !cfg.url.endsWith('/auth/login')) {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf='))?.split('=')[1];
    if (csrf) cfg.headers['X-CSRF-Token'] = csrf;
  }
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && currentPath !== '/login' && !isAuthEndpoint(err.config.url)) {
      sessionExpiredEventBus.emit();   // mostra <SessionExpiredModal>
    }
    return Promise.reject(err);
  }
);
```

Todos os outros componentes (`PrecosTab`, `StatusTab`, etc.) substituem `import axios` por `import { api } from '../hooks/useApi'` — uma linha por arquivo.

### 7.5 Header — `UserMenu`

Adicionado à direita do `ThemeToggle` e `Settings`:

```
[Logo + Título]              [☀/☾] [⚙] [JA ▼]
                                          └─ Joabh (admin)
                                          ├─ Trocar senha
                                          └─ Sair
```

- Avatar com iniciais (gerada a partir do nome).
- Dropdown ao clicar.
- "Trocar senha" abre `<ChangePasswordModal>`.
- "Sair" chama `POST /api/auth/logout` → reload → LoginPage.

### 7.6 `ChangePasswordModal`

- Três campos: **senha atual**, **nova senha** (mín 8 chars + indicador de força opcional), **confirmar nova senha**.
- Validação client-side (campos preenchidos + match) + server-side (bcrypt da atual).
- Submit envia `{password_atual, password_nova}`.
- Sucesso: toast "Senha alterada. Faça login novamente." → backend invalida sessões → frontend chama logout → redirect para LoginPage.

### 7.7 `UsersTab` (dentro do `SettingsModal`)

Visível apenas se `currentUser.role === 'admin'`. Backend reforça (403 caso contrário).

- Tab "Usuários" ao lado do tab existente "Geral" dentro do SettingsModal (refatoração mínima: tabs internas do modal).
- Tabela: Nome | Email | Role (badge) | Último login | Ações (editar, remover).
- Botão "+ Novo usuário".
- `<UserModal>`: campos nome, email, senha (só ao criar), role select.
- Ações sensíveis (criar, mudar role, remover) abrem confirmação extra pedindo **senha do próprio admin** (reautenticação).
- Botão remover: desabilitado no próprio user e no último admin (backend reforça com 409).

### 7.8 `SessionExpiredModal`

Modal full-screen exibido ao receber 401 fora da LoginPage:
- Título: "Sessão expirada"
- Texto: "Sua sessão expirou ou foi encerrada. Faça login novamente."
- Botão único: "Voltar ao login" → reload (que cai na LoginPage via AuthProvider).
- Sem botão de "cancelar" — a sessão é inválida, não há para onde continuar.

## 8. Roadmap incremental

1. **Fase 1 — Backend auth core**
   - Migrations das tabelas `users` e `auth_audit_log`.
   - `helpers/password.js` (bcrypt 12), `helpers/audit.js`.
   - Seed admin no boot quando `users` vazia.
   - `routes/auth.js`: login, logout, me, change-password.
   - `middleware/requireAuth.js`, `middleware/requireAdmin.js`, `middleware/csrf.js`.
   - `express-session` + `connect-sqlite3` + `express-rate-limit`.
   - Testes Jest/Supertest: login OK, login fail, login rate-limit, logout, regenerate sessão, me 401, me 200, change-password destrói todas sessões, CSRF aceita/rejeita.

2. **Fase 2 — Proteger rotas existentes**
   - As rotas `/api/flights/*` e `/api/settings/*` hoje estão definidas inline em `server.js` (não como routers separados). Antes de aplicar `requireAuth`, **extrair em routers** seguindo o padrão já usado em `routes/monitoredFlights.js`. Isso é refatoração necessária — não surpresa.
   - Aplica `requireAuth` global em `/api/*` (após mount de `/api/auth`).
   - Atualiza testes existentes para autenticar antes (helper `loginAs(role)` no `testApp.js` que faz login e retorna agent com cookie + helper `withCsrf()` que adiciona o header em requests mutáveis).
   - Verificação: 40 testes existentes + novos de auth, todos verdes.

3. **Fase 3 — Frontend login + sessão**
   - `AuthContext` + `AuthProvider` + `useAuth` hook.
   - `useApi` com interceptors (CSRF + 401).
   - `LoginPage`.
   - Substituir `import axios` por `import { api }` em todos os componentes.
   - `SessionExpiredModal`.
   - Verificação manual: bootar app sem sessão → LoginPage; logar → app aparece; expirar cookie manualmente → modal; reload → LoginPage.

4. **Fase 4 — Header user menu + troca de senha**
   - `UserMenu` no header.
   - `ChangePasswordModal`.
   - Logout via dropdown.

5. **Fase 5 — Gerenciamento de usuários**
   - `routes/users.js` (admin-only) + testes.
   - `UsersTab` dentro de `SettingsModal` (adiciona tabs internas).
   - `UserModal`.
   - Confirmação de senha para ações sensíveis.

6. **Fase 6 — Verificação end-to-end + deploy**
   - Testes completos verdes.
   - Smoke test em produção pós-deploy: configurar `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` no Coolify; redeploy; logar; criar colaboradora; logar como colaboradora; tentar acessar `/api/users` como user comum → 403.

## 9. Critérios de aceitação

1. Sem cookie de sessão válido, qualquer chamada a `/api/*` (exceto `/api/auth/login` e `/api/auth/logout`) retorna 401.
2. Login com credenciais válidas seta cookie `cvv.sid` e responde com `{user}`.
3. Login com credenciais inválidas retorna 401 com mensagem genérica — backend não revela se o email existe.
4. Após 5 tentativas falhadas em 15min do mesmo IP, novas tentativas retornam 429.
5. Logout destrói a sessão; chamada subsequente a `/api/auth/me` retorna 401.
6. Trocar a própria senha invalida **todas** as sessões daquele usuário; cookies antigos viram inválidos.
7. Admin pode criar usuário; reautenticação com senha do admin é exigida e validada.
8. Admin não consegue se auto-deletar; nem deletar o último admin.
9. Mudança de role invalida todas as sessões do alvo.
10. Cookie `cvv.sid` é `httpOnly`, `sameSite=strict`, `secure` em produção.
11. Requests `POST/PUT/DELETE` sem header `X-CSRF-Token` correto retornam 403.
12. Login com "Lembrar de mim" persiste 30 dias; sem o checkbox, sessão expira ao fechar o navegador.
13. Frontend mostra `SessionExpiredModal` quando recebe 401 em qualquer rota autenticada (fora da LoginPage).
14. Audit log registra todos os eventos listados em §4.2 com `user_id`, `target_user_id`, `ip`, `user_agent`, `metadata_json`.
15. Bootstrap inicial: server falha com mensagem clara se `users` está vazia e `ADMIN_EMAIL`/`ADMIN_PASSWORD` ausentes.
16. Backend tests passam (existentes + novos de auth).

## 10. Fora de escopo (YAGNI)

- ❌ 2FA / TOTP — overkill para 2 usuários internos sem dados financeiros
- ❌ Reset de senha via email — admin reseta via UsersTab
- ❌ OAuth/SSO (Google, Microsoft) — Cloudflare Access seria a opção caso queira no futuro
- ❌ "Esqueci minha senha" público — sem self-service
- ❌ Histórico de sessões ativas por usuário (UI "ver outras sessões logadas")
- ❌ Lockout temporário **por conta** — só rate limit por IP nesta versão
- ❌ Captcha no login

## 11. Evoluções futuras (não bloqueantes)

- **Lockout por conta + rate limit por email:** se a operação passar a acessar de redes compartilhadas, VPN corporativa ou IPs rotativos, rate limit por IP perde eficácia. Adicionar lockout (ex.: 10 falhas em 1h trava a conta por 30min) com unlock por admin via UI.
- **TOTP/2FA:** se o app passar a expor dados muito sensíveis ou crescer para 5+ usuários, considerar TOTP via app autenticador.
- **Cloudflare Access:** caminho enterprise se decidir colocar o domínio atrás do Cloudflare — substitui (ou complementa) a auth de app.
- **Recovery codes:** ao introduzir 2FA, gerar códigos de recuperação salvos hashados.
- **Histórico de auditoria com UI:** página "Atividade" para admin ver últimos logins, mudanças de senha, etc., em vez de só ler o DB.
