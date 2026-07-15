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

## Multidestinos (modo Multi-arquivo)
> Feature: combinar 2 a 8 vouchers rotulados (1 ida + N internos + volta opcional).
> Spec: `docs/superpowers/specs/2026-07-15-vouchers-multidestinos-design.md`.

### Caso A — ida + 1 interno + volta (3 arquivos, cias distintas)
- [ ] Aba Vouchers → selecionar modo **"Multi-arquivo (ida + internos + volta)"**
- [ ] Linha 1 já vem travada em **Ida** (sem botão remover). Anexar o voucher de ida.
- [ ] Clicar **"+ Adicionar voucher"** → nova linha tipo **Interno**. Anexar o voucher interno.
- [ ] Clicar **"+ Adicionar voucher"** → mudar tipo para **Volta**. Anexar o voucher de volta.
- [ ] Verificar que ao já existir 1 **Volta**, a opção "Volta" fica **desabilitada** nas outras linhas.
- [ ] Resumo textual mostra "3 arquivos · 1 interno(s) · volta: sim".
- [ ] Clicar **"Combinar e gerar voucher"** → 201, voucher aparece selecionado.
- [ ] **Preview (iframe)** — CONFIRMAR:
  - [ ] Itinerário em **3 seções**: IDA / DESTINOS INTERNOS / VOLTA, cada uma com seu localizador.
  - [ ] Header lista **N localizadores** (Ida: … · Interno: … · Volta: …).
  - [ ] Rodapé (Institucional) / seção "Suas reservas" (Compacto) com **um QR por reserva**, rotulados.
- [ ] Alternar modelo **Institucional ↔ Compacto** → ambos mostram as 3 seções + N QRs.
- [ ] **Exportar PDF** → abrir e conferir: 3 seções, N QRs escaneáveis, timezone BR correto (sem +3h).
- [ ] **Enviar e-mail de teste** → conferir no cliente: bloco "Suas reservas" com N QRs clicáveis apontando pro check-in de cada cia.
- [ ] Abrir **página hospedada** (link "Ver itinerário completo") → 3 seções + N QRs + N CTAs de check-in.

### Caso B — open-jaw (ida + 1 interno, SEM volta)
- [ ] Multi-arquivo com 2 linhas: Ida + Interno (sem volta).
- [ ] Combinar → preview mostra IDA + DESTINOS INTERNOS (sem seção VOLTA).
- [ ] `route.destination` = destino do último interno (não volta pra origem).

### Caso C — dedupe de reserva (round-trip mesmo PNR)
- [ ] Voucher **único** ida+volta (1 arquivo, mesmo localizador) → preview mostra **1 QR** "Gerenciar reserva" (não 2), botão "Fazer Check-in" único. (Garante que a dedupe por cia+PNR não regrediu o caso comum.)

### Validações (erros esperados 400)
- [ ] Multi sem ida (só interno+volta) → toast "Envie exatamente 1 voucher de ida".
- [ ] Multi com 1 arquivo só → botão desabilitado (não envia).
- [ ] Backend: 2 voltas → "No máximo 1 voucher de volta".

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
