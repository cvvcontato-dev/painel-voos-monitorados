# Otimização mobile — Etapa 2 (Status + Alterações) — Plano de Implementação

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No celular (< 768 px): a aba **Status** passa a mostrar cartões por voo agrupados por cliente (janelas e gaveta em tela cheia); a aba **Alterações** vira lista → caso em tela cheia com botão **← Voltar**, com botões/campos de 44 px e botão **"Tirar foto"** para enviar voucher/print pela câmera. Computador (≥ 768 px) **sem nenhuma mudança**.

**Architecture:** Mesma base da Etapa 1 (`useIsMobile`, `BottomSheet`/`SheetItem`, regra global de campos de 16 px). Status: o `<table>` não é adaptável por CSS, então o ramo de celular troca a tabela por cartões (`StatusFlightCard`), reaproveitando os handlers e valores de `StatusTab`. Alterações: layout condicional por `isMobile` (lista **ou** caso). Tamanhos de toque vêm de classes compartilhadas (`boarding-passes/formState.js`) com `md:` repondo o tamanho atual.

**Tech Stack:** React 19, Vite, Tailwind v4, lucide-react 1.16. Sem runner de testes no frontend: verificação por **script de auditoria** (`frontend/scripts/mobile-audit.js`), `npm run build` e navegador (360/375/390/430/768/1024/1280 px).

**Spec:** `docs/superpowers/specs/2026-10-26-otimizacao-mobile-design.md` · **Etapa 1:** `docs/superpowers/plans/2026-10-26-otimizacao-mobile-etapa-1.md`

**Convenções:** textos em pt-BR; commits em pt-BR com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; **sem push**; sem `git stash`. **Barras invertidas e caracteres especiais se perdem em shell/heredoc: use as ferramentas de edição de arquivo e releia.** Backend não é tocado.

**Regra de ouro (computador não muda):** toda classe nova de celular precisa de contrapartida `md:` que reponha o valor atual; conferir linha a linha.

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `frontend/scripts/mobile-audit.js` | Modificar: checkbox/radio medidos pela área do `<label>` |
| `frontend/src/components/boarding-passes/formState.js` | Modificar: `inputCls`, `btnPrimary`, `btnGhost` com altura de toque no celular |
| `frontend/src/components/status/StatusFlightCard.jsx` | Criar |
| `frontend/src/components/StatusTab.jsx` | Modificar: barra de ações, indicadores, lista em cartões (celular) |
| `frontend/src/components/StatusModal.jsx` | Modificar: tela cheia no celular |
| `frontend/src/components/StatusHistoryDrawer.jsx` | Modificar: tela cheia/alvos no celular |
| `frontend/src/components/flight-changes/UploadZone.jsx` | Modificar: botão "Tirar foto", texto curto no celular |
| `frontend/src/components/FlightChangesTab.jsx` | Modificar: lista → caso em tela cheia com "Voltar" |
| `frontend/src/components/flight-changes/CaseView.jsx` | Modificar: sem rolagem interna no celular, textos curtos |
| `frontend/src/components/flight-changes/MessageBox.jsx`, `NewVoucherSection.jsx`, `CorrectionForm.jsx`, `EmailPreviewModal.jsx`, `AffectedTripsSection.jsx` | Modificar: alvos de 44 px, tela cheia, sem rolagem aninhada |

---

## Task 1: Auditoria por rótulo + tamanhos de toque compartilhados

**Files:** `frontend/scripts/mobile-audit.js`, `frontend/src/components/boarding-passes/formState.js`

- [ ] **Step 1: Auditoria — checkbox/radio contam pela área do rótulo.** Em `mobile-audit.js`, onde monta `alvos`, trocar a medição para usar um "elemento clicável":

```js
  const areaClicavel = (e) => ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label')) || e;
  const medida = (e) => { const r = areaClicavel(e).getBoundingClientRect(); return Math.min(r.width, r.height); };
```
e usar `medida(e) < 36` / `medida(e) < 44` nos filtros `pequenos36` / `pequenos44` (em vez de `getBoundingClientRect()` do próprio elemento). Rodar o script na aba Preços (Etapa 1) para conferir que o resultado anterior não piora.

