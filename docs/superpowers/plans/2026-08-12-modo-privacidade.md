# Modo privacidade — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão no cabeçalho que oculta nomes de clientes do painel, permitindo capturas de tela publicáveis nas redes sociais.

**Architecture:** Um `PrivacyProvider` montado dentro do `AppShell` (depois dos `return` das rotas de exportação) governa um booleano e um mapa de pseudônimos. Ele liga a classe `privacy-on` na raiz do documento; uma regra CSS global borra tudo que tenha a classe `pii`. Onde o nome estrutura a tela, o componente lê o pseudônimo pelo hook. O padrão espelha o `useTheme`, que já existe e alterna a classe `dark` do mesmo jeito.

**Tech Stack:** React 19, Vite 6, Tailwind v4 (sintaxe `@custom-variant`), lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-12-modo-privacidade-design.md`

---

## Sobre testes neste plano

O `frontend` **não tem runner de teste** — os scripts do `package.json` são `dev`, `build` e `preview`. O `backend` tem `jest`, mas esta feature não toca no backend.

Montar Vitest para quatro pontos de exibição seria maior que a feature. Portanto **os passos de teste deste plano são verificações manuais no navegador**, com o resultado esperado escrito de forma checável. Onde a spec pede TDD, leia "escreva a verificação antes de implementar e confirme que ela falha".

Antes de começar, suba os dois servidores:

```bash
cd "E:/AG/Painel de voos monitorados/Painel de voos monitorados/backend" && npm run dev
```

```bash
cd "E:/AG/Painel de voos monitorados/Painel de voos monitorados/frontend" && npm run dev
```

**Atenção:** nesta máquina a porta 3000 costuma estar ocupada por servidores Vite antigos de outro projeto. Se o backend não subir, libere a porta ou exporte `PORT=3005` e ajuste o proxy do `vite.config.js` temporariamente — **sem commitar essa alteração**.

---

## Desvio da spec: `Private.jsx` não será criado

A §3 da spec lista um componente `Private.jsx`. O plano **o descarta**, por YAGNI.

Depois da correção da §4, a superfície ficou em quatro pontos: três precisam apenas de borrão, e borrão é uma classe CSS estática que pode ficar permanentemente no elemento — a regra `.privacy-on .pii` só age quando o modo está ligado, então não é preciso envolver componente nenhum. Sobra **um único** ponto com pseudônimo, no `StatusTab`, que resolve com duas linhas usando o hook direto.

Um componente com um consumidor só é indireção sem ganho. Se surgir um segundo ponto de pseudônimo, extrair vira trivial.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/contexts/PrivacyContext.jsx` | **criar** — provider: booleano, mapa de pseudônimos, classe na raiz |
| `frontend/src/hooks/usePrivacy.js` | **criar** — acesso ao contexto |
| `frontend/src/components/PrivacyToggle.jsx` | **criar** — botão do cabeçalho |
| `frontend/src/index.css` | **modificar** — regra `.privacy-on .pii` |
| `frontend/src/App.jsx` | **modificar** — montar provider e botão |
| `frontend/src/components/PrecosTab.jsx` | **modificar** — linha 370 |
| `frontend/src/components/StatusTab.jsx` | **modificar** — linha 267 |
| `frontend/src/components/PackagesTab.jsx` | **modificar** — linhas 198-199 |

---

### Task 1: Contexto e hook

**Files:**
- Create: `frontend/src/contexts/PrivacyContext.jsx`
- Create: `frontend/src/hooks/usePrivacy.js`

Sem efeito visível ainda. O objetivo é ter o estado disponível e a classe da raiz funcionando.

- [ ] **Step 1: Criar o contexto**

`frontend/src/contexts/PrivacyContext.jsx`:

```jsx
import { createContext, useState, useRef, useEffect, useCallback } from 'react';

// O default vale para qualquer árvore SEM provider — em particular as rotas de
// exportação (/voucher-preview/...), que retornam antes do provider no AppShell.
// É isso que garante que o voucher real do cliente nunca saia borrado.
export const PrivacyContext = createContext({
  enabled: false,
  toggle: () => {},
  pseudonym: (name) => name,
});

export function PrivacyProvider({ children }) {
  // Sem persistência: nasce desligado a cada carregamento (decisão da spec §1.3).
  const [enabled, setEnabled] = useState(false);

  // Mapa nome->apelido. Vive em ref para sobreviver a ligar/desligar sem
  // renumerar ninguém durante a sessão.
  const namesRef = useRef(new Map());

  useEffect(() => {
    const root = document.documentElement;
    if (enabled) root.classList.add('privacy-on');
    else root.classList.remove('privacy-on');
    return () => root.classList.remove('privacy-on');
  }, [enabled]);

  const toggle = useCallback(() => setEnabled(v => !v), []);

  const pseudonym = useCallback((name) => {
    const key = (name || '').trim();
    if (!key || key === '(sem cliente)') return 'Cliente sem nome';
    const map = namesRef.current;
    if (!map.has(key)) map.set(key, `Cliente ${map.size + 1}`);
    return map.get(key);
  }, []);

  return (
    <PrivacyContext.Provider value={{ enabled, toggle, pseudonym }}>
      {children}
    </PrivacyContext.Provider>
  );
}
```

