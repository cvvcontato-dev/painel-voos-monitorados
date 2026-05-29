import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as api from '../../api/voucherClient';

// Theme per carrier — DARK headers matching the real Azul voucher layout.
const THEMES = {
  azul:  { headerBg: '#001a4d',                                              accent: '#003DA5', initial: 'A', name: 'Azul Linhas Aéreas' },
  latam: { headerBg: 'linear-gradient(90deg, #0d1d4f 0%, #c8102e 100%)',     accent: '#0d1d4f', initial: 'L', name: 'Latam Airlines' },
  gol:   { headerBg: 'linear-gradient(135deg, #ff6b00 0%, #ff4500 100%)',    accent: '#ff5500', initial: 'G', name: 'Gol Linhas Aéreas' },
  multi: { headerBg: 'linear-gradient(90deg, #3871c1 0%, #00569e 100%)',     accent: '#00569e', initial: '✈', name: 'Voo combinado' }
};

function detectCarrierKey(data) {
  const names = (data.trips || [])
    .map(t => (t.airlineDisplayName || '').trim().toLowerCase())
    .filter(Boolean);
  const distinct = Array.from(new Set(names));
  if (distinct.length > 1) return 'multi';
  const c = (data.carrier || '').toLowerCase();
  return ['azul', 'latam', 'gol'].includes(c) ? c : 'azul';
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function paxTypeLabel(type) {
  const t = (type || '').toLowerCase();
  if (t === 'crianca' || t === 'criança' || t === 'child') return 'Criança';
  if (t === 'bebe' || t === 'bebê' || t === 'infant') return 'Bebê';
  return 'Adulto';
}

// SVG icons (no emojis — Playwright Chromium safe).
const IconPhone = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
);
const IconMail = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
);
const IconGlobe = ({ color = '#888', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
);
const IconBag = ({ color = '#666', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M17 6h-2V3c0-.55-.45-1-1-1h-4c-.55 0-1 .45-1 1v3H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2v1h2v-1h6v1h2v-1c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2h2v2h-2V4zM7 19V8h10v11H7z"/></svg>
);
const IconArrow = ({ color = '#9aa5b8', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M16.01 11H4v2h12.01v3L20 12l-3.99-4z"/></svg>
);

function SectionTitle({ children, accent }) {
  return (
    <h3 style={{ fontSize: 13, color: accent, margin: 0, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: accent }}>•</span> {children}
    </h3>
  );
}

function Separator({ flightNumber, durationText, accent }) {
  return (
    <div style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 11, color: '#6b7a90', marginBottom: 4 }}>{flightNumber}</div>
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
        <span style={{ flex: 1, borderTop: '1px solid #c8d0dc' }} />
        <IconArrow color={accent} size={14} />
        <span style={{ flex: 1, borderTop: '1px solid #c8d0dc' }} />
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
      </div>
      <div style={{ fontSize: 10, color: '#9aa5b8', marginTop: 4 }}>{durationText}</div>
    </div>
  );
}

function tripSubtitle(direction) {
  const d = (direction || '').toLowerCase();
  if (d === 'ida' || d === 'outbound') return 'VOO DE IDA';
  if (d === 'volta' || d === 'return' || d === 'inbound') return 'VOO DE VOLTA';
  return 'VOO';
}

function baggageSubtitle(direction) {
  const d = (direction || '').toLowerCase();
  if (d === 'ida' || d === 'outbound') return 'BAGAGENS DE IDA';
  if (d === 'volta' || d === 'return' || d === 'inbound') return 'BAGAGENS DE VOLTA';
  return 'BAGAGENS';
}

export default function VoucherCanonicalV1({ data }) {
  const [qrUrl, setQrUrl] = useState('');
  const [settings, setSettings] = useState({ contact_phone: '', contact_email: '', contact_site: '', contact_extra: '' });

  useEffect(() => {
    if (data?.reservation?.locator) {
      QRCode.toDataURL(data.reservation.locator, { width: 120, margin: 0 }).then(setQrUrl).catch(() => {});
    }
  }, [data?.reservation?.locator]);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
  }, []);

  if (!data) return null;
  const carrierKey = detectCarrierKey(data);
  const theme = THEMES[carrierKey];
  const trips = data.trips || [];
  const baggage = data.baggage || [];
  const passengers = data.passengers || [];

  // Group baggage by direction (preserving first-seen order).
  const baggageDirections = [];
  const baggageByDirection = {};
  for (const b of baggage) {
    const dir = b.direction || '';
    if (!(dir in baggageByDirection)) {
      baggageByDirection[dir] = [];
      baggageDirections.push(dir);
    }
    baggageByDirection[dir].push(b);
  }

  const airlineName = carrierKey === 'multi' ? theme.name : (data.branding?.airlineName || theme.name);

  return (
    <div data-voucher-ready={data.layoutVersion} style={{ width: 794, minHeight: 1123, fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a2a48', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER */}
      <header style={{ background: theme.headerBg, color: 'white', padding: '28px 36px' }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, background: 'white', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: theme.accent, boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{theme.initial}</div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={theme.accent} style={{ marginTop: 2 }}><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: 'white' }}>{airlineName}</div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>Reserva Confirmada</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.75)' }}>Localizador</div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 4, color: 'white', lineHeight: 1.1, marginTop: 2 }}>{data.reservation?.locator}</div>
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.15)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>Passageiros</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginTop: 4 }}>{passengers.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>Origem</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginTop: 4 }}>{data.route?.origin}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>Destino</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginTop: 4 }}>{data.route?.destination}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>Status</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#22c55e' }}>●</span> {data.reservation?.status}
            </div>
          </div>
        </div>
      </header>

      {/* PASSAGEIROS */}
      <section style={{ padding: '22px 36px 14px' }}>
        <SectionTitle accent={theme.accent}>Passageiros</SectionTitle>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {passengers.map(p => (
            <div key={p.order} style={{ background: '#f4f6f9', borderRadius: 6, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ display: 'inline-block', minWidth: 24, fontSize: 13, color: '#9aa5b8' }}>{String(p.order).padStart(2, '0')}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2a48' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 2 }}>{paxTypeLabel(p.type)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ITINERÁRIO */}
      <section style={{ padding: '14px 36px' }}>
        <SectionTitle accent={theme.accent}>Itinerário</SectionTitle>
        <div style={{ marginTop: 12 }}>
          {trips.map((t, i) => (
            <div key={i} style={{ padding: '14px 0', borderBottom: i < trips.length - 1 ? '1px solid #e5eaf0' : 'none' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#9aa5b8', marginBottom: 10 }}>{tripSubtitle(t.direction)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Date column */}
                <div style={{ minWidth: 140 }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#9aa5b8', letterSpacing: 1 }}>{t.dateLabel}</div>
                </div>
                {/* Departure */}
                <div style={{ minWidth: 110 }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#1a2a48', lineHeight: 1 }}>{fmtTime(t.departure?.datetime)}</div>
                  <div style={{ fontSize: 13, color: '#6b7a90', marginTop: 6 }}>{t.departure?.airport} ·</div>
                </div>
                {/* Center separator */}
                <Separator flightNumber={t.flightNumber} durationText={t.durationText} accent={theme.accent} />
                {/* Arrival */}
                <div style={{ minWidth: 110, textAlign: 'right' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#1a2a48', lineHeight: 1 }}>{fmtTime(t.arrival?.datetime)}</div>
                  <div style={{ fontSize: 13, color: '#6b7a90', marginTop: 6 }}>· {t.arrival?.airport}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BAGAGENS */}
      {baggage.length > 0 && (
        <section style={{ padding: '14px 36px 20px' }}>
          <SectionTitle accent={theme.accent}>Bagagens</SectionTitle>
          <div style={{ marginTop: 12 }}>
            {baggageDirections.map(dir => (
              <div key={dir} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#9aa5b8', marginBottom: 8 }}>{baggageSubtitle(dir)}</div>
                {baggageByDirection[dir].map((b, j) => (
                  <div key={j} style={{ background: '#f4f6f9', borderRadius: 6, padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <IconBag color="#6b7a90" size={18} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2a48' }}>{b.label}</div>
                      {b.weightText && <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 2 }}>{b.weightText}</div>}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a2a48' }}>{b.quantity}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer style={{ marginTop: 'auto', padding: '16px 36px 14px', borderTop: `3px solid ${theme.accent}`, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <img src="/voucher-assets/agency-logo.png" alt="Clube do Voo Viagens" style={{ maxHeight: 50, maxWidth: 180, objectFit: 'contain', display: 'block' }} onError={e => { e.target.style.display = 'none'; }} />
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.7, marginTop: 8 }}>
              {settings.contact_phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconPhone color="#888" size={12} /> <span>{settings.contact_phone}</span>
                </div>
              )}
              {settings.contact_email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconMail color="#888" size={12} /> <span>{settings.contact_email}</span>
                </div>
              )}
              {settings.contact_site && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconGlobe color="#888" size={12} /> <span>{settings.contact_site}</span>
                </div>
              )}
              {settings.contact_extra && <div style={{ color: '#777', marginTop: 2 }}>{settings.contact_extra}</div>}
            </div>
          </div>
          {qrUrl && (
            <div style={{ textAlign: 'center' }}>
              <img src={qrUrl} alt="QR localizador" style={{ width: 90, height: 90, background: 'white', padding: 4, border: '1px solid #e5eaf0', display: 'block' }} />
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: '#888', marginTop: 4, textAlign: 'center' }}>Localizador</div>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