- [ ] **Step 2: `formState.js`** — aumentar alvos só no celular:

```js
export const inputCls =
  "w-full px-3 py-2.5 md:py-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border text-sm " +
  "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
  "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 " +
  "dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer";
```
(`labelCls` e `sectionCls` ficam como estão.) Essas classes também são usadas por Cartões de Embarque — mudança intencional e inofensiva no computador (`md:` repõe).

- [ ] **Step 3: Build** (`cd frontend && npm run build`) e **commit** `feat(mobile): botões e campos compartilhados com altura de toque no celular`.

---

## Task 2: Aba Status em cartões

**Files:** criar `frontend/src/components/status/StatusFlightCard.jsx`; modificar `StatusTab.jsx`

- [ ] **Step 1: `StatusFlightCard.jsx`** (recebe valores já calculados; sem regra de negócio):

```jsx
import { useState } from 'react';
import { RefreshCw, History, Pause, Play, Edit2, Trash2, ExternalLink, Hand, EllipsisVertical } from 'lucide-react';
import BottomSheet, { SheetItem } from '../mobile/BottomSheet';

/**
 * Cartão de voo monitorado (celular). StatusTab calcula tudo e passa pronto:
 *  - f: voo; style: { color, icon, label } do status; dataBr, partida, estimada, proxima: textos prontos
 *  - busy: { checking }; on: { checkNow, history, toggle, edit, remove }
 */
export default function StatusFlightCard({ f, style, dataBr, partida, estimada, proxima, busy, on }) {
  const [sheet, setSheet] = useState(false);
  const fechar = () => setSheet(false);
  const rodar = (fn) => () => { fechar(); fn(); };
  return (
    <>
      <article className="rounded-xl border p-3 bg-white border-slate-200/80 dark:bg-slate-800/60 dark:border-slate-700/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-base font-semibold text-slate-800 dark:text-slate-100">{f.numero_voo}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{dataBr} · {f.origem || '?'} → {f.destino || '?'}</div>
          </div>
          <span className={`shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full border ${style.color}`}>{style.icon} {style.label}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
          <span>
            Partida <strong className="font-semibold">{partida}</strong>
            {estimada && <span className="text-amber-700 dark:text-amber-400"> → {estimada}</span>}
          </span>
          {f.override_ativo === 1 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 px-1.5 py-0.5 rounded" title="Horário definido manualmente — não é atualizado pela API">
              <Hand className="w-3 h-3" /> Manual
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {f.monitoramento_ativo ? `Próx. check ${proxima}` : 'Monitoramento pausado'}
        </div>

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={on.checkNow} disabled={busy.checking}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-medium disabled:opacity-50
                             border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-300">
            <RefreshCw className={`w-4 h-4 ${busy.checking ? 'animate-spin' : ''}`} /> Checar agora
          </button>
          <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label={`Mais ações do voo ${f.numero_voo}`}
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <EllipsisVertical className="w-5 h-5" />
          </button>
        </div>
      </article>

      <BottomSheet open={sheet} onClose={fechar} title={`Voo ${f.numero_voo}`}>
        {f.link_gerenciamento && <SheetItem icon={<ExternalLink className="w-5 h-5" />} label="Abrir gerenciamento da reserva" href={f.link_gerenciamento} onClick={fechar} />}
        <SheetItem icon={<History className="w-5 h-5" />} label="Histórico" onClick={rodar(on.history)} />
        <SheetItem icon={f.monitoramento_ativo ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                   label={f.monitoramento_ativo ? 'Pausar monitoramento' : 'Reativar monitoramento'} onClick={rodar(on.toggle)} />
        <SheetItem icon={<Edit2 className="w-5 h-5" />} label="Editar" onClick={rodar(on.edit)} />
        <SheetItem icon={<Trash2 className="w-5 h-5" />} label="Remover" danger onClick={rodar(on.remove)} />
      </BottomSheet>
    </>
  );
}
```
(A folha fica **fora** do `<article>`, como no cartão de Preços.)

- [ ] **Step 2: `StatusTab.jsx` — imports/estado.** Acrescentar `import { useIsMobile } from '../hooks/useMediaQuery';` e `import StatusFlightCard from './status/StatusFlightCard';`; dentro do componente: `const isMobile = useIsMobile();`.