- [ ] **Step 2: Criar o hook**

`frontend/src/hooks/usePrivacy.js`:

```js
import { useContext } from 'react';
import { PrivacyContext } from '../contexts/PrivacyContext';

export function usePrivacy() {
  return useContext(PrivacyContext);
}
```

- [ ] **Step 3: Verificar que o build não quebrou**

Run: `npm run build` no diretório `frontend`
Expected: build conclui sem erro. Os arquivos ainda não são importados por ninguém.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/contexts/PrivacyContext.jsx frontend/src/hooks/usePrivacy.js
git commit -m "feat(privacidade): contexto e hook do modo privacidade"
```

---

### Task 2: Regra CSS do borrão

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Escrever a verificação antes**

Com o app aberto no navegador, no console:

```js
document.documentElement.classList.add('privacy-on');
document.querySelector('main, body').insertAdjacentHTML('afterbegin', '<div class="pii">TESTE</div>');
```

Expected agora: o texto "TESTE" aparece **nítido** — a regra ainda não existe.

- [ ] **Step 2: Adicionar a regra**

Em `frontend/src/index.css`, após o bloco `.modal-animate` (fim do arquivo):

```css
/* Modo privacidade — borra dados de clientes para capturas de tela.
   Ligado pela classe .privacy-on na raiz, controlada pelo PrivacyProvider.
   user-select impede copiar o texto real, que continua no DOM. */
.privacy-on .pii {
  filter: blur(6px);
  user-select: none;
}
```

- [ ] **Step 3: Confirmar que a verificação passa**

Repita o script do Step 1 após o hot reload.
Expected: "TESTE" aparece **borrado** e não é selecionável com o mouse.

Limpe com `document.documentElement.classList.remove('privacy-on')`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(privacidade): regra CSS do borrao"
```

---

### Task 3: Botão do cabeçalho

**Files:**
- Create: `frontend/src/components/PrivacyToggle.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Criar o botão**

`frontend/src/components/PrivacyToggle.jsx`. As classes do estado inativo são copiadas do `ThemeToggle` para o cabeçalho ficar homogêneo; o estado ativo ganha destaque em índigo, para o modo ligado ser inconfundível.

```jsx
import { Eye, EyeOff } from 'lucide-react';
import { usePrivacy } from '../hooks/usePrivacy';

export default function PrivacyToggle() {
  const { enabled, toggle } = usePrivacy();
  const label = enabled ? 'Mostrar dados dos clientes' : 'Ocultar dados dos clientes';
  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={enabled}
      className={`p-2.5 rounded-lg transition-colors cursor-pointer border ${
        enabled
          ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
          : `bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200
             dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white dark:border-slate-700/50`
      }`}
    >
      {enabled ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
    </button>
  );
}
```

- [ ] **Step 2: Montar o provider e o botão**

Em `frontend/src/App.jsx`, adicione aos imports:

```jsx
import { PrivacyProvider } from './contexts/PrivacyContext';
import PrivacyToggle from './components/PrivacyToggle';
```

**A posição do provider é a invariante de segurança da spec §2.1.** Envolva o `return` final do `AppShell` — aquele que começa com `<div className="max-w-7xl ...">`. **Não** envolva o `AppShell` inteiro em `App`, e **não** coloque ao lado do `AuthProvider`: as rotas `/voucher-preview/...` retornam antes deste ponto e precisam continuar fora da árvore do provider.

```jsx
  return (
    <PrivacyProvider>
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* ...conteúdo existente, sem alteração... */}
      </div>
    </PrivacyProvider>
  );
```

E no cabeçalho, imediatamente antes do `<ThemeToggle ... />`:

```jsx
          <PrivacyToggle />
```

- [ ] **Step 3: Verificar**

Abra o painel. Expected:
- Um botão de olho aparece no cabeçalho, à esquerda do botão de tema
- Clicando, ele fica índigo e o ícone vira olho cortado; clicando de novo, volta
- No console, `document.documentElement.classList.contains('privacy-on')` acompanha o estado
- Nada na tela borra ainda — nenhum elemento tem `pii`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PrivacyToggle.jsx frontend/src/App.jsx
git commit -m "feat(privacidade): botao no cabecalho e montagem do provider"
```

---

### Task 4: Aba Preços — borrar o nome

**Files:**
- Modify: `frontend/src/components/PrecosTab.jsx:370`

- [ ] **Step 1: Verificar o estado atual**

Ligue o modo e olhe a lista de voos. Expected: nomes de clientes **legíveis**.

- [ ] **Step 2: Adicionar a classe**

Linha 370. Antes:

```jsx
                  <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">{flight.cliente}</div>
```

Depois:

```jsx
                  <div className="font-semibold text-slate-800 dark:text-slate-100 truncate pii">{flight.cliente}</div>
```

Não é preciso importar nada. A classe é estática e inerte enquanto o modo estiver desligado.

- [ ] **Step 3: Verificar**

