# Otimização mobile — Etapa 1 (estrutura + Preços) — Plano de Implementação

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No celular (< 768 px), o painel passa a ter cabeçalho compacto, barra de navegação inferior com "Mais", janelas em tela cheia e a aba **Preços** em cartões — sem alterar o computador (≥ 768 px).

**Architecture:** Mesma base React/Tailwind. Componentes novos em `frontend/src/components/mobile/` (`BottomSheet`, `MobileNav`, `MobileMenu`) e `frontend/src/components/precos/FlightCard.jsx`. A tabela de Preços usa **estilo inline** (`gridStyle`) que não aceita breakpoint; por isso o cartão é escolhido por JS (`useIsMobile`, `matchMedia`) e renderiza **no lugar** da linha, reaproveitando os handlers e os valores já calculados em `PrecosTab`. O restante (barras, janelas, grades) usa classes `md:`.

**Tech Stack:** React 19, Vite, Tailwind v4 (dark por classe), lucide-react 1.16. **Não há runner de testes no frontend**: a verificação é por **script de auditoria** (medido antes/depois), `npm run build` e conferência no navegador em 360/375/390/430/768/1024/1280 px.

**Spec:** `docs/superpowers/specs/2026-10-26-otimizacao-mobile-design.md`

**Convenções:** textos em pt-BR; commits em pt-BR terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; **sem push** (a usuária autoriza cada envio); sem `git stash`. **Cuidado com barras invertidas** em regex ao editar via shell: use as ferramentas de edição de arquivo e releia o resultado. Ambiente de teste local: backend `PORT=3100` (modo stub) + Vite em `5180` com config temporária (ver "Ambiente de verificação" no fim); **não use a porta 3000** (é de outro projeto).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `frontend/scripts/mobile-audit.js` | Criar | Auditoria colável no console: rolagem horizontal, alvos de toque, texto/campos pequenos |
| `frontend/index.html` | Modificar | `viewport-fit=cover` |
| `frontend/src/index.css` | Modificar | Campos 16 px no celular, animação da folha, movimento reduzido |
| `frontend/src/hooks/useMediaQuery.js` | Criar | `useMediaQuery`, `useIsMobile` |
| `frontend/src/components/mobile/BottomSheet.jsx` | Criar | Folha inferior acessível + `SheetItem` |
| `frontend/src/components/mobile/MobileNav.jsx` | Criar | Barra inferior (4 abas + Mais) |
| `frontend/src/components/mobile/MobileMenu.jsx` | Criar | Menu do cabeçalho (privacidade, tema, configurações, senha, sair) |
| `frontend/src/App.jsx` | Modificar | Cabeçalho compacto, esconder abas do topo, `MobileNav`, espaçamentos |
| `frontend/src/components/Toast.jsx` | Modificar | Aviso acima da barra inferior |
| `frontend/src/components/SettingsModal.jsx`, `ChangePasswordModal.jsx` | Modificar | Tela cheia no celular |
| `frontend/src/components/precos/FlightCard.jsx` | Criar | Cartão do voo + folha de ações |
| `frontend/src/components/PrecosTab.jsx` | Modificar | Toolbar, indicadores, filtros, lista em cartões, modal em tela cheia |

---

## Task 0: Script de auditoria e linha de base (antes de mexer em qualquer tela)

**Files:**
- Create: `frontend/scripts/mobile-audit.js`

- [ ] **Step 1: Criar o script** (arquivo único, colável no console do navegador)

```js
// Auditoria mobile. Cole no console (ou rode via javascript_exec) com a aba que quer medir aberta.
// Retorna um relatório; compare ANTES e DEPOIS de cada etapa.
(() => {
  const W = window.innerWidth;
  const de = document.documentElement;
  const visivel = (e) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const emRolagemX = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const nome = (e) => {
    const t = (e.getAttribute('aria-label') || e.title || e.textContent || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    return `${e.tagName.toLowerCase()}${t ? ` "${t}"` : ''} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`;
  };
  const todos = [...document.querySelectorAll('body *')].filter(visivel);
  const estouram = todos.filter(e => getComputedStyle(e).position !== 'fixed' && !emRolagemX(e) && e.getBoundingClientRect().right > W + 1);
  const alvos = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary')]
    .filter(visivel).filter(e => !e.closest('[aria-hidden="true"]'));
  const pequenos36 = alvos.filter(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < 36; });
  const pequenos44 = alvos.filter(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < 44; });
  const textoMin = todos.filter(e => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 11);
  const campos16 = W < 768
    ? [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, textarea')]
        .filter(visivel).filter(e => parseFloat(getComputedStyle(e).fontSize) < 16)
    : [];
  return {
    largura: W,
    rolagemHorizontalPx: de.scrollWidth - de.clientWidth,
    estouram: estouram.slice(0, 6).map(nome),
    alvosMenor36: pequenos36.length, exemplosMenor36: pequenos36.slice(0, 6).map(nome),
    alvosMenor44: pequenos44.length,
    textoMenor11px: textoMin.length, exemplosTexto: textoMin.slice(0, 4).map(nome),
    camposMenor16px: campos16.length,
    alturaPagina: de.scrollHeight
  };
})();
```

