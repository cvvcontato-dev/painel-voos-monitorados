import React, { useEffect, useState } from 'react';
import * as api from '../../api/voucherClient';
import {
  THEMES, detectCarrierKey, fmtTime,
  CarrierLogo, IconPlane, IconBag, IconUser, IconPhone, IconMail, IconGlobe
} from './_shared';

// Modelo Compacto usa SEMPRE as cores da agência — independe da companhia aérea.
// Apenas a logo (e os dados) mudam por carrier.
const AGENCY_THEME = {
  accent: '#00569e',
  accentLight: '#3871c1',
  pillBg: '#e6effa',
  name: 'Clube do Voo Viagens'
};

function fullDateLabel(t) {
  if (!t || !t.departure?.datetime) return (t && t.dateLabel) || '';
  const d = new Date(t.departure.datetime);
  const dow = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dow.charAt(0).toUpperCase() + dow.slice(1)}, ${dd}/${mm}/${yyyy}`;
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function directionLabel(dir) {
  const d = (dir || '').toLowerCase();
  if (d === 'ida' || d === 'outbound') return 'IDA';
  if (d === 'volta' || d === 'return' || d === 'inbound') return 'VOLTA';
  return (dir || '').toUpperCase();
}

export default function VoucherCompactoV1({ data }) {
  const [settings, setSettings] = useState({ contact_phone: '', contact_email: '', contact_site: '', contact_extra: '' });
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  if (!data) return null;

  const carrierKey = detectCarrierKey(data);
  // Tema do carrier é usado APENAS para o componente de logo (CarrierLogo precisa
  // dele pro fallback "inicial+avião" caso o PNG da cia não exista).
  const carrierTheme = THEMES[carrierKey];
  // Já o tema visual do template é fixo nas cores da agência.
  const theme = AGENCY_THEME;
  const trips = data.trips || [];
  const passengers = data.passengers || [];
  const baggage = data.baggage || [];

  // Preserve first-seen order of directions.
  const directions = [];
  const seen = new Set();
  for (const t of trips) {
    const d = t.direction || '';
    if (!seen.has(d)) { seen.add(d); directions.push(d); }
  }

  return (
    <div data-voucher-ready={data.layoutVersion} style={{ width: 794, minHeight: 1123, fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a2a48', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER (white, no dark band) */}
      <header style={{ padding: '28px 36px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <CarrierLogo carrierKey={carrierKey} theme={carrierTheme} large />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#9aa5b8', letterSpacing: 1, textTransform: 'uppercase' }}>Localizador</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: theme.accent, letterSpacing: 2 }}>{data.reservation?.locator}</div>
        </div>
      </header>

      {/* ITINERARY BLOCKS (one per direction) */}
      <div style={{ padding: '0 24px' }}>
        {directions.map(dir => {
          const tripsInDir = trips.filter(t => (t.direction || '') === dir);
          const firstTrip = tripsInDir[0];
          return (
            <div key={dir} style={{ background: '#f4f6f9', borderRadius: 12, padding: 18, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconPlane color={theme.accent} size={18} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#1a2a48' }}>{directionLabel(dir)}</span>
                </div>
                <div style={{ fontSize: 13, color: '#1a2a48', fontWeight: 600 }}>{fullDateLabel(firstTrip)}</div>
                <div style={{ background: '#dbeafe', color: theme.accent, padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                  {tripsInDir.length} {tripsInDir.length === 1 ? 'trecho' : 'trechos'}
                </div>
              </div>
              {tripsInDir.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: i > 0 ? 14 : 0, borderTop: i > 0 ? '1px solid #e5eaf0' : 'none', marginTop: i > 0 ? 6 : 0 }}>
                  <div style={{ minWidth: 90, textAlign: 'left' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{fmtTime(t.departure?.datetime)}</div>
                    <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>{shortDate(t.departure?.datetime)}</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#6b7a90' }}>
                    <div style={{ fontWeight: 600 }}>Aeroporto</div>
                    <div>({t.departure?.airport})</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#1a2a48', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span>{t.departure?.airport}</span>
                      <span style={{ color: theme.accent, display: 'inline-flex' }}><IconPlane color={theme.accent} size={16} /></span>
                      <span>{t.arrival?.airport}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>Voo {t.flightNumber}</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#6b7a90' }}>
                    <div style={{ fontWeight: 600 }}>Aeroporto</div>
                    <div>({t.arrival?.airport})</div>
                  </div>
                  <div style={{ minWidth: 90, textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{fmtTime(t.arrival?.datetime)}</div>
                    <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 4 }}>{shortDate(t.arrival?.datetime)}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Passageiros */}
      <div style={{ padding: '6px 24px 14px' }}>
        <h3 style={{ color: theme.accent, fontSize: 15, fontWeight: 700, margin: '14px 0 12px' }}>Passageiros: {passengers.length}</h3>
        {passengers.map(p => {
          const idaBags = baggage.filter(b => (b.direction || '').toLowerCase() === 'ida');
          return (
            <div key={p.order} style={{ border: '1px solid #e5eaf0', borderRadius: 10, padding: 14, marginBottom: 10, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconUser color="#1a2a48" size={16} />
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 13 }}>{p.name}</span>
                </div>
                <div style={{ fontSize: 11, color: theme.accent }}>e-ticket: {p.loyaltyNumber || p.documento || '—'}</div>
              </div>
              <div style={{ background: '#f4f6f9', borderRadius: 8, padding: 12, display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ background: '#dbeafe', color: theme.accent, padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>Ida</span>
                    <span style={{ fontSize: 11, color: '#6b7a90' }}>Assentos</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#1a2a48' }}>—</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#6b7a90', marginBottom: 6 }}>Bagagens</div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    {idaBags.length === 0 && (
                      <div style={{ fontSize: 12, color: '#9aa5b8' }}>—</div>
                    )}
                    {idaBags.map((b, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                        <IconBag color="#1a2a48" size={14} />
                        <span style={{ fontWeight: 700 }}>{b.quantity ?? 1}</span>
                        {b.weightText && <span style={{ color: '#9aa5b8', fontSize: 10 }}>{b.weightText}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Informações */}
      <div style={{ padding: '0 24px 14px' }}>
        <h3 style={{ color: theme.accent, fontSize: 15, fontWeight: 700, margin: '4px 0 8px' }}>Informações</h3>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#6b7a90' }}>
          <IconBag color="#9aa5b8" size={14} />
          <span>Além da bagagem especificada acima, cada passageiro pode levar consigo uma bolsa, mochila ou sacola (considerado item pessoal).</span>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ marginTop: 'auto', padding: '16px 36px 14px', borderTop: `3px solid ${theme.accent}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <img src="/voucher-assets/agency-logo.png" alt="Clube do Voo Viagens" style={{ maxHeight: 56, maxWidth: 200, objectFit: 'contain', borderRadius: 10, background: 'white', padding: 4 }} onError={e => { e.target.style.display = 'none'; }} />
          <div style={{ fontSize: 11, color: '#555', textAlign: 'right', lineHeight: 1.6 }}>
            {settings.contact_phone && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}><IconPhone color="#888" size={12} /> {settings.contact_phone}</div>}
            {settings.contact_email && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}><IconMail color="#888" size={12} /> {settings.contact_email}</div>}
            {settings.contact_site && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}><IconGlobe color="#888" size={12} /> {settings.contact_site}</div>}
            {settings.contact_extra && <div style={{ color: '#777' }}>{settings.contact_extra}</div>}
          </div>
        </div>
      </footer>
    </div>
  );
}
