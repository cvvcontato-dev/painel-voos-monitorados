import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as api from '../../api/voucherClient';

const AGENCY_PRIMARY = '#3871c1';
const AGENCY_SECONDARY = '#00569e';

// Theme per carrier — header background can be a solid color or a CSS gradient string.
const THEMES = {
  azul:  { header: '#003DA5',                                                       accent: '#003DA5', name: 'Azul Linhas Aéreas' },
  latam: { header: 'linear-gradient(90deg, #0033A0 0%, #0033A0 55%, #ED1C24 100%)', accent: '#0033A0', name: 'Latam Airlines' },
  gol:   { header: '#FF6B00',                                                       accent: '#FF6B00', name: 'Gol Linhas Aéreas' },
  multi: { header: `linear-gradient(90deg, ${AGENCY_PRIMARY} 0%, ${AGENCY_SECONDARY} 100%)`, accent: AGENCY_SECONDARY, name: 'Voo combinado' }
};

function detectCarrierKey(data) {
  // If trips have multiple distinct airlineDisplayName → multi
  const names = (data.trips || [])
    .map(t => (t.airlineDisplayName || '').trim().toLowerCase())
    .filter(Boolean);
  const distinct = Array.from(new Set(names));
  if (distinct.length > 1) return 'multi';
  // Fall back to data.carrier
  const c = (data.carrier || '').toLowerCase();
  return ['azul', 'latam', 'gol'].includes(c) ? c : 'azul';
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// SVG icons
const IconPlane = ({ color = '#fff', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
);
const IconBaggage = ({ color = '#666', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M17 6h-2V3c0-.55-.45-1-1-1h-4c-.55 0-1 .45-1 1v3H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2v1h2v-1h6v1h2v-1c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2h2v2h-2V4zM7 19V8h10v11H7z"/></svg>
);
const IconUser = ({ color = '#666', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
);

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

  return (
    <div data-voucher-ready={data.layoutVersion} style={{ width: 794, minHeight: 1123, fontFamily: 'Arial, Helvetica, sans-serif', color: '#222', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: theme.header, color: 'white', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <IconPlane color="#fff" size={28} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{carrierKey === 'multi' ? theme.name : (data.branding?.airlineName || theme.name)}</div>
            <div style={{ fontSize: 13, opacity: 0.92 }}>Confirmação de Reserva</div>
          </div>
        </div>
        {qrUrl && <img src={qrUrl} alt="QR localizador" style={{ width: 90, height: 90, background: 'white', padding: 6, borderRadius: 4 }} />}
      </header>

      {/* Reservation summary */}
      <section style={{ padding: '20px 32px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>LOCALIZADOR</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 3, color: theme.accent }}>{data.reservation?.locator}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>STATUS</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.accent }}>{data.reservation?.status}</div>
          <div style={{ fontSize: 12, marginTop: 6, color: '#555' }}>{data.route?.origin} → {data.route?.destination}</div>
        </div>
      </section>

      {/* Passengers */}
      <section style={{ padding: '18px 32px', borderBottom: '1px solid #e5e5e5' }}>
        <h3 style={{ fontSize: 13, color: theme.accent, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          <IconUser color={theme.accent} size={16} /> Passageiros
        </h3>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {(data.passengers || []).map(p => (
              <tr key={p.order} style={{ borderBottom: '1px dashed #eee' }}>
                <td style={{ padding: '6px 0', width: 24, color: '#aaa' }}>{p.order}</td>
                <td style={{ padding: '6px 0', fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: '6px 0', textTransform: 'capitalize', color: '#666' }}>{p.type}</td>
                <td style={{ padding: '6px 0', color: '#666', textAlign: 'right' }}>{p.documento || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Trips */}
      {trips.map((t, i) => {
        const tripBaggage = baggage.filter(b => b.direction === t.direction);
        return (
          <section key={i} style={{ padding: '18px 32px', borderBottom: '1px solid #e5e5e5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 13, color: theme.accent, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{t.direction}</h3>
              <div style={{ fontSize: 12, color: '#666' }}>{t.dateLabel} · Voo <strong>{t.flightNumber}</strong>{t.airlineDisplayName ? ` · ${t.airlineDisplayName}` : ''}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'center', minWidth: 110 }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#222', lineHeight: 1 }}>{fmtTime(t.departure?.datetime)}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#444', marginTop: 4 }}>{t.departure?.airport}</div>
              </div>
              <div style={{ flex: 1, padding: '0 16px', position: 'relative' }}>
                <div style={{ borderTop: '1px dashed #bbb', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '0 8px' }}>
                    <IconPlane color={theme.accent} size={22} />
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 11, color: '#888', marginTop: 6 }}>{t.durationText}</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 110 }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#222', lineHeight: 1 }}>{fmtTime(t.arrival?.datetime)}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#444', marginTop: 4 }}>{t.arrival?.airport}</div>
              </div>
            </div>
            {tripBaggage.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <IconBaggage color="#666" size={14} />
                {tripBaggage.map((b, j) => (
                  <span key={j} style={{ marginRight: 12 }}>
                    {b.quantity}× {b.label}{b.weightText ? ` (${b.weightText})` : ''}
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Informações importantes */}
      <section style={{ padding: '14px 32px', background: '#fafafa', borderBottom: '1px solid #e5e5e5', fontSize: 11, color: '#555' }}>
        <div style={{ fontWeight: 700, color: theme.accent, marginBottom: 6, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>Informações importantes</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Apresente-se no aeroporto com no mínimo 2h de antecedência para voos domésticos e 3h para internacionais.</li>
          <li>Documento de identificação com foto (RG, CNH ou passaporte) é obrigatório no embarque.</li>
          <li>Consulte as regras de bagagem da companhia aérea antes da viagem.</li>
          <li>O check-in online geralmente abre 48h antes do voo.</li>
        </ul>
      </section>

      {/* Footer: logo + contact */}
      <footer style={{ marginTop: 'auto', padding: '16px 32px 14px', borderTop: `3px solid ${theme.accent}`, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <img src="/voucher-assets/agency-logo.png" alt="Clube do Voo Viagens" style={{ maxHeight: 50, maxWidth: 180, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
          <div style={{ fontSize: 11, color: '#555', textAlign: 'right', lineHeight: 1.5 }}>
            {settings.contact_phone && <div>📞 {settings.contact_phone}</div>}
            {settings.contact_email && <div>✉ {settings.contact_email}</div>}
            {settings.contact_site && <div>🌐 {settings.contact_site}</div>}
            {settings.contact_extra && <div style={{ color: '#777' }}>{settings.contact_extra}</div>}
          </div>
        </div>
      </footer>
    </div>
  );
}
