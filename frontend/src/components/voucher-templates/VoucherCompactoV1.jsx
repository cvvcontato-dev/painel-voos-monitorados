import React, { useEffect, useState } from 'react';
import * as api from '../../api/voucherClient';
import {
  THEMES, detectCarrierKey, fmtTime, baggagePolicy, normalizeFlightNumber,
  CarrierLogo, IconPlane, IconBag, IconUser, IconPhone, IconMail, IconGlobe
} from './_shared';
import { airportName } from './_airports';

// Modelo Compacto usa SEMPRE as cores da agência.
const THEME = {
  accent: '#00569e',
  accentLight: '#3871c1',
  pillBg: '#e6effa',
  cardBorder: '#e5eaf0',
  cardBg: '#f4f6f9',
  text: '#1a2a48',
  textMuted: '#6b7a90',
  textFaint: '#9aa5b8'
};

// Fuso fixo BR — Playwright (export PDF) roda em UTC e horários ficavam +3h.
const BR_TZ = 'America/Sao_Paulo';

// Extrai partes (dd, mm, yyyy, dia-da-semana) sempre no fuso de Brasília.
function brDateParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TZ, day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'long'
  });
  const out = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type === 'day') out.dd = p.value;
    else if (p.type === 'month') out.mm = p.value;
    else if (p.type === 'year') out.yyyy = p.value;
    else if (p.type === 'weekday') out.dow = p.value;
  }
  return out;
}

function shortDate(iso) {
  const p = brDateParts(iso);
  if (!p) return '';
  return `${p.dd}/${p.mm}/${p.yyyy}`;
}

function fullDateLabel(t) {
  if (!t || !t.departure?.datetime) return (t && t.dateLabel) || '';
  const p = brDateParts(t.departure.datetime);
  if (!p) return '';
  return `${p.dow.charAt(0).toUpperCase() + p.dow.slice(1)}, ${p.dd}/${p.mm}/${p.yyyy}`;
}

function directionLabel(dir) {
  const d = (dir || '').toLowerCase();
  if (d === 'ida' || d === 'outbound') return 'IDA';
  if (d === 'volta' || d === 'return' || d === 'inbound') return 'VOLTA';
  return (dir || '').toUpperCase();
}

