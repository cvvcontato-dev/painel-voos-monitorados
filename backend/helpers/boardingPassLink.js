// Limpeza e identificação de links de cartão de embarque.
//   - Azul/Gol: o link vem embrulhado no login do Google
//     (accounts.google.com/...?continue=<LINK>&followup=...). Extraímos <LINK>.
//   - Latam: já vem como link final; só removemos parâmetros de rastreamento.
//   - Qualquer outra URL http(s): aceita como está, marcada como não reconhecida.
// Puro, sem I/O.

const ALLOWED_HOSTS = ['pay.google.com', 'latamairlines.com', 'voegol.com.br', 'voeazul.com.br'];

const CARRIER_BY_CODE = { AD: 'azul', G3: 'gol', LA: 'latam', JJ: 'latam' };

const LATAM_TRACKING_PARAM = /^(utm_.+|messageId)$/i;

// Id do flightObject do Google Wallet, após o primeiro ".":
//   prd 20260924 AD 2730 SSA REC RNWDKT <sufixo>
const FLIGHT_ID_RE = /^[a-z]*(\d{8})([A-Z0-9]{2})(\d{1,4})([A-Z]{3})([A-Z]{3})([A-Z0-9]{6})/;

function toUrl(s) {
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function isAllowedHost(url) {
  const u = toUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some(d => hostMatches(host, d));
}

function extractContinue(raw) {
  const i = raw.indexOf('continue=');
  if (i < 0) return null;
  const rest = raw.slice(i + 'continue='.length);
  let end = rest.indexOf('&followup=');
  if (end < 0) end = rest.indexOf('&');
  let value = end < 0 ? rest : rest.slice(0, end);
  if (/^https?%3A/i.test(value)) {
    try { value = decodeURIComponent(value); } catch { return null; }
  }
  return value;
}

// Lê (sem validar assinatura) o payload do JWT "save to wallet".
function decodeGoogleWalletJwt(cleanUrl) {
  try {
    const u = new URL(cleanUrl);
    const token = u.pathname.split('/save/')[1];
    if (!token) return null;
    const payloadSeg = token.split('.')[1];
    if (!payloadSeg) return null;
    const json = JSON.parse(Buffer.from(payloadSeg, 'base64url').toString('utf8'));
    const objects = (json && json.payload && json.payload.flightObjects) || [];
    for (const obj of objects) {
      const id = String((obj && obj.id) || '');
      const suffix = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id;
      const m = suffix.match(FLIGHT_ID_RE);
      if (!m) continue;
      const [, ymd, code, num, origin, destination, locator] = m;
      return {
        carrierCode: code,
        flightNumber: `${code}${num}`,
        date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
        origin,
        destination,
        locator
      };
    }
    return null;
  } catch {
    return null;
  }
}

function parseBoardingPassLink(raw) {
  const input = String(raw || '').trim();
  if (!input) return { ok: false, error: 'Link vazio' };

  let candidate = input;
  if (/^https?:\/\/accounts\.google\.com\//i.test(input)) {
    const extracted = extractContinue(input);
    if (!extracted) return { ok: false, error: 'Não encontrei o link do cartão (continue=) neste endereço' };
    candidate = extracted;
  }

  const u = toUrl(candidate);
  if (!u) return { ok: false, error: 'Link inválido' };
  const host = u.hostname.toLowerCase();

  if (hostMatches(host, 'pay.google.com')) {
    const data = decodeGoogleWalletJwt(candidate);
    const carrier = data ? (CARRIER_BY_CODE[data.carrierCode] || null) : null;
    return { ok: true, cleanUrl: candidate, carrier, recognized: true, data };
  }

  if (hostMatches(host, 'latamairlines.com')) {
    for (const key of [...u.searchParams.keys()]) {
      if (LATAM_TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    const seg = u.searchParams.get('segmentIndex');
    const data = {
      orderId: u.searchParams.get('orderId') || null,
      lastName: u.searchParams.get('lastName') || null,
      segmentIndex: seg !== null && /^\d+$/.test(seg) ? Number(seg) : null
    };
    return { ok: true, cleanUrl: u.toString(), carrier: 'latam', recognized: true, data };
  }

  return { ok: true, cleanUrl: candidate, carrier: null, recognized: false, data: null };
}

module.exports = { parseBoardingPassLink, decodeGoogleWalletJwt, isAllowedHost, ALLOWED_HOSTS };