- [ ] **Step 3: Barra de ações.** `<div className="flex justify-end items-center gap-3 mb-4 flex-wrap">` → `<div className="grid grid-cols-2 gap-2 md:flex md:justify-end md:items-center md:gap-3 md:flex-wrap mb-4">`. Em cada um dos 3 botões acrescentar `justify-center min-h-[44px] md:min-h-0`; o botão **Monitorar Voo** (último no código) ganha também `col-span-2 order-first md:col-span-1 md:order-none`. Os botões "Expandir/Recolher todos" e "Ocultar concluídos" ficam `px-4 py-2.5` (desktop) — no celular `px-3`.

- [ ] **Step 4: Indicadores compactos.** O grid `grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6` → `grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6`. No componente `StatCard`: `p-4` → `p-3 md:p-4`; caixa do ícone `bg-indigo-500/10 p-2.5 ...` ganha `hidden sm:block`; o valor ganha `whitespace-nowrap`.

- [ ] **Step 5: Lista.** Trocar o bloco `<main className="bg-white border ... overflow-hidden"> … </main>` por um ternário `isMobile ? (<lista de cartões>) : (<main …> (conteúdo atual, intacto) </main>)`. A lista de celular:

```jsx
        <div className="space-y-3" aria-busy={isLoading}>
          {isLoading ? (
            <div className="py-12 text-center text-slate-600 dark:text-slate-400">Carregando...</div>
          ) : visibleFlights.length === 0 ? (
            <div className="py-12 text-center text-slate-600 dark:text-slate-400">
              <Plane className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 mb-3 opacity-50" />
              {hideConcluded && flights.length > 0
                ? `Nenhum voo ativo — ${concluidosCount} voo(s) concluído(s) ocultos.`
                : 'Nenhum voo sendo monitorado.'}
            </div>
          ) : groupedByClient.map(group => {
            const collapsed = collapsedGroups.has(group.cliente);
            return (
              <section key={group.cliente} className="rounded-xl border overflow-hidden border-slate-200 dark:border-slate-700/60">
                <button type="button" onClick={() => toggleGroup(group.cliente)} aria-expanded={!collapsed}
                        className="w-full min-h-[48px] flex items-center gap-2 px-3 py-2 text-left bg-slate-100/70 dark:bg-slate-800/50">
                  {collapsed ? <ChevronRight className="w-4 h-4 shrink-0 text-slate-500" /> : <ChevronDown className="w-4 h-4 shrink-0 text-slate-500" />}
                  <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{privacyOn ? pseudonym(group.cliente) : group.cliente}</span>
                  <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                    <Plane className="w-3 h-3" /> {group.flights.length} {group.flights.length === 1 ? 'voo' : 'voos'}
                  </span>
                </button>
                {!collapsed && (
                  <div className="p-2 space-y-2">
                    {group.flights.map(f => {
                      const concluded = isConcluded(f);
                      const style = concluded
                        ? STATUS_STYLES.concluded
                        : (STATUS_STYLES[f.status_atual] || { color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20', icon: '⚪', label: f.status_atual || '—' });
                      const prog = formatTimeShort(f.partida_programada);
                      const est = f.partida_estimada && f.partida_estimada !== f.partida_programada ? formatTimeShort(f.partida_estimada) : null;
                      return (
                        <StatusFlightCard key={f.id} f={f} style={style}
                          dataBr={String(f.data_voo || '').split('-').reverse().join('/')}
                          partida={prog} estimada={est} proxima={untilNow(f.proxima_verificacao)}
                          busy={{ checking: checkingId === f.id }}
                          on={{
                            checkNow: () => handleCheckNow(f.id),
                            history: () => setHistoryId(f.id),
                            toggle: () => handleToggle(f.id),
                            edit: () => { setEditing(f); setModalOpen(true); },
                            remove: () => handleDelete(f.id)
                          }} />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
```
(`ChevronDown`, `ChevronRight`, `Plane` já estão importados em `StatusTab.jsx`.)

- [ ] **Step 6: Build + commit** `feat(mobile): aba Status em cartões por voo, agrupados por cliente`.

