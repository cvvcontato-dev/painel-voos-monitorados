# Painel de Voos Monitorados

Aplicação web para monitorar passagens aéreas: rastreamento de preços (via scraping do Google Voos) e status de voos (via AeroDataBox/RapidAPI).

Stack: Node.js + Express + SQLite (backend), React + Vite + Tailwind (frontend), Playwright (scraping), node-cron (agendamento), nodemailer + Telegram Bot API (notificações). Deploy via Docker no Coolify (Hostinger VPS).

## Aba Status de Voos

Monitora cancelamentos, atrasos (≥15min configurável) e reagendamentos via AeroDataBox (RapidAPI). Funciona em paralelo à aba Preços, com tabelas e scheduler independentes.

### Obtendo uma chave da API

1. Crie conta em https://rapidapi.com.
2. Assine **AeroDataBox** (free tier para testes; plano BASIC ~$10/mês para produção).
3. Copie a chave em "X-RapidAPI-Key" e cole em `RAPIDAPI_KEY` no `.env`.
4. Defina `AVIATION_API_MODE=real`.

### Configurações

| Variável | Default | Descrição |
|---|---|---|
| `AVIATION_API_MODE` | `stub` | `stub` retorna dados fakes (dev). `real` chama a API. |
| `DELAY_THRESHOLD_MIN` | `15` | Minutos mínimos de atraso para gerar alerta. |
| `STATUS_MONITOR_BATCH_SIZE` | `10` | Voos processados por ciclo do scheduler (a cada 5min). |

### Polling

A cadência por voo é configurável na UI (15min, 30min, 1h, …, 1×/dia). O scheduler roda a cada 5min e processa apenas voos cujo `proxima_verificacao` já venceu. Voos com status `landed` há mais de 2h são automaticamente pausados.

### Eventos notificáveis

| Evento | Template | Canais |
|---|---|---|
| Cancelamento | Vermelho | email + Telegram |
| Atraso ≥ threshold | Âmbar | email + Telegram |
| Reagendamento | Âmbar | email + Telegram |
| Mudança de portão/terminal | — | só registrado no histórico |

Anti-spam: alertas idênticos consecutivos não são reenviados.

## Autenticação

O painel usa autenticação por sessão (cookie httpOnly). Na primeira inicialização com a tabela `users` vazia, o servidor cria automaticamente um usuário admin usando as variáveis `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Após o login, o admin pode criar outros usuários pela aba **Configurações → Usuários**.

### Papéis

| Papel | Acesso |
|---|---|
| `admin` | Acesso total — pode criar, editar e excluir usuários, além de alterar configurações do sistema |
| `user` | Acesso ao painel de monitoramento — não vê a aba Usuários |

### Troca de senha

Cada usuário pode trocar sua própria senha via menu de usuário (canto superior direito). Todas as sessões ativas do usuário são invalidadas automaticamente após a troca.

---

## Deploy no Coolify

### Variáveis de ambiente obrigatórias

Configure estas variáveis no painel do Coolify antes do primeiro deploy:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SESSION_SECRET` | **Sim** | Segredo criptográfico das sessões. Gere com `openssl rand -hex 32` e nunca reutilize. |
| `ADMIN_EMAIL` | **Sim (1ª vez)** | E-mail do administrador inicial. Usado apenas quando a tabela `users` está vazia. |
| `ADMIN_PASSWORD` | **Sim (1ª vez)** | Senha do administrador inicial (mínimo 8 caracteres). |
| `CORS_ORIGIN` | Recomendada | URL pública do frontend (ex.: `https://voos.suaempresa.com`). Padrão: `http://localhost:5173`. |

### Variáveis de ambiente opcionais

| Variável | Default | Descrição |
|---|---|---|
| `DB_PATH` | `/data` | Caminho onde os arquivos SQLite são armazenados (persistido via volume no Docker). |
| `PORT` | `3000` | Porta em que o servidor escuta. |
| `NODE_ENV` | `production` | Definido automaticamente no Dockerfile. Não altere. |
| `AVIATION_API_MODE` | `stub` | `real` para usar a API AeroDataBox, `stub` para dados fakes. |
| `RAPIDAPI_KEY` | — | Chave da RapidAPI (obrigatória se `AVIATION_API_MODE=real`). |
| `DELAY_THRESHOLD_MIN` | `15` | Minutos mínimos de atraso para gerar alerta. |
| `STATUS_MONITOR_BATCH_SIZE` | `10` | Voos processados por ciclo do scheduler de status. |

### Passo a passo

1. **Gere o `SESSION_SECRET`** em qualquer terminal:
   ```bash
   openssl rand -hex 32
   ```

2. **Configure as variáveis** no painel do Coolify (aba *Environment Variables* do serviço):
   ```
   SESSION_SECRET=<valor gerado acima>
   ADMIN_EMAIL=seu@email.com
   ADMIN_PASSWORD=<senha-forte>
   CORS_ORIGIN=https://voos.suaempresa.com
   ```

3. **Faça o deploy** (ou redeploy). Acompanhe os logs e confirme a linha:
   ```
   [AUTH] Admin account seeded for seu@email.com
   ```
   > Esta mensagem aparece apenas uma vez — na primeira inicialização com base de dados vazia.

4. **Acesse a URL pública** — você verá a tela de login.

5. **Faça login** com `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

6. **Troque a senha** imediatamente pelo menu de usuário (canto superior direito) → *Trocar senha*.

7. **Crie outros usuários** em Configurações → Usuários, se necessário.

### Smoke test pós-deploy

- [ ] Tela de login carrega corretamente
- [ ] Login com credenciais corretas redireciona para o painel
- [ ] Login com credenciais erradas exibe mensagem de erro
- [ ] Admin vê a aba **Usuários** em Configurações; usuário comum não vê
- [ ] Criar um usuário `user` e logar com ele — confirmar acesso restrito
- [ ] Trocar senha — confirmar que a sessão anterior é invalidada
- [ ] Fechar a aba e reabrir — sessão deve ser mantida (cookie persistente)

---

## Desenvolvimento

```bash
# Backend (porta 3000, serve API + frontend buildado em prod)
cd backend && npm install && npm run dev

# Frontend (porta 5173, dev server com HMR)
cd frontend && npm install && npm run dev

# Testes do backend
cd backend && npm test
```
