# Otimização para celular (mobile) — Design

Data: 2026-10-26 · Status: desenho aprovado pela usuária em conversa (blocos 1 a 5).

## Objetivo
Tornar o painel confortável no **celular** (telas de 360 a 430 px) sem alterar o computador. A usuária usa o celular para **consultar preços e status**, **montar e enviar mensagens** e **subir vouchers/prints**; portanto nada pode ser "só leitura".

## Diagnóstico (medido em 2026-10-26, emulação 375 × 812, dados de exemplo)
| Aba | Rolagem horizontal | Botões/campos < 36 px | Observação |
|---|---|---|---|
| Preços | **240 px** (página mais larga que a tela) | **60** | cabeçalho da lista com textos sobrepostos |
| Status | 0 | 30 | usa `<table>` |
| Promoções | 28 px | 0 | |
| Vouchers / Cartões / Pacotes / Alterações | 0 | 8 / 7 / 10 / 1 | |
Em todas: o cabeçalho (título grande, subtítulo, 3 botões e menu) ocupa mais de meia tela; a barra de abas rola para o lado e esconde as últimas. Como a página estoura na largura, o navegador do celular amplia o layout (zoom out) — o sintoma que a usuária percebe.
Base: Tailwind v4 já em uso, `viewport` correto (`width=device-width, initial-scale=1.0`). Uso de breakpoints hoje: 0 a 7 ocorrências por arquivo.

## Decisões (aprovadas)
1. **Navegação:** barra fixa embaixo + botão "Mais".
2. **Listas de voos (Preços e Status):** um **cartão por voo** no celular; tabela inalterada no computador.
3. **Instalar como app:** versão simples (ícone, tela cheia, sem offline).
4. **Abordagem:** adaptar o sistema atual (mesmo código, comportamento por tamanho de tela); **sem** site/rota separada e **sem** reescrita de interface.

## Princípios
- **Breakpoint:** celular = abaixo de `md` (768 px). De `md` para cima, o layout atual **não muda**. Verificar também 768–1024 px (tablet) para não piorar.
- **CSS primeiro:** alternar layouts com classes (`md:hidden`, `hidden md:block`, `md:flex`…). JavaScript só onde o comportamento muda (aba ativa da barra inferior, "entrar/voltar" do caso em Alterações, folhas/menus).
- **Sem duplicar regra de negócio:** o cartão e a linha da tabela compartilham os mesmos handlers/estado (extrair funções/hooks de `PrecosTab.jsx` e `StatusTab.jsx` quando necessário). Só a apresentação é duplicada.
- **Nenhuma funcionalidade some no celular.**

## Critérios de aceitação (mensuráveis, repetidos a cada etapa)
Para cada aba, em 360, 375, 390 e 430 px de largura:
1. **Sem rolagem horizontal da página** (`scrollWidth - clientWidth == 0`) e nenhum elemento (fora de áreas de rolagem intencionais) passa de `window.innerWidth`.
2. **Alvos de toque:** botões, links, caixas de seleção e campos **principais** com ≥ 44 × 44 px de área clicável (ícones pequenos podem ter área de toque maior que o desenho). Meta: 0 alvos < 36 px nos fluxos principais.
3. **Texto ≥ 11 px** em qualquer lugar; **campos de formulário com 16 px** (evita o zoom automático do iOS).
4. **Desktop (1280 px) sem regressão:** mesmas telas, mesmos textos e funções.
5. **Tablet (768 e 1024 px):** layout de computador sem quebra.
6. Medição feita pelo mesmo script de auditoria (ver "Verificação").

## Bloco 1 — Estrutura e navegação (celular)
- **Cabeçalho compacto** (uma linha, ~56 px): logo, texto curto "Clube do Voo" e **um menu** (privacidade, tema, configurações, usuário/sair). Sem subtítulo no celular. No computador permanece o cabeçalho atual.
- **Barra de navegação inferior fixa** (`MobileNav`): Preços, Status, Alterações, Vouchers + **Mais**. "Mais" abre uma **folha** (bottom sheet) com Promoções, Cartões de Embarque e Pacotes. Aba ativa destacada; a aba ativa continua persistida em `localStorage('activeTab')`; se a aba ativa for uma das de "Mais", o botão "Mais" aparece destacado com o nome dela.
- A barra superior de abas (`Tabs.jsx`) fica **oculta no celular** e visível a partir de `md`.
- **Área segura (iOS):** `viewport-fit=cover` e `padding-bottom: env(safe-area-inset-bottom)` na barra; o conteúdo recebe espaço inferior para não ficar atrás dela. Usar `dvh` em alturas de tela cheia.
- **Toasts** (`Toast.jsx`) sobem acima da barra inferior.
- **Janelas/modais** (`SettingsModal`, `StatusModal`, `BackgroundBank`, `EmailPreviewModal`, `StatusHistoryDrawer`, modais de usuários/senha): **tela cheia** no celular (`max-h-dvh`, rolagem interna, botão de fechar ≥ 44 px, rodapé de ações fixo quando houver "Salvar"); centralizadas como hoje de `md` para cima.
- **Esconder/ajustar:** o botão de modo privacidade e o de tema continuam acessíveis (dentro do menu do cabeçalho).

