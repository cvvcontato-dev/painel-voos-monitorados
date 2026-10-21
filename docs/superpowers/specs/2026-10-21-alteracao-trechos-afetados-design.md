# Aba Alterações — escolher o(s) trecho(s) alterado(s) (reservas separadas) — Design

Data: 2026-10-21 · Status: aprovado pela usuária em conversa.

## Problema
Clientes compram ida e volta em **reservas separadas** (dois vouchers originais combinados na aba Vouchers em um único voucher; ver `services/voucherCombiner.js`: cada trecho guarda `trips[].locator`, e `reservation.reservations[] = [{code, carrier, appliesTo}]`, `reservation.locator` = da ida, `secondaryLocator`/`primaryCarrier`/`secondaryCarrier`, `carrier: 'multi'` se as cias diferem). Quando **só uma reserva é alterada** pela companhia, a aba Alterações hoje não sabe qual trecho foi afetado: o aviso fala do voucher inteiro e o merge/diff dependem só do que o print mostrar.

## Decisão
O operador **marca o(s) trecho(s) alterado(s)** dentro do caso. O resto do fluxo respeita a marcação. O cliente recebe sempre o **voucher completo** (ida + volta) já atualizado; só a **mensagem** e o **aviso** falam do trecho/reserva afetado.

## Dados
- `flight_changes.affected_json TEXT` — array de **índices** em `old_json.trips` (o snapshot é imutável, então o índice é estável). `NULL` = "todos" (legado / voucher de uma reserva).
- `flight_changes.extracted_json TEXT` — saída normalizada do `extractFlights` (`{carrier, locator, trips}`) do último voucher novo, para **refazer o merge sem nova chamada à IA** quando a marcação mudar.
- Migração idempotente (ALTER TABLE com tratamento de "duplicate column", como `confirmation_email_sent_at`) + colunas no CREATE TABLE.
- `needs_affected` (calculado, não gravado) = `affected_json IS NULL` **e** o voucher antigo tem ≥2 reservas distintas (localizadores distintos entre os trechos: `trip.locator || reservation.locator`) **e** `status='aviso_pendente'` **e** `new_json IS NULL`. Casos legados já avançados contam como "todos".

## API (todas escopadas por `user_id`, atrás de requireAuth/CSRF)
- Detalhe do caso (`detail()`): acrescenta `affected` (array de índices efetivo: o gravado, ou todos), `needs_affected` (bool) e `reservation_groups` = `[{ locator, carrier, appliesTo|null, trips:[{ index, direction, label }] }]` para a UI. Com `needs_affected=true`, `messages.notice` = `null`.
- `PUT /api/flight-changes/:id/affected` body `{ affected: [int,...] }`: valida (inteiros únicos dentro do intervalo, ≥1; 400 caso contrário; 409 se confirmado). Grava; se já existe voucher novo (`extracted_json`), **refaz o merge** a partir de `extracted_json` com a nova marcação, recalcula `new_json`/`diff_json`, sincroniza a linha de `vouchers` (como o `PUT /new`), zera `confirmation_email_sent_at` e dispara o PDF em segundo plano. Devolve o detalhe.
- Guardas: `POST /:id/new-voucher`, `POST /:id/notice-sent` e `POST /:id/send-email (kind aviso)` devolvem **409 `escolha_trechos`** ("Marque os trechos alterados antes de continuar") enquanto `needs_affected`. `GET /:id/email-preview?kind=aviso` idem.
- `POST /:id/new-voucher` passa a usar `mergeNewFlights(old, extracted, { affected })`, e grava `extracted_json`.
- `PUT /:id/new` (correção manual) e o diff usam `affected`.

