const fs = require('fs'); const path = require('path');
const DIR = path.join(__dirname, '..', 'static', 'promo-backgrounds');

function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

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

// Estratégia de busca: vai do mais específico ao mais amplo e deduplica.
// O acervo do Pexels é tagueado majoritariamente em inglês — usar termos de
// fotografia de viagem em inglês traz resultados muito mais relevantes que
// genéricos em português. O nome do destino (próprio) entra cru.
async function pexelsFor(destination, country) {
  if (!process.env.PEXELS_API_KEY) return [];
  const dest = String(destination || '').trim();
  if (!dest) return [];
  const ctry = String(country || '').trim();
  const ctryHint = ctry && ctry.toLowerCase() !== dest.toLowerCase() ? ` ${ctry}` : '';
  const queries = [
    `${dest}${ctryHint} aerial beach`,    // foto aérea da praia/destino (inspiracional)
    `${dest}${ctryHint} landscape`,        // paisagem do destino
    `${dest}${ctryHint} travel`,           // material com tag de turismo
    `${dest}${ctryHint}`,                  // amplo
  ];
  const seen = new Set();
  const results = [];
  const TARGET = 10;
  for (const q of queries) {
    if (results.length >= TARGET) break;
    const photos = await searchPexels(q, 6);
    for (const p of photos) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      results.push({
        source: 'pexels',
        url: p.src.large2x || p.src.large,
        thumb: p.src.medium,
        photographer: p.photographer || undefined
      });
      if (results.length >= TARGET) break;
    }
  }
  return results;
}

async function listBackgrounds(destination, country) {
  const local = localFor(destination);
  const pexels = local.length ? [] : await pexelsFor(destination, country); // local-first; só cai no Pexels se não houver foto local curada
  return { options: [...local, ...pexels] };
}

module.exports = { listBackgrounds, pexelsFor, slugify, DIR };