## Bloco 2 — Preços e Status viram cartões (celular)
**Preços (`PrecosTab.jsx`)**
- Painel de indicadores (Total, Compradas, Desistências, Checks, Com falha, Ordenar por): fileira compacta de 3 colunas (ou rolagem horizontal de "chips"), sem ocupar 3 telas.
- Barra de ação: **Atualizar todos** e **Novo voo** em largura total, lado a lado, ≥ 44 px; progresso da fila ("Atualizar todos") continua visível.
- **Filtros:** prioridade em chips com rolagem horizontal; "Ordenar por" num seletor nativo; busca/filtros extras numa folha "Filtros" se houver.
- **Cartão do voo:** cliente (destaque, `pii`), mês/pax, **preço atual × alvo** com etiqueta ("Aguardar"/"Comprar"/"Sem preço"), faixa/cor da prioridade, marcação de comprado/desistência, "economia" quando existir, último check e falha (se houver). **Ações no menu "⋯"** (folha): atualizar agora, editar, comprar/desistir/reativar, link do voo, excluir (com confirmação). O **gráfico de 60 dias** abre ao tocar no cartão (expansão), com altura própria e sem estourar a largura (`ResponsiveContainer`).
- Ordenação dinâmica e posição dos cartões de comprado/desistência (sempre embaixo; desistência por último) **iguais ao computador**.
- Formulário/modal de **novo/editar voo**: tela cheia; campos empilhados; teclado numérico (`inputMode="decimal"`) no preço; seletores nativos.
**Status (`StatusTab.jsx`, `StatusModal.jsx`)**
- Lista agrupada por cliente (já existe no computador) vira **cartões por voo** dentro do grupo (recolhível): número do voo, data, status com cor (programado/atrasado/cancelado/concluído…), horário previsto/atualizado, "Checar agora", link de administração da viagem, "Concluído"/ocultar.
- Modal de cadastro/edição em tela cheia; histórico (`StatusHistoryDrawer`) como folha de tela cheia.
- Tabela do computador **inalterada**.

## Bloco 3 — Demais abas
- **Alterações (`FlightChangesTab.jsx` + `flight-changes/*`):** hoje duas colunas (lista | caso). No celular: **uma coluna**; a lista é a tela inicial; tocar num caso **abre o caso em tela cheia** com botão **← Voltar** fixo no topo; "Nova alteração" também em tela cheia. Passos 1 e 2, caixas de mensagem, botões Copiar / Abrir no WhatsApp / Enviar e-mail empilhados com ≥ 44 px. Seção "Viagens alteradas" legível (caixinhas grandes). Prévia do voucher (`NewVoucherSection`): altura adequada e botões de PDF/PNG em largura total. **UploadZone:** acrescentar botão **"Tirar foto"** (`<input type="file" accept="image/*" capture="environment">`) além de "Escolher arquivo"; o texto "arraste/cole" fica só no computador (`md:`).
- **Vouchers (`VouchersTab.jsx`):** lista, editor e prévia **empilhados**; prévia em largura total com rolagem própria; exportar PDF/PNG e enviar e-mail em largura total. Upload com "Tirar foto".
- **Promoções (`PromocoesTab.jsx`, `BackgroundPicker`, `BackgroundBank`):** corrigir o estouro de 28 px; os passos em coluna; a arte e a grade de fotos cabem na tela (grade de 2 colunas); botões grandes; "Copiar mensagem" e "Baixar arte" destacados.
- **Cartões de Embarque (`BoardingPassesTab.jsx`, `boarding-passes/*`):** cartões de passageiro empilhados; botões de mensagem/e-mail em largura total.
- **Pacotes (`PackagesTab.jsx`):** itens empilhados; upload com "Tirar foto".
- **Usuários/Configurações/Backups:** formulários empilhados em tela cheia.
- **Páginas públicas do cliente** (`/itinerario/<token>`, `/pacote/...`, páginas de voucher): já pensadas para o celular do cliente — **auditar** com o mesmo script e corrigir só o que estourar; não redesenhar.

