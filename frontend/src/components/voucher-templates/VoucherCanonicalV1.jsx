import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import * as api from '../../api/voucherClient';
import {
  THEMES, detectCarrierKey, fmtTime, dateLabelWithDow, resolveBaggageWeight, buildBaggageBlocks,
  manageBookingUrl, firstPassengerLastName, normalizeFlightNumber,
  buildReservationGroups, groupShortLabel, dedupeReservationGroups,
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
    <h3 style={{ fontSize: 12, color: accent, margin: 0, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: accent }}>•</span> {children}
    </h3>
  );
}

function Separator({ flightNumber, durationText, accent }) {
  return (
    <div style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 10, color: '#6b7a90', marginBottom: 4 }}>{flightNumber}</div>
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
        <span style={{ flex: 1, borderTop: '1px solid #c8d0dc' }} />
        <IconArrow color={accent} size={14} />
        <span style={{ flex: 1, borderTop: '1px solid #c8d0dc' }} />
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
      </div>
      <div style={{ fontSize: 9, color: '#9aa5b8', marginTop: 4 }}>{durationText}</div>
    </div>
  );
}

function tripSubtitle(direction) {
  const d = (direction || '').toLowerCase();
  if (d === 'ida' || d === 'outbound') return 'VOO DE IDA';
  if (d === 'volta' || d === 'return' || d === 'inbound') return 'VOO DE VOLTA';
  if (d === 'interno') return 'VOO INTERNO';
  return 'VOO';
}

// Título de seção do itinerário a partir do label do grupo de reserva.
function sectionTitleForGroup(label) {
  const l = (label || '').toUpperCase();
  if (l === 'IDA') return 'IDA';
  if (l === 'VOLTA') return 'VOLTA';
  if (l === 'DESTINOS INTERNOS') return 'DESTINOS INTERNOS';
  return l; // "INTERNO — FCO"
}

function baggageSubtitle(direction) {
  const d = (direction || '').toLowerCase();
  if (d === 'ida' || d === 'outbound') return 'BAGAGENS DE IDA — POR PASSAGEIRO';
  if (d === 'volta' || d === 'return' || d === 'inbound') return 'BAGAGENS DE VOLTA — POR PASSAGEIRO';
  return 'BAGAGENS — POR PASSAGEIRO';
}

