function hexToRgb(hex) {
  let c = (hex || '#00569e').replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return [0, 86, 158];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
}

function mix(rgb1, rgb2, weight) {
  return [
    rgb1[0] * weight + rgb2[0] * (1 - weight),
    rgb1[1] * weight + rgb2[1] * (1 - weight),
    rgb1[2] * weight + rgb2[2] * (1 - weight)
  ];
}

export function generatePalette(baseHex) {
  const base = hexToRgb(baseHex);
  const white = [255, 255, 255];
  const black = [10, 15, 26];
  return {
    50: rgbToHex(...mix(white, base, 0.92)),
    100: rgbToHex(...mix(white, base, 0.82)),
    200: rgbToHex(...mix(white, base, 0.65)),
    300: rgbToHex(...mix(white, base, 0.45)),
    400: rgbToHex(...mix(white, base, 0.22)),
    500: rgbToHex(...mix(white, base, 0.08)),
    600: baseHex.startsWith('#') ? baseHex : `#${baseHex}`,
    700: rgbToHex(...mix(base, black, 0.80)),
    800: rgbToHex(...mix(base, black, 0.62)),
    900: rgbToHex(...mix(base, black, 0.44)),
    950: rgbToHex(...mix(base, black, 0.25)),
  };
}

export function applyBrandColor(hex) {
  if (!hex || typeof window === 'undefined') return;
  const baseHex = hex.startsWith('#') ? hex : `#${hex}`;
  const palette = generatePalette(baseHex);
  const rgb = hexToRgb(baseHex);
  const rgbLight = hexToRgb(palette[400]);

  const root = document.documentElement;
  root.style.setProperty('--color-brand', baseHex);
  root.style.setProperty('--color-brand-light', palette[400]);
  root.style.setProperty('--color-brand-dark', palette[700]);
  root.style.setProperty('--color-brand-accent', palette[500]);

  Object.entries(palette).forEach(([key, val]) => {
    root.style.setProperty(`--color-indigo-${key}`, val);
  });

  root.style.setProperty('--brand-rgb', `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
  root.style.setProperty('--brand-light-rgb', `${rgbLight[0]}, ${rgbLight[1]}, ${rgbLight[2]}`);

  try {
    localStorage.setItem('agency_brand_color', baseHex);
  } catch (_) {}
}

export function getSavedBrandColor() {
  try {
    return localStorage.getItem('agency_brand_color') || '#00569e';
  } catch (_) {
    return '#00569e';
  }
}

export const PRESET_BRAND_COLORS = [
  { name: 'Clube do Voo (Padrão)', hex: '#00569e', description: 'Azul náutico clássico e confiável' },
  { name: 'Azul Royal', hex: '#1d4ed8', description: 'Moderno, vibrante e corporativo' },
  { name: 'Verde Esmeralda', hex: '#059669', description: 'Elegância, frescor e prosperidade' },
  { name: 'Roxo / Índigo', hex: '#4f46e5', description: 'Tecnológico, premium e inovador' },
  { name: 'Laranja Solar', hex: '#ea580c', description: 'Acolhedor, dinâmico e entusiasta' },
  { name: 'Bordô / Vinho', hex: '#be123c', description: 'Luxo, sofisticação e viagens exclusivas' },
  { name: 'Grafite Executivo', hex: '#1e293b', description: 'Minimalista contemporâneo e sóbrio' },
];
