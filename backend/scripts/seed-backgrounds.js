#!/usr/bin/env node
/**
 * Seed da biblioteca local de fundos de promoção.
 *
 * Baixa UMA foto retrato por destino do Pexels e salva em
 * backend/static/promo-backgrounds/<slug>.jpg, usando o mesmo slugify do
 * backgroundResolver (para os nomes baterem com a busca em runtime).
 *
 * Uso:
 *   PEXELS_API_KEY=xxxxx node scripts/seed-backgrounds.js
 *   PEXELS_API_KEY=xxxxx node scripts/seed-backgrounds.js "Natal" "Fortaleza"
 *   PEXELS_API_KEY=xxxxx node scripts/seed-backgrounds.js --force   # sobrescreve existentes
 *
 * Sem argumentos de destino, usa a lista padrão de destinos recorrentes.
 * Por padrão NÃO sobrescreve um arquivo que já existe (use --force para isso).
 *
 * Depois de rodar: confira as imagens, troque manualmente as que não gostar,
 * e faça commit da pasta backend/static/promo-backgrounds/.
 */

const fs = require('fs');
const path = require('path');
const { slugify, DIR } = require('../services/backgroundResolver');

const DEFAULT_DESTINATIONS = [
  'Maceió', 'Porto Seguro', 'Florianópolis', 'Belo Horizonte', 'Rio de Janeiro'
];

const args = process.argv.slice(2);
const force = args.includes('--force');
const destinations = args.filter(a => a !== '--force');
const targets = destinations.length ? destinations : DEFAULT_DESTINATIONS;

const KEY = process.env.PEXELS_API_KEY;
if (!KEY) {
  console.error('ERRO: defina PEXELS_API_KEY no ambiente antes de rodar.');
  console.error('Ex.: PEXELS_API_KEY=xxxxx node scripts/seed-backgrounds.js');
  process.exit(1);
}

fs.mkdirSync(DIR, { recursive: true });

async function fetchPhoto(destination) {
  const query = encodeURIComponent(`${destination} turismo paisagem`);
  const url = `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: KEY } });
  if (!res.ok) throw new Error(`Pexels respondeu ${res.status}`);
  const data = await res.json();
  const photo = (data.photos || [])[0];
  if (!photo) return null;
  return { src: photo.src.large2x || photo.src.large, by: photo.photographer };
}

async function download(src, dest) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`download falhou: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

(async () => {
  for (const destination of targets) {
    const slug = slugify(destination);
    const dest = path.join(DIR, `${slug}.jpg`);
    if (fs.existsSync(dest) && !force) {
      console.log(`• ${destination} (${slug}.jpg) já existe — pulando (use --force p/ sobrescrever)`);
      continue;
    }
    try {
      const photo = await fetchPhoto(destination);
      if (!photo) { console.warn(`! ${destination}: nenhuma foto encontrada no Pexels`); continue; }
      await download(photo.src, dest);
      console.log(`✓ ${destination} → ${slug}.jpg  (foto: ${photo.by} / Pexels)`);
    } catch (err) {
      console.error(`✗ ${destination}: ${err.message}`);
    }
  }
  console.log('\nPronto. Confira as imagens em backend/static/promo-backgrounds/,');
  console.log('troque manualmente as que quiser, e faça commit da pasta.');
})();