export default function VoucherCanonicalV1({ data }) {
  const [qrMap, setQrMap] = useState({});
  const [settings, setSettings] = useState({ contact_phone: '', contact_email: '', contact_site: '', contact_extra: '' });

  // Grupos de reserva do itinerário (IDA / DESTINOS INTERNOS / VOLTA).
  const sectionGroups = useMemo(() => (data ? buildReservationGroups(data) : []), [data]);
  // Grupos deduplicados por (cia, PNR) para QRs/CTAs, com a URL de check-in.
  const resGroups = useMemo(() => {
    if (!data) return [];
    return dedupeReservationGroups(sectionGroups).map(g => ({
      ...g,
      bookingUrl: manageBookingUrl(g.carrierKey, g.locator, firstPassengerLastName(data), g.trips?.[0]?.departure?.airport)
    }));
  }, [data, sectionGroups]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(resGroups.map(g => QRCode.toDataURL(g.bookingUrl, { width: 200, margin: 2 }).catch(() => '')))
      .then(urls => {
        if (cancelled) return;
        const m = {};
        resGroups.forEach((g, i) => { m[g.bookingUrl] = urls[i]; });
        setQrMap(m);
      });
    return () => { cancelled = true; };
  }, [resGroups]);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
  }, []);

  if (!data) return null;
  const carrierKey = detectCarrierKey(data);
  const theme = THEMES[carrierKey];
  const baggage = data.baggage || [];
  const passengers = data.passengers || [];

  // Nome no header: cia única (nome canônico do tema) ou soma das cias distintas
  // ("Azul + Gol + Latam") quando multi.
  const _shortNameOf = (ck) => ({ azul: 'Azul', gol: 'Gol', latam: 'Latam' }[ck] || ck);
  const distinctCarriers = [...new Set(resGroups.map(g => g.carrierKey))];
  const _multiCia = (data.carrier || '').toLowerCase() === 'multi' && distinctCarriers.length > 1;
  const _primaryCk = _multiCia ? distinctCarriers[0] : null;
  const _secondaryCk = _multiCia ? distinctCarriers[1] : null;
  const airlineName = _multiCia ? distinctCarriers.map(_shortNameOf).join(' + ') : theme.name;

  const hasMultiGroups = resGroups.length > 1;
  // Tamanho dos QRs no rodapé: ≤4 → 88px; 5–6 → 64px (>6 idem, com scroll natural).
  const qrSize = resGroups.length <= 4 ? 88 : 64;

  return (
    <div data-voucher-ready={data.layoutVersion} style={{ width: 794, minHeight: 1123, fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a2a48', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER */}
      <header style={{ background: theme.headerBg, color: 'white', padding: '20px 32px' }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <CarrierLogo
              carrierKey={_multiCia ? _primaryCk : carrierKey}
              secondaryCarrierKey={_multiCia ? _secondaryCk : null}
              theme={theme}
            />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1, color: 'white' }}>{airlineName}</div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>Reserva Confirmada</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.75)' }}>{hasMultiGroups ? 'Localizadores' : 'Localizador'}</div>
            {hasMultiGroups ? (
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: 'white', lineHeight: 1.4, marginTop: 2 }}>
                {resGroups.map((g, i) => (
                  <div key={i}>{groupShortLabel(g.label)}: {g.locator || '—'}</div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, color: 'white', lineHeight: 1.1, marginTop: 2 }}>{data.reservation?.locator}</div>
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>Passageiros</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginTop: 4 }}>{passengers.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>Origem</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginTop: 4 }}>{data.route?.origin}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>Destino</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginTop: 4 }}>{data.route?.destination}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>Status</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ color: 'white' }}>{data.reservation?.status || 'Confirmado'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* PASSAGEIROS */}
      <section style={{ padding: '14px 32px 8px' }}>
        <SectionTitle accent={theme.accent}>Passageiros</SectionTitle>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'stretch' }}>
          {passengers.map(p => (
            <div key={p.order} style={{ background: '#f4f6f9', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'stretch', gap: 10 }}>
              <span style={{ display: 'inline-block', minWidth: 24, fontSize: 11, color: '#9aa5b8' }}>{String(p.order).padStart(2, '0')}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2a48', flex: 1 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#6b7a90', marginTop: 4 }}>{paxTypeLabel(p.type)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ITINERÁRIO */}
      <section style={{ padding: '8px 32px' }}>
        <SectionTitle accent={theme.accent}>Itinerário</SectionTitle>
        <div style={{ marginTop: 12 }}>
          {sectionGroups.map((g, gi) => (
            <div key={gi} style={{ marginBottom: gi < sectionGroups.length - 1 ? 10 : 0 }}>
              {/* Cabeçalho da seção (IDA / DESTINOS INTERNOS / VOLTA) */}
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: theme.accent, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                {sectionTitleForGroup(g.label)}
                {g.locator && (
                  <span style={{ color: '#9aa5b8', letterSpacing: 1, fontWeight: 600 }}>· LOC {g.locator}</span>
                )}
              </div>
              {g.trips.map((t, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: i < g.trips.length - 1 ? '1px solid #eef1f5' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Date column */}
                    <div style={{ minWidth: 120 }}>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', color: '#9aa5b8', letterSpacing: 1 }}>{dateLabelWithDow(t)}</div>
                    </div>
                    {/* Departure */}
                    <div style={{ minWidth: 110 }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a2a48', lineHeight: 1 }}>{fmtTime(t.departure?.datetime)}</div>
                      <div style={{ fontSize: 12, color: '#6b7a90', marginTop: 4 }}>{t.departure?.airport} ·</div>
                    </div>
                    {/* Center separator */}
                    <Separator flightNumber={normalizeFlightNumber(t.flightNumber)} durationText={t.durationText} accent={theme.accent} />
                    {/* Arrival */}
                    <div style={{ minWidth: 110, textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a2a48', lineHeight: 1 }}>{fmtTime(t.arrival?.datetime)}</div>
                      <div style={{ fontSize: 12, color: '#6b7a90', marginTop: 4 }}>· {t.arrival?.airport}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* BAGAGENS */}
      {(() => {
        const blocks = buildBaggageBlocks(data);
        if (!blocks.length) return null;
        return (
          <section style={{ padding: '8px 32px 12px' }}>
            <SectionTitle accent={theme.accent}>Bagagens</SectionTitle>
            <div style={{ marginTop: 12 }}>
              {blocks.map((bl, idx) => {
                const dirLabel = bl.direction === 'ida' ? 'IDA' : bl.direction === 'volta' ? 'VOLTA' : (bl.direction || '').toUpperCase();
                const subtitle = bl.label
                  ? `BAGAGENS DE ${dirLabel} — TRECHO ${bl.label} — POR PASSAGEIRO`
                  : `BAGAGENS DE ${dirLabel} — POR PASSAGEIRO`;
                return (
                  <div key={idx} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#9aa5b8', marginBottom: 6 }}>{subtitle}</div>
                    {bl.items.map((it, j) => (
                      <div key={j} style={{ background: '#f4f6f9', borderRadius: 6, padding: '7px 12px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <IconBag color="#6b7a90" size={16} />
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1a2a48' }}>{it.label}</span>
                          <span style={{ fontSize: 10, color: '#9aa5b8', marginTop: 2 }}>
                            {it.weightText} · {it.dimensionsText}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2a48' }}>{it.quantity}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* RESUMO DA RESERVA */}
      <section style={{ marginTop: 'auto', padding: '10px 32px 4px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2a48' }}>Resumo da sua reserva</div>
        <div style={{ fontSize: 10, color: '#6b7a90', marginTop: 4 }}>
          Acesse a área do cliente da companhia aérea para realizar o check-in, alterar assentos e mais.
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '12px 32px 12px', borderTop: `3px solid ${theme.accent}`, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <img src="/voucher-assets/agency-logo.png" alt="Clube do Voo Viagens" style={{ maxHeight: 80, maxWidth: 240, objectFit: 'contain', borderRadius: 10, background: 'white', padding: 4 }} onError={e => { e.target.style.display = 'none'; }} />
            <div style={{ fontSize: 10, color: '#555', lineHeight: 1.7, marginTop: 8 }}>
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
          {resGroups.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: qrSize <= 64 ? 360 : 320 }}>
              {resGroups.map((g, i) => {
                const qr = qrMap[g.bookingUrl];
                const label = hasMultiGroups ? `Check-in ${groupShortLabel(g.label)}` : 'Gerenciar reserva';
                const boxW = qrSize + 12;
                return (
                  <a key={i} href={g.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-block', width: boxW }}>
                    {qr
                      ? <img src={qr} alt={label} style={{ width: qrSize, height: qrSize, background: 'white', padding: 5, border: '1px solid #e5eaf0', display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
                      : <div style={{ width: qrSize, height: qrSize, background: '#f4f6f9', border: '1px solid #e5eaf0', marginLeft: 'auto', marginRight: 'auto' }} />}
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: theme.accent, marginTop: 6, textAlign: 'center', fontWeight: 700, lineHeight: 1.3, width: boxW - 2 }}>
                      {label}
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
