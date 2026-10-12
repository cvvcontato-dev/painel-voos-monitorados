const fs = require('fs'); const path = require('path');
const { slugify } = require('../helpers/slug');
const { buildQueries } = require('./backgroundQueries');
const library = require('./backgroundLibrary');

// Fotos "legadas" versionadas no repositório (preenchidas pelo script seed-backgrounds).
// Continuam funcionando, mas o banco de fundos (backgroundLibrary) tem prioridade.
const DIR = path.join(__dirname, '..', 'static', 'promo-backgrounds');

function localFor(destination) {
  const slug = slugify(destination);
  const opts = [];
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const f = path.join(DIR, `${slug}.${ext}`);
    if (fs.existsSync(f)) opts.push({ source: 'local', url: `/static/promo-backgrounds/${slug}.${ext}`, thumb: `/static/promo-backgrounds/${slug}.${ext}` });
  }
  return opts;
}

async function searchPexels(query, perPage = 8) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait&size=large`;
  try {
    const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.photos || [];
  } catch (e) { return []; }
}

// A URL do Pexels traz parâmetros de tamanho (?auto=compress&w=940...); o caminho
// já identifica a foto, então é ele que serve para reconhecer uma foto já salva.
const photoKey = (u) => String(u || '').split('?')[0];

const toPexelsOption = (p) => ({
  source: 'pexels',
  url: p.src.large2x || p.src.large,
  thumb: p.src.medium,
  photographer: p.photographer || undefined
});

// Busca por destino. As consultas vêm de buildQueries: o Gemini classifica o lugar
// (praia, serra, cidade...) e escreve termos em inglês coerentes com ele; sem Gemini
// usa termos neutros. A ordem vai do mais específico ao mais amplo, e para quando
// junta fotos suficientes, então a busca ampla só roda se as específicas renderem pouco.
async function pexelsFor(destination, country, { queries } = {}) {
  if (!process.env.PEXELS_API_KEY) return [];
  const dest = String(destination || '').trim();
  if (!dest) return [];
  const qs = queries && queries.length ? queries : (await buildQueries(dest, country)).queries;
  const seen = new Set();
  const results = [];
  const TARGET = 10;
  for (const q of qs) {
    if (results.length >= TARGET) break;
    const photos = await searchPexels(q, 6);
    for (const p of photos) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      results.push(toPexelsOption(p));
      if (results.length >= TARGET) break;
    }
  }
  return results;
}

// Busca livre: o operador digita o termo ("dunas", "centro histórico") e vê o que
// o Pexels devolve, sem nenhuma reescrita.
async function pexelsSearch(term, { limit = 12 } = {}) {
  if (!process.env.PEXELS_API_KEY) return [];
  const q = String(term || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return [];
  const seen = new Set();
  const out = [];
  for (const p of await searchPexels(q, limit)) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(toPexelsOption(p));
  }
  return out;
}

/**
 * Opções de fundo para um destino.
 *  - query: busca livre no Pexels (ignora o banco).
 *  - includePexels: mistura sugestões do Pexels mesmo havendo fotos no banco.
 * Sem foto curada (banco ou legada), cai no Pexels. Com foto curada, mostra só ela,
 * já indicando qual é a padrão (default_url) para a tela pré-selecionar.
 */
async function listBackgrounds(destination, country, { query, includePexels = false } = {}) {
  if (query) {
    return { options: await pexelsSearch(query), default_url: null, mode: 'search', has_curated: false };
  }

  let banco = [];
  try { banco = await library.listForDestination(destination); }
  catch (err) { console.error('[BG] Falha ao ler o banco de fundos:', err.message); }

  const curated = [...banco, ...(banco.length ? [] : localFor(destination))];
  const defaultUrl = (banco.find(o => o.is_default) || curated[0])?.url ?? null;

  if (curated.length && !includePexels) {
    return { options: curated, default_url: defaultUrl, mode: 'curated', has_curated: true };
  }
  // Sugestões que já foram salvas no banco não precisam reaparecer na grade.
  const salvas = new Set(banco.map(o => photoKey(o.source_url)).filter(Boolean));
  const pexels = (await pexelsFor(destination, country)).filter(o => !salvas.has(photoKey(o.url)));
  return {
    options: [...curated, ...pexels],
    default_url: defaultUrl,
    mode: curated.length ? 'curated+pexels' : 'pexels',
    has_curated: curated.length > 0
  };
}

module.exports = { listBackgrounds, pexelsFor, pexelsSearch, slugify, DIR };
