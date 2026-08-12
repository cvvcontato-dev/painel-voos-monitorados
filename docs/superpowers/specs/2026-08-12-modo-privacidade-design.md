# Design — Modo privacidade (ocultar dados de clientes para divulgação)

> Spec de design para o botão que oculta dados identificáveis do painel, permitindo capturas de tela para redes sociais.
> Data: 2026-08-12. Branch: `feat/modo-privacidade` (criada a partir de `main`).

---

## 1. Problema & objetivo

O operador quer mostrar o painel nas redes sociais da agência. Hoje qualquer captura de tela expõe nome, contato e localizador de reserva dos clientes reais — não há como divulgar a ferramenta sem quebrar sigilo. Editar as imagens depois é trabalhoso e falha por esquecimento: basta uma linha não borrada.

**Objetivo:** um botão no cabeçalho que, ligado, torna a tela inteira publicável, sem alterar dado nenhum e sem risco de contaminar documentos enviados a clientes.

### Decisões travadas no brainstorming

1. **Escopo do que se oculta:** tudo que identifica — nome do cliente, contatos, nomes de passageiros nos vouchers e localizadores de reserva.
2. **Mecanismo híbrido:** borrão CSS onde o dado é folha, pseudônimo estável onde o nome estrutura a tela (agrupamento da aba Status).
3. **Sem persistência:** o estado nasce desligado a cada carregamento. Não vai para `localStorage`.
4. **Apresentação apenas:** a máscara nunca entra em `input`, payload de API ou exportação.
5. **Fora de escopo:** o campo "Passageiros" da aba Promoções é `type="number"`, uma contagem — não é dado pessoal e não recebe tratamento.

---

## 2. As duas fronteiras de segurança

Estas são as invariantes da feature. Tudo o mais é detalhe de apresentação.

### 2.1 Rotas de exportação nunca são alcançadas

O `PrivacyProvider` é montado **dentro** do `AppShell`, depois dos `return` antecipados que tratam `/voucher-preview/:id` e `/voucher-preview/pacote/:id` — **não** em volta do `AppShell`, e **não** ao lado do `AuthProvider` em `App`.

Quando o Playwright renderiza `/voucher-preview/123?export=1` para gerar o PDF real do cliente, não existe provider na árvore. O `usePrivacy()` cai no valor default do contexto (`enabled: false`) e o voucher sai limpo.

A garantia é estrutural: não depende de passar uma flag correta nem de lembrar de uma exceção. Um voucher borrado enviado ao passageiro seria uma falha pior do que a que a feature previne, então a fronteira é posicional, não condicional.

### 2.2 Formulários mostram sempre o valor real

Nenhum `input`, `select` ou `textarea` é mascarado, mesmo com o modo ligado. Vale para o formulário da `PrecosTab`, o `StatusModal` e os campos de passageiro e localizador da `VouchersTab`.

Motivo: os mesmos objetos que alimentam a listagem alimentam os formulários de edição. Mascarar no nível do dado faria o operador abrir "editar" sobre um pseudônimo e gravar `Cliente 3` por cima do nome real. Foi por isso que a abordagem de mascarar na camada de dados foi descartada no brainstorming.

---

## 3. Arquitetura

| Peça | Responsabilidade |
|---|---|
| `contexts/PrivacyContext.jsx` | Provider: estado booleano + `Map` nome→pseudônimo. Aplica a classe `privacy-on` na raiz. |
| `hooks/usePrivacy.js` | Expõe `{ enabled, toggle, pseudonym }` |
| `components/PrivacyToggle.jsx` | Botão do cabeçalho, ao lado do `ThemeToggle`. Ícones `Eye` / `EyeOff` (lucide-react, já é dependência). |
| `components/Private.jsx` | Envolve um dado sensível e escolhe entre real, borrão ou pseudônimo |
| `index.css` | `.privacy-on .pii { filter: blur(6px); user-select: none; }` |

O padrão espelha o do tema, que já existe e funciona: `useTheme` alterna a classe `dark` na raiz e o CSS resolve o resto. Aqui a classe é `privacy-on`.

**Dois níveis de uso, por custo:**

- Onde basta borrar, adicionar `className="pii"` ao elemento. Não requer envolver componente nem importar nada.
- Onde o nome estrutura a tela, usar `<Private pseudonym>{nome}</Private>`, que substitui o texto.