Expected: com o modo ligado, todos os nomes na coluna Cliente ficam borrados; `pax`, ícones e badges de status seguem nítidos. Desligando, voltam ao normal.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PrecosTab.jsx
git commit -m "feat(privacidade): borra nome do cliente na aba Precos"
```

---

### Task 5: Aba Status — pseudônimo no cabeçalho do grupo

**Files:**
- Modify: `frontend/src/components/StatusTab.jsx:267`

Esta é a única troca por pseudônimo. **Só o texto renderizado muda.** A chave do `collapsedGroups`, o `key` do React e a ordenação `localeCompare` continuam usando `group.cliente` real (linhas 163-175 e 255-260) — trocar isso perderia o estado de recolhimento ao ligar o modo e faria a ordem alfabética dançar.

- [ ] **Step 1: Verificar o estado atual**

Na aba Status, recolha um grupo, ligue o modo. Expected: nome legível no cabeçalho.

- [ ] **Step 2: Ler o contexto no componente**

Junto aos outros hooks no topo de `StatusTab`, adicione o import e a chamada:

```jsx
import { usePrivacy } from '../hooks/usePrivacy';
```

```jsx
  const { enabled: privacyOn, pseudonym } = usePrivacy();
```

- [ ] **Step 3: Trocar apenas o texto exibido**

Linha 267. Antes:

```jsx
                        <span className="font-bold text-slate-900 dark:text-slate-100">{group.cliente}</span>
```

Depois:

```jsx
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {privacyOn ? pseudonym(group.cliente) : group.cliente}
                        </span>
```

- [ ] **Step 4: Verificar**

Expected, com o modo ligado:
- Cada grupo mostra `Cliente 1`, `Cliente 2`… em vez do nome
- O grupo que estava recolhido **continua recolhido**
- A ordem dos grupos não muda
- Clicar no cabeçalho ainda recolhe e expande
- Desligar e religar mantém o mesmo número para o mesmo cliente
- Um grupo sem nome aparece como `Cliente sem nome` e não consome número da sequência

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StatusTab.jsx
git commit -m "feat(privacidade): pseudonimo no agrupamento da aba Status"
```

---

### Task 6: Aba Pacotes — borrar titular e título

**Files:**
- Modify: `frontend/src/components/PackagesTab.jsx:198-199`

O `p.title` entra porque é derivado e embute sobrenome do cliente — o formato documentado na spec de pacotes é `"Pacote Gramado — Silva"`.

- [ ] **Step 1: Verificar o estado atual**

Ligue o modo na aba Pacotes. Expected: titular e título legíveis.

- [ ] **Step 2: Adicionar as classes**

Linhas 198-199. Antes:

```jsx
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.title || `Pacote #${p.id}`}</div>
                    <div className="text-[11px] text-slate-500">{p.holder} · {p.summary?.hotels || 0} hotel(s) · {p.summary?.addons || 0} adicional(is)</div>
```

Depois:

```jsx
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate pii">{p.title || `Pacote #${p.id}`}</div>
                    <div className="text-[11px] text-slate-500"><span className="pii">{p.holder}</span> · {p.summary?.hotels || 0} hotel(s) · {p.summary?.addons || 0} adicional(is)</div>
```

O `holder` ganha um `<span>` próprio para que a contagem de hotéis e adicionais, que não é PII, continue legível.

- [ ] **Step 3: Verificar**

Expected: título e titular borrados; as contagens de hotéis e adicionais nítidas.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PackagesTab.jsx
git commit -m "feat(privacidade): borra titular e titulo na aba Pacotes"
```

---

### Task 7: Verificação final

Nenhum arquivo muda. Percorra os seis casos da §6 da spec.

- [ ] **Caso 1 — cobertura:** modo ligado, nenhum nome legível em Preços, Status e Pacotes. Promoções e Vouchers seguem intactas (não exibem nome).
- [ ] **Caso 2 — agrupamento:** na aba Status, grupos legíveis, apelido próprio e estável por cliente.
- [ ] **Caso 3 — formulários:** com o modo ligado, abra "editar" em Preços e no Status. O campo Cliente traz o **nome real**, não borrado, não pseudônimo.
- [ ] **Caso 4 — exportação (o crítico):** com o modo ligado numa aba, abra `/voucher-preview/<id>?export=1` em outra. O voucher sai **sem** borrão. Repita em `/voucher-preview/pacote/<id>?export=1`.
- [ ] **Caso 5 — sem persistência:** ligue o modo, recarregue com F5. Volta desligado.
- [ ] **Caso 6 — temas:** repita o caso 1 no tema claro e no escuro.

O caso 4 é o que não pode falhar. Os outros degradam a experiência; esse produz um documento ilegível na mão do cliente.

- [ ] **Passo final: abrir o pull request**

```bash
git push origin feat/modo-privacidade
gh pr create --repo cvvcontato-dev/painel-voos-monitorados --base main --head feat/modo-privacidade --title "feat(privacidade): modo privacidade para capturas de tela"
```

Cuidado com a conta: o `git push` sai pela credencial embutida na URL do remote (`cvvcontato-dev`), mas o `gh pr create` usa a conta ativa do `gh`. Confira com `gh auth status` antes.
