# Spec — Aba "Promoções" (Automação de Promoções Clube do Voo Viagens)

> **Alinhamento:** A v1 da aba Promoções será uma automação enxuta, sem histórico funcional,
> integrada à stack atual, com frontend apenas de operação e backend responsável por extração,
> normalização, validação, geração da mensagem e renderização da arte final.

Data: 2026-05-21
Status: Aprovado para implementação

## Objetivo

Adicionar uma nova aba ("Promoções") ao painel existente para automatizar a criação de
promoções de pacotes de viagem do Clube do Voo Viagens: do upload do print do pacote (gerado
nos sistemas internos, estilo CVC) até a geração da mensagem de WhatsApp e da arte promocional
final com logo e fundo do destino.

Esta spec adapta o documento `arquitetura-final-automacao-promocoes.md` (que propunha um app
Python/FastAPI/PostgreSQL standalone) para a **stack já existente do projeto**, evitando um
segundo backend. A lógica de pipeline do documento original é integralmente preservada.

## Stack (reaproveitada do projeto atual)

- **Frontend:** React + Vite + Tailwind (sistema de abas em `frontend/src/App.jsx`)
- **Backend:** Node.js + Express + SQLite
- **Render de arte:** Playwright (já instalado para scraping) renderizando HTML/CSS → PNG
- **IA de extração:** Google Gemini Vision (`GEMINI_API_KEY`)
- **Fallback de imagem de fundo:** Pexels API (`PEXELS_API_KEY`)

## Escopo do v1 (enxuto)

Incluído: upload do print → extração via Gemini → normalização → validação → revisão humana
no formulário → geração da mensagem WhatsApp → renderização da arte PNG → download/cópia.

**Não incluído** (intencionalmente): histórico de promoções, reedição de promoções antigas,
banco de promoções como feature do produto, fila de jobs assíncronos. "Sem persistência
funcional" **não** significa "sem storage temporário" — há pasta de trabalho em disco por ciclo.

As rotas e módulos devem ser desenhados como se a persistência pudesse crescer depois, para
permitir migração futura sem reescrever a API.

## Entradas e saídas reais (calibração)

### Print de entrada (sistema interno, estilo CVC)
Contém: origem → destino, intervalo de datas, nº passageiros; hospedagem (nome do hotel, nota
ex. 8.1 "Muito bom", estrelas, nº noites); voo (companhia GOL/Azul/etc., horários, Direto vs
"1 parada", códigos de aeroporto SSA/BPS/FLN/CNF); regime ("Café da manhã") + ícones de bagagem;
preço por pessoa e "Final 2 pessoas R$ X" + "Taxas e impostos incluídos".

⚠️ **"Seu ganho R$ X"** = comissão da agência. Deve ser detectado como alerta interno e
**NUNCA** aparecer na mensagem ou na arte.

### Arte de saída (padrão Clube do Voo)
Foto do destino como fundo, card branco arredondado por cima; faixa "SAINDO DE SALVADOR";
destino em destaque ("MACEIÓ"); linha "6 NOITES | AGOSTO (sob consulta) | 2 PESSOAS"; linhas
com ícones (Voo / Hotel / Regime); preço "POR APENAS 10X S/ JUROS DE R$ 374,70" (= total ÷ 10)
+ "VALOR TOTAL PARA 2 PESSOAS"; botão "Reserve agora". **Logo no topo central** (opção A).

## Arquitetura

```
Frontend (React/Vite/Tailwind)          Backend (Express/SQLite)
PromocoesTab.jsx                        routes/promotions.js
  1. Upload do print      ──POST──────▶  POST /api/promotions/extract
  2. Preview do print                     └▶ geminiExtractor.js (IA)
  3. Formulário editável                  └▶ promoNormalizer.js
  4. Preview da mensagem  ──POST──────▶  POST /api/promotions/validate
  5. Preview da arte      ──POST──────▶  POST /api/promotions/render-message
  6. Botões de ação       ──POST──────▶  POST /api/promotions/render-image
                                          └▶ backgroundResolver.js
                                          └▶ promoRenderer.js (Playwright)
```

Fluxo do operador: upload → extração + normalização + validação (campos de baixa confiança e
warnings sinalizados) → revisão/correção no formulário → "Gerar" → mensagem + arte derivadas
**do mesmo payload revisado** → previews → download PNG / copiar mensagem.

## Modelo de dados (fonte de verdade)

```json
{
  "promo_id": "uuid-temporario",
  "origin_code": "SSA",
  "origin_city": "Salvador",
  "destination_city": "Porto Seguro",
  "destination_code": "BPS",
  "travel_month_label": "Setembro",
  "availability_note": "sob consulta",
  "display_availability": "Setembro (sob consulta)",
  "nights": 7,
  "passengers": 2,
  "hotel_name": "Rede Andrade Terra Brasil",
  "hotel_stars": 3,
  "hotel_rating_value": 8.1,
  "hotel_rating_text": "Muito bom",
  "flight_type": "Direto",
  "airlines": ["GOL"],
  "baggage": ["carry_on"],
  "meal_plan": "Café da Manhã",
  "total_price": 2411.00,
  "installments": 10,
  "installment_amount": 241.10,
  "taxes_included": true,
  "cta_text": "Reserve agora",
  "_meta": {
    "low_confidence_fields": ["hotel_rating_value"],
    "validation_warnings": [],
    "agency_commission_detected": 227.00
  }
}
```

Notas de campos:
- `baggage`: valores fechados `"carry_on"` e `"checked"`; tradução para rótulo humano fica no backend.
- `display_availability`: montado pelo backend para uso direto no card e na mensagem.
- `_meta.low_confidence_fields` vs `_meta.validation_warnings`: baixa confiança da extração é
  distinta de inconsistência de regra de negócio.