## Merge restrito (`helpers/flightChangeMerge.js`)
`mergeNewFlights(oldVoucher, extracted, { affected } = {})`. Sem `affected` (ou todos): comportamento atual **inalterado**. Com subconjunto A (índices):
1. **Pareamento** dos trechos extraídos E com os afetados:
   - rotulados: por direção, na ordem, contra os afetados da mesma direção;
   - sem rótulo (`multi`/ausente): se `|E| == |A|`, por ordem; se `|E| > |A|`, descarte de E os que casam (voo normalizado + data de partida) com algum trecho **não marcado** do antigo (silenciosamente) e exija que sobrem exatamente `|A|`; senão 422 "Não consegui identificar qual trecho do print corresponde ao que foi marcado. Envie um print com os rótulos ou só o trecho alterado.";
   - trechos extras do print que não correspondem a nenhum afetado: **ignorados** com aviso âmbar ("Ignorei trechos do print que não estavam marcados: …").
2. **Substituição:** só os índices em A são trocados (mantém `direction` e herda `cabinClass`/`status` do antigo quando nulos, como hoje); os demais trechos são cópias do antigo, **intactos**.
3. **Localizador:** o extraído (se válido) vale **apenas para a reserva dos trechos afetados**: atualiza `trips[i].locator` dos afetados, a entrada de `reservation.reservations[]` cujo `code` era o localizador antigo daquela reserva, `reservation.locator` se era o antigo da reserva afetada (ida) e `reservation.secondaryLocator` se era o antigo (volta). Se os afetados pertencem a **mais de uma reserva** com localizadores diferentes e o print traz um só, não aplique e avise.
4. **Cia por trecho** (prefixo do voo) como hoje, mas atualizando só a entrada de `reservations[]` das reservas afetadas; recalcular `carrier` de topo (`multi` se mistas) e `primaryCarrier`/`secondaryCarrier` coerentes (padrão do `voucherCombiner`); avisos existentes mantidos.
5. Rota, `airlineDisplayName`, whitelist, validações de datas/IATA/voo/localizador e `warnings`: **como hoje**.

## Diff restrito (`helpers/flightChangeDiff.js`)
`diffVouchers(old, new, { affected })`: trechos fora de A são **sempre `igual`** (não entram na mensagem). Passageiros/bagagem como hoje. Substituir o `locatorChanged` único por `reservationChanges: [{ direction, antes, depois }]` (um por reserva afetada cujo localizador mudou, comparando `trip.locator || reservation.locator` por trecho afetado); mantenha `locatorChanged` (compatível) preenchido quando só há uma reserva/ou quando `reservation.locator` mudou. `hasChanges` considera `reservationChanges`.

## Mensagens (`helpers/flightChangeMessage.js`, `services/flightChangeEmail.js`)
- **Aviso** (`buildNoticeText(old, { supportPhone, affected })` e o HTML do e-mail): cita só os trechos afetados e a(s) reserva(s): "A companhia aérea fez uma alteração no seu voo de **volta** da reserva *XYZ789* (REC → GRU, 19 SET 2026)." Vários afetados (reservas diferentes): lista curta por reserva ("…no voo de ida da reserva *ABC123* (…) e no voo de volta da reserva *XYZ789* (…)"). Sem `affected` ⇒ texto atual. A mensagem pré-preenchida do cliente (`noticeClientMessage`) cita o localizador da reserva afetada.
- **Confirmação** (`buildConfirmationText`): linha de abertura cita a reserva afetada (novo localizador do trecho afetado, não o da ida); "Novo localizador: *X*" por reserva alterada (`reservationChanges`); só trechos alterados como hoje; link do voucher completo.
- **E-mail de confirmação**: voucher **completo**, `customMessage` com o resumo só do afetado (já derivado do diff restrito).
- Preview e envio continuam compartilhando o mesmo construtor.

## Frontend (aba Alterações)
- Seção **"Trechos alterados"** no topo do caso aberto (`CaseView`): lista agrupada por reserva (`reservation_groups`) com caixinhas por trecho + atalho "marcar a reserva toda". Com `needs_affected`: faixa âmbar "Marque o(s) trecho(s) alterado(s) para continuar", nada pré-marcado, botão "Confirmar trechos" (≥1), Passos 1 e 2 **desabilitados** até escolher. Com voucher de uma reserva só (ou legado): seção colapsada "Trechos: todos" (editável).
- Depois de escolhida a marcação, ela continua editável até confirmar o caso; ao alterar com voucher novo já enviado, avisar "o voucher novo será refeito com a nova marcação" (re-merge no backend) e atualizar diff/mensagens/prévia.
- Textos pt-BR; sem dependências novas; mesmo padrão visual (dark mode, pii).