---

## Task 3: Janelas de Status em tela cheia

**Files:** `StatusModal.jsx`, `StatusHistoryDrawer.jsx`

- [ ] **Step 1: `StatusModal.jsx`** (linhas ~84-193; leia o arquivo e aplique "de → para"):
  - Raiz `fixed inset-0 z-50 flex items-center justify-center p-4` → `fixed inset-0 z-50 flex md:items-center md:justify-center md:p-4`
  - Painel `relative w-full max-w-lg max-h-[90vh] flex flex-col … rounded-2xl overflow-hidden` → `relative w-full md:max-w-lg h-[100dvh] md:h-auto md:max-h-[90vh] flex flex-col … md:rounded-2xl overflow-hidden` (fundo no celular `dark:bg-slate-900 md:dark:bg-slate-900/60`).
  - Cabeçalho (título + X): X vira `w-11 h-11 -mr-2 flex items-center justify-center md:w-auto md:h-auto md:mr-0`; padding `p-4 md:p-6`.
  - `<form … className="p-6 space-y-4 overflow-y-auto flex-1">` → `p-4 md:p-6 …`
  - Grades `grid grid-cols-2 gap-4` (voo/data e e-mail/Telegram) → `grid grid-cols-1 sm:grid-cols-2 gap-4`
  - `inputCls` (`py-2.5`) → `py-3 md:py-2.5`
  - Rodapé de botões (`pt-4 flex justify-end gap-3 border-t …`) → `sticky bottom-0 -mx-4 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-3 md:static md:mx-0 md:px-0 md:py-0 md:pt-4 md:pb-0 md:justify-end border-t bg-white dark:bg-slate-900 md:bg-transparent md:dark:bg-transparent`; botões `flex-1 md:flex-none min-h-[44px] md:min-h-0`.
  - Checkbox "horário manual" e campo `type="time"`: rótulo com `min-h-[44px] md:min-h-0`, checkbox `w-5 h-5 md:w-4 md:h-4`.

- [ ] **Step 2: `StatusHistoryDrawer.jsx`:** o painel já é `w-full max-w-md`; no celular deve ocupar a tela toda e ter rolagem do fundo travada: painel `h-[100dvh] md:h-full`; botão X `w-11 h-11 flex items-center justify-center md:w-auto md:h-auto`; padding `p-4 md:p-6`.

- [ ] **Step 3: Build + commit** `feat(mobile): janela e histórico de Status em tela cheia no celular`.

---

## Task 4: "Tirar foto" no UploadZone

**Files:** `flight-changes/UploadZone.jsx`

- [ ] **Step 1:** novas props `camera = true` e `labelMobile`; segundo input só de imagens com câmera; botões visíveis só no celular; texto de colar/arrastar só no computador.

```jsx
// dentro de UploadZone (junto dos outros refs):
const cameraRef = useRef(null);

// no JSX, depois do <input ref={inputRef} …>:
<input
  ref={cameraRef}
  type="file"
  accept="image/*"
  capture="environment"
  className="hidden"
  tabIndex={-1}
  aria-label="Fotografar o voucher"
  onClick={e => e.stopPropagation()}
  onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }}
/>

// substituir o bloco de texto padrão (o <div>{label || '…'}</div>) por:
<div className="hidden md:block">{label || 'Clique, arraste ou, com esta área selecionada, cole (Ctrl+V) o voucher — PDF ou imagem'}</div>
<div className="md:hidden">{labelMobile || 'Envie o voucher — PDF ou imagem'}</div>
{camera && (
  <div className="md:hidden mt-3 flex gap-2 justify-center">
    <button type="button" disabled={blocked}
            onClick={e => { e.stopPropagation(); cameraRef.current?.click(); }}
            className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-lg border text-sm font-medium disabled:opacity-50 border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-300">
      <Camera className="w-4 h-4" /> Tirar foto
    </button>
    <button type="button" disabled={blocked}
            onClick={e => { e.stopPropagation(); open(); }}
            className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-lg border text-sm font-medium disabled:opacity-50 border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200">
      <UploadCloud className="w-4 h-4" /> Escolher arquivo
    </button>
  </div>
)}
```
Importar `Camera` de `lucide-react`. O `<div role="button">` externo continua clicável no computador; no celular os dois botões internos fazem o trabalho (o clique no fundo também abre o seletor — comportamento atual, aceitável). Ícone grande (`UploadCloud` de cima) fica `hidden md:block` para economizar altura.

