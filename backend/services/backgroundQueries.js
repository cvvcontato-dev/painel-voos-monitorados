const { destinationKey } = require('../helpers/slug');

// Monta as buscas de foto para um destino. O Pexels é tagueado em inglês e por
// palavra-chave, então o resultado depende muito do termo: "Gramado aerial beach"
// traz praia genérica. Aqui o Gemini (já usado na extração do print) diz que tipo
// de lugar é o destino e propõe termos coerentes. Sem chave, em modo stub ou se a
// chamada falhar, cai num conjunto neutro que não força nenhum tipo de paisagem.

const TIMEOUT_MS = 8000;
const MAX_QUERIES = 5;
const MAX_QUERY_LEN = 80;
const CACHE_LIMIT = 500;
const TIPOS = ['praia', 'ilha', 'serra', 'cidade', 'natureza', 'deserto', 'neve', 'resort', 'historico'];

// Só respostas do Gemini entram no cache: um fallback causado por falha passageira
// não pode ficar "grudado" e impedir a próxima tentativa de usar o modelo.
const cache = new Map();

function buildPrompt(destination, country) {
  return [
    'Você ajuda a escolher fotos de fundo para anúncios de pacotes de viagem.',
    `Destino: "${destination}"${country ? ` (país: "${country}")` : ''}.`,
    '',
    'Responda SOMENTE com um objeto JSON, sem texto extra, neste formato:',
    '{"tipo": "<um de: ' + TIPOS.join(', ') + '>", "queries": ["...", "..."]}',
    '',
    'Regras para "queries":',
    `- de 3 a ${MAX_QUERIES} buscas EM INGLÊS para um banco de fotos de turismo, da mais específica à mais ampla;`,
    '- a primeira deve citar o nome próprio do destino e uma imagem típica dele (ex.: "Gramado Brazil pine trees town");',
    '- NÃO force "beach" ou "sea" se o destino não é de praia;',
    '- evite termos que tragam retratos, pessoas em close, textos ou logotipos;',
    '- não invente atrações: se não conhecer bem o destino, use só o nome com "travel" e "landscape".'
  ].join('\n');
}

/** Valida e higieniza a resposta do modelo; devolve null se não servir. */
function parseModelOutput(text) {
  const json = (String(text || '').match(/\{[\s\S]*\}/) || [null])[0];
  if (!json) return null;
  let data;
  try { data = JSON.parse(json); } catch { return null; }
  if (!data || !Array.isArray(data.queries)) return null;

  const seen = new Set();
  const queries = [];
  for (const raw of data.queries) {
    if (typeof raw !== 'string') continue;
    const q = raw.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LEN);
    if (q.length < 3 || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    queries.push(q);
    if (queries.length >= MAX_QUERIES) break;
  }
  if (queries.length === 0) return null;

  const tipo = TIPOS.includes(String(data.tipo || '').toLowerCase()) ? String(data.tipo).toLowerCase() : null;
  return { tipo, queries };
}

/** Termos neutros: não assume praia, montanha nem cidade. */
function fallbackQueries(destination, country) {
  const dest = String(destination || '').trim();
  const ctry = String(country || '').trim();
  const hint = ctry && ctry.toLowerCase() !== dest.toLowerCase() ? ` ${ctry}` : '';
  return [
    `${dest}${hint} landscape`,
    `${dest}${hint} travel`,
    `${dest}${hint} aerial view`,
    `${dest}${hint}`
  ];
}

/** Chamada real ao Gemini; devolve null quando não há como chamar. */
async function defaultGenerate(prompt) {
  if ((process.env.EXTRACTION_MODE || 'stub') === 'stub') return null;
  if (!process.env.GEMINI_API_KEY) return null;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    .getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

function withTimeout(promise, ms) {
  let timer;
  const limite = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}

/**
 * Retorna { queries, tipo, origin } onde origin é 'gemini', 'cache' ou 'fallback'.
 * O parâmetro generate existe para os testes injetarem uma resposta falsa.
 */
async function buildQueries(destination, country, { generate = defaultGenerate } = {}) {
  const dest = String(destination || '').trim();
  const key = destinationKey(dest);
  if (!key) return { queries: [], tipo: null, origin: 'fallback' };

  const cacheKey = `${key}|${String(country || '').trim().toLowerCase()}`;
  if (cache.has(cacheKey)) return { ...cache.get(cacheKey), origin: 'cache' };

  try {
    const text = await withTimeout(generate(buildPrompt(dest, country)), TIMEOUT_MS);
    const parsed = text ? parseModelOutput(text) : null;
    if (parsed) {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, parsed);
      return { ...parsed, origin: 'gemini' };
    }
  } catch (err) {
    console.warn(`[BG-QUERIES] Gemini indisponível para "${dest}": ${err.message} — usando termos neutros.`);
  }
  return { queries: fallbackQueries(dest, country), tipo: null, origin: 'fallback' };
}

function clearCache() { cache.clear(); }

module.exports = { buildQueries, fallbackQueries, parseModelOutput, buildPrompt, clearCache, TIPOS, MAX_QUERIES };