- `_meta.agency_commission_detected`: somente alerta interno; nunca renderizado.

## Contratos de API

Todos sob `/api/promotions`, protegidos por `requireAuth` (sessão existente).

| Método | Endpoint | Entrada | Saída |
|--------|----------|---------|-------|
| POST | `/extract` | imagem do print (multipart) | `{ promo_id, promotion, _meta, workspace }` |
| POST | `/validate` | `{ promotion }` | `{ valid, errors, warnings, normalized_promotion }` |
| POST | `/render-message` | `{ promotion }` revisado | `{ message_text }` |
| POST | `/render-image` | `{ promotion, background_choice? }` | `{ image_url, image_width, image_height, expires_at }` |
| GET | `/backgrounds?destination=` | — | `{ options: [{ source: "local"|"pexels", url, thumb }] }` |

`render-message` e `render-image` derivam sempre do mesmo payload revisado — nunca de extrações
independentes.

### Storage temporário
Pasta de trabalho por ciclo em `backend/output/promos/<promo_id>/` (print enviado, `promocao_final.png`).
URLs temporárias com `expires_at` = criação + 24h. Limpeza: varredura no startup do servidor +
verificação preguiçosa a cada `/extract` que remove pastas com mais de 24h. Sem cron dedicado no v1.

### Tratamento de erro da extração
`geminiExtractor` é o ponto mais dependente de serviço externo. Comportamento esperado:
- Gemini indisponível / timeout / erro HTTP → `/extract` retorna `503` com mensagem amigável;
  o operador pode tentar novamente.
- Resposta do Gemini com JSON malformado ou campos faltando → tenta parse tolerante; campos
  ausentes entram em `_meta.low_confidence_fields` (em vez de falhar), permitindo correção manual
  no formulário. Só falha (`422`) se nada útil for extraído.

## Componentes

### Frontend
- `frontend/src/components/PromocoesTab.jsx` — UI apenas: upload, preview do print, formulário
  editável (campos de baixa confiança destacados em âmbar; warnings visíveis), preview da
  mensagem, preview da arte, botões `Gerar` / `Regenerar` / `Baixar imagem` / `Copiar mensagem`.
  **Sem regra de negócio.**
- `frontend/src/api/promoClient.js` — helper de chamadas (padrão de `authClient.js`).
- `frontend/src/App.jsx` — adicionar `{ value: 'promocoes', label: 'Promoções', icon: <Megaphone/> }`
  ao array `TABS` e renderizar `PromocoesTab`.

### Backend
- `backend/routes/promotions.js` — rotas acima; registrar em `server.js`.
- `backend/services/geminiExtractor.js` — Gemini Vision com prompt controlado + schema; devolve
  JSON preliminar + `low_confidence_fields`. Não produz saída final.
- `backend/services/promoNormalizer.js` — aeroporto→cidade, datas→`travel_month_label`,
  `availability_note`, `display_availability`, total→`installment_amount`, baggage→`carry_on`/`checked`.
- `backend/services/promoValidator.js` — todas as validações (ver abaixo).
- `backend/services/whatsappMessage.js` — template controlado da legenda.
- `backend/services/backgroundResolver.js` — **prioridade explícita: biblioteca local aprovada
  primeiro, fallback Pexels depois, nunca o contrário.**
- `backend/services/promoRenderer.js` — Playwright renderiza `promo-art.html` → PNG.
- `backend/templates/promo-art.html` — template fiel ao padrão (faixa, destino, linhas com
  ícones, preço, CTA, logo topo central). **Deve tratar textos longos** (especialmente
  `hotel_name`, `meal_plan`, lista de `airlines`) sem quebrar o layout — truncamento visual controlado.
- `backend/static/promo-backgrounds/` — biblioteca local de fotos por destino.
- `.env.example` — adicionar `GEMINI_API_KEY` e `PEXELS_API_KEY`.

## Regras de validação (`promoValidator`)

- Campos obrigatórios: origem, destino, hotel, voo, preço.
- Coerência: `installment_amount * installments ≈ total_price` dentro de tolerância de R$ 0,10
  (10 centavos, para absorver arredondamento da divisão).
- **Bloqueio do "Seu ganho" / campos internos** — aplicado também no renderer e no message
  builder, não só no validator.
- Número de noites entre 1 e 30 (fora disso → warning para revisão).
- Limite de comprimento para `hotel_name`, `meal_plan`, `airlines` com truncamento visual controlado.
- Campos de baixa confiança exigem atenção do operador antes da aprovação.

## Testes

Seguindo o padrão de `backend/__tests__/`, foco em `promoNormalizer` e `promoValidator` com
dados dos prints reais. Cenários mínimos:

1. Print com "Seu ganho" detectado e **bloqueado** da saída (mensagem e arte).
2. Print sem nota do hotel.
3. Print com bagagem ambígua.
4. Parcela divergente do total.
5. Nome de hotel grande demais para o card.
6. Destino sem imagem local, usando fallback externo (Pexels).

## Ordem de implementação

1. Rota + UI de upload/extract com Gemini.
2. Normalização + validação.
3. Formulário de revisão.
4. Mensagem WhatsApp.
5. Template HTML + renderer Playwright.
6. Resolver de fundo + logo.
7. Export (download/copy).

## Dependências externas

- `GEMINI_API_KEY` — extração via Gemini Vision.
- `PEXELS_API_KEY` — fallback de imagem de fundo.
- Playwright — já presente no projeto.
- `Logo.png` (raiz) — logo da agência, posicionada no topo central da arte.