- [ ] **Step 2: Chamadas.** Em `CaseView.jsx` (voucher novo) passar `labelMobile` curto: voucher novo — `"Voucher novo — PDF ou imagem. Pode ser só um print dos voos."`; substituição (`hasNew`) — `"Substituir o voucher novo — envie um print com TODAS as viagens alteradas."`. Em `FlightChangesTab.jsx` (nova alteração) — `labelMobile="Envie o voucher antigo — PDF ou imagem."`.

- [ ] **Step 3: Build + commit** `feat(mobile): botão Tirar foto (câmera) no envio de voucher/print`.

---

## Task 5: Alterações — lista → caso em tela cheia

**Files:** `FlightChangesTab.jsx`, `CaseView.jsx`, `MessageBox.jsx`, `NewVoucherSection.jsx`, `CorrectionForm.jsx`, `EmailPreviewModal.jsx`, `AffectedTripsSection.jsx`

- [ ] **Step 1: `FlightChangesTab.jsx`** — imports `import { ArrowLeft } from 'lucide-react'` (junto dos demais ícones) e `import { useIsMobile } from '../hooks/useMediaQuery';`; `const isMobile = useIsMobile();`; função `voltar`:

```jsx
  function voltar() { setCreating(false); setSelected(null); window.scrollTo({ top: 0 }); }
```
No `return`, antes do `<div className="grid lg:grid-cols-3 …">`, acrescentar o ramo de celular (detalhe em tela cheia):

```jsx
  if (isMobile && (creating || selected)) {
    return (
      <div>
        <div className="sticky top-0 z-30 -mx-3 mb-3 px-3 py-1 border-b backdrop-blur bg-slate-50/95 border-slate-200 dark:bg-slate-950/95 dark:border-slate-800">
          <button type="button" onClick={voltar}
                  className="min-h-[44px] -ml-2 px-2 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-300">
            <ArrowLeft className="w-5 h-5" /> Alterações
          </button>
        </div>
        {creating
          ? <NewCasePanel showToast={showToast} onCreated={created} onLate={createdLate} onClose={voltar} />
          : <CaseView key={selected.id} id={selected.id} initial={selected.initial} showToast={showToast} onChanged={reload} />}
      </div>
    );
  }
```
Na lista (celular): contêiner `max-h-[70vh] overflow-y-auto` → `md:max-h-[70vh] md:overflow-y-auto`; item da lista: botão principal `p-2` → `p-3 md:p-2 min-h-[56px]`; botão de apagar `p-2 …` → `w-11 h-11 flex items-center justify-center md:w-auto md:h-auto md:p-2`; chip de status `text-[11px]` permanece (≥ 11).
`NewCasePanel` ganha `labelMobile` no `UploadZone` (Task 4).

- [ ] **Step 2: `CaseView.jsx`** — raiz `space-y-4 max-h-[80vh] overflow-y-auto pr-1` → `space-y-4 md:max-h-[80vh] md:overflow-y-auto md:pr-1` (a página inteira rola no celular). Cabeçalho do caso (nome/localizador/status) ok. Botões já usam `btnGhost`/`btnPrimary` (44 px após a Task 1); o botão "Confirmar alteração" fica `w-full md:w-auto` e "Marcar aviso como enviado"/"Corrigir dados lidos" `w-full md:w-auto`.

- [ ] **Step 3: `MessageBox.jsx`** — botões Copiar/WhatsApp: `flex flex-wrap gap-2` → cada botão `flex-1 md:flex-none`; linha de e-mail: o campo `flex-1 min-w-[200px]` → `flex-1 min-w-0 w-full md:w-auto md:min-w-[200px]`; botão enviar `w-full md:w-auto`; "Ver modelo do e-mail" `w-full md:w-auto`; textarea `max-h-72` fica (rolagem própria só da caixa).

