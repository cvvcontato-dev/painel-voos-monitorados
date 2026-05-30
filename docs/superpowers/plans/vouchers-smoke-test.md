# Vouchers MVP — Smoke test (manual)

## Pré-requisitos
- `GEMINI_API_KEY` setado no .env (sem ela o app retorna STUB hardcoded)
- Backend rodando: `cd backend && npm run dev`
- Frontend rodando: `cd frontend && npm run dev`
- Login válido na aplicação

## Checklist
- [ ] Upload PDF Azul real → JSON canônico aparece coerente no editor
- [ ] Editar localizador → Salvar → preview ao vivo atualiza
- [ ] Exportar PDF → ABRIR PDF e CONFIRMAR:
  - [ ] Conteúdo do voucher visível (passageiros, trechos, bagagens)
  - [ ] Marca d'água diagonal "REEMISSÃO — CÓPIA NÃO-OFICIAL" visível
  - [ ] Disclaimer "Documento gerado pela Clube do Voo..." no rodapé
- [ ] Exportar PNG → mesmas verificações
- [ ] Excluir voucher → some da lista
- [ ] Verificar `voucher_audit_log` no SQLite: deve ter `create`, `update`, `export`, `delete`

## Em produção (Coolify)
- [ ] Repetir os 4 itens de export acima no ambiente real
- [ ] Se PDF/PNG sair em branco ou em página de login → cookie Plan A falhou
  - Ação: ativar Plano B (HMAC token assinado na querystring) antes de subir
  - Ver decisão arquitetural em `docs/superpowers/plans/2026-05-28-vouchers-aba-mvp.md`

## Gatilho do Plano B
Se Plano A falhar:
1. Em `voucherRenderer.js`, substituir o bloco `if (cookieHeader)` por geração de token HMAC com `crypto.createHmac('sha256', SECRET).update(`${voucherId}:${expiresAt}`).digest('hex')`, anexar na URL como `?previewToken=...&exp=...`
2. Em `App.jsx` (ou em uma rota Express server-side específica), aceitar `previewToken` válido em vez de exigir sessão para `/voucher-preview/:id`
3. Token expira em 60s
4. `PREVIEW_TOKEN_SECRET` env var obrigatória