- [ ] **Step 2: Subir o ambiente de verificação** (ver seção "Ambiente de verificação" no fim) com dados de exemplo (6 voos de preço, 6 de status, 4 vouchers, 1 caso de alteração).

- [ ] **Step 3: Medir a LINHA DE BASE no celular**: com viewport 375×812, para cada aba (Preços, Status, Promoções, Vouchers, Cartões de Embarque, Alterações, Pacotes) colar o script e salvar o resultado numa nota (ex.: `docs/superpowers/plans/_baseline-mobile.md`, **não commitar** — fica no scratchpad). **Esperado hoje:** Preços `rolagemHorizontalPx ≈ 240`, ~60 alvos < 36; Status ≈ 30; Promoções ≈ 28 px.

- [ ] **Step 4: Medir a LINHA DE BASE do computador (1280×900)**: para cada aba registrar `document.body.innerText.length` e as 60 primeiras palavras do `innerText` do conteúdo (`main`/container) — serve para provar "sem regressão" no fim.

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/mobile-audit.js
git commit -m "chore(mobile): script de auditoria de largura, alvos de toque e fontes"
```

---

## Task 1: Base global (viewport, CSS, hook)

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/hooks/useMediaQuery.js`

- [ ] **Step 1: `index.html`** — trocar a meta do viewport:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: `index.css`** — acrescentar no FIM do arquivo (fora de qualquer `@layer`, para ter prioridade sobre os utilitários):

```css
/* ── Mobile ─────────────────────────────────────────────────────────── */
html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }

/* iOS dá zoom ao focar campos com fonte < 16 px: no celular, todos os campos usam 16 px. */
@media (max-width: 767px) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]),
  select,
  textarea {
    font-size: 16px;
  }
}

@keyframes sheet-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.sheet-animate { animation: sheet-in 0.2s ease-out; }

@media (prefers-reduced-motion: reduce) {
  .sheet-animate, .modal-animate { animation: none; }
}
```

- [ ] **Step 3: `useMediaQuery.js`**

```js
import { useEffect, useState } from 'react';

/** true enquanto a media query casa; reage a mudanças (girar a tela, redimensionar). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Celular = abaixo do breakpoint `md` do Tailwind (768 px). */
export function useIsMobile() {
  return !useMediaQuery('(min-width: 768px)');
}
```

- [ ] **Step 4: Verificar** — `cd frontend && npm run build` (sem erros). No navegador, 375 px: campos de formulário medem 16 px (script: `camposMenor16px` → 0 na aba Preços ao abrir o modal "Novo Voo" — fazer depois da Task 5; aqui só confirmar o build).

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html frontend/src/index.css frontend/src/hooks/useMediaQuery.js
git commit -m "feat(mobile): base global (viewport-fit, campos de 16px, folha animada, hook useIsMobile)"
```

---

## Task 2: `BottomSheet` + `SheetItem`

**Files:**
- Create: `frontend/src/components/mobile/BottomSheet.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Folha que sobe da parte de baixo (só no celular: `md:hidden`).
 * Fecha com Esc, toque no fundo ou no X; trava a rolagem do fundo; devolve o foco ao fechar.
 */
export default function BottomSheet({ open, onClose, title, children }) {
  const closeBtn = useRef(null);
  const anterior = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;           // evita re-rodar o efeito (e roubar foco) a cada render do pai

  useEffect(() => {
    if (!open) return undefined;
    anterior.current = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (anterior.current && document.contains(anterior.current)) anterior.current.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/60" onClick={onClose} />
      <div className="sheet-animate absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t shadow-2xl
                      bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700
                      pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b
                        bg-white/95 border-slate-100 dark:bg-slate-900/95 dark:border-slate-800 backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</h2>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Fechar"
                  className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-2">{children}</div>
      </div>
    </div>
  );
}

/** Linha de ação da folha: ≥ 52 px de altura. Use `href` para link externo. */
export function SheetItem({ icon, label, onClick, href, danger = false, disabled = false, active = false, hint }) {
  const cls = `w-full min-h-[52px] flex items-center gap-3 px-3 rounded-xl text-left text-[15px] transition-colors
    ${danger ? 'text-red-600 dark:text-red-400 active:bg-red-50 dark:active:bg-red-500/10'
             : active ? 'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10'
             : 'text-slate-800 dark:text-slate-100 active:bg-slate-100 dark:active:bg-slate-800'}
    ${disabled ? 'opacity-40 pointer-events-none' : ''}`;
  const corpo = (
    <>
      <span className="shrink-0 w-6 flex justify-center">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{hint}</span>}
      </span>
    </>
  );
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>{corpo}</a>;
  }
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{corpo}</button>;
}
```

- [ ] **Step 2: Build** — `cd frontend && npm run build` (sem erros).
- [ ] **Step 3: Commit** — `git add frontend/src/components/mobile/BottomSheet.jsx && git commit -m "feat(mobile): folha inferior acessível (BottomSheet) e SheetItem"`

---

## Task 3: Navegação inferior, menu do cabeçalho e shell

**Files:**
- Create: `frontend/src/components/mobile/MobileNav.jsx`
- Create: `frontend/src/components/mobile/MobileMenu.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Toast.jsx`

- [ ] **Step 1: `MobileNav.jsx`**

```jsx
import { cloneElement, useEffect, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import BottomSheet, { SheetItem } from './BottomSheet';

// Abas sempre visíveis na barra; as demais ficam em "Mais".
const PRIMARY = ['precos', 'status', 'alteracoes', 'vouchers'];
const TIPOS_TEXTO = ['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color', 'reset', 'image'];
const ehCampoDeTexto = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !TIPOS_TEXTO.includes(el.type)));

