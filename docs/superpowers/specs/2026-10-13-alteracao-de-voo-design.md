# Aba "Alterações" de voo + fotos do banco de fundos no backup — Design

Data: 2026-10-13 · Status: aprovado pelo usuário em conversa (blocos 1 e 2)

## Objetivo
1. Incluir as fotos do banco de fundos (`<DB_PATH>/promo-backgrounds/`) no backup diário.
2. Nova aba **Alterações**: notificar o cliente quando a companhia altera um voo (aviso) e confirmar o voo alterado com o novo voucher.

## Reaproveitamento (sem nova stack)
- `services/voucherExtractor.js` (`extractVoucher(buffer, mimetype)`): já lê PDF e PNG/JPEG/WebP via Gemini e devolve o JSON unificado.
- Tabela `vouchers` + `renderVoucher` + `sendVoucherEmail` (fluxo de `routes/vouchers.js` `send-email`).
- `voucher_settings.contact_phone` como número de suporte do botão de WhatsApp.
- Estilo de mensagem `*negrito*` de `helpers/boardingPassMessage.js`; visual de e-mail de `services/boardingPassEmail.js`.

## Fluxo
**Momento 1 — Aviso (só voucher antigo).** Escolher voucher salvo (aba Vouchers) ou subir PDF/imagem. Cria o caso (status `aviso_pendente`). Gera WhatsApp e e-mail opcional dizendo que a companhia alterou o voo, que entraremos em contato e com botão `wa.me/<suporte>?text=<mensagem pré-preenchida com nome e localizador>`. Sem horários novos. O usuário marca "aviso enviado" (`aviso_enviado`).

**Momento 2 — Confirmação (voucher novo).** No mesmo caso, sobe o voucher novo (PDF/imagem), extrai, compara automaticamente com o antigo, permite corrigir, gera WhatsApp (antes → depois só do que mudou) e e-mail opcional com o novo voucher em PDF. O voucher novo é salvo na aba Vouchers. Status `confirmado`. O passo 2 só abre após o aviso marcado como enviado; é possível pular o passo 1 (cliente avisado fora do sistema).

## Dados
Tabela `flight_changes`: `id, user_id, old_voucher_id, new_voucher_id, status, old_json, new_json, diff_json, notice_sent_at, confirmed_at, created_at, updated_at`. Status: `aviso_pendente | aviso_enviado | confirmado`. Lista ordena pendentes primeiro.

## Comparação (função pura `helpers/flightChangeDiff.js`)
- Casa trechos por direção + ordem. Marca cada trecho: `alterado` (com lista de campos), `igual`, `novo`, `removido`.
- Campos: partida/chegada (data e hora comparadas como instante, ignorando formato), número do voo, aeroportos, classe; também passageiros, localizador (destaca se mudou) e bagagem.
- Nada mudou → não permite gerar a confirmação.
- O usuário pode editar a extração antes; o diff é recalculado.

## Mensagens
- Aviso: saudação com primeiro nome, localizador, rota e data original, aviso de contato via WhatsApp e link `wa.me`.
- Confirmação: "Seu voo foi reajustado ✅", antes → depois por trecho alterado, nota de que o novo voucher está no e-mail/anexo. Trechos iguais omitidos.
- E-mail no visual do e-mail de voucher/cartão de embarque.

## Tela
Lista de casos com badge de status (pendentes no topo) + caso aberto em 2 passos (Aviso, Confirmação). Upload por seletor, arrastar e Ctrl+V. Botões Copiar e Abrir no WhatsApp; e-mail opcional (destinatários + Enviar).

## Backup das fotos
O backup diário (03:00) copia `promo-backgrounds/` para `backups/fundos-AAAAMMDD-HHmmss/` usando hard link com cópia como fallback; mesma retenção do banco (`BACKUP_KEEP`). Falha na cópia das fotos não impede o `VACUUM INTO`. Painel de backups indica se as fotos foram incluídas. Restauração é manual (copiar a pasta de volta); documentado.

## Erros e testes
- Extração falha/incompleta: mensagem clara, preenchimento manual, nenhum caso perdido.
- Testes: diff (horário, remoção, adição, nada mudou, formatos), mensagens, rotas (permissão por usuário, upload inválido, e-mail simulado), backup das fotos (com mutação/sabotagem das proteções).
- Fora de escopo: envio automático de WhatsApp; restauração automática do backup de fotos.
