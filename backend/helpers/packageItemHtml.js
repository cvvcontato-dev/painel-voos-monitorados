// Renderizadores de HTML por tipo de item do pacote, compartilhados pelo e-mail
// e pela página hospedada. Cada função devolve uma string HTML de um "card".
//
// Timezone: os horários são exibidos no FUSO LOCAL DO PRÓPRIO SERVIÇO — lemos a
// hora de parede diretamente do ISO (que já carrega o offset do documento), sem
// converter. Assim um check-in de hotel em Madri (14:00+01:00) mostra "14:00".

const { buildReservationGroups } = require('./reservationGroups');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Extrai a hora de parede local do ISO (sem conversão de fuso).
function localParts(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso));
  if (!m) return null;
  return { y: m[1], mo: m[2], d: m[3], hh: m[4], mm: m[5] };
}
function fmtDate(iso) {
  const p = localParts(iso);
  if (!p) return '';
  return `${p.d}/${p.mo}/${p.y}`;
}
function fmtTime(iso) {
  const p = localParts(iso);
  if (!p) return '';
  return `${p.hh}:${p.mm}`;
}
function fmtDateLong(iso) {
  const p = localParts(iso);
  if (!p) return '';
  const day = parseInt(p.d, 10);
  const mon = MONTHS[parseInt(p.mo, 10) - 1] || '';
  return `${day} ${mon} ${p.y}`;
}

const KIND_META = {
  flight:   { icon: '&#9992;', label: 'Voo', color: '#00539C' },
  hotel:    { icon: '&#127976;', label: 'Hospedagem', color: '#7c3aed' },
  car:      { icon: '&#128664;', label: 'Aluguel de carro', color: '#0d9488' },
  tour:     { icon: '&#127903;', label: 'Passeio', color: '#d97706' },
  transfer: { icon: '&#128656;', label: 'Transfer', color: '#0284c7' }
};