export default function MobileNav({ tabs, active, onChange }) {
  const [maisAberto, setMaisAberto] = useState(false);
  const [digitando, setDigitando] = useState(false);

  // Com o teclado aberto a barra some, para não cobrir o campo que está sendo digitado.
  useEffect(() => {
    const dentro = (e) => setDigitando(ehCampoDeTexto(e.target));
    const fora = () => setDigitando(false);
    document.addEventListener('focusin', dentro);
    document.addEventListener('focusout', fora);
    return () => { document.removeEventListener('focusin', dentro); document.removeEventListener('focusout', fora); };
  }, []);

  const principais = PRIMARY.map(v => tabs.find(t => t.value === v)).filter(Boolean);
  const extras = tabs.filter(t => !PRIMARY.includes(t.value));
  const ativaEmMais = extras.find(t => t.value === active);

  const ir = (valor) => { onChange(valor); window.scrollTo({ top: 0 }); };
  const icone = (t) => cloneElement(t.icon, { className: 'w-5 h-5' });
  const btn = (ativo) => `w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors
    ${ativo ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`;

  if (digitando) return null;
  return (
    <>
      <nav aria-label="Navegação principal"
           className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur
                      bg-white/95 border-slate-200 dark:bg-slate-950/95 dark:border-slate-800
                      pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {principais.map(t => (
            <li key={t.value}>
              <button type="button" onClick={() => ir(t.value)} aria-current={active === t.value ? 'page' : undefined} className={btn(active === t.value)}>
                {icone(t)}
                <span className="truncate max-w-full px-1">{t.label}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMaisAberto(true)} aria-haspopup="dialog" aria-current={ativaEmMais ? 'page' : undefined} className={btn(!!ativaEmMais)}>
              {ativaEmMais ? icone(ativaEmMais) : <Ellipsis className="w-5 h-5" />}
              <span className="truncate max-w-full px-1">{ativaEmMais ? ativaEmMais.label.split(' ')[0] : 'Mais'}</span>
            </button>
          </li>
        </ul>
      </nav>

      <BottomSheet open={maisAberto} onClose={() => setMaisAberto(false)} title="Mais">
        {extras.map(t => (
          <SheetItem key={t.value} icon={icone(t)} label={t.label} active={t.value === active}
                     onClick={() => { setMaisAberto(false); ir(t.value); }} />
        ))}
      </BottomSheet>
    </>
  );
}
```

- [ ] **Step 2: `MobileMenu.jsx`** (botão do cabeçalho + folha)

```jsx
import { useState } from 'react';
import { Eye, EyeOff, Sun, Moon, Settings, KeyRound, LogOut } from 'lucide-react';
import BottomSheet, { SheetItem } from './BottomSheet';
import ChangePasswordModal from '../ChangePasswordModal';
import { usePrivacy } from '../../hooks/usePrivacy';
import { logout } from '../../api/authClient';

const iniciais = (nome) => nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

/** Menu do cabeçalho no celular: reúne privacidade, tema, configurações, senha e sair. */
export default function MobileMenu({ user, theme, onToggleTheme, onOpenSettings, onToast }) {
  const [aberto, setAberto] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const { enabled, toggle } = usePrivacy();
  const escuro = theme === 'dark';

  async function sair() {
    try { await logout(); } finally { window.location.reload(); }
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-haspopup="dialog" aria-label="Abrir menu"
              className="w-11 h-11 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">
        {iniciais(user.nome)}
      </button>

      <BottomSheet open={aberto} onClose={() => setAberto(false)} title={user.nome.split(' ')[0]}>
        <div className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</div>
        <SheetItem icon={enabled ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                   label={enabled ? 'Mostrar dados dos clientes' : 'Ocultar dados dos clientes'}
                   hint={enabled ? 'Modo privacidade ligado' : 'Modo privacidade desligado'} active={enabled}
                   onClick={() => { toggle(); setAberto(false); }} />
        <SheetItem icon={escuro ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                   label={escuro ? 'Tema claro' : 'Tema escuro'}
                   onClick={() => { onToggleTheme(); setAberto(false); }} />
        <SheetItem icon={<Settings className="w-5 h-5" />} label="Configurações"
                   onClick={() => { setAberto(false); onOpenSettings(); }} />
        <SheetItem icon={<KeyRound className="w-5 h-5" />} label="Trocar senha"
                   onClick={() => { setAberto(false); setSenhaAberta(true); }} />
        <SheetItem icon={<LogOut className="w-5 h-5" />} label="Sair" danger onClick={sair} />
      </BottomSheet>

      <ChangePasswordModal isOpen={senhaAberta} onClose={() => setSenhaAberta(false)} onToast={onToast} />
    </>
  );
}
```

- [ ] **Step 3: `App.jsx`** — importar e montar. Alterações exatas:

  1. Imports (junto dos demais): 
  ```jsx
  import MobileNav from './components/mobile/MobileNav';
  import MobileMenu from './components/mobile/MobileMenu';
  ```
  2. Container externo: trocar `className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8"` por
  ```jsx
  <div className="max-w-7xl mx-auto px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 lg:p-8">
  ```
  3. Antes do `<header>` atual, inserir o cabeçalho do celular:
  ```jsx
  <header className="md:hidden flex items-center justify-between gap-3 mb-3 min-h-[44px]">
    <div className="flex items-center gap-2.5 min-w-0">
      <img src={logo} alt="Clube do Voo" className="w-10 h-10 rounded-full object-cover border-2 border-indigo-500/30 shrink-0" />
      <h1 className="text-lg font-bold truncate text-slate-900 dark:text-white">Clube do Voo</h1>
    </div>
    <MobileMenu user={currentUser} theme={theme} onToggleTheme={toggleTheme} onOpenSettings={() => setSettingsOpen(true)} onToast={showToast} />
  </header>
  ```
  4. No `<header>` existente (desktop), trocar `className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4"` por `className="hidden md:flex flex-row justify-between items-center mb-6 gap-4"`.
  5. Envolver as abas do topo: trocar `<Tabs active={activeTab} onChange={setActiveTab} tabs={TABS} />` por
  ```jsx
  <div className="hidden md:block"><Tabs active={activeTab} onChange={setActiveTab} tabs={TABS} /></div>
  ```
  6. Logo depois do `{toast && <Toast .../>}` (ainda dentro do `PrivacyProvider`), acrescentar:
  ```jsx
  <MobileNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
  ```

- [ ] **Step 4: `Toast.jsx`** — trocar a primeira linha do `className` do `div` raiz: de `fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 ...` para
```jsx
<div className={`fixed z-[100] left-3 right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:left-auto md:right-6 md:bottom-6 flex items-center justify-between md:justify-start gap-3 px-4 md:px-5 py-3 rounded-xl border backdrop-blur-xl shadow-2xl ${colors[type]} modal-animate`}>
```
(manter o restante do componente) e aumentar o botão de fechar: `className="hover:opacity-70 cursor-pointer p-2 -m-2"`.

- [ ] **Step 5: Verificar no navegador (375 e 1280 px)** — no celular: cabeçalho de uma linha (~56 px) com logo, "Clube do Voo" e avatar; barra inferior com 5 itens; "Mais" abre Promoções/Cartões/Pacotes; ao escolher "Promoções" o botão "Mais" passa a mostrar "Promoções" destacado; abas do topo e cabeçalho grande não aparecem. No computador (1280): **nada mudou** (cabeçalho e abas no topo; sem barra inferior). `npm run build`.
- [ ] **Step 6: Commit** — `git add frontend/src/components/mobile frontend/src/App.jsx frontend/src/components/Toast.jsx && git commit -m "feat(mobile): cabeçalho compacto, barra inferior com Mais, menu do usuário em folha"`

---

## Task 4: Janelas em tela cheia (Configurações e Trocar senha)

**Files:**
- Modify: `frontend/src/components/SettingsModal.jsx` (linhas ~70-72)
- Modify: `frontend/src/components/ChangePasswordModal.jsx` (linhas ~65-66)

- [ ] **Step 1: `SettingsModal.jsx`**
  - Raiz: `fixed inset-0 z-50 flex items-center justify-center p-4` → `fixed inset-0 z-50 flex md:items-center md:justify-center md:p-4`
  - Painel: `relative w-full max-w-lg ... rounded-2xl overflow-hidden modal-animate max-h-[90vh] overflow-y-auto` → `relative w-full md:max-w-lg ... md:rounded-2xl overflow-hidden modal-animate h-[100dvh] md:h-auto md:max-h-[90vh] overflow-y-auto` (manter as classes de cor/borda/sombra existentes).
  - Cabeçalho do painel (título + X): torná-lo `sticky top-0 z-10` com o mesmo fundo do painel (`bg-white dark:bg-slate-900`) e o botão de fechar com `w-11 h-11 flex items-center justify-center`.
  - Abas internas ("Geral", "Usuários", "Backups"): garantir `min-h-[44px]` e que o contêiner delas tenha `overflow-x-auto` (podem rolar no celular).
  - Rodapé com botões: no celular, botões em largura total (`flex-1 md:flex-none min-h-[44px]`).

- [ ] **Step 2: `ChangePasswordModal.jsx`**
  - Raiz: `fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4` → `fixed inset-0 z-50 flex md:items-center md:justify-center bg-slate-950/80 md:px-4`
  - Painel: `bg-white ... rounded-2xl p-6 w-full max-w-sm shadow-2xl` → `bg-white ... md:rounded-2xl p-4 md:p-6 w-full md:max-w-sm h-[100dvh] md:h-auto overflow-y-auto shadow-2xl`
  - Botões do formulário: `min-h-[44px]`; no celular `flex-1`.

- [ ] **Step 3: Verificar (375 px)** — abrir "Configurações" e "Trocar senha" pelo menu do avatar: ocupam a tela inteira, rolam por dentro, fecham no X (≥ 44 px) e com o botão voltar do navegador não saem do sistema (se sair, registrar como risco para a Etapa 3: `history.pushState`). No computador (1280): janelas centralizadas como antes.
- [ ] **Step 4: Commit** — `git commit -am "feat(mobile): Configurações e Trocar senha em tela cheia no celular"`

---

## Task 5: Aba Preços em cartões

**Files:**
- Create: `frontend/src/components/precos/FlightCard.jsx`
- Modify: `frontend/src/components/PrecosTab.jsx`

- [ ] **Step 1: Criar `FlightCard.jsx`**

```jsx
import { useState } from 'react';
import {
  EllipsisVertical, CheckCircle2, Circle, Users, Mail, MessageSquare, TrendingDown, Clock,
  AlertTriangle, PiggyBank, LineChart as LineChartIcon, RefreshCw, ExternalLink, Bell,
  ShoppingBag, XCircle, Edit2, Trash2, ArrowUp, ArrowDown
} from 'lucide-react';
import BottomSheet, { SheetItem } from '../mobile/BottomSheet';

/**
 * Cartão de voo (celular). Recebe tudo já calculado por PrecosTab para NÃO duplicar regra de negócio:
 *  - d: valores derivados (hasPrice, isAlert, isBought, isClosed, chartOpen, falhas, desatualizado,
 *       diasSemCheck, statusStyle, priorityCls, economia, timeAgoText, ultimoErro, ultimaFalhaTexto)
 *  - busy: { checking, anyChecking, testing }
 *  - on: ações { toggleChart, toggleCheck, checkNow, testNotification, setStatus, edit, remove }
 *  - move: { up, down } ou null (só na ordenação manual sem filtro)
 *  - chart: nó do gráfico (já montado) quando aberto
 */
export default function FlightCard({ flight, d, fmt, busy, on, move, chart }) {
  const [sheet, setSheet] = useState(false);
  const fechar = () => setSheet(false);
  const rodar = (fn) => () => { fechar(); fn(); };

  const barra = d.isBought ? 'bg-emerald-400 dark:bg-emerald-500'
    : d.isClosed ? 'bg-slate-300 dark:bg-slate-600'
    : d.hasPrice ? (d.isAlert ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-amber-400 dark:bg-amber-500') : 'bg-transparent';
  const casca = d.isBought ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/60 dark:border-emerald-700/30'
    : d.isClosed ? 'bg-slate-50/80 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-700/30 opacity-70'
    : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/50';
  const rotulo = 'text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500';

  return (
    <article className={`relative border rounded-xl overflow-hidden ${casca}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${barra}`} />
      <div className="pl-4 pr-1 pt-1.5 pb-3">
        <div className="flex items-start gap-1">
          <button type="button" onClick={on.toggleChart} aria-expanded={d.chartOpen}
                  aria-label={`${d.chartOpen ? 'Ocultar' : 'Ver'} histórico de preços de ${flight.cliente}`}
                  className="flex-1 min-w-0 min-h-[44px] pt-1.5 text-left">
            <div className="font-semibold text-slate-800 dark:text-slate-100 truncate pii">{flight.cliente}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-xs text-slate-500 dark:text-slate-400">
              <span>{flight.mes_viagem}</span>
              <span aria-hidden="true">·</span>
              <Users className="w-3 h-3 shrink-0" />
              <span>{flight.quantidade_pax || 1} pax</span>
              {flight.email_cliente && <Mail className="w-3 h-3 shrink-0" aria-label="Tem e-mail" />}
              {flight.telegram_chat_id && <MessageSquare className="w-3 h-3 shrink-0" aria-label="Tem Telegram" />}
            </div>
          </button>
          <button type="button" onClick={on.toggleCheck} aria-pressed={!!flight.check_diario}
                  aria-label={flight.check_diario ? 'Desmarcar check diário' : 'Marcar check diário'}
                  className={`w-11 h-11 flex items-center justify-center rounded-full shrink-0 ${flight.check_diario ? 'text-indigo-500 bg-indigo-500/10' : 'text-slate-300 dark:text-slate-600'}`}>
            {flight.check_diario ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
          </button>
          <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label={`Ações do voo de ${flight.cliente}`}
                  className="w-11 h-11 flex items-center justify-center rounded-lg shrink-0 text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700/50">
            <EllipsisVertical className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1 pr-2">
          <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${d.priorityCls}`}>{flight.prioridade}</span>
          {d.statusStyle && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded border ${d.statusStyle.cls}`}>
              {d.statusStyle.icon} {d.statusStyle.label}
            </span>
          )}
          {d.isBought && d.economia != null && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${d.economia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <PiggyBank className="w-3 h-3 shrink-0" />
              {d.economia >= 0 ? `economia ${fmt(d.economia)}` : `${fmt(Math.abs(d.economia))} acima do alvo`}
            </span>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3 pr-2">
          <div>
            <div className={rotulo}>Alvo</div>
            <div className="font-mono text-sm font-medium text-slate-600 dark:text-slate-300">{fmt(flight.preco_esperado)}</div>
          </div>
          <div className="min-w-0">
            <div className={rotulo}>Atual</div>
            {d.hasPrice ? (
              <>
                <div className={`font-mono text-base font-bold ${d.isAlert ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>{fmt(flight.preco_atual)}</div>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  {d.isAlert ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25 px-2 py-0.5 rounded-md"><TrendingDown className="w-3 h-3" /> ALERTA</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25 px-2 py-0.5 rounded-md"><Clock className="w-3 h-3" /> AGUARDAR</span>
                  )}
                  {d.timeAgoText && <span className="text-[11px] text-slate-400 dark:text-slate-500">{d.timeAgoText}</span>}
                </div>
              </>
            ) : <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>}
          </div>
        </div>

        {flight.status === 'ativo' && d.falhas > 0 && (
          <div className="flex items-start gap-1 text-xs font-semibold text-red-600 dark:text-red-400 mt-2 pr-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{d.falhas} {d.falhas === 1 ? 'falha seguida' : 'falhas seguidas'}{d.ultimoErro ? ` — ${d.ultimoErro}` : ''}{d.ultimaFalhaTexto ? ` (${d.ultimaFalhaTexto})` : ''}</span>
          </div>
        )}
        {d.desatualizado && (
          <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> desatualizado (sem verificação há {d.diasSemCheck} dias)
          </div>
        )}
      </div>

      {d.chartOpen && (
        <div className="border-t border-slate-200/80 dark:border-slate-700/50 bg-slate-50/60 dark:bg-slate-900/30 px-3 py-3">
          <div className="flex items-center gap-2 mb-2">
            <LineChartIcon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Histórico — últimos 60 dias</span>
          </div>
          {chart}
        </div>
      )}

      <BottomSheet open={sheet} onClose={fechar} title={flight.cliente}>
        <SheetItem icon={<RefreshCw className={`w-5 h-5 ${busy.checking ? 'animate-spin' : ''}`} />} label="Verificar preço agora"
                   disabled={busy.anyChecking} onClick={rodar(on.checkNow)} />
        <SheetItem icon={<LineChartIcon className="w-5 h-5" />} label={d.chartOpen ? 'Ocultar histórico de preços' : 'Ver histórico de preços (60 dias)'} onClick={rodar(on.toggleChart)} />
        <SheetItem icon={<ExternalLink className="w-5 h-5" />} label="Abrir no Google Voos" href={flight.link_voo} onClick={fechar} />
        <SheetItem icon={<Bell className={`w-5 h-5 ${busy.testing ? 'animate-pulse' : ''}`} />} label="Enviar notificação de teste" hint="E-mail e Telegram"
                   disabled={busy.testing} onClick={rodar(on.testNotification)} />
        {flight.status !== 'passagem comprada' && <SheetItem icon={<ShoppingBag className="w-5 h-5" />} label="Marcar como passagem comprada" onClick={rodar(() => on.setStatus('passagem comprada'))} />}
        {flight.status !== 'encerrado' && <SheetItem icon={<XCircle className="w-5 h-5" />} label="Marcar como desistência" onClick={rodar(() => on.setStatus('encerrado'))} />}
        {(flight.status === 'passagem comprada' || flight.status === 'encerrado') && <SheetItem icon={<RefreshCw className="w-5 h-5" />} label="Reativar monitoramento" onClick={rodar(() => on.setStatus('ativo'))} />}
        <SheetItem icon={<Edit2 className="w-5 h-5" />} label="Editar" onClick={rodar(on.edit)} />
        {move && <SheetItem icon={<ArrowUp className="w-5 h-5" />} label="Mover para cima" disabled={!move.up} onClick={rodar(move.up || (() => {}))} />}
        {move && <SheetItem icon={<ArrowDown className="w-5 h-5" />} label="Mover para baixo" disabled={!move.down} onClick={rodar(move.down || (() => {}))} />}
        <SheetItem icon={<Trash2 className="w-5 h-5" />} label="Excluir" danger onClick={rodar(on.remove)} />
      </BottomSheet>
    </article>
  );
}
```

- [ ] **Step 2: `PrecosTab.jsx` — imports e estado**
  - No topo: `import { useIsMobile } from '../hooks/useMediaQuery';` e `import FlightCard from './precos/FlightCard';`
  - Dentro de `PrecosTab`, junto dos outros `useState`: `const isMobile = useIsMobile();`
  - Acrescentar a função (perto de `handleDragEnd`):

```jsx
  // Reordenar no celular (arrastar não funciona com o dedo): sobe/desce uma posição na ordenação manual.
  const moveFlight = async (index, dir) => {
    const j = index + dir;
    if (!dragEnabled || j < 0 || j >= sortedFlights.length) return;
    const n = [...sortedFlights];
    [n[index], n[j]] = [n[j], n[index]];
    setFlights(n);
    try { await api.put(`${API_URL}/reorder`, { ids: n.map(f => f.id) }); }
    catch (e) { console.error(e); fetchFlights(); }
  };
