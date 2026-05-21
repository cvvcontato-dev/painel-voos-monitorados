const PROMPT = `Você recebe o print de um pacote de viagem (sistema interno estilo CVC).
Extraia SOMENTE os dados visíveis e devolva um JSON único, sem texto extra, com as chaves:
origin_code, destination_code, start_date (YYYY-MM-DD), end_date, nights, passengers, hotel_name,
hotel_stars, hotel_rating_value, hotel_rating_text, flight_type ("Direto" ou "1 parada"),
airlines (array), baggage_raw (array de strings como "bagagem de mão"), meal_plan,
total_price (número, "Final 2 pessoas"), agency_commission ("Seu ganho", número ou null),
availability_note (ex.: "sob consulta" ou null).
Se um campo não estiver visível, use null. NÃO invente valores.`;

const STUB = {
  origin_code: 'SSA', destination_code: 'BPS', start_date: '2026-09-12', end_date: '2026-09-19',
  nights: 7, passengers: 2, hotel_name: 'Rede Andrade Terra Brasil', hotel_stars: 3, hotel_rating_value: 8.1,
  hotel_rating_text: 'Muito bom', flight_type: 'Direto', airlines: ['GOL'],
  baggage_raw: ['bagagem de mão', 'bagagem despachada'], meal_plan: 'Café da Manhã',
  total_price: 2411.0, agency_commission: 227.0, availability_note: 'sob consulta'
};

const FIELDS = Object.keys(STUB);

function toPromotion(parsed) {
  const promotion = { ...parsed };
  const low = FIELDS.filter(f => parsed[f] == null && f !== 'agency_commission' && f !== 'availability_note');
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
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
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
