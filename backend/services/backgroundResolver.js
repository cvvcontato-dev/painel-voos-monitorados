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

async function pexelsFor(destination) {
  if (!process.env.PEXELS_API_KEY) return [];
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(destination + ' praia turismo')}&per_page=4&orientation=portrait`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.photos || []).map(p => ({ source: 'pexels', url: p.src.large2x || p.src.large, thumb: p.src.medium }));
  } catch (e) { return []; }
}

async function listBackgrounds(destination) {
  const local = localFor(destination);
  const pexels = local.length ? [] : await pexelsFor(destination); // local-first; only fall back when none local
  return { options: [...local, ...pexels] };
}

module.exports = { listBackgrounds, slugify, DIR };