// Suitcase icon (despachada) — distinct from IconBag (handbag)
const IconSuitcase = ({ color = '#1a2a48', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M20 8h-3V6c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6h6v2H9V6zm11 14H4V10h16v10z"/>
  </svg>
);

// Splits the baggage array into 3 slots: personal, handbag, checked per direction.
// Returns { personal, mao, despachada } each with { qty, weightText, dimensionsText }.
function splitBaggage(allBags, direction, carrierKey) {
  const dirBags = allBags.filter(b => (b.direction || '').toLowerCase() === direction);
  const lower = b => `${b.label || ''} ${b.weightText || ''}`.toLowerCase();
  const isPersonal = b => /mochila|bolsa|sacola|pessoal|personal/.test(lower(b));
  const isHand = b => /m[aã]o|carry/.test(lower(b)) || /\b1[02]\s*kg\b/.test(lower(b));
  const isChecked = b => /despach|por[aã]o|\bmala\b|checked/.test(lower(b)) || /\b23\s*kg\b/.test(lower(b));

  const personalExtracted = dirBags.find(isPersonal);
  const handExtracted = dirBags.find(isHand);
  const checkedExtracted = dirBags.find(isChecked);

  return {
    personal:    { qty: personalExtracted ? (personalExtracted.quantity ?? 1) : 1, ...baggagePolicy(carrierKey, 'personal') },
    mao:         { qty: handExtracted ? (handExtracted.quantity ?? 1) : 1,         ...baggagePolicy(carrierKey, 'handbag') },
    despachada:  { qty: checkedExtracted ? (checkedExtracted.quantity ?? 1) : 0,   ...baggagePolicy(carrierKey, 'checked') }
  };
}

export default function VoucherCompactoV1({ data }) {
  const [settings, setSettings] = useState({ contact_phone: '', contact_email: '', contact_site: '', contact_extra: '' });
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  if (!data) return null;

  const carrierKey = detectCarrierKey(data);
  const carrierTheme = THEMES[carrierKey]; // only used by CarrierLogo fallback
  const trips = data.trips || [];
  const passengers = data.passengers || [];
  const baggage = data.baggage || [];

  // Direction order (preserve first-seen)
  const directions = [];
  const seen = new Set();
  for (const t of trips) {
    const d = t.direction || '';
    if (!seen.has(d)) { seen.add(d); directions.push(d); }
  }

  // Resolve airport name: prefer trip-level airportName, fallback to lookup table, then empty string.
  const resolveName = (airportLeg) => {
    if (!airportLeg) return '';
    if (airportLeg.airportName) return airportLeg.airportName;
    return airportName(airportLeg.airport) || '';
  };

  return (
    <div data-voucher-ready={data.layoutVersion} style={{ width: 794, minHeight: 1123, fontFamily: 'Arial, Helvetica, sans-serif', color: THEME.text, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER — logo bare on left, localizador center, "Visualizar reserva" button right */}
      <header style={{ padding: '36px 40px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
        <div style={{ flex: '0 0 auto' }}>
          {/* Bare large carrier logo — no white card around.
              Em multi-cia (merge), mostra as 2 logos lado a lado. */}
          {(() => {
            const isMulti = (data.carrier || '').toLowerCase() === 'multi'
              && data.reservation?.primaryCarrier && data.reservation?.secondaryCarrier
              && data.reservation.primaryCarrier !== data.reservation.secondaryCarrier;
            const primaryCk = isMulti ? data.reservation.primaryCarrier.toLowerCase() : carrierKey;
            const secondaryCk = isMulti ? data.reservation.secondaryCarrier.toLowerCase() : null;
            return (
              <CarrierLogo
                carrierKey={primaryCk}
                secondaryCarrierKey={secondaryCk}
                theme={carrierTheme}
                bare
              />
            );
          })()}
        </div>
        <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
          <div style={{ fontSize: 11, color: THEME.textFaint, letterSpacing: 1, textTransform: 'capitalize' }}>Localizador</div>
          {(() => {
            const secondaryLocator = data.reservation?.secondaryLocator || '';
            const hasDualLocator = !!secondaryLocator && secondaryLocator !== data.reservation?.locator;
            return hasDualLocator ? (
              <div style={{ fontSize: 14, fontWeight: 800, color: THEME.accent, letterSpacing: 1.5, marginTop: 2, lineHeight: 1.3 }}>
                <div>Ida: {data.reservation?.locator}</div>
                <div>Volta: {secondaryLocator}</div>
              </div>
            ) : (
              <div style={{ fontSize: 22, fontWeight: 800, color: THEME.accent, letterSpacing: 2, marginTop: 2 }}>{data.reservation?.locator}</div>
            );
          })()}
        </div>
        <div style={{ flex: '0 0 auto' }}>
          {/* Decorative — looks like a button but is non-functional in print */}
          <div style={{ background: THEME.accent, color: 'white', padding: '12px 22px', borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Visualizar reserva</div>
        </div>
      </header>

      {/* ITINERARY BLOCKS */}
      <div style={{ padding: '0 24px' }}>
        {directions.map(dir => {
          const tripsInDir = trips.filter(t => (t.direction || '') === dir);
          const firstTrip = tripsInDir[0];
          const tripLocator = firstTrip?.locator;
          const showTripLocator = !!tripLocator && tripLocator !== data.reservation?.locator;
          return (
            <div key={dir} style={{ background: THEME.cardBg, borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
              {/* Block top bar: direction + date + trechos pill */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${THEME.cardBorder}`, paddingBottom: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconPlane color={THEME.accent} size={18} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: THEME.text, letterSpacing: 0.5 }}>{directionLabel(dir)}</span>
                  {showTripLocator && (
                    <span style={{ fontSize: 10, color: THEME.textMuted, marginLeft: 6 }}>· Localizador {tripLocator}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: THEME.text, fontWeight: 500 }}>{fullDateLabel(firstTrip)}</div>
                <div style={{ background: THEME.pillBg, color: THEME.accent, padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                  {tripsInDir.length} {tripsInDir.length === 1 ? 'trecho' : 'trechos'}
                </div>
              </div>

              {/* Trip rows */}
              {tripsInDir.map((t, i) => {
                const depName = resolveName(t.departure);
                const arrName = resolveName(t.arrival);
                return (
                  <div key={i} style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 14px 1fr 14px minmax(180px, 0.9fr) 14px 1fr 14px 90px',
                    alignItems: 'center',
                    gap: 0,
                    paddingTop: i > 0 ? 14 : 0,
                    borderTop: i > 0 ? `1px dashed ${THEME.cardBorder}` : 'none',
                    marginTop: i > 0 ? 8 : 0
                  }}>
                    {/* Time + date (left) */}
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: THEME.text }}>{fmtTime(t.departure?.datetime)}</div>
                      <div style={{ fontSize: 10, color: THEME.textMuted, marginTop: 4 }}>{shortDate(t.departure?.datetime)}</div>
                    </div>
                    <div style={{ textAlign: 'center', color: THEME.textFaint, fontSize: 14 }}>—</div>

                    {/* Airport long name (left) */}
                    <div style={{ textAlign: 'center', fontSize: 11, color: THEME.textMuted, lineHeight: 1.3 }}>
                      {depName && <div>{depName}</div>}
                      <div style={{ color: THEME.textFaint }}>({t.departure?.airport})</div>
                    </div>
                    <div style={{ textAlign: 'center', color: THEME.textFaint, fontSize: 14 }}>—</div>

                    {/* CENTER: IATA ✈ IATA + flight + cabin pill */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: THEME.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <span>{t.departure?.airport}</span>
                        <IconPlane color={THEME.text} size={16} />
                        <span>{t.arrival?.airport}</span>
                      </div>
                      <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 4 }}>Voo {normalizeFlightNumber(t.flightNumber)}</div>
                      {t.cabinClass && (
                        <div style={{ display: 'inline-block', marginTop: 6, background: THEME.pillBg, color: THEME.accent, padding: '2px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{t.cabinClass}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', color: THEME.textFaint, fontSize: 14 }}>—</div>

                    {/* Airport long name (right) */}
                    <div style={{ textAlign: 'center', fontSize: 11, color: THEME.textMuted, lineHeight: 1.3 }}>
                      {arrName && <div>{arrName}</div>}
                      <div style={{ color: THEME.textFaint }}>({t.arrival?.airport})</div>
                    </div>
                    <div style={{ textAlign: 'center', color: THEME.textFaint, fontSize: 14 }}>—</div>

                    {/* Time + date (right) */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: THEME.text }}>{fmtTime(t.arrival?.datetime)}</div>
                      <div style={{ fontSize: 10, color: THEME.textMuted, marginTop: 4 }}>{shortDate(t.arrival?.datetime)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* PASSAGEIROS title */}
      <div style={{ padding: '8px 24px 4px' }}>
        <h3 style={{ color: THEME.accent, fontSize: 17, fontWeight: 600, margin: '18px 0 14px', letterSpacing: 0 }}>Passageiros: {passengers.length}</h3>
      </div>

      {/* PASSENGER CARDS */}
      <div style={{ padding: '0 24px 8px' }}>
        {passengers.map(p => {
          const eticket = p.loyaltyNumber || p.documento || '';
          // Which directions does the trip have? Show "Ida" first if 'ida' exists, then "Volta".
          const dirsPresent = directions;
          return (
            <div key={p.order} style={{ border: `1px solid #eef1f6`, borderRadius: 12, padding: 16, marginBottom: 12, background: '#fff' }}>
              {/* Top row: name + e-ticket */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconUser color={THEME.text} size={16} />
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 13 }}>{p.name}</span>
                </div>
                {eticket && <div style={{ fontSize: 11, color: THEME.accent }}>e-ticket: {eticket}</div>}
              </div>

              {/* Gray box per direction */}
              {dirsPresent.map(dir => {
                const bags = splitBaggage(baggage, dir, carrierKey);
                return (
                  <div key={dir} style={{ background: THEME.cardBg, borderRadius: 8, padding: 12, marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    {/* Left: direction pill + Assentos */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ background: THEME.pillBg, color: THEME.accent, padding: '2px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{directionLabel(dir)}</span>
                        <span style={{ fontSize: 11, color: THEME.textMuted }}>Assentos</span>
                      </div>
                      <div style={{ fontSize: 12, color: THEME.text }}>—</div>
                    </div>
                    {/* Right: Bagagens — 3 fixed slots (pessoal + mão + despachada) */}
                    <div>
                      <div style={{ fontSize: 11, color: THEME.textMuted, marginBottom: 8 }}>Bagagens</div>
                      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <IconBag color={THEME.text} size={20} />
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{bags.personal.qty}</div>
                            <div style={{ fontSize: 9, color: THEME.textFaint, marginTop: 2 }}>Pessoal</div>
                            <div style={{ fontSize: 8, color: THEME.textFaint }}>{bags.personal.weightText}</div>
                            <div style={{ fontSize: 8, color: THEME.textFaint }}>{bags.personal.dimensionsText}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <IconBag color={THEME.text} size={22} />
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{bags.mao.qty}</div>
                            <div style={{ fontSize: 9, color: THEME.textFaint, marginTop: 2 }}>Mão</div>
                            <div style={{ fontSize: 8, color: THEME.textFaint }}>{bags.mao.weightText}</div>
                            <div style={{ fontSize: 8, color: THEME.textFaint }}>{bags.mao.dimensionsText}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <IconSuitcase color={THEME.text} size={22} />
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{bags.despachada.qty}</div>
                            <div style={{ fontSize: 9, color: THEME.textFaint, marginTop: 2 }}>Despachada</div>
                            <div style={{ fontSize: 8, color: THEME.textFaint }}>{bags.despachada.weightText}</div>
                            <div style={{ fontSize: 8, color: THEME.textFaint }}>{bags.despachada.dimensionsText}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* INFORMAÇÕES */}
      <div style={{ padding: '6px 24px 14px' }}>
        <h3 style={{ color: THEME.accent, fontSize: 17, fontWeight: 600, margin: '12px 0 10px', letterSpacing: 0 }}>Informações</h3>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: THEME.textMuted }}>
          <IconBag color={THEME.textFaint} size={14} />
          <span>Além da bagagem especificada acima, cada passageiro pode levar consigo uma bolsa, mochila ou sacola (considerado item pessoal).</span>
        </div>
      </div>

      {/* FOOTER — compliance: agency logo + contact */}
      <footer style={{ marginTop: 'auto', padding: '16px 36px 14px', borderTop: `3px solid ${THEME.accent}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <img src="/voucher-assets/agency-logo.png" alt="Clube do Voo Viagens" style={{ maxHeight: 88, maxWidth: 260, objectFit: 'contain', borderRadius: 10, background: 'white', padding: 4 }} onError={e => { e.target.style.display = 'none'; }} />
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
