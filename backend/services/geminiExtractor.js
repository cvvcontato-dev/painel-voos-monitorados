const PROMPT = `Você recebe o print de um pacote de viagem (sistema interno estilo CVC).
Extraia SOMENTE os dados visíveis e devolva um ÚNICO objeto JSON, sem texto extra, com as chaves abaixo.

REGRAS IMPORTANTES:
- O cabeçalho no topo mostra "Origem, País - Destino, País" (ex.: "Salvador, Brasil - Aruba, Aruba").
  Use ESSE cabeçalho para os nomes de cidade/país. Os códigos de aeroporto (3 letras como SSA, AUA)
  NÃO são o nome do destino — o destino é o NOME DA CIDADE do cabeçalho.
- NOME DO HOTEL: no topo ele aparece ABREVIADO com reticências (ex.: "Caribbean Palm Villag...").
  NUNCA use esse. O nome COMPLETO está no bloco "Hospedagem selecionada" (ao lado da foto do hotel,
  na parte de baixo). Copie o nome COMPLETO de lá, SEM reticências. Se houver "..." no valor, está errado.
- TIPO DE VOO: no bloco inferior há o texto "Voo direto" OU "Voo com paradas" (ex.: "Voo com paradas SSA ⇄ AUA").
  Os trechos também mostram "Direto", "1 parada", "2 paradas". Regra: se aparecer "Voo com paradas" OU
  qualquer trecho com parada(s), então flight_type = "Com paradas". Só use "Direto" se TODOS os trechos
  forem diretos E o texto disser "Voo direto".

Chaves do JSON:
origin_code (IATA, ex.: SSA), origin_city (nome, ex.: Salvador), origin_country (ex.: Brasil),
destination_code (IATA, ex.: AUA), destination_city (NOME da cidade, ex.: Aruba), destination_country (ex.: Aruba),
destination_country_code (ISO-3166 alpha-2 do país de destino, ex.: BR, AW, US),
start_date (YYYY-MM-DD), end_date, nights, passengers,
hotel_name (COMPLETO, do card inferior), hotel_stars, hotel_rating_value, hotel_rating_text,
flight_type ("Direto" ou "Com paradas"), airlines (array),
baggage_raw (array, ex.: "bagagem de mão"), meal_plan (ou null se não constar),
total_price (número, "Final 2 pessoas"), agency_commission ("Seu ganho", número ou null),
availability_note (ex.: "sob consulta" ou null).
Se um campo não estiver visível, use null. NÃO invente valores.`;

const STUB = {
  origin_code: 'SSA', origin_city: 'Salvador', origin_country: 'Brasil',
  destination_code: 'BPS', destination_city: 'Porto Seguro', destination_country: 'Brasil',
  destination_country_code: 'BR',
  start_date: '2026-09-12', end_date: '2026-09-19',
  nights: 7, passengers: 2, hotel_name: 'Rede Andrade Terra Brasil', hotel_stars: 3, hotel_rating_value: 8.1,
  hotel_rating_text: 'Muito bom', flight_type: 'Direto', airlines: ['GOL'],
  baggage_raw: ['bagagem de mão'], meal_plan: 'Café da Manhã',
  total_price: 2411.0, agency_commission: 227.0, availability_note: 'sob consulta'
};

// Campos críticos: se vierem vazios da extração, o operador deve conferir antes de gerar.
// (meal_plan, availability_note, country etc. são opcionais/têm default — não disparam revisão.)
const IMPORTANT_FIELDS = [
  'destination_city', 'hotel_name', 'total_price', 'flight_type', 'airlines', 'nights'
];

function toPromotion(parsed) {
  const promotion = { ...parsed };
  const low = IMPORTANT_FIELDS.filter(f => {
    const v = parsed[f];
    return v == null || (Array.isArray(v) && v.length === 0);
  });
  const _meta = {
    low_confidence_fields: low,
    validation_warnings: [],
    agency_commission_detected: parsed.agency_commission ?? null
  };
  delete promotion.agency_commission;
  return { promotion, _meta };
}

async function extract(imageBuffer, mimeType) {
  if ((process.env.EXTRACTION_MODE || 'stub') === 'stub') {
    return toPromotion({ ...STUB });
  }
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (!process.env.GEMINI_API_KEY) { const e = new Error('GEMINI_API_KEY missing'); e.code = 'unavailable'; throw e; }
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.5-flash' });
    const result = await model.generateContent([
      PROMPT,
      { inlineData: { data: imageBuffer.toString('base64'), mimeType } }
    ]);
    const text = result.response.text();
    const jsonStr = (text.match(/\{[\s\S]*\}/) || [null])[0];
    if (!jsonStr) { const e = new Error('no json'); e.code = 'unprocessable'; throw e; }
    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch (_) { const e = new Error('malformed json'); e.code = 'unprocessable'; throw e; }
    return toPromotion(parsed);
  } catch (err) {
    if (err.code === 'unprocessable') throw err;
    const e = new Error(`Gemini indisponível: ${err.message}`); e.code = 'unavailable'; throw e;
  }
}

module.exports = { extract, PROMPT };