// Cabeçalho do card (ícone colorido + título do tipo).
function cardHeader(kind, title, right) {
  const meta = KIND_META[kind] || { icon: '', label: '', color: '#334155' };
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td valign="middle" style="font-family:Inter,Arial,Helvetica,sans-serif;">
          <span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:7px;background:${meta.color};color:#fff;font-size:14px;">${meta.icon}</span>
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${meta.color};font-weight:700;margin-left:8px;">${escapeHtml(meta.label)}</span>
          <div style="font-size:15px;font-weight:700;color:#0e1726;margin-top:6px;">${escapeHtml(title || '')}</div>
        </td>
        ${right ? `<td valign="top" align="right" style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#6c757d;white-space:nowrap;">${right}</td>` : ''}
      </tr>
    </table>`;
}

function cardWrap(inner) {
  return `<div style="background:#ffffff;border:1px solid #e9ecf2;border-radius:12px;padding:16px 18px;margin:0 0 12px;">${inner}</div>`;
}

function kv(label, value) {
  if (!value) return '';
  return `<div style="font-size:12.5px;color:#334155;margin-top:3px;"><span style="color:#8a93a4;">${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>`;
}

// ── Cards por tipo ──────────────────────────────────────────────────────────

function flightGroupHtml(group) {
  // group = saída de buildReservationGroups: { role, label, trips[], carrierKey, locator }
  const rows = (group.trips || []).map(t => {
    const dep = t.departure || {}, arr = t.arrival || {};
    return `<div style="font-size:13px;color:#0e1726;margin-top:6px;">
      <strong>${escapeHtml(fmtTime(dep.datetime) || '--:--')}</strong> ${escapeHtml((dep.airport || '').toUpperCase())}
      &rarr;
      <strong>${escapeHtml(fmtTime(arr.datetime) || '--:--')}</strong> ${escapeHtml((arr.airport || '').toUpperCase())}
      <span style="color:#8a93a4;font-size:11.5px;">· ${escapeHtml(fmtDate(dep.datetime))} · Voo ${escapeHtml((t.flightNumber || '').replace(/^[A-Z]{2}\s*/, '') || '—')}</span>
    </div>`;
  }).join('');
  const right = group.locator ? `Localizador<br><strong style="color:#00539C;">${escapeHtml(group.locator)}</strong>` : '';
  return cardWrap(cardHeader('flight', group.label || 'Voo', right) + rows);
}

function hotelHtml(item) {
  const room = (item.rooms && item.rooms[0]) || {};
  const inner = cardHeader('hotel', item.name, item.locator ? `Localizador<br><strong style="color:#7c3aed;">${escapeHtml(item.locator)}</strong>` : '')
    + `<div style="margin-top:8px;">`
    + kv('Endereço', item.address)
    + kv('Check-in', `${fmtDate(item.sortDate) || (item.checkIn && item.checkIn.date) || ''} ${item.checkIn ? (item.checkIn.time || '') : ''}`.trim())
    + kv('Check-out', item.checkOut ? `${item.checkOut.date || ''} ${item.checkOut.time || ''}`.trim() : '')
    + kv('Noites', item.nights ? String(item.nights) : '')
    + kv('Quarto', [room.type, room.beds, room.regime].filter(Boolean).join(' · '))
    + kv('Hóspedes', item.guestCount ? String(item.guestCount) : (item.guests && item.guests.length ? String(item.guests.length) : ''))
    + `</div>`;
  return cardWrap(inner);
}

function carHtml(item) {
  const inner = cardHeader('car', item.category || 'Aluguel de carro', item.locator ? `Reserva<br><strong style="color:#0d9488;">${escapeHtml(item.locator)}</strong>` : '')
    + `<div style="margin-top:8px;">`
    + kv('Empresa', item.provider)
    + kv('Motorista', item.driver || item.holder)
    + kv('Retirada', item.pickup ? `${fmtDate(item.pickup.datetime)} ${fmtTime(item.pickup.datetime)} — ${item.pickup.location || ''}`.trim() : '')
    + kv('Devolução', item.dropoff ? `${fmtDate(item.dropoff.datetime)} ${fmtTime(item.dropoff.datetime)} — ${item.dropoff.location || ''}`.trim() : '')
    + kv('Câmbio', item.transmission)
    + kv('Seguro', item.insurance)
    + `</div>`;
  return cardWrap(inner);
}

function tourHtml(item) {
  const inner = cardHeader('tour', item.activity || 'Passeio', item.locator ? `Reserva<br><strong style="color:#d97706;">${escapeHtml(item.locator)}</strong>` : '')
    + `<div style="margin-top:8px;">`
    + kv('Data', `${fmtDate(item.datetime)} ${fmtTime(item.datetime)}`.trim())
    + kv('Fornecedor', item.provider)
    + kv('Viajantes', item.travelers)
    + kv('Ponto de encontro', item.meetingPoint)
    + kv('Retirada em', item.hotelPickup)
    + (item.includes && item.includes.length ? kv('Inclui', item.includes.join(' · ')) : '')
    + `</div>`;
  return cardWrap(inner);
}

function transferHtml(item) {
  const legs = (item.legs || []).map(l => `<div style="font-size:12.5px;color:#334155;margin-top:4px;">
    <strong>${escapeHtml(fmtDate(l.datetime))} ${escapeHtml(fmtTime(l.datetime))}</strong> · ${escapeHtml(l.from || '')} &rarr; ${escapeHtml(l.to || '')}
    ${l.pickupWindow ? `<span style="color:#8a93a4;"> · retirada ${escapeHtml(l.pickupWindow)}</span>` : ''}
  </div>`).join('');
  const inner = cardHeader('transfer', item.type || 'Transfer', item.locator ? `Reserva<br><strong style="color:#0284c7;">${escapeHtml(item.locator)}</strong>` : '')
    + `<div style="margin-top:8px;">` + kv('Empresa', item.provider) + kv('Viajantes', item.travelers) + legs + `</div>`;
  return cardWrap(inner);
}

// Renderiza um bloco da timeline (saída de buildTimeline: { kind, item }).
function blockHtml(block) {
  if (!block) return '';
  if (block.kind === 'flight') return flightGroupHtml(block.item);
  if (block.kind === 'hotel') return hotelHtml(block.item);
  if (block.kind === 'car') return carHtml(block.item);
  if (block.kind === 'tour') return tourHtml(block.item);
  if (block.kind === 'transfer') return transferHtml(block.item);
  return '';
}

// Resumo textual do pacote ("2 voos · 1 hotel · 3 adicionais").
function packageSummaryText(pkg) {
  const flights = pkg && pkg.flights ? buildReservationGroups(pkg.flights).length : 0;
  const hotels = (pkg && pkg.hotels || []).length;
  const addons = (pkg && pkg.addons || []).length;
  const parts = [];
  if (flights) parts.push(`${flights} ${flights === 1 ? 'voo' : 'voos'}`);
  if (hotels) parts.push(`${hotels} ${hotels === 1 ? 'hotel' : 'hotéis'}`);
  if (addons) parts.push(`${addons} ${addons === 1 ? 'adicional' : 'adicionais'}`);
  return parts.join(' · ');
}

// Período total da viagem (1ª data → última data) a partir dos blocos ordenados.
function packagePeriod(blocks) {
  const dated = (blocks || []).filter(b => b.sortDate);
  if (!dated.length) return '';
  const first = fmtDateLong(dated[0].sortDate);
  const last = fmtDateLong(dated[dated.length - 1].sortDate);
  return first === last ? first : `${first} — ${last}`;
}

module.exports = {
  escapeHtml, fmtDate, fmtTime, fmtDateLong, localParts,
  blockHtml, flightGroupHtml, hotelHtml, carHtml, tourHtml, transferHtml,
  packageSummaryText, packagePeriod, KIND_META
};