```

- [ ] **Step 3: Toolbar** — `<div className="flex justify-end gap-3 flex-wrap mb-4">` → `<div className="grid grid-cols-2 gap-2 md:flex md:justify-end md:gap-3 md:flex-wrap mb-4">`; nos dois botões acrescentar `justify-center min-h-[44px]` às classes existentes.

- [ ] **Step 4: Indicadores (6 tiles)** — container `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6` → `grid grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-4 md:mb-6`. Em cada um dos 6 tiles (`<div className="bg-white/80 border ... p-4 rounded-xl flex items-center gap-3">`):
  - `p-4` → `p-2.5 md:p-4`; `flex items-center gap-3` → `flex flex-col items-start md:flex-row md:items-center gap-1 md:gap-3`
  - caixa do ícone (`<div className="... p-2.5 rounded-lg ... shrink-0">`) → acrescentar `hidden md:block`
  - O tile "Ordenar por" recebe também `col-span-3 lg:col-span-1`; o `<select>` dele ganha `min-h-[44px] md:min-h-0`.
  - Valor/legenda: manter `text-lg font-bold` e `text-xs`.

- [ ] **Step 5: Filtro de prioridade** — contêiner `flex items-center gap-2 mb-3 flex-wrap` → `flex items-center gap-2 mb-3 overflow-x-auto md:overflow-visible md:flex-wrap -mx-3 px-3 md:mx-0 md:px-0 pb-1`. O rótulo "Prioridade" ganha `shrink-0`. Chips (botões de prioridade e "Limpar"): `px-2.5 py-1 text-[11px]` → `shrink-0 whitespace-nowrap px-3 py-2 md:px-2.5 md:py-1 text-xs md:text-[11px] min-h-[40px] md:min-h-0`. Logo abaixo do filtro, acrescentar o atalho dos checks (só celular):

```jsx
      <div className="md:hidden mb-3">
        <button onClick={toggleAllChecks} disabled={flights.length === 0}
                className="w-full min-h-[44px] text-sm font-medium rounded-lg border border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-300 disabled:opacity-50">
          {allChecked ? 'Desmarcar todos os checks' : 'Marcar todos os checks'}
        </button>
      </div>
