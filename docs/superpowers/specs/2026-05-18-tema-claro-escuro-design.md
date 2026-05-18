# Design: Tema Claro/Escuro

**Data:** 2026-05-18
**Repositório:** [cvvcontato-dev/painel-voos-monitorados](https://github.com/cvvcontato-dev/painel-voos-monitorados)

---

## 1. Contexto e objetivo

A aplicação hoje só tem tema escuro (slate-900 hardcoded em `index.css` body + classes Tailwind dark espalhadas por todos os componentes React). Este spec adiciona um **tema claro alternativo**, alternável pelo usuário via botão sol/lua no header, com persistência local.

Escuro permanece o tema **default** — usuários atuais não notam diferença visual até clicarem no toggle. Emails (alertas de preço e status) ficam **fora de escopo** — continuam dark.

## 2. Decisões-chave

| Tema | Decisão | Justificativa |
|---|---|---|
| Mecanismo de troca | **Botão sol/lua no header** | Controle explícito do usuário; sem dependência de `prefers-color-scheme` |
| Tema default | **Escuro (atual)** | Zero surpresa para usuários existentes |
| Persistência | **`localStorage`** key `theme` | Sem auth; basta por dispositivo/navegador |
| Implementação | **Tailwind `dark:` variants** com `darkMode: 'class'` (variant CSS em v4) | Idiomático no codebase atual; refator mecânico; revisável |
| Inversão de paradigma | Classes BASE = claro, `dark:` = escuro | Padrão Tailwind. `<html>` recebe classe `dark` por default para manter o look atual |
| Anti-flash | Script inline síncrono em `index.html` aplicando `.dark` antes do React montar | Evita "flash of light theme" no carregamento |
| Emails | **Mantidos dark** | YAGNI; templates de email são contexto separado (caixa de entrada) |

## 3. Arquitetura

```
[index.html] ─── script inline lê localStorage.theme || 'dark' e seta classe `dark` no <html>
                 │
                 ▼
[main.jsx → App.jsx]
                 │
                 │  useTheme() hook lê estado inicial do DOM
                 ▼
[ThemeToggle]   ←─── botão no header
                 │
                 │  onToggle: alterna theme state, atualiza classList e localStorage
                 ▼
[document.documentElement classList "dark"]
                 │
                 ▼
[Todos componentes React]
                 ↑
                 │  classes Tailwind: "bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                 │  reagem automaticamente via cascade CSS
```

### Princípios

- **Sem prop-drilling de tema:** toda mudança de aparência acontece via classe no `<html>`. Componentes não recebem `theme` por prop — apenas suas classes Tailwind reagem ao seletor `.dark` no ancestral.
- **Sem JS por componente:** depois do refator de classes, nenhum componente novo é afetado pela infra de tema (só precisa lembrar de aplicar pares `dark:` em classes de cor).
- **Mudança mecânica:** refator é "para cada classe de cor escura, adicionar par light de fallback como base + manter dark variant". Sem invenção de tokens novos.

## 4. Mapeamento de cores

Toda classe escura existente ganha um par claro semanticamente equivalente.

| Função | Escuro (atual) | Claro (novo) |
|---|---|---|
| Página (body) | `slate-950` + gradientes indigo/purple sutis | `slate-50` + mesmos gradientes em opacidade menor |
| Cards/superfícies | `bg-slate-900/40 border-slate-800/50` | `bg-white/80 border-slate-200` |
| Painel principal (tabela) | `bg-slate-900/60 border-slate-700/50` | `bg-white border-slate-200` |
| Modal/Drawer | `bg-slate-900/60 backdrop-blur` | `bg-white border-slate-200` |
| Overlay de modal | `bg-slate-950/80` | `bg-slate-900/50` |
| Header da tabela | `bg-slate-900/80 text-slate-400` | `bg-slate-50 text-slate-500` |
| Texto primário | `text-slate-100/200` | `text-slate-900` |
| Texto secundário | `text-slate-400` | `text-slate-600` |
| Texto muted | `text-slate-500/600` | `text-slate-400/500` |
| Input | `bg-slate-800/50 border-slate-700 text-slate-100 placeholder-slate-400` | `bg-white border-slate-300 text-slate-900 placeholder-slate-400` |
| Botão primário (indigo) | `bg-indigo-600` (inalterado) | `bg-indigo-600` (inalterado) |
| Hover linha | `hover:bg-slate-800/30` | `hover:bg-slate-100/60` |
| Divisores | `divide-slate-800/50` | `divide-slate-200` |
| Badge Programado | `bg-emerald-500/10 text-emerald-400 border-emerald-500/20` | `bg-emerald-100 text-emerald-700 border-emerald-200` |
| Badge Atrasado | `bg-amber-500/10 text-amber-400 border-amber-500/20` | `bg-amber-100 text-amber-700 border-amber-200` |
| Badge Cancelado | `bg-red-500/10 text-red-400 border-red-500/20` | `bg-red-100 text-red-700 border-red-200` |
| Gradiente do título | `from-white to-slate-400` | `from-slate-900 to-slate-500` |

**Padrão de aplicação:**

```jsx
// antes
<div className="bg-slate-900/40 border border-slate-800/50 text-slate-200">

// depois
<div className="bg-white/80 border border-slate-200 text-slate-900
                dark:bg-slate-900/40 dark:border-slate-800/50 dark:text-slate-200">
```

**Indicadores semânticos (botões primários, sucesso, erro, alerta):**
- Mantêm o **mesmo tom de acento** nos dois temas (indigo-600, etc.).
- Só fundo e texto base mudam — preserva identidade visual da marca.

**Status badges:**
- No escuro: "neon glow" (texto claro sobre fundo translúcido).
- No claro: tinta sólida (texto escuro sobre fundo pastel).
- Mantém contraste WCAG AA mínimo nos dois.

## 5. Componentes novos

### 5.1 `frontend/src/hooks/useTheme.js`

```js
export function useTheme()
// Retorna { theme: 'dark' | 'light', toggleTheme: () => void }
```

- Lê estado inicial: `document.documentElement.classList.contains('dark') ? 'dark' : 'light'`.
- `toggleTheme()`: alterna estado, ajusta `classList` em `document.documentElement`, persiste em `localStorage.theme`.
- Guard com `try/catch` em torno de `localStorage` para Safari private mode.

### 5.2 `frontend/src/components/ThemeToggle.jsx`

- Props: `{ theme, onToggle }`.
- Renderiza um botão ícone (`Sun` quando `theme === 'dark'`, `Moon` quando `theme === 'light'`).
- Estilo idêntico ao botão de Settings no header (mesmas classes de hover/borda).
- Tooltip: "Tema claro" / "Tema escuro" (alterna).

## 6. Mudança em arquivos existentes

| Arquivo | Mudança |
|---|---|
| `frontend/index.html` | Adiciona script inline antes do `<script src="/src/main.jsx">` que lê `localStorage.theme` (default `'dark'`) e aplica classe `dark` em `<html>` |
| `frontend/src/index.css` | Adiciona `@custom-variant dark (&:where(.dark, .dark *));` no topo. Body com cor de fundo/texto claros como base; `.dark body` restaura cores escuras atuais |
| `frontend/src/App.jsx` | Importa e usa `useTheme`; renderiza `<ThemeToggle>` no header à esquerda do botão Settings |
| `frontend/src/components/Tabs.jsx` | Adiciona pares `dark:` em todas as classes de cor |
| `frontend/src/components/PrecosTab.jsx` | Idem (arquivo mais extenso afetado) |
| `frontend/src/components/StatusTab.jsx` | Idem |
| `frontend/src/components/StatusModal.jsx` | Idem |
| `frontend/src/components/StatusHistoryDrawer.jsx` | Idem |
| `frontend/src/components/SettingsModal.jsx` | Idem |
| `frontend/src/components/Toast.jsx` | Idem |

**Total:** 2 arquivos novos, 9 modificados. Toda mudança é mecânica (adicionar pares `dark:` seguindo o mapa da seção 4).

## 7. Fora de escopo (YAGNI)

- ❌ Detecção automática de `prefers-color-scheme` (botão + default fixo basta)
- ❌ Temas customizados além de claro/escuro
- ❌ Persistência por usuário no banco (app não tem auth; localStorage basta)
- ❌ Animação de transição entre temas (Tailwind aplica imediato; fade só agrega complexidade)
- ❌ Templates de email no tema claro
- ❌ Detecção de mudança do tema do SO em runtime

## 8. Critérios de aceitação

1. Em primeira visita, a app abre **escura** — visualmente idêntica ao estado atual antes da mudança.
2. Botão sol/lua aparece no header, à esquerda do botão de Settings.
3. Clicar no toggle alterna o tema imediatamente, sem reload.
4. A escolha persiste após reload (`localStorage.theme`).
5. **Sem flash branco** entre o carregamento da página e a montagem do React (init síncrono no `index.html`).
6. Todos os componentes (Tabs, PrecosTab, StatusTab, StatusModal, StatusHistoryDrawer, SettingsModal, Toast) ficam legíveis nos dois temas — contraste WCAG AA mínimo.
7. Tanto a aba Preços quanto a aba Status têm cobertura idêntica nos dois modos (nenhum componente fica "esquecido" no escuro).
8. Emails permanecem dark (sem regressão).
9. Nenhuma mudança de comportamento funcional — só aparência.
10. Em Safari private mode (onde `localStorage` lança), a app cai no default `dark` sem crashar.