## Casos de borda
- Voucher não combinado: nada muda para o operador.
- Duas reservas alteradas em momentos distintos: novo caso usando o voucher novo do primeiro (já possível). Atalho "Abrir novo caso a partir deste" fica fora do escopo.
- Caso legado `aviso_enviado`/`confirmado`: `affected` NULL = todos.

## Testes
Merge restrito (rotulado, sem rótulo, extras ignorados, localizador só da reserva afetada, cia mista, ambíguo ⇒ 422), diff restrito (não marcados sempre `igual`, `reservationChanges`), mensagens (aviso só do trecho afetado; confirmação com reserva certa), rotas (PUT /affected, re-merge, guardas 409, isolamento por usuário, legado), migração idempotente, e **verificação no navegador** com voucher combinado (stub).

## Fora do escopo
Atalho para abrir novo caso a partir do anterior; mudar a regra "o merge parte do voucher antigo"; leitura real do Gemini (continua só validável em produção).

## Revisão (2026-10-21) — regras acrescentadas
- **Localizador novo vale para todos os trechos da MESMA reserva, inclusive os não marcados** (ex.: ida e volta no mesmo localizador, só a volta marcada: o localizador novo troca a reserva toda; só `trips[].locator`/`reservations[]`/`reservation.locator` mudam, os demais campos do trecho não marcado ficam intactos).
- **Marcação explícita cobrindo todos os trechos** (`affected_json` gravado) em voucher com ≥2 reservas usa o merge restrito: o localizador do print só é aplicado se os marcados são de UMA reserva; senão não é aplicado e há aviso. Trechos novos recebem sempre `trips[].locator` da sua reserva. Sem marcação (NULL) ou voucher de 1 reserva ⇒ comportamento antigo idêntico.
- Trecho do print igual (voo + data de partida) a um trecho não marcado é descartado em silêncio, mesmo de direção sem afetado; só trecho realmente diferente gera o aviso "Ignorei trechos…". Trecho marcado sem substituto gera "Não encontrei no print o trecho marcado: …". Prefixo desconhecido: cia do trecho substituído (dica do modelo só em último caso).
- `reservationChanges` também aparece sem marcação em vouchers combinados (diff sem restrição compara cada reserva).
- Concorrência: `new-voucher` grava só se `affected_json` não mudou (409 `marcacao_alterada`); `PUT /affected` grava só se `new_json` não mudou (409 `caso_alterado`); voucher novo sem `extracted_json` ⇒ 409 `sem_extracao`; o PUT devolve `remerged`.

## Reconciliação da direção pela rota (2026-10-21)
O rótulo de direção do modelo não é confiável. Antes do pareamento: (1) a direção de cada trecho do print é reescrita pela ROTA (partida, chegada) quando ela coincide com trechos de uma única direção entre os candidatos (marcados no caminho restrito; todos no legado, só trechos rotulados), com aviso "O print identificava X mas, pela rota (A → B), usei como Y."; (2) descartam-se em silêncio trechos iguais (voo + data) a um não marcado ou repetidos; (3) se nenhuma direção cobre os marcados e o nº de candidatos (sem os que têm a rota de um trecho não marcado) é igual ao de marcados, pareia por ORDEM CRONOLÓGICA com aviso "…pela sua marcação e pela rota (A → B), usei como Y."; (4) senão 422 "O print mostra N trecho(s) e você marcou M. Marque exatamente os trechos que aparecem no print, ou envie um print só do trecho alterado." (com log `[FLIGHT-CHANGES] merge ambíguo: marcados=… print=…`). Dois trechos da mesma rota na mesma direção não são conexão: 422.

