# Pacotes — Smoke test (manual)

> Feature: montar um pacote de viagem a partir de N vouchers tipados (voos + hotel
> obrigatórios + adicionais de carro/passeio/transfer), gerando e-mail + página
> hospedada + PDFs anexados, com timeline cronológica.
> Spec: `docs/superpowers/specs/2026-07-15-pacotes-design.md`.

## Pré-requisitos
- `GEMINI_API_KEY` no `.env` (sem ela, extração usa STUB — útil pra testar a UI sem PDFs reais).
- `EMAIL_HOST/PORT/USER/PASS/FROM` (Hostinger) para o envio de e-mail.
- `PUBLIC_BASE_URL` (para links da página e do PDF de voo).
- Backend: `cd backend && npm run dev` · Frontend: `cd frontend && npm run dev` · login válido.
- PDFs de exemplo em `E:\AG\Gerador de Email\` (car, 3 hotéis, 2 passeios, transfer).

## Fluxo principal — pacote completo
- [ ] Aba **Pacotes** → seção "Montar pacote": 2 linhas fixas (Voo, Hotel).
- [ ] Anexar o PDF do voo na linha **Voo** e o PDF do hotel na linha **Hotel**.
- [ ] **+ Adicionar serviço** → linha **Carro**; anexar `voucher_car_*.pdf`.
- [ ] **+ Adicionar serviço** → mudar para **Passeio**; anexar `voucher_tour_*.pdf`.
- [ ] **+ Adicionar serviço** → mudar para **Transfer**; anexar o PDF de transfer.
- [ ] Reordenar linhas com ↑↓ (a ordem dos adicionais é preservada no `addons[]`).
- [ ] Botão **Gerar pacote** habilita só com ≥1 voo + ≥1 hotel e todas as linhas com arquivo.
- [ ] Clicar **Gerar pacote** → pacote aparece na lista e é selecionado (15–40s com Gemini real).
- [ ] **Preview (iframe)** — CONFIRMAR:
  - [ ] Header com título, titular, período total e resumo ("N voos · 1 hotel · N adicionais").
  - [ ] **Timeline cronológica**: voo de ida → transfer/serviços do dia → hotel (check-in) → passeio → voo de volta, na ordem real da viagem.
  - [ ] Cada serviço num card com ícone/cor do tipo e os campos-chave (hotel: check-in/out, quarto; carro: retirada/devolução; passeio: data, ponto de encontro; transfer: trechos).
  - [ ] **Horários no fuso local do serviço** (ex.: hotel internacional mostra a hora local do hotel, não convertida para BR).
- [ ] Editar o **título** → Salvar → preview recarrega com o novo título.
- [ ] **Enviar por e-mail** (modal: destinatários + mensagem) → CONFIRMAR no cliente:
  - [ ] E-mail consolidado com a timeline (versão enxuta) + CTA "Ver pacote completo".
  - [ ] **Anexos**: os PDFs **originais** de cada serviço + o **PDF do voucher de voo** gerado.
  - [ ] Link "Ver pacote completo" abre a **página hospedada** `/pacote/:token` com a timeline rica.
- [ ] **Excluir** o pacote → some da lista; os arquivos originais são removidos.

## Caso mínimo — só voo + hotel
- [ ] Gerar pacote com apenas 1 voo + 1 hotel → timeline com 2 blocos, e-mail sem adicionais.

## Validações (erros esperados)
- [ ] Tentar gerar sem voo (trocar a 1ª linha? — ela é fixa; via API: `POST /api/packages` só com hotel) → 400 "Envie ao menos 1 voo".
- [ ] Sem hotel → 400 "Envie ao menos 1 hotel".
- [ ] Botão **Gerar pacote** fica desabilitado até ter voo + hotel + todos os arquivos.
- [ ] Enviar e-mail com destinatário inválido → toast de erro.

## Auditoria / retenção
- [ ] Conferir `package_audit_log` no SQLite: `create`, `update` (título), `email_sent`, `delete`.
- [ ] Retenção (cron 03:30): arquivos originais >30 dias são apagados e `source_file_paths` vira NULL (audit `retention_cleanup`).

## Notas / follow-ups conhecidos
- Extração de novos providers pode variar; se um campo vier errado, ajustar o prompt do tipo em `backend/services/packagePrompts.js`.
- **Edição de campos por tipo** (além do título) não está no MVP — a extração costuma bastar; é um follow-up natural (o editor React por tipo pode ler/gravar via `PUT /api/packages/:id`).
- **Seguro viagem** fora do MVP — adicionar `kind:'insurance'` é 1 prompt + 1 card + 1 branch (schema já é extensível).
- Se o PDF do voucher de voo falhar no anexo (Playwright), o e-mail segue **sem** ele (com os originais + página) e loga.

## Em produção (Coolify)
- [ ] Após merge em `main`, fazer **Redeploy** (branch `main`, não automático).
- [ ] Repetir o fluxo principal com PDFs reais; conferir os anexos e a página hospedada no ambiente real.