## Bloco 4 — Instalar como app (versão simples)
- `frontend/public/manifest.webmanifest`: `name`/`short_name` ("Clube do Voo"), `lang: pt-BR`, `display: standalone`, `start_url: "/"`, `theme_color`/`background_color` coerentes com o tema escuro/claro, ícones 192 e 512 (any) e 512 (maskable).
- Ícones gerados a partir de `Logo.png` (raiz do repositório) — gerar arquivos PNG estáticos e versioná-los em `frontend/public/icons/`. `apple-touch-icon` (180 px).
- `index.html`: `<link rel="manifest">`, `<meta name="theme-color">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, `viewport-fit=cover`.
- **Sem cache offline e sem notificações.** Se, na verificação em Android/Chrome, o prompt de instalação exigir service worker, adicionar um **service worker mínimo que não faz cache** (passa as requisições direto); iOS ("Adicionar à Tela de Início") não precisa. Nenhum dado de cliente é guardado no aparelho.
- O login continua exigido; a sessão segue o comportamento atual (cookie).
- Servir o manifest e os ícones pelo Express/Vite sem passar pelo `requireAuth`; verificar que `/manifest.webmanifest` e `/icons/*` são públicos e não quebram o roteamento do SPA.

## Etapas de entrega (cada uma verificada e enviada com autorização)
1. **Estrutura + Preços:** cabeçalho compacto, `MobileNav`, folha "Mais", modais em tela cheia (base), cartões de Preços, ajustes globais (alvos de toque, fontes de 16 px, área segura).
2. **Status + Alterações:** cartões de Status, modais/gaveta, Alterações em tela cheia com "Voltar", "Tirar foto".
3. **Vouchers, Promoções, Cartões de Embarque, Pacotes, Usuários/Configurações:** empilhar e dimensionar; auditoria das páginas públicas do cliente.
4. **Instalar como app:** manifest, ícones, meta tags, teste de instalação (Android Chrome e iOS Safari, quando possível) e service worker mínimo somente se necessário.

## Verificação
- **Script de auditoria** versionado (`frontend/scripts/mobile-audit.js`, para colar no console ou rodar via Playwright): para cada aba mede rolagem horizontal da página, elementos que passam da largura, alvos de toque < 44 px (e < 36 px), texto < 11 px, e `input`/`select` com fonte < 16 px; imprime um relatório comparável antes/depois.
- **Navegador (painel do app) em 360, 375, 390, 430, 768, 1024 e 1280 px**, com backend em modo stub e dados de exemplo (já usados no diagnóstico), em tema claro e escuro, com e sem o modo privacidade.
- **Fluxos reais no celular emulado:** marcar comprado/desistência, atualizar todos (fila), cadastrar voo de status, montar mensagem de promoção, abrir um caso de Alterações, marcar viagens, subir print, copiar mensagem e abrir o WhatsApp, enviar e-mail de teste.
- `npm run build` sem erros; suíte do backend inalterada (só as 19 falhas pré-existentes de `auth`/`users`).
- Dispositivo real: a usuária confirma depois do deploy (Android/iOS); o que depender de hardware (câmera, instalação) fica marcado como "não testado localmente".

## Riscos e cuidados
- **`PrecosTab.jsx` tem ~960 linhas**: extrair handlers/estado para compartilhar entre tabela e cartão, sem alterar regras (ordenação dinâmica, compra/desistência, preço-alvo sugerido, histórico). Cobrir com a verificação no navegador antes/depois (e testes de API existentes seguem verdes).
- **Regressão no computador:** conferir sempre em 1280 px e 1024 px; qualquer diferença visual não intencional é defeito.
- **Barras fixas e teclado:** com o teclado aberto no celular, a barra inferior não pode cobrir campos (ocultar a barra enquanto um campo de texto está focado, ou usar `visualViewport`).
- **Modais com `position: fixed` e `dvh`:** testar rolagem interna e o botão "voltar" do navegador do celular (não deve sair do sistema ao fechar uma janela; opcional: `history.pushState` nas telas cheias — avaliar no plano).
- Navegador do painel não emula 100% o celular real (teclado, câmera, área segura): ver "Dispositivo real".
- **Textos de privacidade:** manter a classe `pii` nos dados do cliente nos novos cartões.

## Fora do escopo
Redesenho do computador; layout específico de tablet; modo paisagem otimizado; aplicativo nativo; notificações push; funcionamento offline; mudanças de regra de negócio; páginas públicas do cliente além de correções pontuais.
