const { GoogleGenerativeAI } = require('@google/generative-ai');
const { normalize } = require('./voucherNormalizer');

const SUPPORTED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const PROMPT = `Você recebe um voucher/comprovante de reserva da AZUL Linhas Aéreas.
Extraia os dados e devolva UM ÚNICO objeto JSON, sem texto extra, com as chaves:

carrier ("azul"), layoutVersion ("azul.confirmacao.v1"),
reservation: { locator, status, summaryText },
route: { origin (IATA 3 letras), destination (IATA) },
passengers: [{ order (1-based), name (MAIÚSCULAS), type ("adulto"|"crianca"|"bebe"), documento, loyaltyNumber (pode ser preenchido com o e-ticket da cia aérea quando visível, ex.: "1272303925150") }],
trips: [{
  direction ("ida"|"volta"|"multi"), dateLabel (ex.: "12 SET 2026"),
  departure: { airport (IATA), airportName (nome completo do aeroporto quando visível, ex.: "Ministro Victor Konder"), datetime (ISO 8601 com timezone -03:00) },
  arrival:   { airport (IATA), airportName (nome completo do aeroporto quando visível), datetime (ISO 8601 com timezone -03:00) },
  flightNumber (ex.: "AD 4001"), durationText (ex.: "3h15"),
  cabinClass ("Econômica"|"Executiva"|"Premium Economy" etc., null se não visível),
  airlineDisplayName, status
}],
baggage: [{ direction ("ida"|"volta"), label, weightText, quantity (número) }],
branding: { airlineName: "Azul", logoUrl: null, primaryColor: "#003DA5" }.

REGRAS:
- Datetimes SEMPRE em ISO 8601 com offset -03:00. Se só houver hora, use a data do trecho.
- IATA sempre 3 letras maiúsculas.
- Se um campo não estiver visível, use null. NÃO invente.
- Não inclua nenhum texto fora do JSON.`;

const STUB = {
  carrier: 'azul', layoutVersion: 'azul.confirmacao.v1',
  reservation: { locator: 'STUB01', status: 'Confirmada', summaryText: null },
  route: { origin: 'GRU', destination: 'REC' },
  passengers: [
    { order: 1, name: 'JOAO DA SILVA', type: 'adulto', documento: null, loyaltyNumber: '1234567890' },
    { order: 2, name: 'MARIA SILVA',   type: 'adulto', documento: null, loyaltyNumber: '1234567891' }
  ],
  trips: [
    { direction: 'ida', dateLabel: '12 SET 2026',
      departure: { airport: 'GRU', airportName: 'Guarulhos', datetime: '2026-09-12T08:30:00-03:00' },
      arrival:   { airport: 'REC', airportName: 'Guararapes', datetime: '2026-09-12T11:45:00-03:00' },
      flightNumber: 'AD 4001', durationText: '3h15',
      cabinClass: 'Econômica',
      airlineDisplayName: 'Azul Linhas Aéreas', status: 'Confirmado' },
    { direction: 'volta', dateLabel: '19 SET 2026',
      departure: { airport: 'REC', airportName: 'Guararapes', datetime: '2026-09-19T13:00:00-03:00' },
      arrival:   { airport: 'GRU', airportName: 'Guarulhos', datetime: '2026-09-19T16:30:00-03:00' },
      flightNumber: 'AD 4002', durationText: '3h30',
      cabinClass: 'Econômica',
      airlineDisplayName: 'Azul Linhas Aéreas', status: 'Confirmado' }
  ],
  baggage: [
    { direction: 'ida',   label: 'Bagagem despachada', weightText: '23kg', quantity: 1 },
    { direction: 'volta', label: 'Bagagem despachada', weightText: '23kg', quantity: 1 }
  ],
  branding: { airlineName: 'Azul', logoUrl: null, primaryColor: '#003DA5' }
};

async function extractVoucher(buffer, mimetype) {
  if (!SUPPORTED.includes(mimetype)) {
    throw new Error(`mimetype não suportado: ${mimetype}`);
  }
  if (!process.env.GEMINI_API_KEY) {
    return normalize(STUB);
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.5-flash' });
  const part = { inlineData: { data: buffer.toString('base64'), mimeType: mimetype } };
  const result = await model.generateContent([PROMPT, part]);
  const text = result.response.text().trim().replace(/^```json\s*|\s*```$/g, '');
  const parsed = JSON.parse(text);
  // Strip any stale meta from Gemini so normalizer's fresh parsedAt wins
  delete parsed.meta;
  return normalize(parsed);
}

module.exports = { extractVoucher, STUB };
