import React from 'react';

const AZUL = '#003DA5';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function AzulConfirmacaoV1({ data }) {
  if (!data) return null;
  const trips = data.trips || [];
  const baggage = data.baggage || [];
  return (
    <div data-voucher-ready="azul.confirmacao.v1" style={{ width: 794, minHeight: 1123, fontFamily: 'Arial, sans-serif', color: '#222', background: '#fff' }}>
      <header style={{ background: AZUL, color: 'white', padding: '24px 32px' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{data.branding?.airlineName || 'Azul'}</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>Confirmação de Reserva</div>
      </header>

      <section style={{ padding: '24px 32px', borderBottom: '1px solid #ddd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: '#666' }}>LOCALIZADOR</div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>{data.reservation?.locator}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#666' }}>STATUS</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: AZUL }}>{data.reservation?.status}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {data.route?.origin} → {data.route?.destination}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '20px 32px', borderBottom: '1px solid #ddd' }}>
        <h3 style={{ fontSize: 14, color: AZUL, margin: '0 0 12px' }}>Passageiros</h3>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {(data.passengers || []).map(p => (
              <tr key={p.order} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '6px 0', width: 30, color: '#888' }}>{p.order}</td>
                <td style={{ padding: '6px 0', fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: '6px 0', textTransform: 'capitalize', color: '#666' }}>{p.type}</td>
                <td style={{ padding: '6px 0', color: '#666' }}>{p.documento || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {trips.map((t, i) => (
        <section key={i} style={{ padding: '20px 32px', borderBottom: '1px solid #ddd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, color: AZUL, margin: 0, textTransform: 'capitalize' }}>{t.direction}</h3>
            <div style={{ fontSize: 12, color: '#666' }}>{t.dateLabel} · Voo {t.flightNumber}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtTime(t.departure?.datetime)}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{t.departure?.airport}</div>
            </div>
            <div style={{ flex: 1, padding: '0 24px', textAlign: 'center', color: '#888', fontSize: 12 }}>
              ── {t.durationText} ──
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtTime(t.arrival?.datetime)}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{t.arrival?.airport}</div>
            </div>
          </div>
        </section>
      ))}

      {baggage.length > 0 && (
        <section style={{ padding: '20px 32px' }}>
          <h3 style={{ fontSize: 14, color: AZUL, margin: '0 0 12px' }}>Bagagens</h3>
          <ul style={{ fontSize: 13, paddingLeft: 20, margin: 0 }}>
            {baggage.map((b, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <strong style={{ textTransform: 'capitalize' }}>{b.direction}:</strong> {b.quantity}× {b.label} {b.weightText ? `(${b.weightText})` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
