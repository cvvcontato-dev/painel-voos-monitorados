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

## Desenvolvimento

```bash
# Backend (porta 3000, serve API + frontend buildado em prod)
cd backend && npm install && npm run dev

# Frontend (porta 5173, dev server com HMR)
cd frontend && npm install && npm run dev

# Testes do backend
cd backend && npm test
```
