import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as api from '../../api/voucherClient';
import {
  THEMES, detectCarrierKey, fmtTime, dateLabelWithDow,
  CarrierLogo, IconPhone, IconMail, IconGlobe, IconBag, IconArrow
} from './_shared';

function paxTypeLabel(type) {
  const t = (type || '').toLowerCase();
  if (t === 'crianca' || t === 'criança' || t === 'child') return 'Criança';
  if (t === 'bebe' || t === 'bebê' || t === 'infant') return 'Bebê';
  return 'Adulto';
}

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
            <CarrierLogo carrierKey={carrierKey} theme={theme} />
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
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ color: 'white' }}>{data.reservation?.status || 'Confirmado'}</span>
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
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#9aa5b8', letterSpacing: 1 }}>{dateLabelWithDow(t)}</div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1a2a48' }}>{b.label}</span>
                      {b.weightText && <span style={{ fontSize: 11, color: '#9aa5b8', marginTop: 2 }}>{b.weightText}</span>}
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
            <img src="/voucher-assets/agency-logo.png" alt="Clube do Voo Viagens" style={{ maxHeight: 56, maxWidth: 200, objectFit: 'contain', borderRadius: 10, background: 'white', padding: 4 }} onError={e => { e.target.style.display = 'none'; }} />
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
