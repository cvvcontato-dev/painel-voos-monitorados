// Junta {date:'YYYY-MM-DD', time:'HH:mm'} num ISO com fuso BR (-03:00) como default
// quando o time não trouxer offset.
function joinDateTime(date, time) {
  if (!date) return null;
  const t = (time && /^\d{1,2}:\d{2}/.test(time)) ? time.padStart(5, '0') : '00:00';
  return `${date}T${t}:00-03:00`;
}

function deriveSortDate(item, kind) {
  if (kind === 'hotel') return item.checkIn ? joinDateTime(item.checkIn.date, item.checkIn.time) : null;
  if (kind === 'car') return item.pickup?.datetime || null;
  if (kind === 'tour') return item.datetime || null;
  if (kind === 'transfer') return (Array.isArray(item.legs) && item.legs[0]?.datetime) || null;
  if (kind === 'flight') return item.trips?.[0]?.departure?.datetime || null;
  return null;
}

function normalizeItem(raw, kind) {
  const item = { ...(raw || {}), kind };
  if (kind === 'hotel') {
    item.rooms = Array.isArray(item.rooms) ? item.rooms : [];
    item.guests = Array.isArray(item.guests) ? item.guests : [];
    item.amenities = Array.isArray(item.amenities) ? item.amenities : [];
  }
  if (kind === 'tour') {
    item.includes = Array.isArray(item.includes) ? item.includes : [];
    item.excludes = Array.isArray(item.excludes) ? item.excludes : [];
  }
  if (kind === 'transfer') {
    item.legs = Array.isArray(item.legs) ? item.legs : [];
  }
  item.sortDate = deriveSortDate(item, kind);
  return item;
}

module.exports = { normalizeItem };