## Viagem = voos encadeados (2026-10-21)
Para a usuária o "trecho" é a VIAGEM inteira (ida/volta, com 0..n conexões), não cada voo. `helpers/flightJourneys.js`: **viagem** = voos consecutivos do mesmo `direction` e da mesma reserva (localizador), encadeados (chegada de um = partida do seguinte, intervalo de 0 a <24h). Origem = partida do 1º voo; destino = chegada do último. Voos do print são ordenados por partida e encadeados do mesmo modo, independentemente dos rótulos do modelo (dois voos com rótulos diferentes nunca se juntam: o rótulo só desempata).
- **Marcação:** `affected` segue como lista de índices de voos, mas o backend normaliza para viagens inteiras (voo marcado ⇒ viagem toda; `PUT /affected` devolve `affected` normalizado). `reservation_groups[].journeys = [{ key, direction, origin, destination, label, segments, trips:[{ index, label }] }]` (label ex.: "Volta · REC → BSB → GRU · 19 SET 2026"; um voo só termina em " · direto"); `reservation_groups[].trips` segue existindo.
- **Merge:** pareia viagem do print ↔ viagem marcada por origem+destino; senão, se o nº de viagens candidatas do print = nº de marcadas, por ordem cronológica (aviso quando o rótulo do modelo diferia); senão 422 "O print mostra N viagem(ns) e você marcou M. Marque exatamente as viagens que aparecem no print, ou envie um print só da viagem alterada." (+ log `[FLIGHT-CHANGES] merge ambíguo: …`). Duas viagens do print com a mesma origem+destino da marcada e sem desempate de rótulo ⇒ ambíguo. Viagem do print idêntica (voo+data de todos os voos) a uma não marcada ⇒ descarte silencioso; com a rota de uma não marcada mas voos diferentes ⇒ ignorada com aviso. A substituição troca o BLOCO inteiro de voos (qualquer quantidade); direção e localizador vêm da viagem substituída; classe/status por posição quando há par. Caminho sem marcação: só a reconciliação por rota passa a usar origem/destino da viagem.
- **Diff/mensagens:** se a quantidade de voos ou as escalas intermediárias mudam, UMA entrada `alterado` por viagem (`journey: true`; `old`/`new` = trecho sintético com origem/destino da viagem inteira e `flightNumber` "G3 1920 + G3 1930") com `changes` `itinerario` ("REC → BSB → GRU (G3 1920 + G3 1930)" → "REC → GRU (G3 1925, direto)"), `partida` (1º voo) e `chegada` (último). Mudança só de horário/aeroporto de origem ou destino segue voo a voo. Mensagem: "• Itinerário: antes → depois" e título "*Volta (REC → GRU)*". O aviso cita sempre origem/destino da viagem inteira.

### Ajustes da revisão (viagem)
- **Classe/status herdados:** o voo do print herda `cabinClass`/`status` do voo antigo da mesma posição; voo extra (sem par, ex.: direto → conexão) herda os do ÚLTIMO voo da viagem antiga, para o voucher/PDF não ficar com classes inconsistentes. No diff da viagem, `classe` usa a do 1º voo (ou "Econômica + Executiva" se divergirem) e só conta quando os dois lados têm classe.
- **Viagem inteira cancelada/incluída** (com conexão): uma entrada `removido`/`novo` com `journey: true` (`old`/`new` sintético com `itinerary`); mensagem "Viagem cancelada/incluída" + "Itinerário: …". Voo único segue "Trecho cancelado/incluído".
- **Texto do itinerário na mensagem:** "• Itinerário: de REC → BSB → GRU (AD 4002 + AD 4012) para REC → GRU (AD 4020, direto)"; os campos `antes`/`depois` do diff não mudam.
- **422 específico:** quando o nº de viagens do print é igual ao de marcadas mas nenhuma corresponde: "Nenhuma viagem do print corresponde à viagem marcada (origem e destino diferentes). Confira a marcação ou envie um print só da viagem alterada."
- **Bate-volta no mesmo dia** com mesma direção e reserva (<24h entre os voos encadeados) forma uma única viagem.