### Contrato do `<Private>`

```jsx
<Private>{flight.cliente}</Private>                  // borra (aplica .pii)
<Private pseudonym>{group.cliente}</Private>         // troca por "Cliente 2"
```

Com o modo desligado, renderiza o filho intacto, sem wrapper adicional.

---

## 4. Superfícies cobertas

O levantamento dos pontos de exibição reduziu a superfície a **quatro**. As linhas são do estado em `f0c6c3d`.

| Arquivo | Dado | Tratamento |
|---|---|---|
| `PrecosTab.jsx:370` | `flight.cliente` na linha do voo | borrão |
| `StatusTab.jsx:267` | `group.cliente` no cabeçalho do grupo | pseudônimo |
| `PackagesTab.jsx:198` | `p.title` — derivado, embute sobrenome ("Pacote Gramado — Silva") | borrão |
| `PackagesTab.jsx:199` | `p.holder` — titular do pacote | borrão |
| Todos os formulários | qualquer campo | nenhum — ver §2.2 |

### O que investigamos e ficou de fora

**Templates de voucher** (`VoucherCanonicalV1`, `VoucherCompactoV1`, `AzulConfirmacaoV1`): não recebem tratamento. Eles são importados **apenas** por `VoucherPreviewPage.jsx` e `PackageFlightPreviewPage.jsx`, as duas rotas de exportação que retornam antes do provider (§2.1). Nunca renderizam dentro do shell autenticado, então uma classe `pii` ali nunca encontraria um `.privacy-on` ancestral — seria código morto nos arquivos de maior risco do projeto.

**`VouchersTab.jsx`**: nada a mascarar. A lista de vouchers salvos exibe apenas `#id · companhia` (linha 495). O localizador e os nomes de passageiros aparecem só como `input` (linhas 516 e 547), cobertos pela regra §2.2.

**`PrecosTab`, contatos**: o e-mail e o telegram aparecem apenas como ícones indicando presença, não como valores (linhas 374-375). Não há PII a ocultar ali além do nome.

**`StatusTab`, chave de agrupamento**: `group.cliente` é usado como chave do `collapsedGroups`, no `key` do React e na ordenação `localeCompare` (linhas 163-175, 255-260). Esses usos permanecem com o **nome real**. Só o texto renderizado na linha 267 recebe o pseudônimo. Trocar a chave faria o estado de recolhimento se perder ao ligar o modo, e a ordem alfabética dançar.

---

## 5. Pseudônimos

O provider mantém um `Map` de nome→apelido, preenchido na ordem de primeira aparição: `Cliente 1`, `Cliente 2`, e assim por diante.

O mapa vive no `useRef` do provider e sobrevive a ligar/desligar o modo, então a mesma pessoa é sempre `Cliente 2` durante a sessão. Isso importa para capturar várias telas seguidas sem que os apelidos dancem entre uma imagem e outra. O mapa morre no reload, junto com o estado.

**Casos de borda:**

- Nome vazio ou nulo: a `StatusTab` já agrupa esses casos em `(sem cliente)`. Vira `Cliente sem nome` e não consome número da sequência.
- Borrão sobre string vazia não renderiza nada visível — comportamento correto, sem tratamento especial.
- `user-select: none` impede selecionar e copiar o texto real por baixo do borrão, que continua no DOM.

---

## 6. Verificação

O `backend` tem `jest` configurado. O `frontend` **não tem infraestrutura de teste** — os scripts do `package.json` são apenas `dev`, `build` e `preview`. Montar Vitest para esta feature seria escopo maior que a feature.

A verificação é manual no navegador, e estes são os casos:

1. Modo ligado: nenhum nome legível em Preços, Status e Pacotes — as três abas com superfície (§4). Promoções e Vouchers não exibem nome; conferir que seguem intactas.
2. Aba Status com modo ligado: os agrupamentos continuam legíveis, cada cliente com apelido próprio e estável.
3. Abrir um formulário de edição com o modo ligado: o campo traz o **nome real**.
4. `/voucher-preview/:id?export=1` com o modo ligado na outra aba: voucher **sem** borrão.
5. Recarregar a página com o modo ligado: volta desligado.
6. Temas claro e escuro: o borrão permanece legível como censura em ambos.

O caso 4 é o que não pode falhar. Os outros degradam a experiência; esse produz um documento errado na mão do cliente.