- [ ] **Step 4: `NewVoucherSection.jsx`** — iframe: `style={{ height: '70vh', minHeight: 420 }}` → `className="w-full border-0 h-[60dvh] md:h-[70vh] min-h-[420px]"` (sem `style`); botões de PDF/PNG/copiar/abrir: contêiner `flex flex-wrap gap-2` → cada item `flex-1 md:flex-none` (ou `grid grid-cols-2 gap-2 md:flex`).

- [ ] **Step 5: `CorrectionForm.jsx`** — `max-h-96 overflow-y-auto` → `md:max-h-96 md:overflow-y-auto` (sem rolagem aninhada no celular); botões Salvar/Cancelar `flex-1 md:flex-none`.

- [ ] **Step 6: `EmailPreviewModal.jsx`** — raiz `fixed inset-0 z-50 flex items-center justify-center p-4` → `fixed inset-0 z-50 flex md:items-center md:justify-center md:p-4`; painel `relative w-full max-w-3xl rounded-xl … p-4 space-y-3` → `relative w-full md:max-w-3xl h-[100dvh] md:h-auto overflow-y-auto md:rounded-xl … p-4 space-y-3`; iframe `style={{ height: '70vh' }}` → `className="… h-[calc(100dvh-10rem)] md:h-[70vh]"`; botão fechar `w-11 h-11 flex items-center justify-center md:w-auto md:h-auto`.

- [ ] **Step 7: `AffectedTripsSection.jsx`** — cada `<label>` de viagem e o de "Marcar a reserva toda": `min-h-[44px] md:min-h-0` + checkbox `w-5 h-5 md:w-4 md:h-4 shrink-0`; botões "Confirmar viagens"/"Salvar viagens" usam `btnPrimary` (44 px) e ficam `w-full md:w-auto`.

- [ ] **Step 8: Build + commit** `feat(mobile): Alterações em tela cheia com Voltar, botões de 44px e modelo de e-mail em tela cheia`.

---

## Task 6: Verificação final da etapa

- [ ] **Step 1: Ambiente** (ver Etapa 1, "Ambiente de verificação") com dados de exemplo: voos de status (≥ 6, de 3+ clientes, 1 concluído), 4+ vouchers, 1 caso de alteração com voucher combinado de 2 reservas.
- [ ] **Step 2: Auditoria no celular** (360, 375, 390 e 430 px) para **Status** e **Alterações** (lista, caso aberto, "Nova alteração", modelo de e-mail): `rolagemHorizontalPx = 0`; `alvosMenor36 = 0`; `textoMenor11px = 0`; `camposMenor16px = 0`. Registrar `alvosMenor44` (aceitáveis só chips/rótulos secundários ≥ 36). Comparar com a linha de base (Status: 30 alvos; Alterações: 1).
- [ ] **Step 3: Fluxos reais (celular emulado):** Status — checar agora, abrir histórico em tela cheia, pausar/reativar, editar (modal em tela cheia, ajuste de horário manual), remover, recolher/expandir cliente, ocultar concluídos, modo privacidade (nome do cliente trocado por pseudônimo). Alterações — abrir caso (tela cheia, **← Voltar** volta à lista na mesma posição), marcar viagens, subir print (botões **Tirar foto**/**Escolher arquivo** visíveis; simular escolha de arquivo), corrigir dados, copiar mensagem, abrir modelo do e-mail em tela cheia, confirmar; "Nova alteração" com busca de voucher.
- [ ] **Step 4: Computador não mudou:** em 1280 e 768 px, Status mostra a tabela com colunas e ações ao passar o mouse; Alterações mantém lista + caso lado a lado (lg) / empilhados (md); `UploadZone` com o texto de arrastar/colar e **sem** os botões de foto; textos e contagem de botões **visíveis** iguais à linha de base (Etapa 1 registrou: Status 43, Alterações 14 botões no total antes da barra inferior; ajuste pelos botões escondidos do celular).
- [ ] **Step 5:** `npm run build`; suíte do backend inalterada (só as 19 falhas pré-existentes de `auth`/`users`).
- [ ] **Step 6:** relatório (antes/depois por aba; o que não foi testado: câmera real, teclado, gestos); **não enviar ao GitHub sem a autorização da usuária**.
