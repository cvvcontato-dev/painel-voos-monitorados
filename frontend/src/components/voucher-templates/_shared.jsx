import React, { useState } from 'react';

// Theme per carrier — DARK headers matching the real Azul voucher layout.
export const THEMES = {
  azul:  { headerBg: '#001a4d',                                              accent: '#003DA5', initial: 'A', name: 'Azul Linhas Aéreas' },
  latam: { headerBg: 'linear-gradient(90deg, #0d1d4f 0%, #c8102e 100%)',     accent: '#0d1d4f', initial: 'L', name: 'Latam Airlines' },
  gol:   { headerBg: 'linear-gradient(135deg, #ff6b00 0%, #ff4500 100%)',    accent: '#ff5500', initial: 'G', name: 'Gol Linhas Aéreas' },
  multi: { headerBg: 'linear-gradient(90deg, #3871c1 0%, #00569e 100%)',     accent: '#00569e', initial: '✈', name: 'Voo combinado' }
};

export function detectCarrierKey(data) {
  const names = (data.trips || [])
    .map(t => (t.airlineDisplayName || '').trim().toLowerCase())
    .filter(Boolean);
  const distinct = Array.from(new Set(names));
  if (distinct.length > 1) return 'multi';
  const c = (data.carrier || '').toLowerCase();
  return ['azul', 'latam', 'gol'].includes(c) ? c : 'azul';
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// SVG icons (no emojis — Playwright Chromium safe).
export const IconPhone = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
);
export const IconMail = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
);
export const IconGlobe = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
);
export const IconBag = ({ color = '#666', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M17 6h-2V3c0-.55-.45-1-1-1h-4c-.55 0-1 .45-1 1v3H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2v1h2v-1h6v1h2v-1c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2h2v2h-2V4zM7 19V8h10v11H7z"/></svg>
);
export const IconArrow = ({ color = '#9aa5b8', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M16.01 11H4v2h12.01v3L20 12l-3.99-4z"/></svg>
);
export const IconPlane = ({ color = '#003DA5', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
);
export const IconUser = ({ color = '#1a2a48', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
);

const WEEKDAYS_PTBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export function dateLabelWithDow(t) {
  const base = (t.dateLabel || '').trim();
  if (!t.departure?.datetime) return base;
  const upper = base.toUpperCase();
  if (WEEKDAYS_PTBR.some(d => upper.startsWith(d))) return base;
  const dow = WEEKDAYS_PTBR[new Date(t.departure.datetime).getDay()];
  if (!dow) return base;
  return `${dow}, ${base}`;
}

export function CarrierLogo({ carrierKey, theme, large = false, bare = false }) {
  const [failed, setFailed] = useState(false);
  if (bare && !failed && carrierKey !== 'multi') {
    return (
      <img
        src={`/voucher-assets/carrier-logos/${carrierKey}.png`}
        alt={theme.name}
        style={{ maxHeight: 64, maxWidth: 200, objectFit: 'contain', display: 'block' }}
        onError={() => setFailed(true)}
      />
    );
  }
  const boxSize = large ? 80 : 56;
  const maxW = large ? 180 : boxSize;
  const wrapperStyle = {
    width: large ? maxW : boxSize,
    height: boxSize,
    background: 'white',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: large ? 'none' : '0 2px 6px rgba(0,0,0,0.12)',
    padding: 6
  };
  const fallback = (
    <div style={{ ...wrapperStyle, flexDirection: 'column', color: theme.accent }}>
      <div style={{ fontSize: large ? 32 : 24, fontWeight: 800, lineHeight: 1 }}>{theme.initial}</div>
      <svg width={large ? 20 : 16} height={large ? 20 : 16} viewBox="0 0 24 24" fill={theme.accent} style={{ marginTop: 2 }}>
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    </div>
  );
  if (carrierKey === 'multi' || failed) return fallback;
  return (
    <div style={wrapperStyle}>
      <img
        src={`/voucher-assets/carrier-logos/${carrierKey}.png`}
        alt={theme.name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
