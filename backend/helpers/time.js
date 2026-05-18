function nowUtcIso() {
  return new Date().toISOString();
}

function addMinutesUtc(iso, minutes) {
  const d = new Date(iso);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}

function diffMinutes(aIso, bIso) {
  if (!aIso || !bIso) return null;
  return Math.round((new Date(bIso) - new Date(aIso)) / 60000);
}

function isOlderThanHours(iso, hours) {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) > hours * 3600 * 1000;
}

module.exports = { nowUtcIso, addMinutesUtc, diffMinutes, isOlderThanHours };
