# Otimização mobile — Etapa 3 (demais abas) — Plano

> Execução: subagentes por grupo de abas + verificação no navegador. Spec: `docs/superpowers/specs/2026-10-26-otimizacao-mobile-design.md`. Etapas 1 e 2 já no ar (`782c8d9`).

**Meta:** Vouchers, Promoções, Cartões de Embarque, Pacotes, Usuários e Configurações usáveis no celular (< 768 px): sem rolagem horizontal, alvos de toque ≥ 44 px (≥ 36 px no mínimo absoluto), campos 16 px, texto ≥ 11 px, janelas/modais em tela cheia com cabeçalho e rodapé de ações fixos. **Desktop (≥ 768 px) não muda** (toda classe mobile com contrapartida `md:`).

## Linha de base (390 px, script `frontend/scripts/mobile-audit.js`)

| Aba | Rolagem horiz. | Alvos < 36 px | Alvos < 44 px |
|---|---|---|---|
| Vouchers | 0 | 8 (botão "Configurações da agência" 24 px, checkboxes 13 px, "Atualizar" 28 px, chips "#4 · azul" 30 px) | 8 |
| Promoções | **21 px** | 0 | 1 |
| Cartões de Embarque | 0 | 5 (checkboxes 13 px) | 5 |
| Pacotes | 0 | 10 (inputs 16 px de altura, selects 32 px, botões Subir/Descer 24 px) | 11 |
| Usuários / Configurações | a medir | a medir | a medir |

## Grupos

**Grupo A — Vouchers + Promoções** (`VouchersTab.jsx`, `PromocoesTab.jsx`, `voucher-templates/*`): corrigir o estouro de 21 px em Promoções; alvos de toque; formulário longo de voucher em uma coluna; pré-visualização sem rolagem lateral; botões de ação fixos/largura total quando fizer sentido; "Tirar foto" no envio de print (se houver zona de upload).

**Grupo B — Cartões de Embarque + Pacotes + Usuários + Configurações** (`BoardingPassesTab.jsx`, `boarding-passes/*`, `PackagesTab.jsx`, `UsersTab.jsx`, `UserModal.jsx`, `SettingsModal.jsx`, `BackupsPanel.jsx`, `BackgroundBank.jsx`/`BackgroundPicker.jsx`): mesmos critérios; rodapé "Salvar" fixo nas Configurações; Subir/Descer de 44 px; Usuários em cartões se houver tabela.

**Grupo C — transversal:** (1) botão **Voltar do celular** fecha janelas/folhas/modais/"drill-in" em vez de sair do app (`history.pushState` + `popstate`, em um hook `useBackClose(open, onClose)` usado por `BottomSheet`, modais de tela cheia e o caso de Alterações; nunca empilhar entradas duplicadas e limpar a entrada ao fechar por outro meio); (2) auditar páginas públicas do cliente (`/itinerario/:token`, `PackageFlightPreviewPage`, `VoucherPreviewPage`, `LoginPage`) em 360–430 px.

## Critério de aceite (por aba, 360/390/430 px)
`rolagemHorizontalPx = 0`, `alvosMenor36 = 0`, `textoMenor11px = 0`, `camposMenor16px = 0`; `alvosMenor44` apenas controles secundários justificados. Desktop 1280/768 visualmente igual (mesma estrutura: tabelas, colunas, textos).
Verificação: `npm run build` + navegador (backend `PORT=3100`, Vite `5180`) + fluxos reais de cada aba. Sem push sem autorização.