```

- [ ] **Step 6: Cabeçalho de colunas só no computador** — envolver o bloco `{/* Column Headers */} <div style={gridStyle} className="px-4 py-2"> … </div>` em `{!isMobile && ( … )}` (o estilo inline força `display:grid`, então classe `hidden` não funcionaria).

- [ ] **Step 7: Lista em cartões** — dentro do `sortedFlights.map((flight, index) => { … })`, logo depois das constantes (`desatualizado` etc.) e **antes** do `return (` da linha, inserir:

```jsx
          if (isMobile) {
            return (
              <FlightCard
                key={flight.id}
                flight={flight}
                fmt={fmt}
                d={{
                  hasPrice, isAlert, isBought, isClosed, chartOpen, falhas, desatualizado, diasSemCheck, statusStyle,
                  priorityCls: getPriorityColor(flight.prioridade),
                  economia: isBought ? economiaDoVoo(flight) : null,
                  timeAgoText: flight.ultima_verificacao ? timeAgo(flight.ultima_verificacao) : null,
                  ultimoErro: flight.ultimo_erro || '',
                  ultimaFalhaTexto: flight.ultima_falha ? `última tentativa ${tempoAtras(flight.ultima_falha)}` : ''
                }}
                busy={{
                  checking: checkingId === flight.id,
                  anyChecking: checkingId !== null || startingAll || !!priceJob?.running,
                  testing: testingNotifId === flight.id
                }}
                on={{
                  toggleChart: () => toggleChart(flight.id),
                  toggleCheck: () => toggleCheck(flight),
                  checkNow: () => checkNow(flight.id),
                  testNotification: () => testNotification(flight.id),
                  setStatus: (s) => setStatus(flight, s),
                  edit: () => openModal(flight),
                  remove: () => deleteFlight(flight.id)
                }}
                move={dragEnabled ? {
                  up: index > 0 ? () => moveFlight(index, -1) : null,
                  down: index < sortedFlights.length - 1 ? () => moveFlight(index, 1) : null
                } : null}
                chart={chartOpen ? (
                  <PriceHistoryChart
                    data={historyData[flight.id]}
                    targetPrice={flight.preco_esperado}
                    loading={historyState[flight.id] === 'loading'}
                    error={typeof historyState[flight.id] === 'string' && historyState[flight.id].startsWith('error:') ? historyState[flight.id].slice(6) : null}
                  />
                ) : null}
              />
            );
          }
```

  Observação: `economiaDoVoo` devolve `null` quando não há preço de compra (confira a função na linha ~339) — o cartão já trata `d.economia != null`.

- [ ] **Step 8: Modal de voo em tela cheia no celular** (`{isModalOpen && ( … )}`):
  - Raiz: `fixed inset-0 z-50 flex items-center justify-center p-4` → `fixed inset-0 z-50 flex md:items-center md:justify-center md:p-4`
  - Painel: `relative w-full max-w-lg ... rounded-2xl overflow-hidden modal-animate max-h-[90vh] overflow-y-auto` → `relative w-full md:max-w-lg ... md:rounded-2xl overflow-hidden modal-animate h-[100dvh] md:h-auto md:max-h-[90vh] overflow-y-auto`
  - Cabeçalho (`flex justify-between items-center p-6 border-b ...`) → `sticky top-0 z-10 bg-white dark:bg-slate-900 flex justify-between items-center p-4 md:p-6 border-b ...`; botão X → `w-11 h-11 -mr-2 flex items-center justify-center ...`
  - `<form ... className="p-6 space-y-4">` → `p-4 md:p-6 space-y-4`
  - Grade E-mail/Telegram `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`
  - `inputCls` (`py-2.5`) → `py-3 md:py-2.5` (altura ≥ 44 px no celular)
  - `<input type="number" step="0.01" ... preco_esperado>` acrescentar `inputMode="decimal"`
  - Rodapé de botões: `pt-4 flex justify-end gap-3 border-t ... mt-6` → `sticky bottom-0 -mx-4 px-4 md:mx-0 md:px-0 py-3 md:pt-4 md:pb-0 flex gap-3 md:justify-end border-t bg-white dark:bg-slate-900 mt-6`; botões `flex-1 md:flex-none min-h-[44px]`.

- [ ] **Step 9: Build** — `cd frontend && npm run build` (sem erros).

- [ ] **Step 10: Verificação no navegador (375 e 1280 px)**
  - 375 px, aba Preços: indicadores em 3 colunas (5 tiles + "Ordenar por" em linha própria); chips de prioridade rolam para o lado dentro da faixa; **cada voo é um cartão**; tocar no cartão abre o gráfico de 60 dias sem estourar a largura; "⋯" abre a folha de ações; "Verificar preço agora", "Marcar como passagem comprada", "Marcar como desistência", "Editar" (abre tela cheia), "Excluir" (confirma) funcionam; ordenação **Manual** mostra "Mover para cima/baixo"; comprados/desistências continuam embaixo.
  - 1280 px: **idêntico ao baseline** (tabela com colunas, cabeçalho de colunas, ações ao passar o mouse, arrastar).
  - 768 e 1024 px: layout de computador sem quebra.

- [ ] **Step 11: Commit** — `git add frontend/src/components/precos frontend/src/components/PrecosTab.jsx && git commit -m "feat(mobile): aba Preços em cartões, indicadores compactos, filtros roláveis e modal em tela cheia"`

---

## Task 6: Auditoria final e relatório da etapa

- [ ] **Step 1: Repetir a auditoria** em 360, 375, 390 e 430 px para **todas as abas** (colar `mobile-audit.js`). **Critérios da Etapa 1** (as abas Status, Promoções, Vouchers, Cartões, Pacotes e Alterações só ganham a base global/cabeçalho/barra — o resto vem nas Etapas 2 e 3):
  - **Preços:** `rolagemHorizontalPx = 0` (era ≈ 240); `alvosMenor36 = 0`; `textoMenor11px = 0`; `camposMenor16px = 0` (inclusive com o modal "Novo Voo" aberto).
  - **Demais abas:** `rolagemHorizontalPx` **não pior** que a linha de base; a barra inferior e o cabeçalho sem estouro; alvos < 36 apenas nos itens que as Etapas 2/3 tratarão (registrar a lista).
  - **Navegação:** o conteúdo final de cada aba **não fica atrás** da barra inferior (rolar até o fim e conferir o último elemento acima da barra); o aviso (toast) aparece acima da barra.
- [ ] **Step 2: Regressão no computador (1280 e 1024 px)** — repetir a coleta do Task 0/Step 4 e comparar com a linha de base (mesmos textos; cabeçalho e abas no topo; sem barra inferior).
- [ ] **Step 3: Temas e privacidade** — repetir no celular em tema escuro e claro, e com o modo privacidade ligado (nomes dos clientes borrados nos cartões, classe `pii`).
- [ ] **Step 4: Fluxos reais no celular emulado** — marcar comprado/desistência, "Atualizar todos" (progresso visível), cadastrar um voo novo (modal em tela cheia, teclado numérico no preço), reordenar no modo Manual, abrir "Mais → Alterações", trocar tema pelo menu, abrir Configurações.
- [ ] **Step 5: Suíte do backend** (inalterada): `cd backend && npx jest --runInBand` → só as 19 falhas pré-existentes de `auth`/`users` (confira antes se há `jest` órfão).
- [ ] **Step 6: Relatório** — listar: números antes/depois por aba; o que **não** foi testado localmente (barra de gestos do iPhone, teclado real, toque real) — a usuária confirma no aparelho depois do deploy; riscos abertos (botão "voltar" do celular nas janelas em tela cheia).
- [ ] **Step 7: NÃO enviar ao GitHub.** Perguntar à usuária ("Posso dar o push direto na main?").

---

## Ambiente de verificação (referência)

1. Backend de teste (modo stub, banco temporário fora do repositório), a partir de `backend/`:
   `DB_PATH=<scratchpad>/e2e-data PORT=3100 PUBLIC_BASE_URL=http://localhost:3100 SESSION_SECRET=e2e-secret-not-for-prod ADMIN_EMAIL=admin@test.com ADMIN_PASSWORD='AdminPass123!' EXTRACTION_MODE=stub AVIATION_API_MODE=stub NODE_ENV=development BACKUP_ENABLED=0 node server.js`
2. Vite com config temporária (porta 5180, proxy `/api` e `/itinerario` → 3100) em `<scratchpad>/vite.e2e.config.mjs`, iniciado de `frontend/` com `node node_modules/vite/bin/vite.js --config <scratchpad>/vite.e2e.config.mjs`.
3. Login de teste (`admin@test.com` / senha acima — só local) e **dados de exemplo** via `fetch` no navegador: 6 voos (`POST /api/flights`), 6 voos de status (`POST /api/monitored-flights`), 4 vouchers (upload stub) e 1 caso de alteração.
4. Viewport: `resize_window` com `mobile` (375×812) ou largura/altura customizadas; **voltar para `desktop` ao terminar**. Encerrar **somente** os processos nas portas 3100/5180 ao final.
