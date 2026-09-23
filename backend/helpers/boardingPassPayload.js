// Valida e normaliza o corpo de um envio de cartões de embarque.
// Retorna { ok:false, errors:[...] } ou
//         { ok:true, payload, links, flightDate, voucherId }.

const { parseBoardingPassLink } = require('./boardingPassLink');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSENGERS = 9;

// null = vazio; undefined = inválido; string = dígitos com DDI 55.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return undefined;
}

// null = vazio; undefined = algum inválido; string = lista normalizada "a@x, b@y".
function normalizeEmailList(raw) {
  const list = String(raw || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return null;
  if (list.some(e => !EMAIL_RE.test(e))) return undefined;
  return [...new Set(list)].join(', ');
}

function wordCount(name) {
  return name.replace(/,/g, ' ').split(/\s+/).filter(Boolean).length;
}

function validateSendPayload(body) {
  const src = body || {};
  const errors = [];
  const passengersIn = Array.isArray(src.passengers) ? src.passengers : [];
  if (passengersIn.length < 1 || passengersIn.length > MAX_PASSENGERS) {
    errors.push(`Informe de 1 a ${MAX_PASSENGERS} passageiros`);
  }

  const passengers = [];
  const links = [];

  passengersIn.slice(0, MAX_PASSENGERS).forEach((p, i) => {
    const n = i + 1;
    const name = String((p && p.name) || '').trim().replace(/\s+/g, ' ');
    if (wordCount(name) < 2) errors.push(`Passageiro ${n}: informe nome e sobrenome`);

    const emailRaw = String((p && p.email) || '').trim().toLowerCase();
    if (emailRaw && !EMAIL_RE.test(emailRaw)) errors.push(`Passageiro ${n}: e-mail inválido`);

    const phone = normalizePhone(p && p.phone);
    if (phone === undefined) errors.push(`Passageiro ${n}: WhatsApp inválido`);

    const segments = [];
    const segsIn = Array.isArray(p && p.segments) ? p.segments : [];
    segsIn.forEach((s) => {
      const url = String((s && s.url) || '').trim();
      if (!url) return;
      const parsed = parseBoardingPassLink(url);
      if (!parsed.ok) {
        errors.push(`Passageiro ${n}, trecho ${segments.length + 1}: ${parsed.error}`);
        return;
      }
      const segmentIndex = segments.length;
      segments.push({ url, label: s && s.label ? String(s.label) : null });
      links.push({
        passengerIndex: i,
        segmentIndex,
        originalUrl: url,
        cleanUrl: parsed.cleanUrl,
        carrier: parsed.carrier,
        recognized: parsed.recognized,
        data: parsed.data
      });
    });
    if (!segments.length) errors.push(`Passageiro ${n}: adicione pelo menos um link de cartão`);

    passengers.push({ name, email: emailRaw || null, phone: phone || null, segments });
  });

  const emailMode = src.emailMode === 'single' ? 'single' : 'individual';
  const whatsappMode = src.whatsappMode === 'single' ? 'single' : 'individual';

  let singleEmail = null;
  if (emailMode === 'single') {
    singleEmail = normalizeEmailList(src.singleEmail);
    if (singleEmail === null) errors.push('Informe o e-mail que vai receber todos os cartões');
    if (singleEmail === undefined) errors.push('E-mail único inválido');
  }

  let singlePhone = null;
  if (whatsappMode === 'single') {
    singlePhone = normalizePhone(src.singlePhone);
    if (singlePhone === undefined) errors.push('WhatsApp único inválido');
  }

  if (errors.length) return { ok: false, errors };

  const jwtDates = links.map(l => l.data && l.data.date).filter(Boolean).sort();
  const flightDate = jwtDates[0]
    || (/^\d{4}-\d{2}-\d{2}$/.test(String(src.flightDate || '')) ? src.flightDate : null);
  const vid = Number(src.voucherId);
  const voucherId = Number.isInteger(vid) && vid > 0 ? vid : null;

  return {
    ok: true,
    payload: { passengers, emailMode, singleEmail, whatsappMode, singlePhone },
    links,
    flightDate,
    voucherId
  };
}

module.exports = { validateSendPayload, normalizePhone };
